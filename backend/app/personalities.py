from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
PERSONALITIES_FILE = DATA_DIR / "PERSONALITIES.json"


def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "default"


def load_personalities() -> Dict:
    try:
        if PERSONALITIES_FILE.exists():
            data = json.loads(PERSONALITIES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "personalities" in data:
                return data
    except Exception:
        pass
    return {"default_id": None, "personalities": []}


def save_personalities(data: Dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PERSONALITIES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def upsert_personality(
    name: str,
    system_prompt_id: str,
    provider: str,
    model: str,
    personality_id: Optional[str] = None,
    set_default: bool = False,
    avatar: Optional[str] = None,
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
