from __future__ import annotations

import json
import re
from pathlib import Path
import shutil
import logging
from typing import Dict, List, Optional

"""Gestione delle personalities (seed vs runtime).

Standard 2025-09:
    Seed versionati (lowercase): backend/config/seed/personalities.json
    Runtime persistente: /app/storage/personalities/personalities.json

Compat legacy rimossa: eliminati fallback /app/data. Solo seed lowercase e runtime persistente.
"""

SEED_BASE = Path(__file__).resolve().parent.parent / 'config' / 'seed'
# Runtime storage base (rimane invariato)
RUNTIME_BASE = Path('/app/storage')
RUNTIME_PERSONALITIES_DIR = RUNTIME_BASE / 'personalities'
# Replace old constant usage
SEED_PERSONALITIES_DIR = SEED_BASE
# Lowercase runtime file
PERSONALITIES_FILE = RUNTIME_PERSONALITIES_DIR / "personalities.json"
TOPIC_DESCRIPTIONS_FILE = SEED_BASE / 'system_prompts.json'
# Legacy fallback list
LEGACY_PERSONALITIES_CANDIDATES: list[Path] = []  # legacy support rimosso

_cached_topic_descriptions = None

def load_topic_descriptions() -> dict:
    global _cached_topic_descriptions
    if _cached_topic_descriptions is not None:
        return _cached_topic_descriptions
    try:
        if TOPIC_DESCRIPTIONS_FILE.exists():
            data = json.loads(TOPIC_DESCRIPTIONS_FILE.read_text(encoding='utf-8'))
            # Atteso formato { "topics": { "topic_name": "descrizione" } } oppure semplice dict
            if isinstance(data, dict):
                if 'topics' in data and isinstance(data['topics'], dict):
                    _cached_topic_descriptions = data['topics']
                else:
                    _cached_topic_descriptions = data
            else:
                _cached_topic_descriptions = {}
        else:
            _cached_topic_descriptions = {}
    except Exception:
        _cached_topic_descriptions = {}
    return _cached_topic_descriptions

def _bootstrap_personalities():
    RUNTIME_PERSONALITIES_DIR.mkdir(parents=True, exist_ok=True)
    # Se manca il runtime e c'è seed standard lo copia
    if not PERSONALITIES_FILE.exists():
        seed_std = SEED_BASE / 'personalities.json'
        if seed_std.exists():
            try:
                shutil.copy2(seed_std, PERSONALITIES_FILE)
                logging.info('[personalities] Copiato seed personalities.json nel runtime (source=%s)', seed_std)
            except Exception as e:
                logging.warning('[personalities] Impossibile copiare seed personalities.json: %s', e)


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
        logging.warning('[personalities] Errore caricamento personalities.json', exc_info=True)
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
