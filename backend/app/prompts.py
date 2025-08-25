from pathlib import Path

def load_system_prompt() -> str:
    p = Path(__file__).resolve().parent.parent / "data" / "CLAUDE.md"
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        # fallback minimale
        return "Sei Counselorbot, compagno di apprendimento. Guida l'utente attraverso i passi del QSA con tono positivo."
