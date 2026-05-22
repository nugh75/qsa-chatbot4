import json
import os
import threading
import uuid
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field

from .auth import get_current_active_user, is_admin_user

LOCK = threading.Lock()

STORAGE_DIR = os.path.join(os.path.dirname(__file__), '..', 'storage', 'welcome-guide')
FILE_PATH = os.path.join(STORAGE_DIR, 'welcome_guide.json')


def _ensure_storage():
    os.makedirs(STORAGE_DIR, exist_ok=True)
    if not os.path.exists(FILE_PATH):
        # Seed file structure if missing
        seed = {
            "welcome": {"active_id": None, "messages": []},
            "guides": {"active_id": None, "guides": []}
        }
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(seed, f, ensure_ascii=False, indent=2)


def _load() -> dict:
    _ensure_storage()
    with LOCK:
        with open(FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)


def _save(data: dict):
    with LOCK:
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


class WelcomeMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"wm_{uuid.uuid4().hex[:8]}")
    title: Optional[str] = None
    content: str


class GuideItem(BaseModel):
    id: str = Field(default_factory=lambda: f"gd_{uuid.uuid4().hex[:8]}")
    title: Optional[str] = None
    content: str


class UpsertWelcome(BaseModel):
    title: Optional[str] = None
    content: str


class UpsertGuide(BaseModel):
    title: Optional[str] = None
    content: str


router = APIRouter(prefix="/welcome-guides", tags=["welcome-guides"])


def _admin_only(user=Depends(get_current_active_user)):
    if not is_admin_user(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


@router.get("/state")
def get_state():
    data = _load()
    return data


@router.get("/welcome", response_model=List[WelcomeMessage])
def list_welcome_messages():
    data = _load()
    return data.get("welcome", {}).get("messages", [])


@router.get("/guides", response_model=List[GuideItem])
def list_guides():
    data = _load()
    return data.get("guides", {}).get("guides", [])


@router.get("/welcome/active")
def get_active_welcome():
    data = _load()
    active_id = data.get("welcome", {}).get("active_id")
    for m in data.get("welcome", {}).get("messages", []):
        if m.get("id") == active_id:
            return m
    return None


@router.get("/guides/active")
def get_active_guide():
    data = _load()
    active_id = data.get("guides", {}).get("active_id")
    for g in data.get("guides", {}).get("guides", []):
        if g.get("id") == active_id:
            return g
    return None


@router.post("/welcome", response_model=WelcomeMessage, dependencies=[Depends(_admin_only)])
def create_welcome(msg: UpsertWelcome):
    data = _load()
    new = WelcomeMessage(title=msg.title, content=msg.content).model_dump()
    data.setdefault("welcome", {}).setdefault("messages", []).append(new)
    # Set active if none
    if not data["welcome"].get("active_id"):
        data["welcome"]["active_id"] = new["id"]
    _save(data)
    return new


@router.post("/guides", response_model=GuideItem, dependencies=[Depends(_admin_only)])
def create_guide(guide: UpsertGuide):
    data = _load()
    new = GuideItem(title=guide.title, content=guide.content).model_dump()
    data.setdefault("guides", {}).setdefault("guides", []).append(new)
    if not data["guides"].get("active_id"):
        data["guides"]["active_id"] = new["id"]
    _save(data)
    return new


@router.put("/welcome/{item_id}", response_model=WelcomeMessage, dependencies=[Depends(_admin_only)])
def update_welcome(item_id: str, msg: UpsertWelcome):
    data = _load()
    messages = data.get("welcome", {}).get("messages", [])
    for m in messages:
        if m["id"] == item_id:
            m["title"] = msg.title
            m["content"] = msg.content
            _save(data)
            return m
    raise HTTPException(404, "Welcome message not found")


@router.put("/guides/{item_id}", response_model=GuideItem, dependencies=[Depends(_admin_only)])
def update_guide(item_id: str, guide: UpsertGuide):
    data = _load()
    guides = data.get("guides", {}).get("guides", [])
    for g in guides:
        if g["id"] == item_id:
            g["title"] = guide.title
            g["content"] = guide.content
            _save(data)
            return g
    raise HTTPException(404, "Guide not found")


@router.delete("/welcome/{item_id}", dependencies=[Depends(_admin_only)])
def delete_welcome(item_id: str):
    data = _load()
    coll = data.get("welcome", {})
    msgs = coll.get("messages", [])
    new_msgs = [m for m in msgs if m["id"] != item_id]
    if len(new_msgs) == len(msgs):
        raise HTTPException(404, "Welcome message not found")
    coll["messages"] = new_msgs
    if coll.get("active_id") == item_id:
        coll["active_id"] = new_msgs[0]["id"] if new_msgs else None
    _save(data)
    return {"deleted": item_id}


@router.delete("/guides/{item_id}", dependencies=[Depends(_admin_only)])
def delete_guide(item_id: str):
    data = _load()
    coll = data.get("guides", {})
    guides = coll.get("guides", [])
    new_guides = [g for g in guides if g["id"] != item_id]
    if len(new_guides) == len(guides):
        raise HTTPException(404, "Guide not found")
    coll["guides"] = new_guides
    if coll.get("active_id") == item_id:
        coll["active_id"] = new_guides[0]["id"] if new_guides else None
    _save(data)
    return {"deleted": item_id}


class ActivateRequest(BaseModel):
    id: str
    kind: Literal['welcome','guide']


@router.post("/activate", dependencies=[Depends(_admin_only)])
def activate_item(payload: ActivateRequest):
    data = _load()
    if payload.kind == 'welcome':
        ids = [m['id'] for m in data.get('welcome', {}).get('messages', [])]
        if payload.id not in ids:
            raise HTTPException(404, 'Welcome message not found')
        data['welcome']['active_id'] = payload.id
    else:
        ids = [g['id'] for g in data.get('guides', {}).get('guides', [])]
        if payload.id not in ids:
            raise HTTPException(404, 'Guide not found')
        data['guides']['active_id'] = payload.id
    _save(data)
    return {"activated": payload.id, "kind": payload.kind}


@router.get("/public")
def public_welcome_and_guide():
    data = _load()
    welcome_active = None
    for m in data.get('welcome', {}).get('messages', []):
        if m.get('id') == data.get('welcome', {}).get('active_id'):
            welcome_active = m
            break
    guide_active = None
    for g in data.get('guides', {}).get('guides', []):
        if g.get('id') == data.get('guides', {}).get('active_id'):
            guide_active = g
            break
    return {"welcome": welcome_active, "guide": guide_active}


# --- Seed import helpers (programmatic) ---
def apply_seed(data_seed: dict, overwrite: bool = False) -> None:
    """Apply a seed structure to welcome/guides storage.

    data_seed shape (partial allowed):
      {
        "welcome": {"active_id": str|None, "messages": [{id,title,content}, ...]},
        "guides": {"active_id": str|None, "guides": [{id,title,content}, ...]}
      }

    - overwrite=False (default): merge items by id; keep existing ones; do not change active unless provided.
    - overwrite=True: replace entire sections if provided in seed; otherwise leave untouched.
    """
    if not isinstance(data_seed, dict):
        return
    data = _load()

    # Welcome
    if "welcome" in data_seed and isinstance(data_seed["welcome"], dict):
        seed_w = data_seed["welcome"]
        cur_w = data.get("welcome", {"active_id": None, "messages": []})
        if overwrite:
            data["welcome"] = {
                "active_id": seed_w.get("active_id"),
                "messages": seed_w.get("messages", [])
            }
        else:
            msgs = {m.get("id"): m for m in cur_w.get("messages", []) if isinstance(m, dict) and m.get("id")}
            for m in seed_w.get("messages", []) or []:
                mid = m.get("id")
                if not mid:
                    continue
                if mid in msgs:
                    # update fields
                    msgs[mid].update({k: v for k, v in m.items() if k in ("title","content") and v is not None})
                else:
                    msgs[mid] = m
            new_messages = list(msgs.values())
            new_active = cur_w.get("active_id")
            if seed_w.get("active_id") is not None:
                new_active = seed_w.get("active_id")
            data["welcome"] = {"active_id": new_active, "messages": new_messages}

    # Guides
    if "guides" in data_seed and isinstance(data_seed["guides"], dict):
        seed_g = data_seed["guides"]
        cur_g = data.get("guides", {"active_id": None, "guides": []})
        if overwrite:
            data["guides"] = {
                "active_id": seed_g.get("active_id"),
                "guides": seed_g.get("guides", [])
            }
        else:
            guides_map = {g.get("id"): g for g in cur_g.get("guides", []) if isinstance(g, dict) and g.get("id")}
            for g in seed_g.get("guides", []) or []:
                gid = g.get("id")
                if not gid:
                    continue
                if gid in guides_map:
                    guides_map[gid].update({k: v for k, v in g.items() if k in ("title","content") and v is not None})
                else:
                    guides_map[gid] = g
            new_guides = list(guides_map.values())
            new_active_g = cur_g.get("active_id")
            if seed_g.get("active_id") is not None:
                new_active_g = seed_g.get("active_id")
            data["guides"] = {"active_id": new_active_g, "guides": new_guides}

    _save(data)
