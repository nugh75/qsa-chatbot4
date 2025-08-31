from __future__ import annotations

import json
import re
from pathlib import Path
import shutil
import logging
from typing import Dict, List, Optional

SEED_PERSONALITIES_DIR = Path('/app/data')  # seed read-only
# Runtime storage: puntiamo alla directory montata persistente /app/storage
# Evita il precedente mismatch (/app/backend/storage) utilizzando il path assoluto persistente.
RUNTIME_BASE = Path('/app/storage')
RUNTIME_PERSONALITIES_DIR = RUNTIME_BASE / 'personalities'
PERSONALITIES_FILE = RUNTIME_PERSONALITIES_DIR / "PERSONALITIES.json"

def _bootstrap_personalities():
    RUNTIME_PERSONALITIES_DIR.mkdir(parents=True, exist_ok=True)
    seed_file = SEED_PERSONALITIES_DIR / 'PERSONALITIES.json'
    if not PERSONALITIES_FILE.exists() and seed_file.exists():
        try:
            shutil.copy2(seed_file, PERSONALITIES_FILE)
            logging.info('[personalities] Copiato seed PERSONALITIES.json nel runtime')
        except Exception as e:
            logging.warning(f'[personalities] Impossibile copiare seed PERSONALITIES.json: {e}')


def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "default"


def load_personalities() -> Dict:
    _bootstrap_personalities()
    try:
        if PERSONALITIES_FILE.exists():
            data = json.loads(PERSONALITIES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "personalities" in data:
                return data
    except Exception:
        logging.warning('[personalities] Errore caricamento PERSONALITIES.json', exc_info=True)
    return {"default_id": None, "personalities": []}


def save_personalities(data: Dict) -> None:
    RUNTIME_PERSONALITIES_DIR.mkdir(parents=True, exist_ok=True)
    PERSONALITIES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def upsert_personality(
    name: str,
    system_prompt_id: str,
    provider: str,
    model: str,
    welcome_message: Optional[str] = None,
    guide_id: Optional[str] = None,
    context_window: Optional[int] = None,
    temperature: Optional[float] = None,
    personality_id: Optional[str] = None,
    set_default: bool = False,
    avatar: Optional[str] = None,
    tts_provider: Optional[str] = None,
    tts_voice: Optional[str] = None,
    active: bool = True,
    enabled_pipeline_topics: Optional[List[str]] = None,
    enabled_rag_groups: Optional[List[int]] = None,
    enabled_mcp_servers: Optional[List[str]] = None,
    max_tokens: Optional[int] = None,
) -> Dict:
    data = load_personalities()
    if personality_id is None:
        personality_id = _slugify(name)
    # Update or insert
    found = False
    for p in data["personalities"]:
        if p["id"] == personality_id:
            p.update({
                "name": name,
                "system_prompt_id": system_prompt_id,
                "provider": provider,
                "model": model,
                "avatar": avatar if avatar is not None else p.get("avatar"),
                "tts_provider": tts_provider if tts_provider is not None else p.get("tts_provider"),
                "tts_voice": tts_voice if tts_voice is not None else p.get("tts_voice"),
                # welcome_message is stored as id referencing welcome_guides; keep previous value if not provided
                "welcome_message": welcome_message if welcome_message is not None else p.get("welcome_message"),
                # guide association (id) similar to welcome_message
                "guide_id": guide_id if guide_id is not None else p.get("guide_id"),
                "context_window": context_window if context_window is not None else p.get("context_window"),
                "temperature": temperature if temperature is not None else p.get("temperature"),
                "max_tokens": max_tokens if max_tokens is not None else p.get("max_tokens"),
                "active": active if active is not None else p.get("active", True),
                "enabled_pipeline_topics": enabled_pipeline_topics if enabled_pipeline_topics is not None else p.get("enabled_pipeline_topics", []),
                "enabled_rag_groups": enabled_rag_groups if enabled_rag_groups is not None else p.get("enabled_rag_groups", []),
                "enabled_mcp_servers": enabled_mcp_servers if enabled_mcp_servers is not None else p.get("enabled_mcp_servers", []),
            })
            found = True
            break
    if not found:
        data["personalities"].append({
            "id": personality_id,
            "name": name,
            "system_prompt_id": system_prompt_id,
            "provider": provider,
            "model": model,
            "avatar": avatar,
            "tts_provider": tts_provider,
            "tts_voice": tts_voice,
            "welcome_message": welcome_message,
            "guide_id": guide_id,
            "context_window": context_window,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "active": active,
            "enabled_pipeline_topics": enabled_pipeline_topics or [],
            "enabled_rag_groups": enabled_rag_groups or [],
            "enabled_mcp_servers": enabled_mcp_servers or [],
        })
    if set_default:
        data["default_id"] = personality_id
    save_personalities(data)
    return {"id": personality_id}


def delete_personality(personality_id: str) -> None:
    data = load_personalities()
    before = len(data.get("personalities", []))
    data["personalities"] = [p for p in data.get("personalities", []) if p["id"] != personality_id]
    if len(data["personalities"]) == before:
        raise ValueError("Personalità non trovata")
    if data.get("default_id") == personality_id:
        data["default_id"] = data["personalities"][0]["id"] if data["personalities"] else None
    save_personalities(data)


def set_default_personality(personality_id: str) -> None:
    data = load_personalities()
    ids = {p["id"] for p in data.get("personalities", [])}
    if personality_id not in ids:
        raise ValueError("Personalità non trovata")
    data["default_id"] = personality_id
    save_personalities(data)


def get_personality(personality_id: str) -> Optional[Dict]:
    data = load_personalities()
    for p in data.get("personalities", []):
        if p["id"] == personality_id:
            return p
    return None
