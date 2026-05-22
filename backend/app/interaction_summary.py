"""
Gestione riassunti persistenti per conversazione.

Ad ogni coppia domanda/risposta viene generato un riassunto incrementale
salvato in un file Markdown per conversation_id.
Quando il file supera il limite di token, i riassunti più vecchi vengono
condensati in un meta-riassunto.
"""

import os
import time
from pathlib import Path
from typing import Optional

from .admin import get_summary_provider, get_summary_model
from .llm import chat_with_provider

# Directory dove salvare i riassunti
SUMMARIES_DIR = Path(os.getenv(
    "SUMMARIES_DIR",
    str(Path(__file__).resolve().parent.parent / "storage" / "summary")
))

# Limite massimo di caratteri per il file MD (circa 2000 token)
MAX_SUMMARY_CHARS = int(os.getenv("MAX_SUMMARY_CHARS", "8000"))

# Soglia oltre la quale scatta il meta-riassunto (80% del limite)
META_SUMMARY_THRESHOLD = int(MAX_SUMMARY_CHARS * 0.8)


def _ensure_dir():
    SUMMARIES_DIR.mkdir(parents=True, exist_ok=True)


def _summary_path(conversation_id: str) -> Path:
    safe_id = conversation_id.replace("/", "_").replace("..", "_")
    return SUMMARIES_DIR / f"{safe_id}.md"


def load_summary(conversation_id: str) -> str:
    """Carica il riassunto corrente per una conversazione. Ritorna stringa vuota se non esiste."""
    path = _summary_path(conversation_id)
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def save_summary(conversation_id: str, content: str):
    """Salva il contenuto del riassunto su file."""
    _ensure_dir()
    path = _summary_path(conversation_id)
    path.write_text(content, encoding="utf-8")


def list_summaries() -> list:
    """Restituisce la lista dei file di riassunto disponibili."""
    _ensure_dir()
    result = []
    for f in sorted(SUMMARIES_DIR.glob("*.md")):
        stat = f.stat()
        result.append({
            "conversation_id": f.stem,
            "filename": f.name,
            "size_chars": stat.st_size,
            "last_modified": stat.st_mtime,
        })
    return result


async def generate_interaction_summary(
    user_message: str,
    assistant_reply: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Genera un riassunto conciso di una singola coppia domanda/risposta."""
    provider = provider or get_summary_provider()
    model = model or get_summary_model()

    prompt_messages = [
        {
            "role": "system",
            "content": (
                "Sei un assistente che riassume interazioni di chat. "
                "Genera un riassunto MOLTO conciso (2-3 frasi max) della seguente interazione. "
                "Cattura: l'argomento principale, la domanda dell'utente e il punto chiave della risposta. "
                "Scrivi in italiano. Non usare intestazioni o formattazione markdown. "
                "Sii il più breve possibile mantenendo le informazioni essenziali."
            ),
        },
        {
            "role": "user",
            "content": (
                f"DOMANDA UTENTE:\n{user_message[:1500]}\n\n"
                f"RISPOSTA ASSISTENTE:\n{assistant_reply[:2000]}\n\n"
                "Riassumi questa interazione in 2-3 frasi concise."
            ),
        },
    ]

    try:
        summary = await chat_with_provider(
            prompt_messages,
            provider=provider,
            model=model,
            temperature=0.2,
            is_summary_request=True,
        )
        return summary.strip()
    except Exception as e:
        print(f"[interaction_summary] Errore generazione riassunto: {e}")
        return f"[Riassunto non disponibile] Utente ha chiesto: {user_message[:100]}..."


async def generate_meta_summary(
    existing_content: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Condensa il contenuto esistente in un meta-riassunto più breve."""
    provider = provider or get_summary_provider()
    model = model or get_summary_model()

    prompt_messages = [
        {
            "role": "system",
            "content": (
                "Sei un assistente che condensa riassunti di conversazioni. "
                "Ti viene dato un elenco di riassunti di interazioni passate. "
                "Devi condensarli in un UNICO meta-riassunto più breve che mantenga "
                "le informazioni più importanti e il filo logico della conversazione. "
                "Scrivi in italiano. Mantieni un formato cronologico ma conciso. "
                "Il risultato deve essere circa il 40% della lunghezza originale."
            ),
        },
        {
            "role": "user",
            "content": (
                f"RIASSUNTI DA CONDENSARE:\n\n{existing_content}\n\n"
                "Condensa tutto in un meta-riassunto più breve mantenendo le informazioni chiave."
            ),
        },
    ]

    try:
        meta = await chat_with_provider(
            prompt_messages,
            provider=provider,
            model=model,
            temperature=0.2,
            is_summary_request=True,
        )
        return meta.strip()
    except Exception as e:
        print(f"[interaction_summary] Errore meta-riassunto: {e}")
        # Fallback: tronca la prima metà
        half = len(existing_content) // 2
        return existing_content[half:]


async def append_interaction_summary(
    conversation_id: str,
    user_message: str,
    assistant_reply: str,
) -> str:
    """
    Genera il riassunto dell'interazione corrente, lo aggiunge al file MD
    e se necessario compatta con un meta-riassunto.

    Ritorna il contenuto aggiornato del file.
    """
    # 1. Genera riassunto della nuova interazione
    new_summary = await generate_interaction_summary(user_message, assistant_reply)

    # 2. Carica il contenuto esistente
    existing = load_summary(conversation_id)

    # 3. Componi il nuovo contenuto
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"**[{timestamp}]** {new_summary}"

    if existing:
        updated = f"{existing}\n\n{entry}"
    else:
        header = f"# Riassunto conversazione: {conversation_id}\n\n"
        updated = f"{header}{entry}"

    # 4. Se supera la soglia, condensa con meta-riassunto
    if len(updated) > META_SUMMARY_THRESHOLD:
        print(f"[interaction_summary] Soglia superata ({len(updated)}/{META_SUMMARY_THRESHOLD}), "
              f"generazione meta-riassunto per {conversation_id}")
        meta = await generate_meta_summary(updated)
        header = f"# Riassunto conversazione: {conversation_id}\n\n"
        updated = f"{header}## Meta-riassunto (condensato)\n\n{meta}\n\n---\n\n{entry}"

        # Se ancora troppo lungo, tronca il meta-riassunto
        if len(updated) > MAX_SUMMARY_CHARS:
            overflow = len(updated) - MAX_SUMMARY_CHARS + 200
            meta_truncated = meta[overflow:]
            updated = f"{header}## Meta-riassunto (condensato)\n\n...{meta_truncated}\n\n---\n\n{entry}"

    # 5. Salva
    save_summary(conversation_id, updated)
    print(f"[interaction_summary] Salvato riassunto per {conversation_id} ({len(updated)} chars)")

    return updated
