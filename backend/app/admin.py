from .prompts import (
    load_system_prompts,
    load_summary_prompt,
    save_summary_prompt,
    reset_summary_prompt_from_seed,
    load_summary_prompts,
    upsert_summary_prompt,
    set_active_summary_prompt,
    delete_summary_prompt
)
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import json
import os
import logging
from .prompts import (
    load_system_prompt,
    save_system_prompt,
    load_summary_prompt,
    save_summary_prompt,
    load_system_prompts,
    upsert_system_prompt,
    set_active_system_prompt,
    delete_system_prompt,
)
from fastapi import UploadFile
from fastapi import File as FastFile
from fastapi.staticfiles import StaticFiles
from .topic_router import refresh_routes_cache
from .rag import refresh_files_cache
from .usage import read_usage, usage_stats, reset_usage, query_usage
from .memory import get_memory
from .transcribe import whisper_service
from .auth import AuthManager, get_current_admin_user
from pathlib import Path
import re
import sqlite3
import bcrypt
import secrets
import string
from datetime import datetime, timedelta
from .rag_engine import RAGEngine
from .personalities import (
    load_personalities,
    upsert_personality,
    delete_personality,
    set_default_personality,
)
from .logging_utils import LOG_DIR, get_system_logger
import logging as _logging
from fastapi.responses import FileResponse
import glob
import json as _json

# Configurazione database - usa il percorso relativo alla directory backend
BASE_DIR = Path(__file__).parent.parent
DATABASE_PATH = BASE_DIR / "storage" / "databases" / "qsa_chatbot.db"

router = APIRouter(dependencies=[Depends(get_current_admin_user)])

class AdminConfig(BaseModel):
    ai_providers: Dict[str, Any]
    tts_providers: Dict[str, Any]
    default_provider: str
    default_tts: str

# ---- Endpoint introspection ----
class EndpointInfo(BaseModel):
    method: str
    path: str
    name: str | None = None
    summary: str | None = None

@router.get("/admin/endpoints")
async def list_endpoints(limit_prefix: str = "/api"):
    """Elenca gli endpoint GET/POST esposti (solo letti dall'app FastAPI principale).
    Filtra facoltativamente per prefix (default '/api'). Ritorna solo metodi GET/POST.
    Nota: questo endpoint mostra le route effettive dopo l'inclusione dei router.
    """
    try:
        from fastapi import FastAPI
        # L'app globale è raggiungibile tramite router.dependency_overrides se montato? fallback a traversal.
        # In FastAPI non c'è riferimento diretto all'app dentro il router, quindi usiamo "request" se servisse.
        # Qui importiamo l'istanza app dal modulo main.
        from . import main as _main
        app_obj = getattr(_main, 'app', None)
        if app_obj is None or not isinstance(app_obj, FastAPI):
            raise RuntimeError("App FastAPI principale non trovata")
        items: list[EndpointInfo] = []
        for route in app_obj.routes:
            methods = getattr(route, 'methods', []) or []
            path = getattr(route, 'path', '')
            if limit_prefix and not path.startswith(limit_prefix):
                continue
            for m in methods:
                if m in ("GET", "POST"):
                    items.append(EndpointInfo(
                        method=m,
                        path=path,
                        name=getattr(route, 'name', None),
                        summary=getattr(route, 'summary', None)
                    ))
        # Ordina per path poi metodo
        items.sort(key=lambda x: (x.path, x.method))
        return {"success": True, "count": len(items), "endpoints": [i.dict() for i in items]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore introspezione endpoints: {e}")

# Configurazione predefinita
DEFAULT_CONFIG = {
    "ai_providers": {
        "local": {
            "enabled": False,
            "name": "Local LLM",
            "models": [],
            "selected_model": ""
        },
        "gemini": {
            "enabled": False,
            "name": "Google Gemini",
            "models": [],
            "selected_model": ""
        },
        "claude": {
            "enabled": False,
            "name": "Anthropic Claude",
            "models": [],
            "selected_model": ""
        },
        "openai": {
            "enabled": False,
            "name": "OpenAI",
            "models": [],
            "selected_model": ""
        },
        "openrouter": {
            "enabled": False,
            "name": "OpenRouter",
            "models": [],
            "selected_model": ""
        },
        "ollama": {
            "enabled": False,
            "name": "Ollama",
            "base_url": "http://localhost:11434",
            "models": [],
            "selected_model": ""
        }
    },
    "tts_providers": {
        "edge": {
            "enabled": True,
            "voices": ["it-IT-DiegoNeural", "it-IT-ElsaNeural", "it-IT-IsabellaNeural"],
            "selected_voice": "it-IT-ElsaNeural"
        },
        "elevenlabs": {
            "enabled": False,
            "api_key": "",
            "voices": ["Rachel", "Domi", "Bella", "Antoni", "Elli", "Josh"],
            "selected_voice": "Rachel"
        },
        "openai": {
            "enabled": False,
            "api_key": "",
            "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
            "selected_voice": "nova"
        },
        "piper": {
            "enabled": True,
            "voices": ["it_IT-riccardo-x_low", "it_IT-paola-medium"],
            "selected_voice": "it_IT-riccardo-x_low"
        }
    },
    "default_provider": "local",
    "default_tts": "edge",
    "ui_settings": {
        "arena_public": False
    },
    "summary_settings": {
        "provider": "openrouter",  # Provider dedicato per i summary (NON local)
        "enabled": True
    },
    "memory_settings": {
        "max_messages_per_session": 10,
        "auto_cleanup_hours": 24,
        "enabled": True
    }
}

def get_config_file_path():
    """Ottieni il percorso del file di configurazione"""
    return os.path.join(os.path.dirname(__file__), "..", "config", "admin_config.json")

def load_config():
    """Carica la configurazione dal file o usa quella predefinita"""
    config_file = get_config_file_path()
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return DEFAULT_CONFIG

def save_config(config: dict):
    """Salva la configurazione nel file"""
    config_file = get_config_file_path()
    os.makedirs(os.path.dirname(config_file), exist_ok=True)
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def get_summary_provider():
    """Ottiene il provider configurato per i summary (mai 'local')"""
    config = load_config()
    summary_settings = config.get("summary_settings", {})
    provider = summary_settings.get("provider", "openrouter")
    enabled = summary_settings.get("enabled", True)
    
    # Fallback se il provider è local (non dovrebbe mai succedere)
    if provider == "local":
        provider = "openrouter"
    
    return provider if enabled else "openrouter"  # Fallback sicuro

# ---- UI settings (arena visibility) ----
class UiSettingsIn(BaseModel):
    arena_public: bool
    contact_email: str | None = None

@router.get("/admin/ui-settings")
async def get_ui_settings():
    try:
        config = load_config()
        ui = config.get("ui_settings", {"arena_public": False, "contact_email": None})
        if "arena_public" not in ui:
            ui["arena_public"] = False
        if "contact_email" not in ui:
            ui["contact_email"] = None
        return {"settings": ui}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento impostazioni UI: {str(e)}")

@router.post("/admin/ui-settings")
async def update_ui_settings(payload: UiSettingsIn):
    try:
        config = load_config()
        config.setdefault("ui_settings", {})
        config["ui_settings"]["arena_public"] = bool(payload.arena_public)
        if payload.contact_email is not None:
            # Basic sanitize trim
            ce = payload.contact_email.strip() or None
            config["ui_settings"]["contact_email"] = ce
        save_config(config)
        return {"success": True, "message": "Impostazioni UI aggiornate"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore salvataggio impostazioni UI: {str(e)}")

@router.get("/admin/config")
async def get_config():
    config = load_config()
    
    # Aggiungi le API key mascherate per l'interfaccia
    masked_config = config.copy()
    
    # Per ogni provider che usa API key, aggiungi la versione mascherata
    api_keys = {
        "gemini": os.getenv("GOOGLE_API_KEY", ""),
        "claude": os.getenv("ANTHROPIC_API_KEY", ""), 
        "openai": os.getenv("OPENAI_API_KEY", ""),
        "openrouter": os.getenv("OPENROUTER_API_KEY", "")
    }
    
    for provider, api_key in api_keys.items():
        if provider in masked_config["ai_providers"]:
            masked_config["ai_providers"][provider]["api_key_status"] = "configured" if api_key else "missing"
            masked_config["ai_providers"][provider]["api_key_masked"] = "••••••••••••••••" if api_key else ""
    
    # Sovrascrivi l'URL di Ollama con quello dalle variabili di ambiente
    if "ollama" in masked_config["ai_providers"]:
        ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        masked_config["ai_providers"]["ollama"]["base_url"] = ollama_base_url
    
    # Aggiungi anche lo status per ElevenLabs TTS
    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
    if "elevenlabs" in masked_config["tts_providers"]:
        masked_config["tts_providers"]["elevenlabs"]["api_key_status"] = "configured" if elevenlabs_key else "missing"
        masked_config["tts_providers"]["elevenlabs"]["api_key_masked"] = "••••••••••••••••" if elevenlabs_key else ""
    
    return masked_config

@router.post("/admin/config")
async def save_admin_config(config: AdminConfig):
    """Salva la configurazione amministratore"""
    try:
        save_config(config.dict())
        return {"success": True, "message": "Configurazione salvata con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio: {str(e)}")

@router.get("/admin/system-prompt")
async def get_system_prompt():
    """Restituisce il prompt di sistema corrente."""
    try:
        return {"prompt": load_system_prompt()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento prompt: {str(e)}")

class SystemPromptIn(BaseModel):
    prompt: str

@router.post("/admin/system-prompt")
async def update_system_prompt(payload: SystemPromptIn):
    """Aggiorna/salva il prompt di sistema."""
    try:
        save_system_prompt(payload.prompt)
        return {"success": True, "message": "Prompt salvato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio prompt: {str(e)}")

@router.post("/admin/system-prompt/reset")
async def reset_system_prompt():
    """Ripristina un prompt di default minimale."""
    try:
        default_text = "Sei Counselorbot, compagno di apprendimento. Guida l'utente attraverso i passi del QSA con tono positivo."
        save_system_prompt(default_text)
        return {"success": True, "prompt": default_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset prompt: {str(e)}")

# ---- Multiple system prompts management ----
from typing import Optional

class SystemPromptEntry(BaseModel):
    id: Optional[str] = None
    name: str
    text: str
    set_active: bool = False

@router.get("/admin/system-prompts")
async def list_system_prompts():
    try:
        data = load_system_prompts()
        return {"active_id": data.get("active_id"), "prompts": data.get("prompts", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento prompts: {str(e)}")

@router.post("/admin/system-prompts")
async def upsert_system_prompt_api(entry: SystemPromptEntry):
    try:
        res = upsert_system_prompt(entry.name, entry.text, entry.id, entry.set_active)
        return {"success": True, "id": res.get("id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore salvataggio prompt: {str(e)}")

@router.post("/admin/system-prompts/activate")
async def activate_system_prompt(prompt_id: str):
    try:
        set_active_system_prompt(prompt_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore attivazione prompt: {str(e)}")

@router.delete("/admin/system-prompts/{prompt_id}")
async def delete_system_prompt_api(prompt_id: str):
    try:
        delete_system_prompt(prompt_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore eliminazione prompt: {str(e)}")

# ---- Summary prompt endpoints ----
@router.get("/admin/summary-prompt")
async def get_summary_prompt():
    """Restituisce il prompt di riassunto conversazioni."""
    try:
        prompt = load_summary_prompt()
        logging.info(
            "[admin] GET summary-prompt len=%d sha1=%s",
            len(prompt),
            __import__('hashlib').sha1(prompt.encode('utf-8')).hexdigest()[:10]
        )
        return {"prompt": prompt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento summary prompt: {str(e)}")

@router.post("/admin/summary-prompt")
async def update_summary_prompt(payload: SystemPromptIn):
    """Aggiorna il prompt di riassunto conversazioni."""
    try:
        before = None
        try:
            # Legge eventuale versione precedente per confronto (best-effort)
            from .prompts import load_summary_prompt as _ls
            before = _ls()
        except Exception:
            before = None
        save_summary_prompt(payload.prompt)
        diff_info = {
            "new_len": len(payload.prompt),
            "old_len": (len(before) if before is not None else None),
            "changed": (before != payload.prompt) if before is not None else True,
        }
        logging.info(
            "[admin] Summary prompt update: changed=%s old_len=%s new_len=%s first20_new=%r",
            diff_info["changed"],
            diff_info["old_len"],
            diff_info["new_len"],
            payload.prompt[:20]
        )
        return {"success": True, "message": "Summary prompt salvato", "meta": diff_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio summary prompt: {str(e)}")

@router.post("/admin/summary-prompt/reset")
async def reset_summary_prompt():
    """Ripristina il prompt di riassunto conversazioni di default."""
    try:
        default_text = load_summary_prompt()  # load_summary_prompt già restituisce default se file assente
        save_summary_prompt(default_text)
        return {"success": True, "prompt": default_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset summary prompt: {str(e)}")

@router.post("/admin/summary-prompt/reset-seed")
async def reset_summary_prompt_seed():
    """Forza il reset copiando il file seed /app/data/SUMMARY_PROMPT.md (se presente)."""
    try:
        text = reset_summary_prompt_from_seed()
        return {"success": True, "prompt": text, "seed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset seed summary prompt: {str(e)}")

# ---- Summary settings endpoints ----
class SummarySettingsIn(BaseModel):
    provider: str
    enabled: bool

# ---- Summary prompts (multi) endpoints ----
class SummaryPromptIn(BaseModel):
    name: str
    text: str
    id: str | None = None
    set_active: bool = False

@router.get("/admin/summary-prompts")
async def list_summary_prompts():
    try:
        return load_summary_prompts()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento summary prompts: {e}")

@router.post("/admin/summary-prompts")
async def create_or_update_summary_prompt(payload: SummaryPromptIn):
    try:
        res = upsert_summary_prompt(payload.name, payload.text, payload.id, payload.set_active)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore upsert summary prompt: {e}")

@router.post("/admin/summary-prompts/{prompt_id}/activate")
async def activate_summary_prompt(prompt_id: str):
    try:
        set_active_summary_prompt(prompt_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore attivazione summary prompt: {e}")

@router.delete("/admin/summary-prompts/{prompt_id}")
async def remove_summary_prompt(prompt_id: str):
    try:
        delete_summary_prompt(prompt_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione summary prompt: {e}")

@router.get("/admin/summary-settings")
async def get_summary_settings():
    """Ottiene le impostazioni correnti per la generazione dei summary"""
    try:
        config = load_config()
        summary_settings = config.get("summary_settings", {"provider": "openrouter", "enabled": True})
        return {"settings": summary_settings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento impostazioni summary: {str(e)}")

@router.post("/admin/summary-settings")
async def update_summary_settings(payload: SummarySettingsIn):
    """Aggiorna le impostazioni per la generazione dei summary"""
    try:
        # Valida che il provider non sia "local"
        if payload.provider == "local":
            raise HTTPException(status_code=400, detail="Il provider 'local' non può essere usato per i summary")
        
        config = load_config()
        config["summary_settings"] = {
            "provider": payload.provider,
            "enabled": payload.enabled
        }
        save_config(config)
        return {"success": True, "message": "Impostazioni summary aggiornate"}
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio impostazioni summary: {str(e)}")

# ---- Personalities (presets) management ----
class PersonalityIn(BaseModel):
    id: Optional[str] = None
    name: str
    system_prompt_id: str
    provider: str
    model: str
    set_default: bool = False
    avatar: Optional[str] = None  # filename under storage/avatars

@router.get("/admin/personalities")
async def list_personalities_admin():
    try:
        return load_personalities()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento personalità: {str(e)}")

@router.post("/admin/personalities")
async def upsert_personality_admin(p: PersonalityIn):
    try:
        res = upsert_personality(p.name, p.system_prompt_id, p.provider, p.model, p.id, p.set_default, p.avatar)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore salvataggio personalità: {str(e)}")

@router.delete("/admin/personalities/{personality_id}")
async def delete_personality_admin(personality_id: str):
    try:
        delete_personality(personality_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore eliminazione personalità: {str(e)}")

@router.post("/admin/personalities/default")
async def set_default_personality_admin(personality_id: str):
    try:
        set_default_personality(personality_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore impostazione default: {str(e)}")

# ---- Logs (system & interactions) ----
@router.get("/admin/logs/system")
async def get_system_log(tail: int = 500):
    try:
        log_path = LOG_DIR / "system.log"
        if not log_path.exists():
            return {"lines": [], "path": str(log_path)}
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        if tail > 0:
            lines = lines[-min(tail, len(lines)) :]
        return {"lines": [l.rstrip('\n') for l in lines], "path": str(log_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura system log: {str(e)}")

@router.get("/admin/logs/system/download")
async def download_system_log():
    try:
        log_path = LOG_DIR / "system.log"
        if not log_path.exists():
            raise HTTPException(status_code=404, detail="system.log non trovato")
        return FileResponse(str(log_path), media_type="text/plain", filename="system.log")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore download system log: {str(e)}")

@router.get("/admin/logs/interactions/dates")
async def get_interaction_log_dates():
    try:
        files = glob.glob(str(LOG_DIR / "interactions_*.jsonl"))
        dates = []
        for fp in files:
            name = os.path.basename(fp)
            # interactions_YYYY-MM-DD.jsonl
            try:
                d = name.split("_")[1].split(".")[0]
                dates.append(d)
            except Exception:
                continue
        dates = sorted(list(set(dates)), reverse=True)
        return {"dates": dates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura date: {str(e)}")

@router.get("/admin/logs/interactions/filters")
async def get_interactions_filters(date: Optional[str] = None):
    """Restituisce i valori distinti disponibili per i filtri dei log interazioni.
    Campi: provider, event, model, topic, user_id, conversation_id, personalities (id->name)
    """
    try:
        # Determine file path
        if date:
            path = LOG_DIR / f"interactions_{date}.jsonl"
        else:
            files = glob.glob(str(LOG_DIR / "interactions_*.jsonl"))
            if not files:
                return {"providers": [], "events": [], "models": [], "topics": [], "user_ids": [], "conversation_ids": [], "personalities": []}
            latest = sorted(files, reverse=True)[0]
            path = Path(latest)

        if not path.exists():
            return {"providers": [], "events": [], "models": [], "topics": [], "user_ids": [], "conversation_ids": [], "personalities": []}

        providers = set()
        events = set()
        models = set()
        topics = set()
        user_ids = set()
        conversation_ids = set()
        pers_map: dict[str, str] = {}

        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = _json.loads(line)
                except Exception:
                    continue
                p = obj.get('provider')
                if p: providers.add(p)
                ph = obj.get('provider_header')
                if ph: providers.add(ph)
                ev = obj.get('event')
                if ev: events.add(ev)
                m = obj.get('model')
                if m: models.add(m)
                t = obj.get('topic')
                if t: topics.add(t)
                ui = obj.get('user_id')
                if ui is not None: user_ids.add(ui)
                cid = obj.get('conversation_id')
                if cid: conversation_ids.add(cid)
                pid = obj.get('personality_id')
                if pid:
                    pers_map.setdefault(pid, obj.get('personality_name') or '')

        return {
            "providers": sorted(list(providers)),
            "events": sorted(list(events)),
            "models": sorted(list(models)),
            "topics": sorted(list(topics)),
            "user_ids": sorted(list(user_ids)),
            "conversation_ids": sorted(list(conversation_ids)),
            "personalities": [{"id": k, "name": v or k} for k, v in pers_map.items()]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura filtri: {str(e)}")

@router.get("/admin/logs/interactions")
async def get_interactions_log(
    date: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    provider: Optional[str] = None,
    event: Optional[str] = None,
    personality_id: Optional[str] = None,
    model: Optional[str] = None,
    conversation_id: Optional[str] = None,
    user_id: Optional[int] = None,
    topic: Optional[str] = None,
    request_id: Optional[str] = None,
    group_by_request_id: bool = False,
    rag: Optional[bool] = None,
    min_duration_ms: Optional[int] = None,
    max_duration_ms: Optional[int] = None,
    min_tokens: Optional[int] = None,
    max_tokens: Optional[int] = None,
):
    try:
        # Determine file path
        if date:
            path = LOG_DIR / f"interactions_{date}.jsonl"
        else:
            files = glob.glob(str(LOG_DIR / "interactions_*.jsonl"))
            if not files:
                return {"items": [], "total": 0, "date": None}
            latest = sorted(files, reverse=True)[0]
            path = Path(latest)
            date = os.path.basename(latest).split("_")[1].split(".")[0]

        if not path.exists():
            return {"items": [], "total": 0, "date": date}

        # Load and filter
        items = []
        total_lines = 0
        parsed_lines = 0
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                total_lines += 1
                try:
                    obj = _json.loads(line)
                    parsed_lines += 1
                except Exception:
                    continue
                if request_id and (obj.get('request_id') or '') != request_id:
                    continue
                if provider and (obj.get('provider') or obj.get('provider_header') or '') != provider:
                    continue
                if event and (obj.get('event') or '') != event:
                    continue
                if personality_id and (obj.get('personality_id') or '') != personality_id:
                    continue
                if model and (obj.get('model') or '') != model:
                    continue
                if conversation_id and (obj.get('conversation_id') or '') != conversation_id:
                    continue
                if user_id is not None and (obj.get('user_id') != user_id):
                    continue
                if topic and (obj.get('topic') or '') != topic:
                    continue
                if rag is not None:
                    if (obj.get('rag_used') is None) or (bool(obj.get('rag_used')) != bool(rag)):
                        continue
                if (min_duration_ms is not None) or (max_duration_ms is not None):
                    d = obj.get('duration_ms')
                    if d is not None:
                        if (min_duration_ms is not None and d < min_duration_ms) or (max_duration_ms is not None and d > max_duration_ms):
                            continue
                if (min_tokens is not None) or (max_tokens is not None):
                    t = None
                    tok = obj.get('tokens')
                    if isinstance(tok, dict):
                        t = tok.get('total_tokens') or tok.get('total')
                    if t is not None:
                        if (min_tokens is not None and t < min_tokens) or (max_tokens is not None and t > max_tokens):
                            continue
                items.append(obj)
        try:
            get_system_logger().info(f"Interactions log: date={date} path={path} lines={total_lines} parsed={parsed_lines} kept={len(items)} grouped={group_by_request_id}")
        except Exception:
            pass
        # Group by request_id if requested
        if group_by_request_id:
            from datetime import datetime
            groups: Dict[str, dict] = {}
            def _parse_ts(ts: str):
                try:
                    return datetime.fromisoformat(ts.replace('Z','+00:00'))
                except Exception:
                    return None
            for ev in items:
                rid = ev.get('request_id') or f"noid_{id(ev)}"
                g = groups.setdefault(rid, {
                    'request_id': rid,
                    'events': [],
                    'start_ts': None,
                    'end_ts': None,
                    'duration_ms': None,
                    'provider': None,
                    'provider_header': None,
                    'model': None,
                    'personality_id': None,
                    'personality_name': None,
                    'topic': None,
                    'session_id': None,
                    'conversation_id': None,
                    'user_id': None,
                    'tokens_total': None,
                    'rag_used': False,
                    'rag_preview': [],
                    'raw_count': 0,
                })
                g['events'].append(ev.get('event'))
                g['raw_count'] += 1
                ts = ev.get('ts')
                if ts:
                    if g['start_ts'] is None or ts < g['start_ts']:
                        g['start_ts'] = ts
                    if g['end_ts'] is None or ts > g['end_ts']:
                        g['end_ts'] = ts
                # Prefer completion/resolved fields, else fallback
                if ev.get('provider') and not g['provider']:
                    g['provider'] = ev.get('provider')
                if ev.get('provider_header') and not g['provider_header']:
                    g['provider_header'] = ev.get('provider_header')
                if ev.get('model') and not g['model']:
                    g['model'] = ev.get('model')
                if ev.get('personality_id') and not g['personality_id']:
                    g['personality_id'] = ev.get('personality_id')
                if ev.get('personality_name') and not g['personality_name']:
                    g['personality_name'] = ev.get('personality_name')
                if ev.get('topic') and not g['topic']:
                    g['topic'] = ev.get('topic')
                if ev.get('session_id') and not g['session_id']:
                    g['session_id'] = ev.get('session_id')
                if ev.get('conversation_id') and not g['conversation_id']:
                    g['conversation_id'] = ev.get('conversation_id')
                if (ev.get('user_id') is not None) and (g['user_id'] is None):
                    g['user_id'] = ev.get('user_id')
                # tokens
                tok = ev.get('tokens')
                if isinstance(tok, dict):
                    g['tokens_total'] = tok.get('total_tokens') or tok.get('total') or g['tokens_total']
                # rag
                if ev.get('rag_used'):
                    g['rag_used'] = True
                # rag preview (first 3 entries if present)
                if not g['rag_preview'] and ev.get('rag_results'):
                    try:
                        rp = []
                        for r in (ev.get('rag_results') or [])[:3]:
                            rp.append({
                                'filename': r.get('filename'),
                                'chunk_index': r.get('chunk_index'),
                                'similarity': r.get('similarity')
                            })
                        g['rag_preview'] = rp
                    except Exception:
                        pass
                # duration
                if ev.get('duration_ms') and not g['duration_ms']:
                    g['duration_ms'] = ev.get('duration_ms')
            # Compute missing durations by ts delta
            for rid, g in groups.items():
                if not g['duration_ms'] and g['start_ts'] and g['end_ts']:
                    st = _parse_ts(g['start_ts'])
                    et = _parse_ts(g['end_ts'])
                    if st and et:
                        g['duration_ms'] = int((et - st).total_seconds() * 1000)
                # Normalize provider
                if not g['provider'] and g['provider_header']:
                    g['provider'] = g['provider_header']
                if not g['personality_name'] and g['personality_id']:
                    g['personality_name'] = g['personality_id']
            # Apply grouped-level filters
            if rag is not None:
                groups = {k: v for k, v in groups.items() if bool(v.get('rag_used')) == bool(rag)}
            if (min_duration_ms is not None) or (max_duration_ms is not None):
                def _dur_ok(v):
                    d = v.get('duration_ms')
                    if d is None:
                        return True
                    if min_duration_ms is not None and d < min_duration_ms:
                        return False
                    if max_duration_ms is not None and d > max_duration_ms:
                        return False
                    return True
                groups = {k: v for k, v in groups.items() if _dur_ok(v)}
            if (min_tokens is not None) or (max_tokens is not None):
                def _tok_ok(v):
                    t = v.get('tokens_total')
                    if t is None:
                        return True
                    if min_tokens is not None and t < min_tokens:
                        return False
                    if max_tokens is not None and t > max_tokens:
                        return False
                    return True
                groups = {k: v for k, v in groups.items() if _tok_ok(v)}

            grouped = list(groups.values())
            try:
                get_system_logger().info(f"Interactions log grouped: groups={len(grouped)}")
            except Exception:
                pass
            # Sort by end_ts desc
            grouped.sort(key=lambda x: x.get('end_ts') or '', reverse=True)
            total = len(grouped)
            slice_items = grouped[offset: offset+limit]
            return {"items": slice_items, "total": total, "date": date, "grouped": True}

        # Sort desc by ts (ungrouped)
        def _ts(x):
            return x.get('ts') or ''
        items.sort(key=_ts, reverse=True)
        total = len(items)
        slice_items = items[offset: offset+limit]
        return {"items": slice_items, "total": total, "date": date, "grouped": False}
    except Exception as e:
        try:
            logger = get_system_logger()
            import traceback as _tb
            logger.error(f"Interactions log error: {e}\n{_tb.format_exc()}")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Errore lettura interactions log: {str(e)}")

@router.get("/admin/logs/interactions/download")
async def download_interactions_log(date: Optional[str] = None):
    try:
        if date:
            path = LOG_DIR / f"interactions_{date}.jsonl"
        else:
            files = glob.glob(str(LOG_DIR / "interactions_*.jsonl"))
            if not files:
                raise HTTPException(status_code=404, detail="Nessun log interazioni disponibile")
            latest = sorted(files, reverse=True)[0]
            path = Path(latest)
            date = os.path.basename(latest).split("_")[1].split(".")[0]
        if not path.exists():
            raise HTTPException(status_code=404, detail="File non trovato")
        filename = f"interactions_{date}.jsonl"
        # application/x-ndjson per JSON Lines
        return FileResponse(str(path), media_type="application/x-ndjson", filename=filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore download interactions log: {str(e)}")


# ---- Avatar upload/list ----
@router.post("/admin/avatars/upload")
async def upload_avatar(file: UploadFile = FastFile(...)):
    try:
        allowed = {".png", ".jpg", ".jpeg", ".webp"}
        from pathlib import Path
        ext = Path(file.filename).suffix.lower()
        if ext not in allowed:
            raise HTTPException(status_code=400, detail="Formato non supportato. Usa PNG/JPG/WEBP.")
        # sanitize filename
        base = Path(file.filename).stem
        safe = re.sub(r"[^a-zA-Z0-9_-]", "-", base).strip("-") or "avatar"
        # unique suffix
        import time
        fname = f"{safe}-{int(time.time())}{ext}"
        target_dir = Path(__file__).parent.parent / "storage" / "avatars"
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / fname
        with open(target_path, "wb") as out:
            out.write(await file.read())
        return {"success": True, "filename": fname, "url": f"/static/avatars/{fname}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore upload avatar: {str(e)}")

@router.get("/admin/avatars")
async def list_avatars():
    try:
        from pathlib import Path
        avatars_dir = Path(__file__).parent.parent / "storage" / "avatars"
        if not avatars_dir.exists():
            return {"avatars": []}
        items = []
        for p in avatars_dir.iterdir():
            if p.is_file() and p.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                items.append({"filename": p.name, "url": f"/static/avatars/{p.name}"})
        return {"avatars": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore elenco avatar: {str(e)}")

# ---------------- Pipeline (routing + files) -----------------
PIPELINE_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"

class PipelineConfig(BaseModel):
    routes: List[Dict[str, str]]
    files: Dict[str, str]

class PipelineRoute(BaseModel):
    pattern: str
    topic: str

class PipelineFile(BaseModel):
    topic: str
    filename: str

class RouteUpdate(BaseModel):
    old_pattern: str
    old_topic: str
    new_pattern: str
    new_topic: str

class FileUpdate(BaseModel):
    old_topic: str
    new_topic: str
    new_filename: str

@router.get("/admin/pipeline")
async def get_pipeline_config():
    try:
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento pipeline: {str(e)}")

@router.post("/admin/pipeline")
async def update_pipeline_config(cfg: PipelineConfig):
    # Validazione regex
    invalid = []
    for route in cfg.routes:
        pat = route.get("pattern", "")
        try:
            re.compile(pat)
        except re.error as e:
            invalid.append({"pattern": pat, "error": str(e)})
    if invalid:
        raise HTTPException(status_code=400, detail={"message": "Pattern regex non valido", "invalid": invalid})
    try:
        PIPELINE_CONFIG_PATH.write_text(json.dumps(cfg.dict(), indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_routes_cache()
        refresh_files_cache()
        return {"success": True, "message": "Pipeline salvata"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio pipeline: {str(e)}")

@router.post("/admin/pipeline/reset")
async def reset_pipeline_config():
    """Ripristina pipeline_config.json ai valori iniziali se presenti nel repository."""
    try:
        # Carica il file originale dal repository (se esiste) oppure fallback hardcoded
        default_path = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"
        if default_path.exists():
            original = json.loads(default_path.read_text(encoding="utf-8"))
        else:
            original = {"routes": [], "files": {}}
        # Sovrascrive
        PIPELINE_CONFIG_PATH.write_text(json.dumps(original, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_routes_cache()
        refresh_files_cache()
        return {"success": True, "pipeline": original}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset pipeline: {str(e)}")

@router.post("/admin/pipeline/route/add")
async def add_pipeline_route(route: PipelineRoute):
    """Aggiungi una nuova route alla pipeline"""
    try:
        # Valida regex
        try:
            re.compile(route.pattern)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Pattern regex non valido: {str(e)}")
        
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Verifica che il pattern non esista già
        for existing_route in data["routes"]:
            if existing_route["pattern"] == route.pattern:
                raise HTTPException(status_code=400, detail="Pattern già esistente")
        
        # Aggiungi la nuova route
        data["routes"].append({"pattern": route.pattern, "topic": route.topic})
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_routes_cache()
        
        return {"success": True, "message": "Route aggiunta con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiunta route: {str(e)}")

@router.post("/admin/pipeline/route/update")
async def update_pipeline_route(update: RouteUpdate):
    """Modifica una route esistente"""
    try:
        # Valida regex
        try:
            re.compile(update.new_pattern)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Pattern regex non valido: {str(e)}")
        
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Trova e aggiorna la route
        route_found = False
        for i, route in enumerate(data["routes"]):
            if route["pattern"] == update.old_pattern and route["topic"] == update.old_topic:
                # Verifica che il nuovo pattern non esista già (escludendo quello corrente)
                for j, existing_route in enumerate(data["routes"]):
                    if j != i and existing_route["pattern"] == update.new_pattern:
                        raise HTTPException(status_code=400, detail="Il nuovo pattern è già in uso")
                
                data["routes"][i] = {"pattern": update.new_pattern, "topic": update.new_topic}
                route_found = True
                break
        
        if not route_found:
            raise HTTPException(status_code=404, detail="Route non trovata")
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_routes_cache()
        
        return {"success": True, "message": "Route aggiornata con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento route: {str(e)}")

@router.delete("/admin/pipeline/route")
async def delete_pipeline_route(pattern: str, topic: str):
    """Elimina una route dalla pipeline"""
    try:
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Trova e rimuovi la route
        route_found = False
        for i, route in enumerate(data["routes"]):
            if route["pattern"] == pattern and route["topic"] == topic:
                data["routes"].pop(i)
                route_found = True
                break
        
        if not route_found:
            raise HTTPException(status_code=404, detail="Route non trovata")
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_routes_cache()
        
        return {"success": True, "message": "Route eliminata con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione route: {str(e)}")

@router.post("/admin/pipeline/file/add")
async def add_pipeline_file(file_mapping: PipelineFile):
    """Aggiungi un nuovo mapping file alla pipeline"""
    try:
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Verifica che il topic non esista già
        if file_mapping.topic in data["files"]:
            raise HTTPException(status_code=400, detail="Topic già esistente")
        # Verifica che il file esista nella directory pipeline_files
        data_dir = _pipeline_data_dir()
        file_path = data_dir / file_mapping.filename
        if not file_path.exists():
            raise HTTPException(status_code=400, detail=f"File {file_mapping.filename} non trovato nella directory pipeline_files")
        
        # Aggiungi il nuovo mapping
        data["files"][file_mapping.topic] = file_mapping.filename
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_files_cache()
        
        return {"success": True, "message": "Mapping file aggiunto con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiunta mapping file: {str(e)}")

@router.post("/admin/pipeline/file/update")
async def update_pipeline_file(update: FileUpdate):
    """Modifica un mapping file esistente"""
    try:
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Verifica che il vecchio topic esista
        if update.old_topic not in data["files"]:
            raise HTTPException(status_code=404, detail="Topic non trovato")
        
        # Verifica che il nuovo topic non esista già (se diverso dal vecchio)
        if update.new_topic != update.old_topic and update.new_topic in data["files"]:
            raise HTTPException(status_code=400, detail="Il nuovo topic è già in uso")
        # Verifica che il file esista nella directory pipeline_files
        data_dir = _pipeline_data_dir()
        file_path = data_dir / update.new_filename
        if not file_path.exists():
            raise HTTPException(status_code=400, detail=f"File {update.new_filename} non trovato nella directory pipeline_files")
        
        # Rimuovi il vecchio mapping
        del data["files"][update.old_topic]
        
        # Aggiungi il nuovo mapping
        data["files"][update.new_topic] = update.new_filename
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_files_cache()
        
        return {"success": True, "message": "Mapping file aggiornato con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento mapping file: {str(e)}")

@router.delete("/admin/pipeline/file")
async def delete_pipeline_file(topic: str):
    """Elimina un mapping file dalla pipeline"""
    try:
        # Carica configurazione attuale
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        
        # Verifica che il topic esista
        if topic not in data["files"]:
            raise HTTPException(status_code=404, detail="Topic non trovato")
        
        # Rimuovi il mapping
        del data["files"][topic]
        
        # Salva
        PIPELINE_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        refresh_files_cache()
        
        return {"success": True, "message": "Mapping file eliminato con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione mapping file: {str(e)}")

@router.get("/admin/pipeline/files/available")
async def get_available_files():
    """Ottieni la lista dei file disponibili nella directory pipeline_files"""
    try:
        data_dir = _pipeline_data_dir()
        if not data_dir.exists():
            return {"files": []}
        
        # Lista file supportati nella directory data
        available_files = []
        for file_path in data_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in ['.txt', '.md', '.pdf', '.docx']:
                available_files.append(file_path.name)
        
        return {"files": sorted(available_files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero file disponibili: {str(e)}")

# ---- Pipeline file content edit/upload ----
import shutil
def _pipeline_data_dir() -> Path:
    """Restituisce la directory pipeline_files persistente, con migrazione automatica e log diagnostico."""
    import os
    env_dir = os.getenv("PIPELINE_FILES_DIR")
    here = Path(__file__).resolve()
    storage_dir = here.parent.parent / "storage" / "pipeline_files"
    legacy_data_dir = here.parent.parent.parent / "data"
    # Priorità: env, storage, legacy
    if env_dir:
        d = Path(env_dir)
        d.mkdir(parents=True, exist_ok=True)
        print(f"[Pipeline] PIPELINE_FILES_DIR attivo: {d}")
        return d
    migrated = 0
    if not storage_dir.exists():
        storage_dir.mkdir(parents=True, exist_ok=True)
        # Migrazione automatica
        if legacy_data_dir.exists():
            for f in legacy_data_dir.iterdir():
                if f.is_file() and f.suffix.lower() in ['.txt', '.md', '.pdf', '.docx']:
                    target = storage_dir / f.name
                    if not target.exists():
                        try:
                            shutil.copy2(f, target)
                            migrated += 1
                        except Exception as e:
                            print(f"[Pipeline] Errore migrazione file: {e}")
            # Marker file
            marker = storage_dir / ".pipeline_migrated"
            marker.write_text(f"Migrati {migrated} file da {legacy_data_dir} all'avvio\n", encoding="utf-8")
    print(f"[Pipeline] pipeline_files dir: {storage_dir} (migrati {migrated} nuovi file)")
    return storage_dir

def _safe_pipeline_file(filename: str) -> Path:
    if not filename or any(sep in filename for sep in ["..", "/", "\\"]):
        raise HTTPException(status_code=400, detail="Nome file non valido")
    base = _pipeline_data_dir().resolve()
    base.mkdir(parents=True, exist_ok=True)
    p = (base / filename).resolve()
    if base not in p.parents and base != p:
        raise HTTPException(status_code=400, detail="Percorso non consentito")
    return p

@router.get("/admin/pipeline/file/content")
async def get_pipeline_file_content(filename: str):
    try:
        path = _safe_pipeline_file(filename)
        if not path.exists():
            raise HTTPException(status_code=404, detail="File non trovato")
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Il file non è testuale (UTF-8)")
        return {"filename": filename, "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura file: {str(e)}")

class PipelineFileContentIn(BaseModel):
    filename: str
    content: str

@router.post("/admin/pipeline/file/content")
async def save_pipeline_file_content(payload: PipelineFileContentIn):
    try:
        path = _safe_pipeline_file(payload.filename)
        path.write_text(payload.content, encoding="utf-8")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore scrittura file: {str(e)}")

@router.post("/admin/pipeline/file/upload")
async def upload_pipeline_file(file: UploadFile = FastFile(...)):
    try:
        original = Path(file.filename).name
        if not original:
            raise HTTPException(status_code=400, detail="Filename mancante")
        safe_name = re.sub(r"[^a-zA-Z0-9_.\-]", "-", original)
        target = _safe_pipeline_file(safe_name)
        if target.exists():
            import time
            target = target.with_name(f"{target.stem}-{int(time.time())}{target.suffix}")
        with open(target, "wb") as out:
            out.write(await file.read())
        return {"success": True, "filename": target.name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore upload file: {str(e)}")

# --------------- Usage logging endpoints ---------------
@router.get("/admin/usage")
async def get_usage(
    limit: int = 0,
    start: Optional[str] = None,
    end: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
):
    try:
        if limit:
            data = read_usage(limit=limit)
            return {"items": data, "mode": "simple"}
        qres = query_usage(start=start, end=end, provider=provider, model=model, q=q, page=page, page_size=page_size)
        return {"mode": "query", **qres}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento usage: {str(e)}")

@router.get("/admin/usage/stats")
async def get_usage_stats():
    try:
        return usage_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore stats usage: {str(e)}")

@router.post("/admin/usage/reset")
async def reset_usage_logs():
    try:
        reset_usage()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset usage: {str(e)}")

@router.get("/admin/usage/export")
async def export_usage(format: str = "csv"):
    try:
        data = query_usage(page_size=100000)["items"]
        if format == "jsonl":
            lines = "\n".join(json.dumps(e, ensure_ascii=False) for e in data)
            return lines
        # csv basic
        import io, csv
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ts","provider","model","duration_ms","tokens_total","tokens_in","tokens_out"])
        for e in data:
            t = (e.get('tokens') or {})
            writer.writerow([
                e.get('ts',''), e.get('provider',''), e.get('model',''), e.get('duration_ms',''),
                t.get('total',''), t.get('input_tokens',''), t.get('output_tokens','')
            ])
        return output.getvalue()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore export usage: {str(e)}")

@router.get("/admin/test-provider/{provider}")
async def test_ai_provider(provider: str):
    """Testa un provider AI"""
    try:
        config = load_config()
        provider_config = config["ai_providers"].get(provider)
        
        if not provider_config or not provider_config.get("enabled"):
            return {"success": False, "message": "Provider non abilitato"}
        
        # Qui potresti aggiungere test specifici per ogni provider
        # Per ora restituiamo solo la configurazione
        return {
            "success": True, 
            "message": f"Provider {provider} configurato correttamente",
            "config": provider_config
        }
        
    except Exception as e:
        return {"success": False, "message": f"Errore nel test: {str(e)}"}

@router.get("/admin/voices/{tts_provider}")
async def get_available_voices(tts_provider: str):
    """Ottieni le voci disponibili per un provider TTS"""
    try:
        if tts_provider == "edge":
            # Voci Microsoft Edge TTS per italiano
            return {
                "voices": [
                    "it-IT-DiegoNeural", "it-IT-ElsaNeural", "it-IT-IsabellaNeural",
                    "it-IT-BenignoNeural", "it-IT-CalimeroNeural", "it-IT-CataldoNeural",
                    "it-IT-FabiolaNeural", "it-IT-FidellioNeural", "it-IT-GianniNeural",
                    "it-IT-GiuseppeNeural", "it-IT-ImeldaNeural", "it-IT-IrmaNeural",
                    "it-IT-LisandroNeural", "it-IT-PalmiraNeural", "it-IT-PierinaNeural",
                    "it-IT-RinaldoNeural"
                ]
            }
        elif tts_provider == "piper":
            # Voci Piper per italiano
            return {
                "voices": [
                    "it_IT-riccardo-x_low",
                    "it_IT-paola-medium"
                ]
            }
        elif tts_provider == "elevenlabs":
            # Voci ElevenLabs (fetch dinamico)
            api_key = os.getenv("ELEVENLABS_API_KEY", "")
            if not api_key:
                return {"voices": []}
            
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        "https://api.elevenlabs.io/v1/voices",
                        headers={"xi-api-key": api_key}
                    )
                    if response.status_code == 200:
                        data = response.json()
                        voices = [voice["name"] for voice in data.get("voices", [])]
                        return {"voices": voices}
            except Exception:
                pass
            
            # Fallback a voci predefinite
            return {
                "voices": ["Rachel", "Domi", "Bella", "Antoni", "Elli", "Josh", "Arnold", "Adam", "Sam"]
            }
        elif tts_provider == "openai":
            # Voci OpenAI
            return {
                "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
            }
        else:
            return {"voices": []}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero voci: {str(e)}")

@router.get("/admin/models/{ai_provider}")
async def get_available_models(ai_provider: str):
    """Ottieni i modelli disponibili per un provider AI"""
    try:
        import httpx
        
        if ai_provider == "local":
            return {
                "models": ["qsa-analyzer", "qsa-advanced"]
            }
        
        elif ai_provider == "gemini":
            # Modelli Google Gemini - verifica presenza API key
            config = load_config()
            api_key = config["ai_providers"].get("gemini", {}).get("api_key") or os.getenv("GOOGLE_API_KEY")
            
            return {
                "models": [
                    "gemini-pro",
                    "gemini-pro-vision", 
                    "gemini-1.5-pro",
                    "gemini-1.5-flash"
                ]
            }
        
        elif ai_provider == "claude":
            # Modelli Anthropic Claude - verifica presenza API key
            config = load_config()
            api_key = config["ai_providers"].get("claude", {}).get("api_key") or os.getenv("ANTHROPIC_API_KEY")
            
            return {
                "models": [
                    "claude-3-opus-20240229",
                    "claude-3-sonnet-20240229", 
                    "claude-3-haiku-20240307",
                    "claude-3-5-sonnet-20240620"
                ]
            }
        
        elif ai_provider == "openai":
            # Modelli OpenAI (fetch dinamico)
            api_key = os.getenv("OPENAI_API_KEY")
            
            if api_key:
                try:
                    import httpx
                    async with httpx.AsyncClient() as client:
                        response = await client.get(
                            "https://api.openai.com/v1/models",
                            headers={"Authorization": f"Bearer {api_key}"}
                        )
                        if response.status_code == 200:
                            data = response.json()
                            models = [model["id"] for model in data["data"] 
                                    if model["id"].startswith(("gpt-", "text-"))]
                            return {"models": sorted(models)}
                except Exception:
                    pass
            
            # Fallback ai modelli predefiniti
            return {
                "models": [
                    "gpt-4",
                    "gpt-4-turbo", 
                    "gpt-4o",
                    "gpt-3.5-turbo",
                    "gpt-3.5-turbo-16k"
                ]
            }
        
        elif ai_provider == "openrouter":
            # Modelli OpenRouter (fetch dinamico)
            config = load_config()
            api_key = config["ai_providers"].get("openrouter", {}).get("api_key") or os.getenv("OPENROUTER_API_KEY")
            
            try:
                import httpx
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                async with httpx.AsyncClient() as client:
                    response = await client.get("https://openrouter.ai/api/v1/models", headers=headers)
                    if response.status_code == 200:
                        data = response.json()
                        models = [model["id"] for model in data["data"]]
                        return {"models": models[:50]}  # Primi 50 modelli
            except Exception:
                pass
            
            # Fallback ai modelli predefiniti
            return {
                "models": [
                    "anthropic/claude-3-sonnet",
                    "anthropic/claude-3-haiku", 
                    "openai/gpt-4",
                    "openai/gpt-3.5-turbo",
                    "meta-llama/llama-2-70b-chat",
                    "mistralai/mixtral-8x7b-instruct"
                ]
            }
        
        elif ai_provider == "ollama":
            # Modelli Ollama (fetch dinamico)
            config = load_config()
            base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"{base_url}/api/tags")
                    if response.status_code == 200:
                        data = response.json()
                        models = [model["name"] for model in data.get("models", [])]
                        return {"models": models}
            except Exception:
                pass
            
            # Fallback ai modelli predefiniti
            return {
                "models": [
                    "llama2",
                    "llama2:13b",
                    "mistral", 
                    "codellama",
                    "phi3",
                    "gemma"
                ]
            }
        
        else:
            return {"models": []}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero modelli: {str(e)}")

@router.post("/admin/test-model")
async def test_model(request: dict):
    provider = request.get("provider")
    model = request.get("model")
    
    if not provider or not model:
        return {"success": False, "message": "Provider e modello sono richiesti"}
    
    try:
        # Test simulato per verificare che il modello sia configurabile
        config = load_config()
        provider_config = config.get("ai_providers", {}).get(provider, {})
        
        if not provider_config.get("enabled", False):
            return {"success": False, "message": f"Provider {provider} non è abilitato"}
        
        # Verifica che il modello sia nella lista disponibile
        available_models = provider_config.get("models", [])
        if model not in available_models:
            return {"success": False, "message": f"Modello {model} non disponibile per {provider}"}
        
        # Test base di configurazione
        if provider in ["local", "gemini", "claude", "openai", "openrouter", "ollama"]:
            # Verifica API key se necessaria (dalle variabili di ambiente)
            if provider == "gemini":
                api_key = os.getenv("GOOGLE_API_KEY")
                if not api_key:
                    return {"success": False, "message": f"API key mancante per {provider} (variabile GOOGLE_API_KEY)"}
            elif provider == "claude":
                api_key = os.getenv("ANTHROPIC_API_KEY")
                if not api_key:
                    return {"success": False, "message": f"API key mancante per {provider} (variabile ANTHROPIC_API_KEY)"}
            elif provider == "openai":
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    return {"success": False, "message": f"API key mancante per {provider} (variabile OPENAI_API_KEY)"}
            elif provider == "openrouter":
                api_key = os.getenv("OPENROUTER_API_KEY")
                if not api_key:
                    return {"success": False, "message": f"API key mancante per {provider} (variabile OPENROUTER_API_KEY)"}
            
            return {"success": True, "message": f"Modello {model} testato con successo per {provider}"}
        else:
            return {"success": False, "message": f"Provider {provider} non supportato"}
            
    except Exception as e:
        return {"success": False, "message": f"Errore nel test del modello: {str(e)}"}

# --------------- Memory management endpoints ---------------
@router.get("/admin/memory/stats")
async def get_memory_stats():
    """Ottieni statistiche della memoria delle conversazioni"""
    try:
        memory = get_memory()
        return memory.get_all_sessions_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore stats memoria: {str(e)}")

@router.post("/admin/memory/config")
async def update_memory_config(max_messages: int):
    """Aggiorna la configurazione della memoria"""
    try:
        if max_messages < 1 or max_messages > 100:
            raise HTTPException(status_code=400, detail="Il numero di messaggi deve essere tra 1 e 100")
        
        memory = get_memory()
        memory.set_max_messages(max_messages)
        
        # Salva la configurazione nel file
        config = load_config()
        if "memory_settings" not in config:
            config["memory_settings"] = {}
        config["memory_settings"]["max_messages_per_session"] = max_messages
        save_config(config)
        
        return {"success": True, "message": f"Memoria configurata per {max_messages} messaggi per sessione"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento memoria: {str(e)}")

@router.post("/admin/memory/clear")
async def clear_memory(session_id: Optional[str] = None):
    """Cancella la memoria (sessione specifica o tutte)"""
    try:
        memory = get_memory()
        if session_id:
            memory.clear_session(session_id)
            return {"success": True, "message": f"Sessione {session_id} cancellata"}
        else:
            memory.clear_all_sessions()
            return {"success": True, "message": "Tutte le sessioni cancellate"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore cancellazione memoria: {str(e)}")

@router.post("/admin/memory/cleanup")
async def cleanup_old_sessions(max_idle_hours: int = 24):
    """Pulisce le sessioni inattive"""
    try:
        memory = get_memory()
        removed_count = memory.cleanup_old_sessions(max_idle_hours)
        return {"success": True, "message": f"Rimosse {removed_count} sessioni inattive"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore pulizia memoria: {str(e)}")

# Modelli per Whisper
class WhisperDownloadRequest(BaseModel):
    model: str

class WhisperSetModelRequest(BaseModel):
    model: str

@router.get("/admin/whisper/models")
async def get_whisper_models():
    """Restituisce la lista dei modelli Whisper disponibili e il modello corrente"""
    try:
        models_status = whisper_service.get_models_status()
        
        # Lista dei modelli scaricati
        downloaded_models = [model.name for model in models_status if model.downloaded]
        
        # Modello corrente
        current_model = getattr(whisper_service, 'current_model_name', 'small') if whisper_service.current_model else None
        
        return {
            "success": True,
            "models": downloaded_models,
            "current_model": current_model,
            "status": {model.name: model.dict() for model in models_status}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento modelli Whisper: {str(e)}")

@router.post("/admin/whisper/download")
async def download_whisper_model(request: WhisperDownloadRequest):
    """Scarica un modello Whisper"""
    try:
        await whisper_service.download_model(request.model)
        return {"success": True, "message": f"Modello {request.model} scaricato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore download modello: {str(e)}")

@router.post("/admin/whisper/set-model")
async def set_whisper_model(request: WhisperSetModelRequest):
    """Imposta il modello Whisper predefinito"""
    try:
        whisper_service.load_model(request.model)
        whisper_service.current_model_name = request.model
        return {"success": True, "message": f"Modello {request.model} impostato come predefinito"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore impostazione modello: {str(e)}")

# ==== ADMIN RAG ENDPOINTS ====
from .rag_engine import rag_engine
from . import embedding_manager

class RAGGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None

class RAGGroupUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

# ==== EMBEDDING CONFIG ENDPOINTS ====
class EmbeddingSetRequest(BaseModel):
    provider_type: str
    model_name: str

class EmbeddingDownloadRequest(BaseModel):
    model_name: str

@router.get("/admin/rag/embedding/config")
async def get_embedding_config():
    try:
        cfg = embedding_manager.get_config()
        # Augment with runtime provider info
        try:
            prov = embedding_manager.get_provider()
            cfg["runtime"] = prov.info()
        except Exception as e:  # provider non caricato
            cfg["runtime_error"] = str(e)
        return {"success": True, "config": cfg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento embedding config: {e}")

@router.get("/admin/rag/embedding/local-models")
async def list_local_embedding_models():
    try:
        return {"success": True, "models": embedding_manager.list_local_models()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore elenco modelli: {e}")

@router.post("/admin/rag/embedding/set")
async def set_embedding_provider(req: EmbeddingSetRequest):
    try:
        embedding_manager.set_provider(req.provider_type, req.model_name)
        info = embedding_manager.get_config()
        # Nota: cambiamento di dimensione potrebbe richiedere reindicizzazione manuale
        return {"success": True, "message": "Provider embedding aggiornato", "config": info}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore set provider: {e}")

@router.post("/admin/rag/embedding/download/start")
async def start_embedding_download(req: EmbeddingDownloadRequest):
    try:
        task_id = embedding_manager.start_model_download(req.model_name)
        return {"success": True, "task_id": task_id}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore avvio download: {e}")

@router.get("/admin/rag/embedding/download/status")
async def get_embedding_download_status(task_id: str):
    try:
        status = embedding_manager.download_status(task_id)
        if not status:
            raise HTTPException(status_code=404, detail="Task non trovato")
        return {"success": True, "status": status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore status download: {e}")

@router.get("/admin/rag/embedding/download/tasks")
async def list_embedding_download_tasks():
    try:
        tasks = embedding_manager.download_tasks()
        return {"success": True, "tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore elenco tasks: {e}")

@router.get("/admin/rag/stats")
async def admin_get_rag_stats():
    """Get RAG statistics for admin panel"""
    try:
        stats = rag_engine.get_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/groups")
async def admin_get_rag_groups():
    """Get all RAG groups for admin panel"""
    try:
        groups = rag_engine.get_groups()
        return {"success": True, "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/groups")
async def admin_create_rag_group(request: RAGGroupRequest):
    """Create new RAG group for admin panel"""
    try:
        group_id = rag_engine.create_group(request.name, request.description)
        return {"success": True, "group_id": group_id, "message": f"Gruppo '{request.name}' creato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/rag/groups/{group_id}")
async def admin_delete_rag_group(group_id: int):
    """Delete RAG group for admin panel"""
    try:
        rag_engine.delete_group(group_id)
        return {"success": True, "message": "Gruppo eliminato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/rag/groups/{group_id}")
async def admin_update_rag_group(group_id: int, request: RAGGroupUpdateRequest):
    """Update RAG group for admin panel"""
    try:
        rag_engine.update_group(group_id, request.name, request.description)
        return {"success": True, "message": "Gruppo aggiornato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/upload")
async def admin_upload_rag_document(
    group_id: int = Form(...),
    file: UploadFile = File(...)
):
    """Upload document to RAG group for admin panel"""
    import tempfile
    import os
    
    try:
        # Check if file is PDF
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Solo file PDF sono supportati")
        
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content_bytes = await file.read()
            temp_file.write(content_bytes)
            temp_file_path = temp_file.name
        
        try:
            # Extract text from PDF
            from .file_processing import extract_text_from_pdf
            text_content = extract_text_from_pdf(temp_file_path)
            
            if not text_content.strip():
                raise HTTPException(status_code=400, detail="Impossibile estrarre testo dal PDF")
            
            # Add document to group
            document_id = rag_engine.add_document(
                group_id=group_id,
                filename=file.filename,
                content=text_content,
                original_filename=file.filename
            )
            
            return {
                "success": True, 
                "document_id": document_id,
                "message": f"Documento '{file.filename}' caricato con successo"
            }
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/groups/{group_id}/documents")
async def admin_get_rag_documents(group_id: int):
    """Get documents in RAG group for admin panel"""
    try:
        documents = rag_engine.get_group_documents(group_id)
        return {"success": True, "documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/rag/documents/{document_id}")
async def admin_delete_rag_document(document_id: int):
    """Delete RAG document for admin panel"""
    try:
        rag_engine.delete_document(document_id)
        return {"success": True, "message": "Documento eliminato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==== ADMIN USER MANAGEMENT ENDPOINTS ====
import bcrypt
import secrets
import string

class UserResetPasswordRequest(BaseModel):
    user_id: int

@router.get("/admin/users")
async def admin_get_users():
    """Get all users for admin panel (without sensitive data)"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, email, created_at, last_login, is_admin 
            FROM users 
            ORDER BY created_at DESC
        """)
        
        users = []
        for row in cursor.fetchall():
            users.append({
                "id": row[0],
                "email": row[1],
                "created_at": row[2],
                "last_login": row[3],
                "is_admin": bool(row[4]) if row[4] is not None else False
            })
        
        conn.close()
        return {"success": True, "users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int):
    """Delete user account for admin panel"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # First check if user exists
        cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        
        # Delete user conversations first (foreign key constraint)
        cursor.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))
        
        # Delete user
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        
        conn.commit()
        conn.close()
        
        return {"success": True, "message": f"Utente {user[0]} eliminato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: int):
    """Reset user password and return new temporary password.
    Also clears failed attempts and lock, and updates user_key_hash.
    """
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        email = row[0]

        # Generate new temporary password
        characters = string.ascii_letters + string.digits + "!@#$%&*"
        temp_password = ''.join(secrets.choice(characters) for _ in range(12))

        # Hashes
        new_hash = AuthManager.hash_password(temp_password)
        new_user_key_hash = AuthManager.generate_user_key_hash(temp_password, email)

        # Update user
        cursor.execute(
            """
            UPDATE users 
            SET password_hash = ?, user_key_hash = ?, failed_login_attempts = 0, locked_until = NULL, must_change_password = 1
            WHERE id = ?
            """,
            (new_hash, new_user_key_hash, user_id)
        )
        conn.commit()
        conn.close()

        return {
            "success": True,
            "message": f"Password reset per {email}",
            "temporary_password": temp_password,
            "email": email
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UserRoleRequest(BaseModel):
    is_admin: bool

@router.put("/admin/users/{user_id}/role")
async def admin_change_user_role(user_id: int, request: UserRoleRequest):
    """Change user role (admin/user)"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        
        # Update user role
        cursor.execute(
            "UPDATE users SET is_admin = ? WHERE id = ?",
            (1 if request.is_admin else 0, user_id)
        )
        conn.commit()
        conn.close()
        
        role_name = "amministratore" if request.is_admin else "utente"
        return {
            "success": True,
            "message": f"Ruolo cambiato a {role_name} per {user[0]}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Test endpoint semplice per debug
@router.get("/admin/test-users")
async def admin_test_users():
    """Test endpoint for debugging"""
    import os
    return {
        "success": True, 
        "message": "Endpoint funziona", 
        "users": [],
        "database_path": str(DATABASE_PATH),
        "database_exists": DATABASE_PATH.exists(),
        "current_working_directory": os.getcwd(),
        "absolute_database_path": str(DATABASE_PATH.absolute())
    }
