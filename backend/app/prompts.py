from pathlib import Path

"""Gestione del prompt di sistema.

Nota: la cartella dati è nella root del repository (../.. / data),
quindi risaliamo di tre livelli da questo file (app -> backend -> repo root).
"""
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SYSTEM_PROMPT_FILE = DATA_DIR / "CLAUDE.md"

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
