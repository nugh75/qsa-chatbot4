from pathlib import Path
import json
import re
from typing import Optional

"""Gestione del prompt di sistema.

Nota: la cartella dati è nella root del repository (../.. / data),
quindi risaliamo di tre livelli da questo file (app -> backend -> repo root).
"""
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SYSTEM_PROMPT_FILE = DATA_DIR / "CLAUDE.md"
SYSTEM_PROMPTS_JSON = DATA_DIR / "SYSTEM_PROMPTS.json"
SUMMARY_PROMPT_FILE = DATA_DIR / "SUMMARY_PROMPT.md"

DEFAULT_SYSTEM_TEXT = (
    "Sei Counselorbot, compagno di apprendimento. Guida l'utente attraverso i passi del QSA con tono positivo."
)

def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "default"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def _load_legacy_text() -> str:
    try:
        return SYSTEM_PROMPT_FILE.read_text(encoding="utf-8")
    except Exception:
        return DEFAULT_SYSTEM_TEXT

def load_system_prompts() -> dict:
    """Carica la collezione di system prompts. Se mancante, crea struttura di default.

    Structure: { "active_id": str, "prompts": [{"id","name","text"}, ...] }
    """
    try:
        if SYSTEM_PROMPTS_JSON.exists():
            data = json.loads(SYSTEM_PROMPTS_JSON.read_text(encoding="utf-8"))
            # basic validation
            if isinstance(data, dict) and "prompts" in data:
                return data
        # Migrate from legacy single file
        text = _load_legacy_text()
        data = {
            "active_id": "default",
            "prompts": [
                {"id": "default", "name": "Default", "text": text}
            ],
        }
        save_system_prompts(data)
        return data
    except Exception:
        # Fallback minimal
        return {"active_id": "default", "prompts": [{"id": "default", "name": "Default", "text": DEFAULT_SYSTEM_TEXT}]}

def save_system_prompts(data: dict) -> None:
    _ensure_data_dir()
    SYSTEM_PROMPTS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def set_active_system_prompt(prompt_id: str) -> None:
    data = load_system_prompts()
    ids = {p["id"] for p in data.get("prompts", [])}
    if prompt_id not in ids:
        raise ValueError("Prompt id non trovato")
    data["active_id"] = prompt_id
    save_system_prompts(data)

def upsert_system_prompt(name: str, text: str, prompt_id: Optional[str] = None, set_active: bool = False) -> dict:
    data = load_system_prompts()
    if prompt_id is None:
        prompt_id = _slugify(name)
    # Update if exists
    found = False
    for p in data["prompts"]:
        if p["id"] == prompt_id:
            p["name"] = name
            p["text"] = text
            found = True
            break
    if not found:
        data["prompts"].append({"id": prompt_id, "name": name, "text": text})
    if set_active:
        data["active_id"] = prompt_id
    save_system_prompts(data)
    return {"id": prompt_id}

def delete_system_prompt(prompt_id: str) -> None:
    data = load_system_prompts()
    prompts = [p for p in data.get("prompts", []) if p["id"] != prompt_id]
    if len(prompts) == len(data.get("prompts", [])):
        raise ValueError("Prompt id non trovato")
    data["prompts"] = prompts
    # If deleting active, reset to first available
    if data.get("active_id") == prompt_id:
        data["active_id"] = prompts[0]["id"] if prompts else "default"
    save_system_prompts(data)

def load_system_prompt() -> str:
    """Restituisce il testo del system prompt attivo."""
    data = load_system_prompts()
    active = data.get("active_id", "default")
    for p in data.get("prompts", []):
        if p["id"] == active:
            return p.get("text", DEFAULT_SYSTEM_TEXT)
    return DEFAULT_SYSTEM_TEXT

def get_system_prompt_by_id(prompt_id: str) -> str:
    data = load_system_prompts()
    for p in data.get("prompts", []):
        if p["id"] == prompt_id:
            return p.get("text", DEFAULT_SYSTEM_TEXT)
    return DEFAULT_SYSTEM_TEXT

def save_system_prompt(text: str) -> None:
    """Compat: salva il testo nel prompt attivo (o default)."""
    data = load_system_prompts()
    active = data.get("active_id", "default")
    for p in data.get("prompts", []):
        if p["id"] == active:
            p["text"] = text
            break
    else:
        data.setdefault("prompts", []).append({"id": "default", "name": "Default", "text": text})
        data["active_id"] = "default"
    save_system_prompts(data)

def load_summary_prompt() -> str:
    """Carica il prompt usato per generare i report/riassunti delle chat.

    Se non esiste restituisce un prompt di default modificabile dall'admin.
    """
    default = (
        "Sei un assistente che genera un REPORT di una conversazione tra utente e counselorbot. "
        "Obiettivo: produrre un riassunto strutturato in italiano che includa: \n"
        "1. Titolo breve descrittivo (max 12 parole).\n"
        "2. Obiettivo dichiarato o implicito dell'utente.\n"
        "3. Punti chiave emersi (bullet sintetici).\n"
        "4. Eventuali fattori cognitivi/affettivi menzionati.\n"
        "5. Progressi o cambiamenti durante il dialogo.\n"
        "6. Suggerimenti concreti per il prossimo passo (max 5).\n"
        "7. Tono generale e stato emotivo percepito.\n\n"
        "Regole: Non inventare dettagli assenti. Mantieni tono professionale, empatico e sintetico."
    )
    try:
        return SUMMARY_PROMPT_FILE.read_text(encoding="utf-8")
    except Exception:
        return default

def save_summary_prompt(text: str) -> None:
    """Salva (sovrascrive) il prompt di riassunto conversazioni."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_PROMPT_FILE.write_text(text, encoding="utf-8")
