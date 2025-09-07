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
# NOTE: Avoid importing topic_router at module import time to prevent circular import
# (topic_router imports load_config from this module). We'll lazy-import refresh_routes_cache
# where needed via the _refresh_routes_cache() helper below.
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
from .rag_engine import RAGEngine, rag_engine
from .personalities import (
    load_personalities,
    upsert_personality,
    delete_personality,
    set_default_personality,
)
from .logging_utils import LOG_DIR, get_system_logger
from .database import db_manager, USING_POSTGRES
import logging as _logging
from fastapi.responses import FileResponse
import glob
import json as _json
from fastapi import Response
import hashlib
import httpx
import asyncio, uuid, time
import threading

# ---- TTS Download Task Persistence Helpers ----
# We add lightweight JSON persistence so that async download tasks survive process restarts.
# File format: JSON Lines, each line a task dict. On save we rewrite the full file atomically.
_TTS_TASKS_LOCK = threading.RLock()
_TTS_TASKS_FILE = Path(__file__).parent.parent / 'storage' / 'tts_download_tasks.jsonl'

def _load_tts_tasks_from_disk() -> dict[str, dict]:
    tasks: dict[str, dict] = {}
    try:
        if _TTS_TASKS_FILE.exists():
            with open(_TTS_TASKS_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        tid = obj.get('id') or obj.get('task_id')
                        if isinstance(tid, str):
                            tasks[tid] = obj
                    except Exception:
                        continue
    except Exception:
        pass
    # Mark any running/pending tasks as 'stale' since we lost the in-flight coroutine on restart.
    now = time.time()
    for t in tasks.values():
        if t.get('status') in ('running','pending'):
            t['status'] = 'stale'
            t.setdefault('ended_at', now)
            t.setdefault('error', 'process_restarted')
    return tasks

def _save_tts_tasks_to_disk(tasks: dict[str, dict]):
    try:
        _TTS_TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = _TTS_TASKS_FILE.with_suffix('.tmp')
        with open(tmp_path, 'w', encoding='utf-8') as f:
            for t in tasks.values():
                try:
                    f.write(json.dumps(t, ensure_ascii=False) + '\n')
                except Exception:
                    continue
        os.replace(tmp_path, _TTS_TASKS_FILE)
    except Exception:
        pass

# Percorsi guida amministratore (root + storage copia)
# Primary admin guide path moved into config directory (persistent & versioned)
ADMIN_GUIDE_ROOT_PATH = Path(__file__).resolve().parent.parent / 'config' / 'ADMIN_GUIDE.md'
# Legacy fallback locations (checked only if primary missing)
_ADMIN_GUIDE_FALLBACKS = [
    Path(__file__).resolve().parent.parent / 'ADMIN_GUIDE.md',                # previous backend copy
    Path(__file__).resolve().parent.parent.parent / 'ADMIN_GUIDE.md'          # repository root
]
ADMIN_GUIDE_STORAGE_PATH = Path(__file__).resolve().parent.parent / 'storage' / 'admin' / 'ADMIN_GUIDE.md'

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
        "coqui": {
            "enabled": False,
            "models": [
                "tts_models/it/mai_female/vits",
                "tts_models/it/mai_male/vits"
            ],
            "voices": [
                "tts_models/it/mai_female/vits",
                "tts_models/it/mai_male/vits"
            ],
            "selected_voice": "tts_models/it/mai_female/vits"
        },
        "piper": {
            "enabled": True,
            "voices": ["it_IT-riccardo-low", "it_IT-paola-medium"],
            "selected_voice": "it_IT-riccardo-low"
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
    },
    "context_settings": {
        "total_tokens": 9000,            # target totale (token stimati)
        "min_topics_tokens": 3000,       # minimo riservato ai topics
        "min_rag_tokens": 2000,          # minimo riservato al RAG
        "jaccard_threshold": 0.8,        # soglia dedup topic
        "topics_extra_share": 0.7        # quota leftover ai topics
    },
    "pipeline_settings": {
        "force_case_insensitive": False,
        "normalize_accents": False
    }
}

def ensure_default_ai_provider(seed: bool = True, force: bool = False):
    """Ensure a sane default provider/model (OpenRouter + gpt-oss-20b:free) without overwriting explicit admin choices.

    Rules:
    - Only run if seed True.
    - If force True (env RESEED_DEFAULTS=1) apply even if values already set.
    - If openrouter block missing, create it disabled (admin can enable later).
    - If selected_model empty (or forcing) set to gpt-oss-20b:free (do not touch if already non-empty unless force).
    - If default_provider not set or == 'local', set to 'openrouter'.
    - Leave claude selected_model blank (only wipe if forcing and model equals the specific seed model we previously injected – conservative).
    """
    if not seed:
        return
    try:
        cfg = load_config()
        ai = cfg.setdefault('ai_providers', {})
        or_cfg = ai.setdefault('openrouter', {"enabled": False, "name": "OpenRouter", "models": [], "selected_model": ""})
        target_model = "gpt-oss-20b:free"
        reseed_env = os.getenv('RESEED_DEFAULTS', '0').lower() in ('1','true','yes','on')
        _force = force or reseed_env
        # Set default provider if missing or still local
        if _force or cfg.get('default_provider') in (None, '', 'local'):
            cfg['default_provider'] = 'openrouter'
        # Seed model only if empty or forcing
        if _force or not (or_cfg.get('selected_model') or '').strip():
            or_cfg['selected_model'] = target_model
            if target_model not in or_cfg.get('models', []):
                # Prepend to models list for visibility without losing existing
                models_list = or_cfg.get('models', [])
                or_cfg['models'] = [target_model] + [m for m in models_list if m != target_model]
        # Wipe Claude selected_model only if forcing and we explicitly want it blank
        if _force:
            claude_cfg = ai.get('claude')
            if claude_cfg and claude_cfg.get('selected_model') and claude_cfg.get('selected_model') == 'claude-3-5-sonnet-20241022':
                claude_cfg['selected_model'] = ''
        save_config(cfg)
    except Exception as e:  # pragma: no cover
        try:
            print(f"[ensure_default_ai_provider] skipped: {e}")
        except Exception:
            pass

# ---- Dynamic provider models listing (remote fetch + cache) ----
_PROVIDER_MODELS_CACHE: dict[str, dict] = {}
_PROVIDER_MODELS_TTL_DEFAULT = 600  # seconds

def _cache_get(key: str):
    import time
    item = _PROVIDER_MODELS_CACHE.get(key)
    if not item:
        return None
    if item['expires_at'] < time.time():
        _PROVIDER_MODELS_CACHE.pop(key, None)
        return None
    return item['value']

def _cache_set(key: str, value, ttl: int):
    import time
    _PROVIDER_MODELS_CACHE[key] = { 'value': value, 'expires_at': time.time() + ttl }

async def _fetch_openrouter_models(api_key: str) -> list[str]:
    import httpx
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as cx:
        r = await cx.get("https://openrouter.ai/api/v1/models", headers=headers)
        r.raise_for_status()
        data = r.json()
        models = []
        for m in data.get('data', []):
            mid = m.get('id') or m.get('name')
            if isinstance(mid, str):
                models.append(mid)
        return models

async def _fetch_openai_models(api_key: str) -> list[str]:
    import httpx
    async with httpx.AsyncClient(timeout=30) as cx:
        r = await cx.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
        r.raise_for_status()
        data = r.json()
        keep = []
        for m in data.get('data', []):
            mid = m.get('id')
            if not isinstance(mid, str):
                continue
            # Heuristic: include chat/capable new naming patterns
            if any(tok in mid for tok in ["gpt-4", "gpt-4o", "gpt-4.1", "o3", "o1", "gpt-3.5", "mini"]):
                keep.append(mid)
    return sorted(set(keep))

async def _fetch_gemini_models(api_key: str) -> list[str]:
    """Fetch Gemini models list via Google Generative Language API.
    Filters to chat-capable models (exclude embed/vision-only/edits when detectable).
    """
    import httpx
    out: list[str] = []
    # Prefer v1beta for broader compatibility
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    params = {"key": api_key}
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.get(url, params=params)
            r.raise_for_status()
            data = r.json() or {}
            for m in data.get('models', []):
                # id may be in name as projects/*/models/{id} or directly
                raw = m.get('name') or m.get('id') or ''
                mid = raw.split('/')[-1]
                if not isinstance(mid, str) or not mid:
                    continue
                # Keep only Gemini chat models
                if not mid.startswith('gemini-'):
                    continue
                # Exclude embedding/edit models
                if any(x in mid for x in ['embed', 'embedding', 'editor']):
                    continue
                out.append(mid)
    except Exception:
        out = []
    # Stable curated order if API fails later
    if not out:
        out = [
            'gemini-2.0-flash',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
        ]
    # Dedup preserving seen order
    seen: set[str] = set()
    ordered: list[str] = []
    for m in out:
        if m not in seen:
            seen.add(m); ordered.append(m)
    return ordered

async def _fetch_anthropic_models(api_key: str) -> list[str]:
    """Fetch Claude models list. If API fails, return a curated set."""
    import httpx
    out: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.get("https://api.anthropic.com/v1/models", headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"})
            if r.status_code == 200:
                data = r.json() or {}
                for m in data.get('data', []):
                    mid = m.get('id') or m.get('name')
                    if isinstance(mid, str) and mid.startswith('claude-'):
                        out.append(mid)
    except Exception:
        out = []
    if not out:
        out = [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
        ]
    # keep order
    seen: set[str] = set(); ordered: list[str] = []
    for m in out:
        if m not in seen:
            seen.add(m); ordered.append(m)
    return ordered

async def _fetch_ollama_models(base_url: str) -> list[str]:
    import httpx
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.get(f"{base_url.rstrip('/')}/api/tags")
        r.raise_for_status()
        data = r.json()
        out = []
        for entry in data.get('models', []):
            nm = entry.get('name')
            if isinstance(nm, str):
                out.append(nm)
        return out

def _static_models(provider: str) -> list[str]:
    if provider == 'claude':
        return [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-latest',
            'claude-3-opus-latest',
            'claude-3-haiku-20240307'
        ]
    if provider == 'gemini':
        # Curated modern list (fallback if API listing not available)
        return [
            'gemini-2.0-flash',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
        ]
    if provider == 'local':
        return ['local-fallback']
    return []

@router.get('/admin/provider-models/{provider}')
async def get_provider_models(provider: str, refresh: bool = False):
    """Return dynamic model list for a provider.
    Fallback order: cache -> remote -> config -> static -> []."""
    provider = provider.lower()
    import os, time
    ttl = int(os.getenv('REMOTE_MODEL_LIST_CACHE_SECONDS', str(_PROVIDER_MODELS_TTL_DEFAULT)))
    cache_key = f"prov_models:{provider}"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            return {"success": True, "provider": provider, "cached": True, "models": cached}
    models: list[str] = []
    note = None
    try:
        if provider == 'openrouter':
            api_key = os.getenv('OPENROUTER_API_KEY')
            if api_key:
                try:
                    models = await _fetch_openrouter_models(api_key)
                except Exception as e:  # fallback
                    note = f"openrouter_fetch_error:{e}"  # not exposed key
            else:
                note = 'missing_api_key'
        elif provider == 'openai':
            api_key = os.getenv('OPENAI_API_KEY')
            if api_key:
                try:
                    models = await _fetch_openai_models(api_key)
                except Exception as e:
                    note = f"openai_fetch_error:{e}"
            else:
                note = 'missing_api_key'
        elif provider == 'ollama':
            base_url = load_config().get('ai_providers', {}).get('ollama', {}).get('base_url') or os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            try:
                models = await _fetch_ollama_models(base_url)
            except Exception as e:
                note = f"ollama_fetch_error:{e}"
        elif provider == 'gemini':
            api_key = os.getenv('GOOGLE_API_KEY')
            if api_key:
                try:
                    models = await _fetch_gemini_models(api_key)
                except Exception as e:
                    note = f"gemini_fetch_error:{e}"
            if not models:
                models = _static_models('gemini')
        elif provider == 'claude':
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if api_key:
                try:
                    models = await _fetch_anthropic_models(api_key)
                except Exception as e:
                    note = f"claude_fetch_error:{e}"
            if not models:
                models = _static_models('claude')
        elif provider == 'local':
            models = _static_models('local')
        else:
            return {"success": False, "error": "provider_not_supported"}
    except Exception as e:
        note = f"generic_error:{e}"

    # Fallback a config se remote vuoto
    if not models:
        try:
            cfg = load_config()
            cfg_models = cfg.get('ai_providers', {}).get(provider, {}).get('models') or []
            if cfg_models:
                models = [m for m in cfg_models if isinstance(m, str) and m.strip()]
        except Exception:
            pass
    # Fallback static if ancora vuoto
    if not models:
        static = _static_models(provider)
        if static:
            models = static
    # Dedup & sort (keep order for openrouter for curated ranking)
    if provider == 'openrouter':
        # preserve order
        seen = set()
        ordered = []
        for m in models:
            if m not in seen:
                seen.add(m); ordered.append(m)
        models = ordered
    else:
        models = sorted(set(models))

    _cache_set(cache_key, models, ttl)
    resp = {"success": True, "provider": provider, "cached": False, "models": models}
    if note:
        resp['note'] = note
    return resp

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

def _refresh_routes_cache():
    """Lazy import per aggiornare la cache delle route senza creare import circolari."""
    try:
        from . import topic_router  # type: ignore
        if hasattr(topic_router, 'refresh_routes_cache'):
            topic_router.refresh_routes_cache()
    except Exception:
        pass

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

def get_summary_model():
    """Restituisce il modello configurato per i summary o un default coerente col provider."""
    config = load_config()
    ss = config.get("summary_settings", {})
    model = ss.get("model")
    if model:
        return model
    provider = ss.get("provider", "openrouter")
    defaults = {
        "openrouter": "anthropic/claude-3.5-sonnet",
        "claude": "claude-3-5-sonnet-20241022",
        "openai": "gpt-4o-mini",
        "gemini": "gemini-1.5-pro",
        "ollama": "llama3.1:8b"
    }
    return defaults.get(provider, "anthropic/claude-3.5-sonnet")

# ---- TTS providers / voices management ----
class TTSVoicesRequest(BaseModel):
    provider: str
    refresh: bool = False

@router.get("/admin/tts/voices")
async def list_tts_voices(provider: str, refresh: bool = False):
    """Ritorna elenco voci per un provider TTS.
    Provider supportati: edge (static), elevenlabs (API), openai (static), piper (installed + static config).
    Se refresh True forza refetch remoto dove applicabile.
    """
    provider = provider.lower()
    cfg = load_config()
    out = []
    note = None
    try:
        if provider == 'edge':
            out = cfg.get('tts_providers', {}).get('edge', {}).get('voices', [])
        elif provider == 'openai':
            out = cfg.get('tts_providers', {}).get('openai', {}).get('voices', [])
        elif provider == 'elevenlabs':
            api_key = os.getenv('ELEVENLABS_API_KEY')
            if not api_key:
                note = 'missing_api_key'
                out = cfg.get('tts_providers', {}).get('elevenlabs', {}).get('voices', [])
            else:
                try:
                    async with httpx.AsyncClient(timeout=30) as client:
                        r = await client.get('https://api.elevenlabs.io/v1/voices', headers={'xi-api-key': api_key})
                        if r.status_code == 200:
                            data = r.json()
                            out = [v['name'] for v in data.get('voices', []) if v.get('name')]
                        else:
                            note = f"remote_status_{r.status_code}"
                except Exception as e:
                    note = f"remote_error:{e}"  # fallback static
                    if not out:
                        out = cfg.get('tts_providers', {}).get('elevenlabs', {}).get('voices', [])
        elif provider == 'coqui':
            block = cfg.get('tts_providers', {}).get('coqui', {})
            out = block.get('voices') or block.get('models') or []
        elif provider == 'piper':
            # Installed voices = file .onnx nel models/piper + static config voices
            models_dir = os.path.join(os.path.dirname(__file__), '..', 'models', 'piper')
            installed = []
            try:
                if os.path.isdir(models_dir):
                    for fn in os.listdir(models_dir):
                        if fn.endswith('.onnx'):
                            installed.append(fn[:-5])
            except Exception:
                pass
            static = cfg.get('tts_providers', {}).get('piper', {}).get('voices', [])
            # Unione mantenendo ordine static e aggiungendo installed nuove
            seen = set()
            merged = []
            for v in static + installed:
                if v not in seen:
                    seen.add(v); merged.append(v)
            out = merged
        else:
            return {"success": False, "error": "provider_not_supported"}
        return {"success": True, "provider": provider, "voices": out, "note": note}
    except Exception as e:
        return {"success": False, "error": str(e), "provider": provider}

class PiperDownloadRequest(BaseModel):
    voice: str

@router.post("/admin/tts/piper/download")
async def download_piper_voice(req: PiperDownloadRequest):
    """Scarica (o conferma già presente) un modello Piper specifico."""
    try:
        from .tts import ensure_piper_voice_downloaded, resolve_piper_voice_id
        voice_id = resolve_piper_voice_id(req.voice)
        model_path, cfg_path = await ensure_piper_voice_downloaded(voice_id)
        ok = os.path.exists(model_path) and os.path.exists(cfg_path)
        return {"success": ok, "voice": voice_id, "model_path": model_path, "config_path": cfg_path}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/admin/tts/piper/installed")
async def list_piper_installed():
    try:
        models_dir = os.path.join(os.path.dirname(__file__), '..', 'models', 'piper')
        voices = []
        if os.path.isdir(models_dir):
            for fn in os.listdir(models_dir):
                if fn.endswith('.onnx'):
                    voices.append(fn[:-5])
        voices.sort()
        return {"success": True, "voices": voices}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ---- Generic async TTS model downloads (Piper + Coqui) ----
class TTSDownloadStart(BaseModel):
    provider: str  # piper | coqui
    voice: str

_TTS_DOWNLOAD_TASKS: dict[str, dict] = _load_tts_tasks_from_disk()

@router.post("/admin/tts/download")
async def start_tts_download(req: TTSDownloadStart):
    provider = req.provider.lower()
    voice = req.voice
    task_id = uuid.uuid4().hex
    started_at = time.time()
    with _TTS_TASKS_LOCK:
        _TTS_DOWNLOAD_TASKS[task_id] = {
            "id": task_id,
            "provider": provider,
            "voice": voice,
            "status": "pending",
            "error": None,
            "bytes": None,
            "total_bytes": None,
            "progress": 0.0,
            "started_at": started_at,
            "ended_at": None,
        }
        _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
    async def _run():
        try:
            with _TTS_TASKS_LOCK:
                task = _TTS_DOWNLOAD_TASKS.get(task_id)
                if task:
                    task["status"] = "running"
                    _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
            if provider == 'piper':
                from .tts import ensure_piper_voice_downloaded, resolve_piper_voice_id
                v = resolve_piper_voice_id(voice)
                bytes_holder = {"last": 0}
                def _prog(b, total):
                    with _TTS_TASKS_LOCK:
                        t = _TTS_DOWNLOAD_TASKS.get(task_id)
                        if not t:
                            return
                        t['bytes'] = b
                        if total and total > 0:
                            t['total_bytes'] = total
                            t['progress'] = min(1.0, b / total)
                        else:
                            # fallback unknown total (treat as indeterminate)
                            if b and (t.get('progress',0) < 0.95):
                                t['progress'] = 0.5  # mid as placeholder
                        _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
                m, c = await ensure_piper_voice_downloaded(v, progress_cb=_prog)
                ok = os.path.exists(m) and os.path.exists(c)
                if not ok:
                    raise RuntimeError("download_incomplete")
                sz = (os.path.getsize(m) if os.path.exists(m) else 0) + (os.path.getsize(c) if os.path.exists(c) else 0)
                with _TTS_TASKS_LOCK:
                    t = _TTS_DOWNLOAD_TASKS.get(task_id)
                    if t:
                        t["bytes"] = sz
                        t["total_bytes"] = sz or t.get('total_bytes')
                        t['progress'] = 1.0 if sz else t.get('progress', 0.0)
            elif provider == 'coqui':
                # Caricamento modello Coqui (download implicito)
                from TTS.api import TTS as _TTS
                loop = asyncio.get_running_loop()
                def _load():
                    _ = _TTS(model_name=voice)
                await loop.run_in_executor(None, _load)
            else:
                raise RuntimeError("provider_not_supported")
            with _TTS_TASKS_LOCK:
                t = _TTS_DOWNLOAD_TASKS.get(task_id)
                if t:
                    t["status"] = "done"
                    t["progress"] = 1.0
        except Exception as e:
            with _TTS_TASKS_LOCK:
                t = _TTS_DOWNLOAD_TASKS.get(task_id)
                if t:
                    t["status"] = "error"
                    t["error"] = str(e)
        finally:
            with _TTS_TASKS_LOCK:
                t = _TTS_DOWNLOAD_TASKS.get(task_id)
                if t:
                    t["ended_at"] = time.time()
                _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
    asyncio.create_task(_run())
    return {"success": True, "task_id": task_id}

@router.get("/admin/tts/download/{task_id}")
async def get_tts_download_status(task_id: str):
    with _TTS_TASKS_LOCK:
        task = _TTS_DOWNLOAD_TASKS.get(task_id)
        if not task:
            return {"success": False, "error": "task_not_found"}
        return {"success": True, "task": task}

@router.get("/admin/tts/download")
async def list_tts_downloads(limit: int = 50):
    with _TTS_TASKS_LOCK:
        items = list(_TTS_DOWNLOAD_TASKS.values())
        items.sort(key=lambda x: x.get('started_at') or 0, reverse=True)
        return {"success": True, "tasks": items[:limit], "total": len(items)}

@router.delete("/admin/tts/download/{task_id}")
async def delete_tts_download_task(task_id: str):
    """Delete a finished (done/error/stale) task. Running/pending tasks are protected."""
    with _TTS_TASKS_LOCK:
        task = _TTS_DOWNLOAD_TASKS.get(task_id)
        if not task:
            return {"success": False, "error": "task_not_found"}
        if task.get('status') in ('running','pending'):
            return {"success": False, "error": "task_in_progress"}
        _TTS_DOWNLOAD_TASKS.pop(task_id, None)
        _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
        return {"success": True, "deleted": task_id}

class TTSDownloadCleanupRequest(BaseModel):
    older_than_seconds: int | None = None  # remove tasks ended more than X seconds ago
    statuses: list[str] | None = None      # default: ['done','error','stale']
    limit: int | None = None               # max tasks to remove

@router.post("/admin/tts/download/cleanup")
async def cleanup_tts_download_tasks(req: TTSDownloadCleanupRequest):
    now = time.time()
    removed = []
    statuses = req.statuses or ['done','error','stale']
    with _TTS_TASKS_LOCK:
        # Build list of candidates
        items = list(_TTS_DOWNLOAD_TASKS.values())
        # Sort oldest first by ended_at
        items.sort(key=lambda x: x.get('ended_at') or x.get('started_at') or 0)
        for t in items:
            if t.get('status') not in statuses:
                continue
            ended = t.get('ended_at') or 0
            if req.older_than_seconds is not None:
                if (now - ended) < req.older_than_seconds:
                    continue
            removed.append(t['id'])
            _TTS_DOWNLOAD_TASKS.pop(t['id'], None)
            if req.limit and len(removed) >= req.limit:
                break
        if removed:
            _save_tts_tasks_to_disk(_TTS_DOWNLOAD_TASKS)
    return {"success": True, "removed": removed, "count": len(removed)}

class TTSPreloadItem(BaseModel):
    provider: str
    voice: str

class TTSPreloadRequest(BaseModel):
    items: list[TTSPreloadItem]

@router.post("/admin/tts/preload")
async def preload_tts_models(req: TTSPreloadRequest):
    """Start multiple download tasks (bulk). Returns list of {voice,provider,task_id}."""
    results = []
    for item in req.items:
        # Reuse existing endpoint logic by calling start_tts_download
        try:
            r = await start_tts_download(TTSDownloadStart(provider=item.provider, voice=item.voice))
            if r.get('success'):
                results.append({
                    'provider': item.provider,
                    'voice': item.voice,
                    'task_id': r.get('task_id')
                })
            else:
                results.append({
                    'provider': item.provider,
                    'voice': item.voice,
                    'error': r.get('error') or 'unknown'
                })
        except Exception as e:
            results.append({
                'provider': item.provider,
                'voice': item.voice,
                'error': str(e)
            })
    return {"success": True, "items": results}

# ---- UI settings (arena visibility) ----
class UiSettingsIn(BaseModel):
    arena_public: bool
    contact_email: str | None = None
    research_project: str | None = None
    repository_url: str | None = None
    website_url: str | None = None
    info_pdf_url: str | None = None
    footer_title: str | None = None
    footer_text: str | None = None
    show_research_project: bool | None = True
    show_repository_url: bool | None = True
    show_website_url: bool | None = True
    show_info_pdf_url: bool | None = True
    show_contact_email: bool | None = True
    show_footer_block: bool | None = True

@router.get("/admin/ui-settings")
async def get_ui_settings():
    try:
        config = load_config()
        ui = config.get("ui_settings", {"arena_public": False, "contact_email": None})
        if "arena_public" not in ui:
            ui["arena_public"] = False
        if "contact_email" not in ui:
            ui["contact_email"] = None
        # Ensure new research fields exist (even if None)
        for k in ["research_project","repository_url","website_url","info_pdf_url"]:
            ui.setdefault(k, None)
        for k in ["footer_title","footer_text"]:
            ui.setdefault(k, None)
        # Visibility flags with default True if missing
        for k in ["show_research_project","show_repository_url","show_website_url","show_info_pdf_url","show_contact_email","show_footer_block"]:
            ui.setdefault(k, True)
        return {"settings": ui}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento impostazioni UI: {str(e)}")

@router.post("/admin/ui-settings")
async def update_ui_settings(payload: UiSettingsIn):
    try:
        config = load_config()
        config.setdefault("ui_settings", {})
        config["ui_settings"]["arena_public"] = bool(payload.arena_public)
        def _norm(v: Optional[str]):
            if v is None:
                return None
            v = v.strip()
            return v or None
        if payload.contact_email is not None:
            config["ui_settings"]["contact_email"] = _norm(payload.contact_email)
        if payload.research_project is not None:
            config["ui_settings"]["research_project"] = _norm(payload.research_project)
        if payload.repository_url is not None:
            config["ui_settings"]["repository_url"] = _norm(payload.repository_url)
        if payload.website_url is not None:
            config["ui_settings"]["website_url"] = _norm(payload.website_url)
        if payload.info_pdf_url is not None:
            config["ui_settings"]["info_pdf_url"] = _norm(payload.info_pdf_url)
        if payload.footer_title is not None:
            config["ui_settings"]["footer_title"] = _norm(payload.footer_title)
        if payload.footer_text is not None:
            config["ui_settings"]["footer_text"] = _norm(payload.footer_text)
        # Visibility flags (store always if provided)
        if payload.show_research_project is not None:
            config["ui_settings"]["show_research_project"] = bool(payload.show_research_project)
        if payload.show_repository_url is not None:
            config["ui_settings"]["show_repository_url"] = bool(payload.show_repository_url)
        if payload.show_website_url is not None:
            config["ui_settings"]["show_website_url"] = bool(payload.show_website_url)
        if payload.show_info_pdf_url is not None:
            config["ui_settings"]["show_info_pdf_url"] = bool(payload.show_info_pdf_url)
        if payload.show_contact_email is not None:
            config["ui_settings"]["show_contact_email"] = bool(payload.show_contact_email)
        if payload.show_footer_block is not None:
            config["ui_settings"]["show_footer_block"] = bool(payload.show_footer_block)
        save_config(config)
        return {"success": True, "message": "Impostazioni UI aggiornate"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore salvataggio impostazioni UI: {str(e)}")

# ---- Context settings (topics/RAG budgeting) ----
class ContextSettingsIn(BaseModel):
    total_tokens: int
    min_topics_tokens: int
    min_rag_tokens: int
    jaccard_threshold: float | None = None
    topics_extra_share: float | None = None

class PipelineSettingsIn(BaseModel):
    force_case_insensitive: bool
    normalize_accents: bool

@router.get("/admin/context-settings")
async def get_context_settings():
    try:
        cfg = load_config()
        ctx = cfg.get("context_settings", {})
        # fill defaults if missing
        defaults = DEFAULT_CONFIG.get("context_settings", {})
        merged = {**defaults, **ctx}
        return {"settings": merged}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento context settings: {e}")

@router.post("/admin/context-settings")
async def update_context_settings(payload: ContextSettingsIn):
    try:
        if payload.total_tokens < 2000:
            raise HTTPException(status_code=400, detail="total_tokens troppo basso")
        if payload.min_topics_tokens + payload.min_rag_tokens > payload.total_tokens:
            raise HTTPException(status_code=400, detail="Somma minimi supera total_tokens")
        cfg = load_config()
        cfg.setdefault("context_settings", {})
        cfg["context_settings"].update({
            "total_tokens": payload.total_tokens,
            "min_topics_tokens": payload.min_topics_tokens,
            "min_rag_tokens": payload.min_rag_tokens,
        })
        if payload.jaccard_threshold is not None:
            cfg["context_settings"]["jaccard_threshold"] = payload.jaccard_threshold
        if payload.topics_extra_share is not None:
            cfg["context_settings"]["topics_extra_share"] = payload.topics_extra_share
        save_config(cfg)
        return {"success": True, "message": "Context settings aggiornati"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore salvataggio context settings: {e}")

@router.get("/admin/pipeline-settings")
async def get_pipeline_settings():
    try:
        cfg = load_config()
        defaults = DEFAULT_CONFIG.get("pipeline_settings", {})
        merged = {**defaults, **cfg.get("pipeline_settings", {})}
        return {"settings": merged}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento pipeline settings: {e}")

@router.post("/admin/pipeline-settings")
async def update_pipeline_settings(payload: PipelineSettingsIn):
    try:
        cfg = load_config()
        cfg.setdefault("pipeline_settings", {})
        cfg["pipeline_settings"].update({
            "force_case_insensitive": bool(payload.force_case_insensitive),
            "normalize_accents": bool(payload.normalize_accents)
        })
        save_config(cfg)
        # Refresh routes cache per applicare subito
        try:
            _refresh_routes_cache()
        except Exception:
            pass
        return {"success": True, "message": "Pipeline settings aggiornati"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore salvataggio pipeline settings: {e}")

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
            # Abilita automaticamente il provider se la chiave API è configurata
            if api_key:
                masked_config["ai_providers"][provider]["enabled"] = True
    
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

# ==== API KEYS MANAGEMENT ====

class APIKeyUpdate(BaseModel):
    provider: str
    api_key: str

@router.get("/admin/api-keys")
async def get_api_keys():
    """Restituisce lo status delle API keys (mascherate)"""
    try:
        api_keys_status = {
            "google": {
                "status": "configured" if os.getenv("GOOGLE_API_KEY", "") else "missing",
                "masked": "••••••••••••••••" if os.getenv("GOOGLE_API_KEY", "") else "",
                "env_var": "GOOGLE_API_KEY"
            },
            "anthropic": {
                "status": "configured" if os.getenv("ANTHROPIC_API_KEY", "") else "missing",
                "masked": "••••••••••••••••" if os.getenv("ANTHROPIC_API_KEY", "") else "",
                "env_var": "ANTHROPIC_API_KEY"
            },
            "openai": {
                "status": "configured" if os.getenv("OPENAI_API_KEY", "") else "missing", 
                "masked": "••••••••••••••••" if os.getenv("OPENAI_API_KEY", "") else "",
                "env_var": "OPENAI_API_KEY"
            },
            "openrouter": {
                "status": "configured" if os.getenv("OPENROUTER_API_KEY", "") else "missing",
                "masked": "••••••••••••••••" if os.getenv("OPENROUTER_API_KEY", "") else "",
                "env_var": "OPENROUTER_API_KEY"
            },
            "elevenlabs": {
                "status": "configured" if os.getenv("ELEVENLABS_API_KEY", "") else "missing",
                "masked": "••••••••••••••••" if os.getenv("ELEVENLABS_API_KEY", "") else "",
                "env_var": "ELEVENLABS_API_KEY"
            }
        }
        return {"success": True, "api_keys": api_keys_status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento API keys: {str(e)}")

@router.post("/admin/api-keys")
async def update_api_key(payload: APIKeyUpdate):
    """Aggiorna una API key specifica"""
    try:
        provider_mapping = {
            "google": "GOOGLE_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY", 
            "openai": "OPENAI_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "elevenlabs": "ELEVENLABS_API_KEY"
        }
        
        if payload.provider not in provider_mapping:
            raise HTTPException(status_code=400, detail=f"Provider non supportato: {payload.provider}")
            
        env_var = provider_mapping[payload.provider]
        
        # Aggiorna la variabile d'ambiente per la sessione corrente
        os.environ[env_var] = payload.api_key
        
        # Cerca di aggiornare il file .env se esiste
        env_file_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        if os.path.exists(env_file_path):
            # Leggi il file .env esistente
            with open(env_file_path, 'r') as f:
                lines = f.readlines()
            
            # Cerca se la variabile esiste già
            updated = False
            for i, line in enumerate(lines):
                if line.startswith(f"{env_var}="):
                    lines[i] = f"{env_var}={payload.api_key}\n"
                    updated = True
                    break
            
            # Se non esiste, aggiungila
            if not updated:
                lines.append(f"{env_var}={payload.api_key}\n")
            
            # Salva il file
            with open(env_file_path, 'w') as f:
                f.writelines(lines)
        
        return {"success": True, "message": f"API key per {payload.provider} aggiornata con successo"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento API key: {str(e)}")

@router.post("/admin/api-keys/test/{provider}")
async def test_api_key(provider: str):
    """Testa una API key specifica"""
    try:
        provider_mapping = {
            "google": "GOOGLE_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "openai": "OPENAI_API_KEY", 
            "openrouter": "OPENROUTER_API_KEY",
            "elevenlabs": "ELEVENLABS_API_KEY"
        }
        
        if provider not in provider_mapping:
            raise HTTPException(status_code=400, detail=f"Provider non supportato: {provider}")
            
        api_key = os.getenv(provider_mapping[provider], "")
        if not api_key:
            return {"success": False, "message": f"API key per {provider} non configurata"}
            
        # Testa la chiave API con una chiamata semplice
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "google":
                # Test Google Gemini
                url = "https://generativelanguage.googleapis.com/v1/models"
                params = {"key": api_key}
                response = await client.get(url, params=params)
                if response.status_code == 200:
                    return {"success": True, "message": "API key Google valida"}
                else:
                    return {"success": False, "message": f"API key Google non valida: {response.status_code}"}
                    
            elif provider == "anthropic":
                # Test Anthropic Claude
                url = "https://api.anthropic.com/v1/models"
                headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return {"success": True, "message": "API key Anthropic valida"}
                else:
                    return {"success": False, "message": f"API key Anthropic non valida: {response.status_code}"}
                    
            elif provider == "openai":
                # Test OpenAI
                url = "https://api.openai.com/v1/models"
                headers = {"Authorization": f"Bearer {api_key}"}
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return {"success": True, "message": "API key OpenAI valida"}
                else:
                    return {"success": False, "message": f"API key OpenAI non valida: {response.status_code}"}
                    
            elif provider == "openrouter":
                # Test OpenRouter
                url = "https://openrouter.ai/api/v1/models"
                headers = {"Authorization": f"Bearer {api_key}"}
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return {"success": True, "message": "API key OpenRouter valida"}
                else:
                    return {"success": False, "message": f"API key OpenRouter non valida: {response.status_code}"}
                    
            elif provider == "elevenlabs":
                # Test ElevenLabs
                url = "https://api.elevenlabs.io/v1/user"
                headers = {"xi-api-key": api_key}
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    return {"success": True, "message": "API key ElevenLabs valida"}
                else:
                    return {"success": False, "message": f"API key ElevenLabs non valida: {response.status_code}"}
            
    except Exception as e:
        return {"success": False, "message": f"Errore nel test API key: {str(e)}"}

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
    """Forza il reset copiando il seed (backend/config/seed/summary_prompt.md) se presente.

    Fallback legacy /app/data rimosso: se il seed manca usa il testo di default.
    """
    try:
        text = reset_summary_prompt_from_seed()
        return {"success": True, "prompt": text, "seed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset seed summary prompt: {str(e)}")

# ---- Summary settings endpoints ----
class SummarySettingsIn(BaseModel):
    provider: str
    enabled: bool
    model: str | None = None
    min_messages: int | None = None  # soglia minima messaggi per generare summary
    min_chars: int | None = None     # soglia minima caratteri (somma contenuti) per generare summary
    auto_on_export: bool | None = None  # se false non tenta generazione automatica nell'export

DEFAULT_SUMMARY_SETTINGS = {
    "provider": "openrouter",
    "enabled": True,
    "model": None,
    "min_messages": 4,
    "min_chars": 200,
    "auto_on_export": True,
}

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
    """Ottiene le impostazioni correnti per la generazione dei summary."""
    try:
        config = load_config()
        raw = config.get("summary_settings", {}) or {}
        summary_settings = DEFAULT_SUMMARY_SETTINGS.copy()
        summary_settings.update({k: v for k, v in raw.items() if v is not None})
        # Normalizza tipi / limiti
        try:
            if summary_settings.get("min_messages") is not None:
                summary_settings["min_messages"] = max(0, int(summary_settings["min_messages"]))
            if summary_settings.get("min_chars") is not None:
                summary_settings["min_chars"] = max(0, int(summary_settings["min_chars"]))
        except Exception:
            pass
        return {"settings": summary_settings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento impostazioni summary: {str(e)}")

@router.post("/admin/summary-settings")
async def update_summary_settings(payload: SummarySettingsIn):
    """Aggiorna le impostazioni per la generazione dei summary"""
    try:
        if payload.provider == "local":
            raise HTTPException(status_code=400, detail="Il provider 'local' non può essere usato per i summary. Scegli un provider AI reale (es: openrouter, openai, gemini, ollama)")

        # Validazioni soft
        min_messages = payload.min_messages if payload.min_messages is not None else DEFAULT_SUMMARY_SETTINGS["min_messages"]
        min_chars = payload.min_chars if payload.min_chars is not None else DEFAULT_SUMMARY_SETTINGS["min_chars"]
        if min_messages < 0:
            min_messages = 0
        if min_chars < 0:
            min_chars = 0
        auto_on_export = payload.auto_on_export if payload.auto_on_export is not None else DEFAULT_SUMMARY_SETTINGS["auto_on_export"]

        config = load_config()
        config["summary_settings"] = {
            "provider": payload.provider,
            "enabled": payload.enabled,
            "model": payload.model,
            "min_messages": min_messages,
            "min_chars": min_chars,
            "auto_on_export": auto_on_export,
        }
        save_config(config)
        return {"success": True, "message": "Impostazioni summary aggiornate"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio impostazioni summary: {str(e)}")

class SummaryTestIn(BaseModel):
    messages: list[str] | None = None  # lista di messaggi utente/assistant alternati (semplice)
    provider: str | None = None
    model: str | None = None
    prompt_override: str | None = None

@router.post("/admin/summary-test")
async def summary_test(payload: SummaryTestIn):
    """Esegue una generazione di summary di test usando i settings correnti o override forniti.

    Se non vengono passati messaggi, usa una breve conversazione di esempio.
    """
    try:
        from .llm import chat_with_provider
        from .prompts import load_summary_prompt
        cfg = load_config()
        settings = cfg.get("summary_settings", {})
        provider = payload.provider or settings.get("provider") or DEFAULT_SUMMARY_SETTINGS["provider"]
        model = payload.model or settings.get("model")
        enabled = settings.get("enabled", True)
        if not enabled:
            return {"success": False, "error": "Summary disabilitato"}
        base_prompt = payload.prompt_override or load_summary_prompt()
        if not base_prompt:
            base_prompt = "You are a helpful assistant generating a concise Italian summary of the following chat."
        raw_messages = payload.messages or [
            "Ciao, potresti spiegarmi come funziona il sistema di prenotazioni?",
            "Certamente! Il sistema consente di prenotare risorse ...",
            "Posso cancellare una prenotazione?",
            "Sì, puoi cancellarla entro 24 ore prima dell'orario previsto." 
        ]
        # Costruisci struttura LLM: semplice sequenza alternata user/assistant a partire da primo user
        llm_msgs = [ {"role":"system","content": base_prompt} ]
        role = "user"
        for txt in raw_messages:
            llm_msgs.append({"role": role, "content": txt})
            role = "assistant" if role == "user" else "user"
        summary_text = await chat_with_provider(llm_msgs, provider=provider, model=model, is_summary_request=True)
        return {"success": True, "provider": provider, "model": model, "summary": summary_text, "chars": len(summary_text or '')}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ---- Personalities (presets) management ----
class PersonalityIn(BaseModel):
    id: Optional[str] = None
    name: str
    system_prompt_id: str
    provider: str
    model: str
    tts_provider: Optional[str] = None
    tts_voice: Optional[str] = None
    set_default: bool = False
    avatar: Optional[str] = None  # filename under storage/avatars
    welcome_message: Optional[str] = None  # must match existing welcome message id
    guide_id: Optional[str] = None  # must match existing guide id
    context_window: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None  # massimo numero di token per risposta
    remove_avatar: Optional[bool] = False
    active: Optional[bool] = True
    enabled_pipeline_topics: Optional[List[str]] = None  # topics di pipeline abilitati
    enabled_rag_groups: Optional[List[int]] = None  # gruppi RAG abilitati
    enabled_mcp_servers: Optional[List[str]] = None  # server MCP abilitati
    enabled_data_tables: Optional[List[str]] = None  # tabelle dati abilitate
    enabled_forms: Optional[List[str]] = None  # questionari abilitati
    # UI visibility flags
    show_pipeline_topics: Optional[bool] = True
    show_source_docs: Optional[bool] = True

@router.get("/admin/personalities")
async def list_personalities_admin():
    try:
        return load_personalities()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento personalità: {str(e)}")

@router.post("/admin/personalities")
async def upsert_personality_admin(p: PersonalityIn):
    try:
        # Validate welcome_message against existing welcome messages (if provided)
        from .welcome_guides import list_welcome_messages, list_guides
        if p.welcome_message:
            try:
                existing_items = list_welcome_messages()
            except Exception:
                existing_items = []
            existing_ids = {m.get('id') for m in existing_items if isinstance(m, dict) and m.get('id')}
            if p.welcome_message not in existing_ids:
                raise HTTPException(status_code=400, detail="welcome_message non valido: usare id di un messaggio esistente")
        if p.guide_id:
            try:
                guide_items = list_guides()
            except Exception:
                guide_items = []
            guide_ids = {g.get('id') for g in guide_items if isinstance(g, dict) and g.get('id')}
            if p.guide_id not in guide_ids:
                raise HTTPException(status_code=400, detail="guide_id non valido: usare id guida esistente")
        # Gestione rimozione avatar: se remove_avatar true forza avatar None
        avatar_filename = None if p.remove_avatar else p.avatar
        res = upsert_personality(
            p.name,
            p.system_prompt_id,
            p.provider,
            p.model,
            p.welcome_message,  # store the id
            p.guide_id,
            p.context_window,
            p.temperature,
            p.id,
            p.set_default,
            avatar_filename,
            p.tts_provider,
            p.tts_voice,
            active=p.active if p.active is not None else True,
            enabled_pipeline_topics=p.enabled_pipeline_topics,
            enabled_rag_groups=p.enabled_rag_groups,
            enabled_mcp_servers=p.enabled_mcp_servers,
            enabled_data_tables=p.enabled_data_tables,
            enabled_forms=p.enabled_forms,
            max_tokens=p.max_tokens,
            show_pipeline_topics=p.show_pipeline_topics,
            show_source_docs=p.show_source_docs
        )
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

# ---- Avatar upload per personalità ----
@router.post("/admin/personalities/{personality_id}/avatar")
async def upload_personality_avatar(personality_id: str, file: UploadFile = File(...)):
    try:
        # Valida estensione
        allowed = {"png","jpg","jpeg","gif","webp"}
        filename = file.filename or "avatar"
        ext = filename.rsplit('.',1)[-1].lower() if '.' in filename else 'png'
        if ext not in allowed:
            raise HTTPException(status_code=400, detail="Formato immagine non supportato")
        # Prepara path salvataggio (usare directory persistente /app/storage/avatars)
        avatars_dir = Path('/app/storage/avatars')
        # Diagnostic: ensure directory is writable
        try:
            avatars_dir.mkdir(parents=True, exist_ok=True)
            if not os.access(avatars_dir, os.W_OK):
                # Attempt to open a temp file to confirm
                test_path = avatars_dir / '.write_test'
                try:
                    with open(test_path, 'w') as _tf:
                        _tf.write('x')
                    test_path.unlink(missing_ok=True)
                except Exception as _e:
                    raise HTTPException(status_code=500, detail=f"Directory avatars non scrivibile: {avatars_dir}. Permessi? {_e}")
        except HTTPException:
            raise
        except Exception as _e:
            raise HTTPException(status_code=500, detail=f"Errore preparazione directory avatars: {_e}")
        # Migrazione automatica: se vecchia dir esiste ed è diversa, copia file mancanti una volta
        try:
            old_dir = Path(__file__).parent.parent / 'storage' / 'avatars'
            if old_dir.exists() and old_dir.resolve() != avatars_dir.resolve():
                avatars_dir.mkdir(parents=True, exist_ok=True)
                for p in old_dir.iterdir():
                    if p.is_file():
                        target = avatars_dir / p.name
                        if not target.exists():
                            try:
                                target.write_bytes(p.read_bytes())
                            except Exception:
                                pass
        except Exception:
            pass
        avatars_dir.mkdir(parents=True, exist_ok=True)
        # Usa un filename con timestamp per forzare l'aggiornamento cache lato browser
        import time
        safe_name = f"{personality_id}-{int(time.time())}.{ext}"
        data = await file.read()
        if len(data) > 2*1024*1024:
            raise HTTPException(status_code=400, detail="Immagine troppo grande (max 2MB)")
        # Salva nuovo file
        target_path = avatars_dir / safe_name
        try:
            with open(target_path, 'wb') as f:
                f.write(data)
        except PermissionError as _pe:
            raise HTTPException(status_code=500, detail=f"Permesso negato scrivendo {target_path}: {_pe}. Controlla owner/permessi del volume host.")
        except OSError as _oe:
            raise HTTPException(status_code=500, detail=f"Errore scrittura file avatar: {_oe}")
        # Rimuove vecchi avatar della stessa personalità (stesso prefisso) lasciando l'ultimo
        try:
            prefix = f"{personality_id}-"
            old_files = sorted([p for p in avatars_dir.iterdir() if p.is_file() and p.name.startswith(prefix) and p.name != safe_name])
            # Mantieni al massimo 1 vecchio (per rollback minimale), elimina gli altri
            if len(old_files) > 1:
                for p in old_files[:-1]:
                    try: p.unlink()
                    except Exception: pass
        except Exception:
            pass
        # Aggiorna personalità
        # Carica personalità esistente per non sovrascrivere campi
        from .personalities import get_personality
        existing = get_personality(personality_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Personalità non trovata")
        upsert_personality(
            name=existing.get('name', personality_id),
            system_prompt_id=existing.get('system_prompt_id',''),
            provider=existing.get('provider','local'),
            model=existing.get('model',''),
            welcome_message=existing.get('welcome_message'),
            guide_id=existing.get('guide_id'),
            context_window=existing.get('context_window'),
            temperature=existing.get('temperature'),
            personality_id=personality_id,
            avatar=safe_name,
            tts_provider=existing.get('tts_provider'),
            tts_voice=existing.get('tts_voice'),
            active=existing.get('active', True)
        )
        # Aggiungi query param cache-busting opzionale
        cache_bust = int(time.time())
        return {"success": True, "filename": safe_name, "url": f"/static/avatars/{safe_name}?v={cache_bust}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore upload avatar: {e}")

# ---- Opzioni per pipeline e RAG ----
@router.get("/admin/pipeline-options")
async def get_pipeline_options():
    """Ottieni topics disponibili nelle pipeline"""
    try:
        config = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        topics = list(set(route.get('topic', '') for route in config.get('routes', []) if route.get('topic')))
        topics.sort()
        return {"success": True, "topics": topics}
    except Exception as e:
        return {"success": False, "topics": [], "error": str(e)}

@router.get("/admin/rag-options") 
async def get_rag_options():
    """Ottieni gruppi RAG disponibili"""
    try:
        from .rag_engine import rag_engine
        groups = rag_engine.get_groups()
        # Includi tutti i gruppi, anche se al momento con 0 documenti (utile per pre-configurare le personalità)
        available_groups = [
            {"id": g.get("id"), "name": g.get("name"), "document_count": g.get("document_count", 0)}
            for g in (groups or [])
            if g and g.get("id") is not None
        ]
        return {"success": True, "groups": available_groups}
    except Exception as e:
        return {"success": False, "groups": [], "error": str(e)}

# ---- MCP Servers Management ----
from .mcp_manager import mcp_manager, MCPServerConfig

@router.get("/admin/mcp-servers")
async def get_mcp_servers():
    """Ottieni lista di tutti i server MCP configurati"""
    try:
        servers = mcp_manager.get_servers()
        return {"success": True, "servers": servers}
    except Exception as e:
        return {"success": False, "servers": [], "error": str(e)}

@router.post("/admin/mcp-servers")
async def create_mcp_server(server_data: MCPServerConfig):
    """Crea un nuovo server MCP"""
    try:
        if mcp_manager.add_server(server_data):
            return {"success": True, "message": f"Server MCP '{server_data.name}' creato"}
        else:
            raise HTTPException(status_code=400, detail="Errore nella creazione del server")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore creazione server MCP: {str(e)}")

@router.put("/admin/mcp-servers/{server_id}")
async def update_mcp_server(server_id: str, server_data: MCPServerConfig):
    """Aggiorna un server MCP esistente"""
    try:
        if mcp_manager.update_server(server_id, server_data):
            return {"success": True, "message": f"Server MCP '{server_data.name}' aggiornato"}
        else:
            raise HTTPException(status_code=404, detail="Server non trovato")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento server MCP: {str(e)}")

@router.delete("/admin/mcp-servers/{server_id}")
async def delete_mcp_server(server_id: str):
    """Elimina un server MCP"""
    try:
        if mcp_manager.delete_server(server_id):
            return {"success": True, "message": "Server MCP eliminato"}
        else:
            raise HTTPException(status_code=404, detail="Server non trovato")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione server MCP: {str(e)}")

@router.post("/admin/mcp-servers/{server_id}/test")
async def test_mcp_server(server_id: str):
    """Testa la connessione a un server MCP"""
    try:
        result = await mcp_manager.test_server_connection(server_id)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/admin/mcp-options")
async def get_mcp_options():
    """Ottieni server MCP abilitati per selezione nelle personalità"""
    try:
        enabled_servers = mcp_manager.get_enabled_servers()
        options = [
            {
                "id": server.id,
                "name": server.name,
                "description": server.description,
                "capabilities": server.capabilities
            }
            for server in enabled_servers
        ]
        return {"success": True, "servers": options}
    except Exception as e:
        return {"success": False, "servers": [], "error": str(e)}

# ---- MCP Servers Management ----
@router.get("/admin/mcp-servers")
async def get_mcp_servers():
    """Ottieni lista di tutti i server MCP configurati"""
    try:
        from .mcp_servers import mcp_manager
        statuses = mcp_manager.get_all_servers_status()
        configs = mcp_manager.load_configurations()
        
        servers = []
        for config in configs:
            status = next((s for s in statuses if s["id"] == config.id), None)
            servers.append({
                "id": config.id,
                "name": config.name,
                "type": config.type,
                "description": config.description,
                "enabled": config.enabled,
                "auto_start": config.auto_start,
                "status": status["status"] if status else "inactive",
                "running": status["pid"] is not None if status else False,
                "config": config.config
            })
        
        return {"success": True, "servers": servers}
    except Exception as e:
        return {"success": False, "servers": [], "error": str(e)}

@router.post("/admin/mcp-servers")
async def create_update_mcp_server(server_data: dict):
    """Crea o aggiorna un server MCP"""
    try:
        from .mcp_servers import mcp_manager, MCPServerConfig
        
        config = MCPServerConfig(**server_data)
        mcp_manager.add_server_config(config)
        
        return {"success": True, "message": f"Server MCP '{config.name}' salvato"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore salvataggio server MCP: {str(e)}")

@router.delete("/admin/mcp-servers/{server_id}")
async def delete_mcp_server(server_id: str):
    """Elimina un server MCP"""
    try:
        from .mcp_servers import mcp_manager
        
        # Ferma il server se in esecuzione
        await mcp_manager.stop_server(server_id)
        
        # Rimuove la configurazione
        mcp_manager.remove_server_config(server_id)
        
        return {"success": True, "message": f"Server MCP {server_id} eliminato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione server MCP: {str(e)}")

@router.post("/admin/mcp-servers/{server_id}/start")
async def start_mcp_server(server_id: str):
    """Avvia un server MCP"""
    try:
        from .mcp_servers import mcp_manager
        
        success = await mcp_manager.start_server(server_id)
        if success:
            return {"success": True, "message": f"Server MCP {server_id} avviato"}
        else:
            return {"success": False, "message": f"Errore avvio server MCP {server_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore avvio server MCP: {str(e)}")

@router.post("/admin/mcp-servers/{server_id}/stop")
async def stop_mcp_server(server_id: str):
    """Ferma un server MCP"""
    try:
        from .mcp_servers import mcp_manager
        
        success = await mcp_manager.stop_server(server_id)
        if success:
            return {"success": True, "message": f"Server MCP {server_id} fermato"}
        else:
            return {"success": False, "message": f"Errore stop server MCP {server_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore stop server MCP: {str(e)}")

@router.get("/admin/mcp-servers/types")
async def get_mcp_server_types():
    """Ottieni i tipi di server MCP disponibili"""
    from .mcp_servers import MCPServerType
    
    types = [
        {"value": MCPServerType.EMAIL, "label": "Email Server"},
        {"value": MCPServerType.CALENDAR, "label": "Calendar Server"},
        {"value": MCPServerType.FILE_SYSTEM, "label": "File System Server"},
        {"value": MCPServerType.WEB_SCRAPER, "label": "Web Scraper Server"},
        {"value": MCPServerType.DATABASE, "label": "Database Server"},
        {"value": MCPServerType.CUSTOM, "label": "Custom Server"}
    ]
    
    return {"success": True, "types": types}

@router.get("/admin/mcp-options")
async def get_mcp_options():
    """Ottieni server MCP disponibili per le personalità"""
    try:
        from .mcp_servers import mcp_manager
        configs = mcp_manager.load_configurations()
        
        # Filtra solo server abilitati
        available_servers = [
            {"id": config.id, "name": config.name, "type": config.type}
            for config in configs 
            if config.enabled
        ]
        
        return {"success": True, "servers": available_servers}
    except Exception as e:
        return {"success": False, "servers": [], "error": str(e)}

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

    # (fine funzione download_interactions_log)

# ---- Config backup & restore ----
@router.get('/admin/config/backup')
async def backup_config(include_seed: bool = False, include_avatars: bool = False, include_regex_guide: bool = False, include_db: bool = True, dry_run: bool = False):
    """Esporta le configurazioni in un archivio ZIP.

    Parametri:
      include_seed: include anche i file seed (read-only) – di solito non necessario.
      include_avatars: include avatar (può aumentare dimensione).
      include_regex_guide: include guida regex pipeline copia runtime se presente.
      dry_run: se True restituisce solo manifest simulato (no zip) con elenco file selezionati.
    """
    try:
        from . import config_backup
        if dry_run:
            # Simula selezione
            data = config_backup.create_backup_zip(include_seed=include_seed, include_avatars=include_avatars, include_regex_guide=include_regex_guide, include_db=include_db)
            import zipfile, io, json
            buf = io.BytesIO(data)
            with zipfile.ZipFile(buf, 'r') as zf:
                manifest = json.loads(zf.read('manifest.json').decode('utf-8')) if 'manifest.json' in zf.namelist() else {}
            return {"success": True, "dry_run": True, "manifest": manifest}
        bin_data = config_backup.create_backup_zip(include_seed=include_seed, include_avatars=include_avatars, include_regex_guide=include_regex_guide, include_db=include_db)
        return Response(content=bin_data, media_type='application/zip', headers={
            'Content-Disposition': 'attachment; filename="config-backup.zip"'
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore backup: {e}")

@router.get('/admin/db/dump')
async def db_dump(tables: Optional[str] = None):
    """Scarica solo il dump del database (JSONL + summary + personalities)."""
    try:
        from . import config_backup
        table_list = None
        if tables:
            table_list = [t.strip() for t in tables.split(',') if t.strip()]
        bin_data = config_backup.create_db_dump_zip(table_list)
        return Response(content=bin_data, media_type='application/zip', headers={
            'Content-Disposition': 'attachment; filename="db-dump.zip"'
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore DB dump: {e}")

# ---- DB Explorer: tables, rows, columns, search, query, CRUD ----
def _safe_table_name(name: str) -> str:
    if not isinstance(name, str) or not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', name):
        raise HTTPException(status_code=400, detail='Invalid table name')
    return name

@router.get('/admin/db/tables')
async def list_db_tables_api():
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            if USING_POSTGRES:
                db_manager.exec(cur, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
                tables = [r[0] for r in cur.fetchall()]
            else:
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                tables = [r[0] for r in cur.fetchall()]
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lista tabelle: {e}")

@router.get('/admin/db/table/{table}')
async def get_table_rows_api(table: str, limit: int = 100, offset: int = 0):
    t = _safe_table_name(table)
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            sql = f'SELECT * FROM "{t}" LIMIT ? OFFSET ?'
            db_manager.exec(cur, sql, (limit, offset))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            data = [dict(zip(cols, r)) for r in rows]
        return {"columns": cols, "rows": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura tabella: {e}")

@router.get('/admin/db/columns/{table}')
async def get_table_columns_api(table: str):
    t = _safe_table_name(table)
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            out = []
            if USING_POSTGRES:
                db_manager.exec(cur, """
                    SELECT c.column_name, c.data_type, (c.is_nullable='YES') AS is_nullable,
                           EXISTS (
                               SELECT 1 FROM information_schema.table_constraints tc
                               JOIN information_schema.key_column_usage k
                                 ON k.constraint_name=tc.constraint_name AND k.table_name=tc.table_name
                               WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_name=c.table_name AND k.column_name=c.column_name
                           ) AS is_primary
                    FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=%s
                    ORDER BY c.ordinal_position
                """, (t,))
                for r in cur.fetchall():
                    out.append({"name": r[0], "type": r[1], "is_nullable": bool(r[2]), "is_primary": bool(r[3])})
            else:
                cur.execute(f"PRAGMA table_info('{t}')")
                for r in cur.fetchall():
                    out.append({"name": r[1], "type": r[2], "is_nullable": not bool(r[3]), "is_primary": bool(r[5])})
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore colonne tabella: {e}")

@router.post('/admin/db/query')
async def run_free_query_api(payload: dict):
    sql = (payload or {}).get('sql') or ''
    limit = int((payload or {}).get('limit') or 100)
    if not sql.strip().lower().startswith('select'):
        raise HTTPException(status_code=400, detail='Only SELECT queries allowed')
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            q = sql.strip().rstrip(';')
            if ' limit ' not in q.lower():
                q = f"{q} LIMIT {limit}"
            cur.execute(db_manager.adapt_sql(q))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description] if cur.description else []
            data = [dict(zip(cols, r)) for r in rows]
        return {"columns": cols, "rows": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore esecuzione query: {e}")

@router.get('/admin/db/search')
async def search_table_api(table: str, q: str, limit: int = 50):
    t = _safe_table_name(table)
    like = f"%{q}%"
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            if USING_POSTGRES:
                db_manager.exec(cur, """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=%s AND data_type IN ('text','character varying','character')
                """, (t,))
                text_cols = [r[0] for r in cur.fetchall()] or []
                if not text_cols:
                    sql = f"SELECT * FROM \"{t}\" WHERE CAST(row_to_json(\"{t}\") AS text) ILIKE %s LIMIT %s"
                    db_manager.exec(cur, sql, (like, limit))
                else:
                    where = ' OR '.join([f'"{c}" ILIKE %s' for c in text_cols])
                    params = tuple([like]*len(text_cols) + [limit])
                    db_manager.exec(cur, f'SELECT * FROM "{t}" WHERE {where} LIMIT %s', params)
            else:
                cur.execute(f"SELECT * FROM \"{t}\" LIMIT ?", (limit,))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]
            data = [dict(zip(cols, r)) for r in rows]
        return {"columns": cols, "rows": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore ricerca: {e}")

@router.post('/admin/db/update')
async def update_row_api(payload: dict):
    table = _safe_table_name((payload or {}).get('table') or '')
    key = (payload or {}).get('key') or {}
    setv = (payload or {}).get('set') or {}
    if not key or not setv:
        raise HTTPException(status_code=400, detail='key and set are required')
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            set_parts = []
            params = []
            for k, v in setv.items():
                set_parts.append(f'"{k}" = ?')
                params.append(v)
            where_parts = []
            for k, v in key.items():
                where_parts.append(f'"{k}" = ?')
                params.append(v)
            sql = f'UPDATE "{table}" SET ' + ', '.join(set_parts) + ' WHERE ' + ' AND '.join(where_parts)
            db_manager.exec(cur, sql, tuple(params))
            affected = cur.rowcount if hasattr(cur, 'rowcount') else None
            conn.commit()
        return {"updated": affected or 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore update: {e}")

@router.post('/admin/db/insert')
async def insert_row_api(payload: dict):
    table = _safe_table_name((payload or {}).get('table') or '')
    values = (payload or {}).get('values') or {}
    if not values:
        raise HTTPException(status_code=400, detail='values required')
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            cols = list(values.keys())
            placeholders = ','.join(['?']*len(cols))
            sql = f'INSERT INTO "{table}" (' + ','.join([f'"{c}"' for c in cols]) + f') VALUES ({placeholders})'
            db_manager.exec(cur, sql, tuple(values[c] for c in cols))
            conn.commit()
        return {"inserted": 1}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore insert: {e}")

@router.post('/admin/db/delete')
async def delete_row_api(payload: dict):
    table = _safe_table_name((payload or {}).get('table') or '')
    key = (payload or {}).get('key') or {}
    if not key:
        raise HTTPException(status_code=400, detail='key required')
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            where_parts = []
            params = []
            for k, v in key.items():
                where_parts.append(f'"{k}" = ?')
                params.append(v)
            sql = f'DELETE FROM "{table}" WHERE ' + ' AND '.join(where_parts)
            db_manager.exec(cur, sql, tuple(params))
            affected = cur.rowcount if hasattr(cur, 'rowcount') else None
            conn.commit()
        return {"deleted": affected or 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore delete: {e}")

# ---- Query Builder (structured, safe) ----
class QBFilter(BaseModel):
    column: str
    op: str  # '=', '!=', '>', '<', '>=', '<=', 'like', 'ilike', 'contains', 'startswith', 'endswith', 'in', 'not in', 'is null', 'is not null', 'between'
    value: Any | None = None  # list for IN, tuple/list for BETWEEN, ignored for IS NULL

class QBMetric(BaseModel):
    fn: str  # count | sum | avg | min | max
    column: Optional[str] = None  # None allowed for count(*)
    alias: Optional[str] = None

class QBOrder(BaseModel):
    by: str
    dir: str = 'ASC'  # ASC | DESC

class QueryBuilderIn(BaseModel):
    table: str
    select: Optional[List[str]] = None        # columns when not aggregating
    filters: Optional[List[QBFilter]] = None
    group_by: Optional[List[str]] = None
    metrics: Optional[List[QBMetric]] = None  # when aggregating
    order_by: Optional[QBOrder] = None
    limit: Optional[int] = 100
    offset: Optional[int] = 0
    distinct: Optional[bool] = False

def _safe_ident(name: str) -> str:
    """Validate identifier and return quoted version for SQL."""
    if not isinstance(name, str) or not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', name):
        raise HTTPException(status_code=400, detail='Invalid identifier')
    return '"' + name + '"'

def _list_columns_for_table(conn, table: str) -> list[str]:
    cur = conn.cursor()
    if USING_POSTGRES:
        db_manager.exec(cur, """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position
        """, (table,))
        return [r[0] for r in cur.fetchall()]
    else:
        cur.execute(f"PRAGMA table_info('{table}')")
        return [r[1] for r in cur.fetchall()]

@router.post('/admin/db/query-builder')
async def query_builder(req: QueryBuilderIn):
    """Esegue una SELECT costruita in modo sicuro a partire da un payload strutturato.

    Supporta filtri semplici, group by + metriche e ordinamento. Forza limiti ragionevoli.
    """
    table = _safe_table_name(req.table)
    limit = int(req.limit or 100)
    if limit <= 0:
        limit = 100
    limit = min(limit, 1000)
    offset = int(req.offset or 0)
    if offset < 0:
        offset = 0
    distinct = bool(req.distinct or False)

    allowed_ops = {
        '=', '!=', '>', '<', '>=', '<=', 'like', 'ilike',
        'contains', 'startswith', 'endswith', 'in', 'not in', 'is null', 'is not null', 'between'
    }
    allowed_fns = {'count', 'sum', 'avg', 'min', 'max'}

    try:
        with db_manager.get_connection() as conn:
            cols = set(_list_columns_for_table(conn, table))
            if not cols:
                raise HTTPException(status_code=400, detail='Table has no columns or not found')

            params: list[Any] = []
            select_parts: list[str] = []
            group_by_parts: list[str] = []
            metrics_aliases: set[str] = set()

            # Build SELECT
            if req.group_by or req.metrics:
                # Aggregation mode
                gb = list(req.group_by or [])
                for c in gb:
                    if c not in cols:
                        raise HTTPException(status_code=400, detail=f'group_by invalid column: {c}')
                    group_by_parts.append(_safe_ident(c))
                    select_parts.append(_safe_ident(c))
                for m in req.metrics or []:
                    fn = (m.fn or '').lower()
                    if fn not in allowed_fns:
                        raise HTTPException(status_code=400, detail=f'Invalid metric fn: {fn}')
                    if fn == 'count' and not m.column:
                        alias = m.alias or 'count'
                        # validate alias if present
                        if alias and not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', alias):
                            raise HTTPException(status_code=400, detail='Invalid alias')
                        select_parts.append(f"COUNT(*) AS {alias}")
                        metrics_aliases.add(alias)
                    else:
                        if not m.column or m.column not in cols:
                            raise HTTPException(status_code=400, detail='Invalid metric column')
                        colq = _safe_ident(m.column)
                        alias = m.alias or f"{fn}_{m.column}"
                        if alias and not re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', alias):
                            raise HTTPException(status_code=400, detail='Invalid alias')
                        select_parts.append(f"{fn.upper()}({colq}) AS {alias}")
                        metrics_aliases.add(alias)
                if not select_parts:
                    raise HTTPException(status_code=400, detail='Empty select in aggregation mode')
            else:
                # Row mode
                if req.select:
                    for c in req.select:
                        if c == '*':
                            select_parts.append('*')
                        else:
                            if c not in cols:
                                raise HTTPException(status_code=400, detail=f'select invalid column: {c}')
                            select_parts.append(_safe_ident(c))
                else:
                    select_parts.append('*')

            # Build WHERE
            where_parts: list[str] = []
            for f in (req.filters or []):
                op = (f.op or '').lower().strip()
                if op not in allowed_ops:
                    raise HTTPException(status_code=400, detail=f'Invalid operator: {op}')
                if op in {'is null', 'is not null'}:
                    if f.column not in cols:
                        raise HTTPException(status_code=400, detail='Invalid filter column')
                    where_parts.append(f"{_safe_ident(f.column)} IS {'NOT ' if op=='is not null' else ''}NULL")
                    continue
                if op == 'between':
                    if f.column not in cols:
                        raise HTTPException(status_code=400, detail='Invalid filter column')
                    if not isinstance(f.value, (list, tuple)) or len(f.value) != 2:
                        raise HTTPException(status_code=400, detail='between requires [min,max]')
                    where_parts.append(f"{_safe_ident(f.column)} BETWEEN ? AND ?")
                    params.extend([f.value[0], f.value[1]])
                    continue
                if op in {'in', 'not in'}:
                    if f.column not in cols:
                        raise HTTPException(status_code=400, detail='Invalid filter column')
                    if not isinstance(f.value, (list, tuple)) or len(f.value) == 0:
                        raise HTTPException(status_code=400, detail='in/not in requires non-empty array')
                    placeholders = ','.join(['?']*len(f.value))
                    where_parts.append(f"{_safe_ident(f.column)} {'NOT ' if op=='not in' else ''}IN ({placeholders})")
                    params.extend(list(f.value))
                    continue
                # LIKE family
                if f.column not in cols:
                    raise HTTPException(status_code=400, detail='Invalid filter column')
                if op in {'like', 'ilike', 'contains', 'startswith', 'endswith'}:
                    pattern = str(f.value or '')
                    if op == 'contains':
                        pattern = f"%{pattern}%"
                        oper = 'ILIKE' if USING_POSTGRES else 'LIKE'
                    elif op == 'startswith':
                        pattern = f"{pattern}%"
                        oper = 'ILIKE' if USING_POSTGRES else 'LIKE'
                    elif op == 'endswith':
                        pattern = f"%{pattern}"
                        oper = 'ILIKE' if USING_POSTGRES else 'LIKE'
                    else:
                        oper = 'ILIKE' if (op=='ilike' and USING_POSTGRES) else 'LIKE'
                    where_parts.append(f"{_safe_ident(f.column)} {oper} ?")
                    params.append(pattern)
                else:
                    # Binary comparisons
                    where_parts.append(f"{_safe_ident(f.column)} {op} ?")
                    params.append(f.value)

            # ORDER BY
            order_sql = ''
            if req.order_by and req.order_by.by:
                by = req.order_by.by
                direction = (req.order_by.dir or 'ASC').upper()
                if direction not in ('ASC','DESC'):
                    direction = 'ASC'
                # Allow ordering by group_by columns or metric aliases
                if (req.group_by and by in req.group_by) or (by in metrics_aliases) or (by in cols):
                    order_sql = f" ORDER BY {by} {direction}"

            sql = 'SELECT ' + (('DISTINCT ' if distinct else '') + ', '.join(select_parts))
            sql += f" FROM {_safe_ident(table)}"
            if where_parts:
                sql += ' WHERE ' + ' AND '.join(where_parts)
            if group_by_parts:
                sql += ' GROUP BY ' + ', '.join(group_by_parts)
            sql += order_sql
            # LIMIT/OFFSET as params for safety
            if USING_POSTGRES:
                # use placeholders, adapted by db_manager
                sql += ' LIMIT ? OFFSET ?'
                params.extend([limit, offset])
            else:
                sql += ' LIMIT ? OFFSET ?'
                params.extend([limit, offset])

            cur = conn.cursor()
            db_manager.exec(cur, sql, tuple(params))
            rows = cur.fetchall()
            cols_out = [d[0] for d in cur.description] if cur.description else []
            data = [dict(zip(cols_out, r)) for r in rows]
            return {"columns": cols_out, "rows": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore query builder: {e}")

class RestoreOptions(BaseModel):
    allow_seed: bool = False
    dry_run: bool = False

@router.post('/admin/config/restore')
async def restore_config(file: UploadFile = File(...), allow_seed: bool = False, dry_run: bool = False):
    """Ripristina configurazioni da un archivio ZIP generato dal backup.

    Parametri:
      allow_seed: se True permette di sovrascrivere file seed.
      dry_run: valida senza scrivere.
    """
    try:
        from . import config_backup
        data = await file.read()
        result = config_backup.restore_from_zip(data, dry_run=dry_run, allow_seed=allow_seed)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore restore: {e}")

@router.get('/admin/config/status')
async def config_status(include_seed: bool = False, include_optional: bool = True, include_uppercase_variants: bool = True):
    """Ritorna hash SHA256 dei file di configurazione + hash aggregato.

    include_seed: include i seed.
    include_optional: include opzionali se presenti.
    include_uppercase_variants: se True rileva varianti UPPERCASE dei file runtime (compat legacy) e le mostra.
    """
    try:
        from . import config_backup
        file_defs = config_backup._file_list()  # type: ignore (internal use)
        entries = []
        hasher = hashlib.sha256()
        # Tracciamo canonical runtime per evitare duplicazioni
        canonical_runtime_map = {
            'system_prompts.json': ('runtime_system_prompts', 'prompts'),
            'summary_prompts.json': ('runtime_summary_prompts', 'summary'),
            'personalities.json': ('runtime_personalities', 'personalities')
        }
        seen_upper = []
        for f in file_defs:
            if f.kind == 'seed' and not include_seed:
                continue
            if not include_optional and (not f.required):
                continue
            exists = f.path.exists()
            info = {
                'id': f.id,
                'path': str(f.path),
                'kind': f.kind,
                'required': f.required,
                'exists': exists,
                'filename': f.path.name,
                'relative': f.path.name,
            }
            if exists:
                try:
                    data = f.path.read_bytes()
                    h = hashlib.sha256(data).hexdigest()
                    info['sha256'] = h
                    info['bytes'] = len(data)
                    hasher.update(h.encode('utf-8'))
                except Exception as e:
                    info['error'] = str(e)
            entries.append(info)
            # Uppercase variant detection (runtime only)
            if include_uppercase_variants and f.kind == 'runtime':
                base = f.path.name
                if base in canonical_runtime_map:
                    upper_candidate = f.path.parent / base.upper()
                    if (not exists) and upper_candidate.exists():
                        # canonical missing, uppercase present → treat as active variant
                        try:
                            data_u = upper_candidate.read_bytes()
                            h_u = hashlib.sha256(data_u).hexdigest()
                            hasher.update(h_u.encode('utf-8'))
                            entries.append({
                                'id': f"{f.id}_uppercase_variant",
                                'path': str(upper_candidate),
                                'kind': f.kind,
                                'required': False,
                                'exists': True,
                                'filename': upper_candidate.name,
                                'relative': upper_candidate.name,
                                'sha256': h_u,
                                'bytes': len(data_u),
                                'uppercase_fallback_for': base,
                                'note': 'uppercase variant in uso (canonical lowercase assente)'
                            })
                            seen_upper.append(str(upper_candidate))
                        except Exception as ue:
                            entries.append({
                                'id': f"{f.id}_uppercase_variant_error",
                                'path': str(upper_candidate),
                                'kind': f.kind,
                                'required': False,
                                'exists': True,
                                'filename': upper_candidate.name,
                                'relative': upper_candidate.name,
                                'error': str(ue)
                            })
                    elif exists and upper_candidate.exists():
                        # Both exist (inconsistency) -> report uppercase as shadowed
                        entries.append({
                            'id': f"{f.id}_uppercase_shadowed",
                            'path': str(upper_candidate),
                            'kind': f.kind,
                            'required': False,
                            'exists': True,
                            'filename': upper_candidate.name,
                            'relative': upper_candidate.name,
                            'shadowed_by': f.path.name,
                            'note': 'variant uppercase presente ma ignorata (usa lowercase)'
                        })
        aggregate = hasher.hexdigest()
        return {"success": True, "aggregate_sha256": aggregate, "files": entries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore status config: {e}")


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
# Prefer storage copy (editable/persisted) for regex guide; fallback to root project file.
PIPELINE_REGEX_GUIDE_STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage" / "pipeline" / "pipeline_regex_guide.json"
PIPELINE_REGEX_GUIDE_ROOT_PATH = Path(__file__).resolve().parent.parent / "pipeline_regex_guide.json"

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

# ---- Pipeline pattern validation helpers ----
class PatternIssue(BaseModel):
    pattern: str
    topic: Optional[str] = None
    severity: str  # INFO | WARN | ERROR
    code: str      # machine readable code
    message: str   # human readable explanation

def _analyze_pattern(raw: str) -> List[PatternIssue]:
    issues: List[PatternIssue] = []
    p = raw.strip()
    if not p:
        issues.append(PatternIssue(pattern=raw, severity="ERROR", code="EMPTY", message="Pattern vuoto"))
        return issues
    # Compile validity
    try:
        re.compile(p)
    except re.error as e:
        issues.append(PatternIssue(pattern=raw, severity="ERROR", code="INVALID", message=f"Regex non valida: {e}"))
        return issues
    # Heuristics
    if p.endswith('|') or '||' in p:
        issues.append(PatternIssue(pattern=raw, severity="ERROR", code="EMPTY_ALTERNATIVE", message="Alternativa vuota (| finale o doppio ||) causa match universale"))
    # Overly generic catch-all suspicious patterns
    if p in ['.*', '.+', '.?']:
        issues.append(PatternIssue(pattern=raw, severity="ERROR", code="TRIVIAL", message="Pattern triviale matcha qualsiasi testo"))
    # Suspicious any-char repetition
    if re.search(r"\.[*+]{2,}", p):
        issues.append(PatternIssue(pattern=raw, severity="WARN", code="REDUNDANT_REPEAT", message="Ripetizione eccessiva (.*+ ecc.)"))
    if '.*.*' in p:
        issues.append(PatternIssue(pattern=raw, severity="WARN", code="DOUBLE_ANY", message="Uso ripetuto di .* consecutivi"))
    # Long unbounded dot-star segment
    if '.*' in p and not re.search(r"\[\\n\]", p):
        issues.append(PatternIssue(pattern=raw, severity="INFO", code="DOTSTAR", message="Usa .* con cautela: valuta limitare con [^\\n]{0,80}"))
    # Missing word boundaries for simple word (heuristic: only letters/spaces)
    if re.fullmatch(r"[a-zàèéìòù ]{3,}", p, flags=re.IGNORECASE):
        if '\\b' not in p:
            issues.append(PatternIssue(pattern=raw, severity="WARN", code="NO_WORD_BOUNDARY", message="Considera aggiungere \\b ai confini per evitare match parziali"))
    # Potential catastrophic backtracking (nested quantifiers) simplistic detection
    if re.search(r"(\(.{0,20}\*[^)]*\+)|\(.{0,20}\+[^)]*\*\)", p):
        issues.append(PatternIssue(pattern=raw, severity="WARN", code="NESTED_QUANTIFIERS", message="Possibile backtracking pesante (quantificatori annidati)"))
    # Length check
    if len(p) > 220:
        issues.append(PatternIssue(pattern=raw, severity="INFO", code="LONG", message="Pattern molto lungo: valuta semplificazione"))
    return issues

def validate_pipeline_patterns(cfg: dict) -> List[PatternIssue]:
    out: List[PatternIssue] = []
    for r in cfg.get('routes', []):
        pat = r.get('pattern','')
        topic = r.get('topic')
        for issue in _analyze_pattern(pat):
            issue.topic = topic
            out.append(issue)
    # Detect duplicate patterns mapping to different topics
    seen: dict[str,str] = {}
    for r in cfg.get('routes', []):
        pat = r.get('pattern','')
        t = r.get('topic')
        if pat in seen and seen[pat] != t:
            out.append(PatternIssue(pattern=pat, topic=t, severity="WARN", code="DUPLICATE_PATTERN", message=f"Pattern duplicato usato anche per topic '{seen[pat]}'"))
        else:
            seen[pat] = t
    return out

@router.get("/admin/pipeline")
async def get_pipeline_config():
    try:
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding="utf-8"))
        # Attach validation summary (non bloccante)
        try:
            issues = validate_pipeline_patterns(data)
            data['validation'] = {
                'issues': [i.dict() for i in issues],
                'counts': {
                    'ERROR': sum(1 for x in issues if x.severity=='ERROR'),
                    'WARN': sum(1 for x in issues if x.severity=='WARN'),
                    'INFO': sum(1 for x in issues if x.severity=='INFO')
                }
            }
        except Exception as _ve:
            data['validation'] = {'error': str(_ve)}
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento pipeline: {str(e)}")

@router.get('/admin/pipeline/regex-guide')
async def get_pipeline_regex_guide():
    """Ritorna il contenuto markdown della guida regex (preferendo la copia in storage)."""
    try:
        # Auto-sync: se esiste root ed è più recente o storage mancante, copia root -> storage
        try:
            if PIPELINE_REGEX_GUIDE_ROOT_PATH.exists():
                root_mtime = PIPELINE_REGEX_GUIDE_ROOT_PATH.stat().st_mtime
                storage_exists = PIPELINE_REGEX_GUIDE_STORAGE_PATH.exists()
                storage_mtime = PIPELINE_REGEX_GUIDE_STORAGE_PATH.stat().st_mtime if storage_exists else 0
                if (not storage_exists) or root_mtime > storage_mtime:
                    PIPELINE_REGEX_GUIDE_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
                    PIPELINE_REGEX_GUIDE_STORAGE_PATH.write_text(PIPELINE_REGEX_GUIDE_ROOT_PATH.read_text(encoding='utf-8'), encoding='utf-8')
        except Exception as sync_err:
            # Non blocca la lettura: logga soltanto
            logging.getLogger(__name__).warning(f"Sync guida regex fallita: {sync_err}")

        path = PIPELINE_REGEX_GUIDE_STORAGE_PATH if PIPELINE_REGEX_GUIDE_STORAGE_PATH.exists() else (PIPELINE_REGEX_GUIDE_ROOT_PATH if PIPELINE_REGEX_GUIDE_ROOT_PATH.exists() else None)
        if not path:
            return {"success": False, "error": "Guida non trovata"}
        text = path.read_text(encoding='utf-8')
        return {"success": True, "content": text, "source": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura guida: {e}")

@router.get('/admin/admin-guide')
async def get_admin_general_guide():
    """Restituisce la guida amministratore generale (auto-sync root→storage)."""
    try:
        try:
            # Determine effective source: primary or first existing fallback
            source_path = None
            if ADMIN_GUIDE_ROOT_PATH.exists():
                source_path = ADMIN_GUIDE_ROOT_PATH
            else:
                for fp in _ADMIN_GUIDE_FALLBACKS:
                    if fp.exists():
                        source_path = fp
                        break
            if source_path:
                root_mtime = source_path.stat().st_mtime
                storage_exists = ADMIN_GUIDE_STORAGE_PATH.exists()
                storage_mtime = ADMIN_GUIDE_STORAGE_PATH.stat().st_mtime if storage_exists else 0
                if (not storage_exists) or root_mtime > storage_mtime:
                    ADMIN_GUIDE_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
                    ADMIN_GUIDE_STORAGE_PATH.write_text(source_path.read_text(encoding='utf-8'), encoding='utf-8')
        except Exception as sync_err:
            logging.getLogger(__name__).warning(f"Sync guida admin fallita: {sync_err}")
        path = ADMIN_GUIDE_STORAGE_PATH if ADMIN_GUIDE_STORAGE_PATH.exists() else (ADMIN_GUIDE_ROOT_PATH if ADMIN_GUIDE_ROOT_PATH.exists() else None)
        if not path:
            return {"success": False, "error": "Guida amministratore non trovata"}
        return {"success": True, "content": path.read_text(encoding='utf-8'), "source": str(path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura guida amministratore: {e}")

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
    # Heuristic validation (non-blocking except HARD errors)
    cfg_dict = cfg.dict()
    issues = validate_pipeline_patterns(cfg_dict)
    hard_errors = [i for i in issues if i.severity == 'ERROR']
    if hard_errors:
        # Block saving if there are HARD errors to enforce quality
        raise HTTPException(status_code=400, detail={
            'message': 'Errori di validazione pattern',
            'issues': [i.dict() for i in hard_errors]
        })
    try:
        PIPELINE_CONFIG_PATH.write_text(json.dumps(cfg.dict(), indent=2, ensure_ascii=False), encoding="utf-8")
        _refresh_routes_cache()
        refresh_files_cache()
        return {"success": True, "message": "Pipeline salvata", "validation": {
            'issues': [i.dict() for i in issues],
            'counts': {
                'ERROR': 0,
                'WARN': sum(1 for x in issues if x.severity=='WARN'),
                'INFO': sum(1 for x in issues if x.severity=='INFO')
            }
        }}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio pipeline: {str(e)}")

@router.get('/admin/pipeline/validate')
async def validate_pipeline_only():
    """Endpoint dedicato alla sola validazione (senza salvataggio)."""
    try:
        data = json.loads(PIPELINE_CONFIG_PATH.read_text(encoding='utf-8'))
        issues = validate_pipeline_patterns(data)
        return {
            'success': True,
            'issues': [i.dict() for i in issues],
            'counts': {
                'ERROR': sum(1 for x in issues if x.severity=='ERROR'),
                'WARN': sum(1 for x in issues if x.severity=='WARN'),
                'INFO': sum(1 for x in issues if x.severity=='INFO')
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Errore validazione pipeline: {e}')

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
        _refresh_routes_cache()
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
        _refresh_routes_cache()
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
        _refresh_routes_cache()
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
        _refresh_routes_cache()
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
def _pipeline_data_dir() -> Path:
    """Directory pipeline_files persistente (niente più migrazione /data)."""
    import os
    env_dir = os.getenv("PIPELINE_FILES_DIR")
    here = Path(__file__).resolve()
    storage_dir = here.parent.parent / "storage" / "pipeline_files"
    target = Path(env_dir) if env_dir else storage_dir
    target.mkdir(parents=True, exist_ok=True)
    return target

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
                    "it_IT-riccardo-low",
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
        elif tts_provider == "coqui":
            # Coqui TTS: recupera dinamicamente le voci dalla configurazione admin se presenti,
            # altrimenti fornisce un fallback statico.
            try:
                cfg = load_config()
                voices = cfg.get("tts_providers", {}).get("coqui", {}).get("voices") or []
            except Exception:
                voices = []
            if not voices:
                voices = [
                    "tts_models/it/mai_female/vits",
                    "tts_models/multilingual/multi-dataset/your_tts"
                ]
            return {"voices": voices}
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

@router.get("/admin/rag/debug/env")
async def admin_rag_debug_env(document_id: int | None = None):
    """Diagnostica rapida backend RAG: tipo DB, path SQLite, presenza documento opzionale."""
    try:
        from .database import USING_POSTGRES
        info: dict[str, Any] = {
            "backend": "postgres" if USING_POSTGRES else "sqlite",
            "rag_db_path": str(rag_engine.db_path),
            "originals_dir": str(rag_engine.originals_dir),
        }
        if document_id is not None:
            try:
                import sqlite3
                if USING_POSTGRES:
                    # Usa db_manager per interrogare Postgres
                    from .database import db_manager as _db
                    with _db.get_connection() as conn:
                        cur = conn.cursor()
                        _db.exec(cur, "SELECT id, group_id, filename FROM rag_documents WHERE id = ?", (document_id,))
                        row = cur.fetchone()
                        if row:
                            info["document"] = {"id": row[0], "group_id": row[1], "filename": row[2]}
                        else:
                            info["document"] = None
                else:
                    conn = sqlite3.connect(str(rag_engine.db_path))
                    cur = conn.cursor()
                    cur.execute("SELECT id, group_id, filename FROM rag_documents WHERE id = ?", (document_id,))
                    row = cur.fetchone()
                    conn.close()
                    info["document"] = {"id": row[0], "group_id": row[1], "filename": row[2]} if row else None
            except Exception as e:
                info["error"] = f"lookup_error:{e}"
        return {"success": True, "env": info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore debug env: {e}")

@router.get("/admin/rag/groups")
async def admin_get_rag_groups():
    """Get all RAG groups for admin panel"""
    try:
        # Prima riassegna automaticamente eventuali documenti orfani (idempotente)
        try:
            moved = rag_engine.reassign_orphan_documents()
            if moved:
                get_system_logger().info(f"[RAG] Riassegnati automaticamente {moved} documenti orfani")
        except Exception as _e:
            # Non bloccare la risposta se fallisce la riassegnazione
            get_system_logger().warning(f"[RAG] Errore auto-riassegnazione orfani: {_e}")

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
    """Upload document to RAG group for admin panel with extraction diagnostics."""
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
            # Verifica che il gruppo esista usando il backend attivo
            if USING_POSTGRES:
                with db_manager.get_connection() as conn:
                    cur = conn.cursor()
                    db_manager.exec(cur, "SELECT id FROM rag_groups WHERE id = ?", (group_id,))
                    if not cur.fetchone():
                        raise HTTPException(status_code=400, detail=f"Gruppo {group_id} inesistente (recuperare o crearne uno)")
            else:
                import sqlite3 as _sl
                _c = _sl.connect(str(rag_engine.db_path))
                try:
                    curg = _c.cursor()
                    curg.execute("SELECT id FROM rag_groups WHERE id = ?", (group_id,))
                    if not curg.fetchone():
                        raise HTTPException(status_code=400, detail=f"Gruppo {group_id} inesistente (recuperare o crearne uno)")
                finally:
                    try:
                        _c.close()
                    except Exception:
                        pass
            # Salva copia persistente del PDF grezzo nella directory originals del rag_engine
            originals_dir = rag_engine.originals_dir
            originals_dir.mkdir(parents=True, exist_ok=True)
            import time, shutil
            safe_base = re.sub(r"[^a-zA-Z0-9_.-]", "-", file.filename.rsplit('/',1)[-1]) or 'document.pdf'
            stored_name = f"{int(time.time())}_{safe_base}"
            stored_path = originals_dir / stored_name
            try:
                shutil.copy2(temp_file_path, stored_path)
            except Exception as ce:
                raise HTTPException(status_code=500, detail=f"Errore salvataggio copia PDF: {ce}")

            # Extract text from PDF
            from .file_processing import extract_text_from_pdf_with_diagnostics
            diag = extract_text_from_pdf_with_diagnostics(temp_file_path)
            text_content = diag.get("text", "")
            if not text_content.strip():
                raise HTTPException(status_code=400, detail="Impossibile estrarre testo dal PDF")

            # Calcola hash per rilevare duplicati prima di inserire
            import hashlib
            content_hash = hashlib.sha256(text_content.encode()).hexdigest()
            duplicate = False
            duplicate_existing_chunk_count = 0
            document_id = None
            existing_filename = ""
            # Usa backend attivo per deduplica e aggiornamento timestamp
            if USING_POSTGRES:
                with db_manager.get_connection() as conn:
                    cur_h = conn.cursor()
                    db_manager.exec(cur_h, "SELECT id, filename FROM rag_documents WHERE file_hash = ? AND group_id = ?", (content_hash, group_id))
                    row_h = cur_h.fetchone()
                    if row_h:
                        document_id, existing_filename = row_h
                        duplicate = True
                        get_system_logger().info(f"Documento duplicato rilevato. File caricato '{file.filename}' ha lo stesso contenuto di '{existing_filename}' (ID: {document_id}).")
                        try:
                            db_manager.exec(cur_h, "UPDATE rag_documents SET updated_at = NOW() WHERE id = ?", (document_id,))
                            conn.commit()
                        except Exception:
                            pass
                    else:
                        duplicate = False
                        document_id = rag_engine.add_document(
                            group_id=group_id,
                            filename=file.filename,
                            content=text_content,
                            original_filename=file.filename,
                            stored_filename=stored_name
                        )
                    if duplicate and document_id:
                        try:
                            db_manager.exec(cur_h, "SELECT chunk_count FROM rag_documents WHERE id = ?", (document_id,))
                            rcc = cur_h.fetchone()
                            if rcc:
                                duplicate_existing_chunk_count = rcc[0] or 0
                        except Exception:
                            pass
            else:
                import sqlite3
                conn_h = sqlite3.connect(str(rag_engine.db_path))
                try:
                    cur_h = conn_h.cursor()
                    cur_h.execute("SELECT id, filename FROM rag_documents WHERE file_hash = ? AND group_id = ?", (content_hash, group_id))
                    row_h = cur_h.fetchone()
                    if row_h:
                        document_id, existing_filename = row_h
                        duplicate = True
                        get_system_logger().info(f"Documento duplicato rilevato. File caricato '{file.filename}' ha lo stesso contenuto di '{existing_filename}' (ID: {document_id}).")
                        try:
                            cur_h.execute("UPDATE rag_documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (document_id,))
                            conn_h.commit()
                        except Exception:
                            pass
                    else:
                        duplicate = False
                        document_id = rag_engine.add_document(
                            group_id=group_id,
                            filename=file.filename,
                            content=text_content,
                            original_filename=file.filename,
                            stored_filename=stored_name
                        )
                    if duplicate and document_id:
                        try:
                            cur_h.execute("SELECT chunk_count FROM rag_documents WHERE id = ?", (document_id,))
                            rcc = cur_h.fetchone()
                            if rcc:
                                duplicate_existing_chunk_count = rcc[0] or 0
                        except Exception:
                            pass
                finally:
                    try:
                        conn_h.close()
                    except Exception:
                        pass

            # Recupera dettagli documento per facilitare aggiornamento frontend immediato
            # Recupera dettagli documento via backend attivo
            doc_details = None
            if USING_POSTGRES:
                with db_manager.get_connection() as conn:
                    cur_d = conn.cursor()
                    # In Postgres archived è già definito come boolean, COALESCE per updated_at
                    db_manager.exec(cur_d,
                        "SELECT id, group_id, filename, original_filename, stored_filename, file_size, content_preview, chunk_count, created_at, COALESCE(updated_at, created_at) as updated_at, archived FROM rag_documents WHERE id = ?",
                        (document_id,)
                    )
                    row = cur_d.fetchone()
                    if row:
                        doc_details = {
                            "id": row[0],
                            "group_id": row[1],
                            "filename": row[2],
                            "original_filename": row[3],
                            "stored_filename": row[4],
                            "file_size": row[5],
                            "content_preview": row[6],
                            "chunk_count": row[7],
                            "created_at": row[8],
                            "updated_at": row[9],
                            "archived": bool(row[10])
                        }
            else:
                import sqlite3
                conn_d = sqlite3.connect(str(rag_engine.db_path))
                try:
                    cur_d = conn_d.cursor()
                    cur_d.execute("PRAGMA table_info(rag_documents)")
                    cols = [r[1] for r in cur_d.fetchall()]
                    has_archived = 'archived' in cols
                    select_archived = ", archived" if has_archived else ", 0 as archived"
                    cur_d.execute(
                        f"SELECT id, group_id, filename, original_filename, stored_filename, file_size, content_preview, chunk_count, created_at, COALESCE(updated_at, created_at) as updated_at{select_archived} FROM rag_documents WHERE id = ?",
                        (document_id,)
                    )
                    row = cur_d.fetchone()
                    if row:
                        doc_details = {
                            "id": row[0],
                            "group_id": row[1],
                            "filename": row[2],
                            "original_filename": row[3],
                            "stored_filename": row[4],
                            "file_size": row[5],
                            "content_preview": row[6],
                            "chunk_count": row[7],
                            "created_at": row[8],
                            "updated_at": row[9],
                            "archived": row[10] if len(row) > 10 else 0
                        }
                finally:
                    try:
                        conn_d.close()
                    except Exception:
                        pass

            message = f"Documento '{file.filename}' caricato con successo."
            if duplicate:
                message = f"File '{file.filename}' è un duplicato di '{existing_filename}' e non è stato aggiunto."

            return {
                "success": True,
                "document_id": document_id,
                "stored_filename": stored_name,
                "duplicate": duplicate,
                "duplicate_existing_chunk_count": duplicate_existing_chunk_count,
                "document": doc_details,
                "message": message,
                "extraction": {
                    "method": diag.get("method"),
                    "pages": diag.get("pages"),
                    "chars": diag.get("chars"),
                    "short_text": diag.get("short_text"),
                    "fallback_used": diag.get("fallback_used"),
                    "errors": diag.get("errors", [])[:5]
                }
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

@router.get("/admin/rag/documents")
async def admin_list_all_rag_documents(search: str | None = None, group_id: int | None = None, limit: int = 100, offset: int = 0):
    """Lista globale documenti RAG con filtri opzionali.
    Params:
      - search: substring su filename/original_filename
      - group_id: filtra per gruppo
      - limit/offset: paginazione (default 100)
    """
    try:
        conds = []
        params: list[Any] = []
        if group_id is not None:
            conds.append("d.group_id = ?")
            params.append(group_id)
        if search:
            conds.append("(LOWER(d.filename) LIKE ? OR LOWER(d.original_filename) LIKE ?)")
            like = f"%{search.lower()}%"
            params.extend([like, like])
        where_clause = f" WHERE {' AND '.join(conds)}" if conds else ""
        order_clause = " ORDER BY d.created_at DESC"
        limit_clause = " LIMIT ? OFFSET ?"
        base = (
            "SELECT d.id, d.group_id, g.name as group_name, d.filename, d.original_filename, d.stored_filename, d.file_size, d.chunk_count, d.created_at "
            "FROM rag_documents d LEFT JOIN rag_groups g ON d.group_id = g.id"
        )
        if USING_POSTGRES:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                db_manager.exec(cur, f"SELECT COUNT(*) FROM rag_documents d LEFT JOIN rag_groups g ON d.group_id = g.id{where_clause}", params)
                total = cur.fetchone()[0]
                db_manager.exec(cur, base + where_clause + order_clause + limit_clause, [*params, limit, offset])
                rows = cur.fetchall()
        else:
            import sqlite3
            conn = sqlite3.connect(str(rag_engine.db_path))
            cur = conn.cursor()
            cur.execute(f"SELECT COUNT(*) FROM rag_documents d LEFT JOIN rag_groups g ON d.group_id = g.id{where_clause}", params)
            total = cur.fetchone()[0]
            cur.execute(base + where_clause + order_clause + limit_clause, [*params, limit, offset])
            rows = cur.fetchall()
            conn.close()
        docs = [
            {
                "id": r[0],
                "group_id": r[1],
                "group_name": r[2],
                "filename": r[3],
                "original_filename": r[4],
                "stored_filename": r[5],
                "file_size": r[6],
                "chunk_count": r[7],
                "created_at": r[8]
            } for r in rows
        ]
        return {"success": True, "total": total, "documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/document/search")
async def admin_search_rag_document(q: str):
    """Ricerca rapida documento per nome (filename o original_filename LIKE). Ritorna lista snella.
    Parametri:
      - q: substring case-insensitive
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query troppo corta (min 2 caratteri)")
    try:
        like = f"%{q.lower()}%"
        sql = (
            "SELECT d.id, d.group_id, g.name, d.filename, d.original_filename, d.chunk_count "
            "FROM rag_documents d "
            "LEFT JOIN rag_groups g ON d.group_id = g.id "
            "WHERE LOWER(d.filename) LIKE ? OR LOWER(d.original_filename) LIKE ? "
            "ORDER BY d.created_at DESC LIMIT 50"
        )
        if USING_POSTGRES:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                db_manager.exec(cur, sql, (like, like))
                rows = cur.fetchall()
        else:
            import sqlite3
            conn = sqlite3.connect(str(rag_engine.db_path))
            cur = conn.cursor()
            cur.execute(sql, (like, like))
            rows = cur.fetchall()
            conn.close()
        results = [
            {
                "id": r[0],
                "group_id": r[1],
                "group_name": r[2],
                "filename": r[3],
                "original_filename": r[4],
                "chunk_count": r[5]
            } for r in rows
        ]
        return {"success": True, "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/orphans")
async def admin_list_rag_orphans():
    """Elenca documenti orfani: group_id NULL/0 o riferito a gruppo inesistente."""
    import sqlite3
    try:
        if USING_POSTGRES:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                db_manager.exec(cur, "SELECT id, group_id, filename, created_at FROM rag_documents WHERE group_id IS NULL OR group_id = 0 ORDER BY created_at DESC")
                nulls = [ { 'id': r[0], 'group_id': r[1], 'filename': r[2], 'created_at': r[3] } for r in cur.fetchall() ]
                db_manager.exec(cur,
                    """
                    SELECT d.id, d.group_id, d.filename, d.created_at
                    FROM rag_documents d
                    LEFT JOIN rag_groups g ON d.group_id = g.id
                    WHERE d.group_id IS NOT NULL AND d.group_id != 0 AND g.id IS NULL
                    ORDER BY d.created_at DESC
                    """
                )
                dangling = [ { 'id': r[0], 'group_id': r[1], 'filename': r[2], 'created_at': r[3] } for r in cur.fetchall() ]
        else:
            conn = sqlite3.connect(str(rag_engine.db_path))
            cur = conn.cursor()
            cur.execute("SELECT id, group_id, filename, created_at FROM rag_documents WHERE group_id IS NULL OR group_id = 0 ORDER BY created_at DESC")
            nulls = [ { 'id': r[0], 'group_id': r[1], 'filename': r[2], 'created_at': r[3] } for r in cur.fetchall() ]
            cur.execute(
                """
                SELECT d.id, d.group_id, d.filename, d.created_at
                FROM rag_documents d
                LEFT JOIN rag_groups g ON d.group_id = g.id
                WHERE d.group_id IS NOT NULL AND d.group_id != 0 AND g.id IS NULL
                ORDER BY d.created_at DESC
                """
            )
            dangling = [ { 'id': r[0], 'group_id': r[1], 'filename': r[2], 'created_at': r[3] } for r in cur.fetchall() ]
            conn.close()
        return { 'success': True, 'null_group': nulls, 'dangling_group': dangling, 'total': len(nulls) + len(dangling) }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/recover-groups")
async def admin_recover_rag_groups():
    """Ricostruisce gruppi mancanti presenti nei documenti (placeholder)."""
    try:
        result = rag_engine.recover_missing_groups()
        return {"success": True, "created": result["created"], "recovered": result["recovered"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/documents/{document_id}/download")
async def admin_download_rag_document(document_id: int):
    """Scarica il PDF originale se salvato (stored_filename)."""
    try:
        stored_filename = None
        original_filename = None
        if USING_POSTGRES:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                db_manager.exec(
                    cur,
                    "SELECT stored_filename, original_filename FROM rag_documents WHERE id = ?",
                    (document_id,),
                )
                row = cur.fetchone()
                if row:
                    stored_filename, original_filename = row[0], row[1]
        else:
            import sqlite3
            conn = sqlite3.connect(str(rag_engine.db_path))
            cur = conn.cursor()
            cur.execute(
                "SELECT stored_filename, original_filename FROM rag_documents WHERE id = ?",
                (document_id,),
            )
            row = cur.fetchone()
            conn.close()
            if row:
                stored_filename, original_filename = row

        if stored_filename is None and original_filename is None:
            raise HTTPException(status_code=404, detail="Documento non trovato")
        if not stored_filename:
            raise HTTPException(status_code=404, detail="File originale non disponibile")

        path = rag_engine.originals_dir / stored_filename
        if not path.exists():
            raise HTTPException(status_code=404, detail="File mancante su disco")

        return FileResponse(
            str(path),
            media_type="application/pdf",
            filename=original_filename or stored_filename,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/fix-orphans")
async def admin_fix_rag_orphans():
    """Forza la creazione del gruppo 'Orfani' e sposta i documenti senza gruppo.
    Ritorna quanti documenti sono stati spostati e l'id del gruppo risultante."""
    try:
        moved = rag_engine.reassign_orphan_documents()
        # Recupera id del gruppo Orfani (esiste sicuramente dopo la chiamata)
        orphan_group_id = None
        for g in rag_engine.get_groups():
            if g["name"] == "Orfani":
                orphan_group_id = g["id"]
                break
        return {"success": True, "moved": moved, "group_id": orphan_group_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/rag/orphans/status")
async def admin_rag_orphans_status():
    """Restituisce conteggi di elementi orfani (documenti già gestiti altrove, qui chunks)."""
    try:
        chunks = rag_engine.count_orphan_chunks()
        return {"success": True, "orphan_chunks": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/documents/{document_id}/reassign-orphans")
async def admin_rag_reassign_single_orphan(document_id: int):
    """Riassegna un documento specifico al gruppo speciale 'Orfani'.

    Crea il gruppo se mancante e aggiorna anche i chunks. Ritorna l'id del gruppo.
    """
    try:
        gid = rag_engine.reassign_document_to_orphans(document_id)
        info = getattr(rag_engine, 'last_reassign_info', None) or {}
        try:
            get_system_logger().info(f"[RAG] Reassigned document id={document_id} to Orfani group_id={gid}")
        except Exception:
            pass
        return {"success": True, "group_id": gid, "duplicate_removed": bool(info.get('duplicate_removed')), "already_in_orphans": bool(info.get('already_in_orphans'))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/admin/rag/orphans/cleanup-chunks")
async def admin_rag_cleanup_orphan_chunks():
    """Elimina tutti i chunks orfani."""
    try:
        removed = rag_engine.delete_orphan_chunks()
        try:
            get_system_logger().info(f"[RAG] Cleanup orphan chunks removed={removed}")
        except Exception:
            pass
        return {"success": True, "removed": removed}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/rag/orphans/cleanup-documents")
async def admin_rag_cleanup_orphan_documents():
    """Elimina tutti i documenti orfani (senza gruppo o con gruppo mancante).

    Criteri:
    - rag_documents.group_id IS NULL o = 0
    - rag_documents.group_id riferito a un gruppo inesistente in rag_groups
    """
    try:
        # Elenco documenti orfani usando il backend attivo (Postgres o SQLite)
        if USING_POSTGRES:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                # Documenti con group_id NULL o 0
                db_manager.exec(cur, "SELECT id, stored_filename FROM rag_documents WHERE group_id IS NULL OR group_id = 0", ())
                null_rows = cur.fetchall()
                # Documenti con group_id che punta a gruppo inesistente
                db_manager.exec(
                    cur,
                    "SELECT d.id, d.stored_filename FROM rag_documents d LEFT JOIN rag_groups g ON d.group_id = g.id WHERE d.group_id IS NOT NULL AND d.group_id <> 0 AND g.id IS NULL",
                    (),
                )
                dangling_rows = cur.fetchall()
        else:
            import sqlite3
            conn = sqlite3.connect(str(rag_engine.db_path))
            try:
                cur = conn.cursor()
                # Documenti con group_id NULL o 0
                cur.execute("SELECT id, stored_filename FROM rag_documents WHERE group_id IS NULL OR group_id = 0")
                null_rows = cur.fetchall()
                # Documenti con group_id pendente verso gruppo inesistente
                cur.execute(
                    """
                    SELECT d.id, d.stored_filename
                    FROM rag_documents d
                    LEFT JOIN rag_groups g ON d.group_id = g.id
                    WHERE d.group_id IS NOT NULL AND d.group_id != 0 AND g.id IS NULL
                    """
                )
                dangling_rows = cur.fetchall()
            finally:
                conn.close()

        # Mappa {id: stored_filename}
        to_delete_map: dict[int, str | None] = {}
        for did, sf in null_rows + dangling_rows:
            to_delete_map[int(did)] = sf

        to_delete = list(to_delete_map.keys())
        try:
            get_system_logger().info(f"[RAG] Cleanup orphan documents start requested={len(to_delete)}")
        except Exception:
            pass

        deleted = 0
        removed_files = 0
        for did in to_delete:
            try:
                sf = to_delete_map.get(did)
                ok = rag_engine.force_delete_document(did)
                if ok:
                    deleted += 1
                    # Prova a rimuovere anche il file originale se presente
                    if sf:
                        try:
                            fpath = rag_engine.originals_dir / sf
                            if fpath.exists():
                                fpath.unlink()
                                removed_files += 1
                        except Exception:
                            pass
                try:
                    get_system_logger().info(
                        f"[RAG] Cleanup orphan document id={did} deleted={bool(ok)} stored='{sf}' removed_file={'true' if sf else 'false'}"
                    )
                except Exception:
                    pass
            except Exception:
                # Continua con i successivi anche se uno fallisce
                pass

        try:
            get_system_logger().info(
                f"[RAG] Cleanup orphan documents done requested={len(to_delete)} deleted={deleted} removed_files={removed_files}"
            )
        except Exception:
            pass
        return {"success": True, "deleted": deleted, "requested": len(to_delete), "removed_files": removed_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/rag/documents/{document_id}")
async def admin_delete_rag_document(document_id: int):
    """Delete RAG document for admin panel"""
    try:
        result = rag_engine.delete_document(document_id)
        if not result.get("deleted"):
            raise HTTPException(status_code=404, detail="Documento non trovato o non eliminato")
        return {"success": True, "message": "Documento eliminato con successo", "group_id": result.get("group_id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ====== Advanced RAG document actions ======
class RAGDocumentRename(BaseModel):
    filename: str

@router.post("/admin/rag/documents/{document_id}/rename")
async def admin_rag_rename_document(document_id: int, payload: RAGDocumentRename):
    try:
        rag_engine.rename_document(document_id, payload.filename)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class RAGDocumentMove(BaseModel):
    group_id: int

@router.post("/admin/rag/documents/{document_id}/move")
async def admin_rag_move_document(document_id: int, payload: RAGDocumentMove):
    try:
        rag_engine.move_document(document_id, payload.group_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class RAGDocumentDuplicate(BaseModel):
    target_group_id: int

@router.post("/admin/rag/documents/{document_id}/duplicate")
async def admin_rag_duplicate_document(document_id: int, payload: RAGDocumentDuplicate):
    try:
        new_id = rag_engine.duplicate_document(document_id, payload.target_group_id)
        return {"success": True, "new_document_id": new_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class RAGDocumentReprocess(BaseModel):
    chunk_size: int | None = None
    chunk_overlap: int | None = None

@router.post("/admin/rag/documents/{document_id}/reprocess")
async def admin_rag_reprocess_document(document_id: int, payload: RAGDocumentReprocess):
    try:
        new_count = rag_engine.reprocess_document(document_id, chunk_size=payload.chunk_size, chunk_overlap=payload.chunk_overlap)
        return {"success": True, "chunk_count": new_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/admin/rag/documents/{document_id}/export")
async def admin_rag_export_document(document_id: int):
    try:
        data = rag_engine.export_document(document_id)
        return {"success": True, **data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class RAGDocumentArchive(BaseModel):
    archived: bool

@router.post("/admin/rag/documents/{document_id}/archive")
async def admin_rag_archive_document(document_id: int, payload: RAGDocumentArchive):
    try:
        rag_engine.set_document_archived(document_id, payload.archived)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/admin/rag/documents/{document_id}/metadata")
async def admin_rag_document_metadata(document_id: int):
    try:
        doc = rag_engine.get_document(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Documento non trovato")
        return {"success": True, "document": doc}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/admin/rag/documents/{document_id}/force")
async def admin_rag_force_delete_document(document_id: int):
    """Eliminazione forzata di un documento RAG, con rimozione del file originale se presente."""
    try:
        # Prova a leggere stored_filename prima della cancellazione
        stored_filename = None
        try:
            import sqlite3
            conn = sqlite3.connect(str(rag_engine.db_path))
            cur = conn.cursor()
            cur.execute("SELECT stored_filename FROM rag_documents WHERE id = ?", (document_id,))
            row = cur.fetchone()
            conn.close()
            if row:
                stored_filename = row[0]
        except Exception:
            pass

        deleted = rag_engine.force_delete_document(document_id)
        # Rimuovi file originale se presente
        removed_file = False
        if deleted and stored_filename:
            try:
                fpath = (rag_engine.originals_dir / stored_filename)
                if fpath.exists():
                    fpath.unlink()
                    removed_file = True
            except Exception:
                pass
        try:
            get_system_logger().info(f"[RAG] Force delete document id={document_id} deleted={bool(deleted)} stored='{stored_filename}' removed_file={removed_file}")
        except Exception:
            pass
        return {"success": True, "deleted": bool(deleted), "removed_file": removed_file}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==== ADMIN USER MANAGEMENT ENDPOINTS ====
import bcrypt
import secrets
import string

class UserResetPasswordRequest(BaseModel):
    user_id: int

@router.get("/admin/legacy-users")
async def admin_get_users():
    """Get all users for admin panel (without sensitive data)"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            # Unified query compatible with SQLite and Postgres
            db_manager.exec(cursor, """
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
            return {"success": True, "users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/legacy-users/{user_id}")
async def admin_delete_user(user_id: int):
    """Delete user account for admin panel"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()

            # First check if user exists
            db_manager.exec(cursor, "SELECT email FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()

            if not user:
                raise HTTPException(status_code=404, detail="Utente non trovato")

            # Delete user conversations first (compatibility with SQLite when FKs off)
            db_manager.exec(cursor, "DELETE FROM conversations WHERE user_id = ?", (user_id,))
            # Optionally delete devices as well for robustness
            try:
                db_manager.exec(cursor, "DELETE FROM user_devices WHERE user_id = ?", (user_id,))
            except Exception:
                pass

            # Delete user (Postgres will cascade to children; above deletes help SQLite)
            db_manager.exec(cursor, "DELETE FROM users WHERE id = ?", (user_id,))

            conn.commit()
            return {"success": True, "message": f"Utente {user[0]} eliminato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/legacy-users/{user_id}/reset-password")
async def admin_reset_user_password(user_id: int):
    """Reset user password and return new temporary password.
    Also clears failed attempts and lock, and updates user_key_hash.
    """
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, "SELECT email FROM users WHERE id = ?", (user_id,))
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

            # Update user (parameterize boolean for cross-DB compatibility)
            db_manager.exec(
                cursor,
                """
                UPDATE users 
                SET password_hash = ?, user_key_hash = ?, failed_login_attempts = 0, locked_until = NULL, must_change_password = ?
                WHERE id = ?
                """,
                (new_hash, new_user_key_hash, True, user_id)
            )
            conn.commit()

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

@router.put("/admin/legacy-users/{user_id}/role")
async def admin_change_user_role(user_id: int, request: UserRoleRequest):
    """Change user role (admin/user)"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()

            # Check if user exists
            db_manager.exec(cursor, "SELECT email FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="Utente non trovato")

            # Update user role (parameterized boolean)
            db_manager.exec(
                cursor,
                "UPDATE users SET is_admin = ? WHERE id = ?",
                (bool(request.is_admin), user_id)
            )
            conn.commit()

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

# ---- Data Tables Agent settings (provider/model indipendenti) ----
class DataTablesSettingsIn(BaseModel):
    enabled: bool = True
    provider: str = 'openrouter'
    model: str | None = None
    temperature: float | None = 0.2
    limit_per_table: int | None = 8
    system_prompt: str | None = None

@router.get('/admin/data-tables/settings')
async def get_data_tables_settings():
    try:
        cfg = load_config()
        defaults = {"enabled": True, "provider": "openrouter", "model": None, "temperature": 0.2, "limit_per_table": 8, "system_prompt": None}
        settings = cfg.get('data_tables_settings') or {}
        return {"success": True, "settings": {**defaults, **settings}}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post('/admin/data-tables/settings')
async def set_data_tables_settings(payload: DataTablesSettingsIn):
    try:
        cfg = load_config()
        ai = cfg.get('ai_providers', {}) or {}
        prov = (payload.provider or 'openrouter').lower()
        if prov not in ai:
            return {"success": False, "error": f"provider_unknown:{prov}"}
        cfg['data_tables_settings'] = {
            'enabled': bool(payload.enabled),
            'provider': prov,
            'model': (payload.model or '').strip() or None,
            'temperature': float(payload.temperature or 0.2),
            'limit_per_table': int(payload.limit_per_table or 8),
            'system_prompt': (payload.system_prompt or '').strip() or None
        }
        save_config(cfg)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

class DataTablesAgentTestIn(BaseModel):
    q: str
    table_ids: list[str] | None = None

@router.post('/admin/data-tables/agent-test')
async def data_tables_agent_test(req: DataTablesAgentTestIn):
    try:
        from .data_tables import list_tables as _list
        from .data_tables_agent import run_agent
        if req.table_ids:
            tids = req.table_ids
        else:
            tids = [t.get('id') for t in _list() if t.get('id')]
        # Pass schemas via tids; lasciamo results vuoto (NL2SQL decide le condizioni)
        answer = await run_agent(req.q, [], tids)
        return {"success": True, "answer": answer, "table_ids": tids}
    except Exception as e:
        return {"success": False, "error": str(e)}
