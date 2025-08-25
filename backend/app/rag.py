from pathlib import Path
import json
from typing import Optional, Dict
from functools import lru_cache

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CONFIG_FILE = Path(__file__).resolve().parent.parent / "pipeline_config.json"

@lru_cache(maxsize=1)
def load_files_mapping() -> Dict[str, str]:
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data.get("files", {})
    except Exception:
        return {}

def refresh_files_cache():
    load_files_mapping.cache_clear()  # type: ignore[attr-defined]

def load_text(name: str) -> str:
    file_map = load_files_mapping()
    fp = DATA_DIR / file_map[name]
    return fp.read_text(encoding="utf-8")

def get_context(topic: Optional[str], query: str = "") -> str:
    file_map = load_files_mapping()
    if topic and topic in file_map:
        try:
            return load_text(topic)
        except Exception:
            pass
    # fallback: concat breve di tutti i file (tagliato)
    parts = []
    for key in file_map:
        try:
            txt = load_text(key)
            parts.append(f"[{key}]\n" + txt[:2000])
        except Exception:
            continue
    return "\n\n".join(parts)[:6000]
