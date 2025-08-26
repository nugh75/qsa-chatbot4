from pathlib import Path

"""Gestione del prompt di sistema.

Nota: la cartella dati è nella root del repository (../.. / data),
quindi risaliamo di tre livelli da questo file (app -> backend -> repo root).
"""
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SYSTEM_PROMPT_FILE = DATA_DIR / "CLAUDE.md"
SUMMARY_PROMPT_FILE = DATA_DIR / "SUMMARY_PROMPT.md"

def load_system_prompt() -> str:
    """Carica il prompt di sistema dal file principale.

    Ritorna un fallback minimo se il file non esiste.
    """
    try:
        return SYSTEM_PROMPT_FILE.read_text(encoding="utf-8")
    except Exception:
        return "Sei Counselorbot, compagno di apprendimento. Guida l'utente attraverso i passi del QSA con tono positivo."

def save_system_prompt(text: str) -> None:
    """Salva (sovrascrive) il prompt di sistema.

    Crea la cartella dati se non esiste.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SYSTEM_PROMPT_FILE.write_text(text, encoding="utf-8")

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
