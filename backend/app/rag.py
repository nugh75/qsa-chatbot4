from pathlib import Path
from typing import Optional

# __file__ = backend/app/rag.py; repo data directory is at repo_root/data
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

FILES = {
    "analisi_secondo_livello": "analisi-di-secondo-livello.txt",
    "fattori_cognitivi": "fattori-cognitivi.txt",
    "artefice_di_se_stessi": "essere-artchietto-di-sestessi.txt",
    "faq_qsa": "domane-e-risposte.txt",
}

def load_text(name: str) -> str:
    fp = DATA_DIR / FILES[name]
    return fp.read_text(encoding="utf-8")

def get_context(topic: Optional[str], query: str = "") -> str:
    if topic and topic in FILES:
        return load_text(topic)
    # fallback: concat breve di tutti i file (tagliato)
    parts = []
    for key in FILES:
        try:
            txt = load_text(key)
            parts.append(f"[{key}]\n" + txt[:2000])
        except Exception:
            # Ignore missing/failed file
            continue
    return "\n\n".join(parts)[:6000]
