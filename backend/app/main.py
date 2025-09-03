from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from typing import Dict, Any
from datetime import datetime
import json
import os
from dotenv import load_dotenv
from pathlib import Path
from .chat import router as chat_router
from .tts import router as tts_router
from .transcribe import router as asr_router
from .admin import router as admin_router
from .admin import ensure_default_ai_provider
from .auth_routes import router as auth_router
from .conversation_routes import router as conversation_router
from .search_routes import router as search_router
from .admin_panel import router as admin_panel_router
from .file_processing import router as file_processing_router
from .rag_routes import router as rag_router
from .survey_routes import router as survey_router
from .welcome_guides import router as welcome_guides_router
from .personalities import load_personalities
from .welcome_guides import list_welcome_messages
from .prompts import load_system_prompts, load_summary_prompt
from .logging_utils import get_system_logger, log_system

# Carica le variabili di ambiente dal file .env (path esplicito) e log mascherato
_env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=_env_path, override=True)
def _mask(v: str|None):
    if not v:
        return 'MISSING'
    if len(v) <= 8:
        return '****'
    return v[:4] + '...' + v[-4:]
print('[env] Loaded .env at', _env_path.exists(), 'OPENAI_API_KEY=', _mask(os.getenv('OPENAI_API_KEY')),
      'ELEVENLABS_API_KEY=', _mask(os.getenv('ELEVENLABS_API_KEY')),
      'GOOGLE_API_KEY=', _mask(os.getenv('GOOGLE_API_KEY')),
      'OPENROUTER_API_KEY=', _mask(os.getenv('OPENROUTER_API_KEY')))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup
    import os as _os
    # Seed default provider/model if needed
    try:
        ensure_default_ai_provider(seed=True)
    except Exception as _e:
        print(f"[startup] default provider seed skipped: {_e}")
    if _os.environ.get("WHISPER_WARMUP", "1").lower() in ("1","true","yes","on"):
        try:
            from .transcribe import whisper_service
            # Non bloccare eccessivamente: warm in thread
            import threading
            threading.Thread(target=lambda: whisper_service.load_model("small"), daemon=True).start()
            log_system(20, "Whisper warm-up (small) scheduled")
        except Exception as e:
            log_system(30, f"Whisper warm-up skipped: {e}")
    yield
    # On shutdown (nothing special yet)

# Espone OpenAPI e docs sotto /api/* così il frontend può cercare /api/openapi.json
app = FastAPI(
    title="QSA Chatbot – Backend",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from storage (e.g., avatars)
import os as _os
_storage_dir = _os.path.join(_os.path.dirname(__file__), '..', 'storage')
try:
    app.mount("/static", StaticFiles(directory=_storage_dir), name="static")
except Exception as e:
    print(f"Static mount error: {e}")

# ---- Runtime storage diagnostics (avatars & personalities) ----
def _diagnose_storage():  # lightweight, runs once at import
    from pathlib import Path as _P
    import stat as _stat
    targets = [
        _P('/app/storage'),
        _P('/app/storage/avatars'),
        _P('/app/storage/personalities'),
    ]
    uid = os.getuid() if hasattr(os, 'getuid') else 'n/a'
    gid = os.getgid() if hasattr(os, 'getgid') else 'n/a'
    for d in targets:
        try:
            exists = d.exists()
            if not exists:
                d.mkdir(parents=True, exist_ok=True)
            mode = oct(d.stat().st_mode & 0o777) if d.exists() else 'missing'
            writable = os.access(d, os.W_OK)
            test_file = d / '.perm_test'
            test_write_ok = False
            err_msg = None
            try:
                with open(test_file, 'w') as _f:
                    _f.write('ok')
                test_write_ok = True
            except Exception as _e:  # pragma: no cover
                err_msg = str(_e)
            finally:
                try:
                    if test_file.exists():
                        test_file.unlink()
                except Exception:
                    pass
            print(f"[storage-diag] path={d} exists={exists} mode={mode} os.access_w={writable} test_write={test_write_ok} uid={uid} gid={gid} err={err_msg}")
        except Exception as e:  # pragma: no cover
            print(f"[storage-diag] error inspecting {d}: {e}")

try:
    _diagnose_storage()
except Exception:
    pass

# Init logging
try:
    _logger = get_system_logger()
    log_system(20, "System logging initialized. Storage at 'storage/logs'.")
except Exception as _e:
    print(f"Logging init error: {_e}")

# Eager bootstrap prompts (seed -> runtime) all'avvio
try:
    _ = load_system_prompts()
    _ = load_summary_prompt()
except Exception as e:
    print(f"Prompt bootstrap error: {e}")

# Modello per il feedback
class FeedbackData(BaseModel):
    messageIndex: int
    feedback: str  # 'like' o 'dislike'
    timestamp: int
    provider: str
    personality_id: Optional[str] = None
    personality_name: Optional[str] = None
    model: Optional[str] = None

app.include_router(chat_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
app.include_router(asr_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(conversation_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(admin_panel_router, prefix="/api")
app.include_router(file_processing_router, prefix="/api")
app.include_router(rag_router, prefix="/api")
app.include_router(survey_router, prefix="/api")
app.include_router(welcome_guides_router, prefix="/api")

@app.get("/api/config/public")
async def get_public_config():
    """Get public configuration for enabled providers (public-safe)."""
    try:
        config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'admin_config.json')
        if not os.path.exists(config_path):
            # Minimal defaults
            return {"success": True, "data": {
                "enabled_providers": ['local'],
                "enabled_tts_providers": ['edge'],
                "enabled_asr_providers": ['openai'],
                "default_provider": 'local',
                "default_tts": 'edge',
                "default_asr": 'openai',
                "ui_settings": {"arena_public": False}
            }}
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        enabled_providers = [p for p, s in config.get('ai_providers', {}).items() if s.get('enabled')]
        enabled_tts_providers = [p for p, s in config.get('tts_providers', {}).items() if s.get('enabled')]
        enabled_asr_providers = [p for p, s in config.get('asr_providers', {}).items() if s.get('enabled')]
        ui_cfg = config.get('ui_settings', {}) or {}
        # Normalize visibility flags defaults True
        for k in ["show_research_project","show_repository_url","show_website_url","show_info_pdf_url","show_contact_email","show_footer_block"]:
            if k not in ui_cfg:
                ui_cfg[k] = True
        payload = {
            "enabled_providers": enabled_providers,
            "enabled_tts_providers": enabled_tts_providers,
            "enabled_asr_providers": enabled_asr_providers,
            "default_provider": config.get('default_provider', 'local'),
            "default_tts": config.get('default_tts', 'edge'),
            "default_asr": config.get('default_asr', 'openai'),
            "ui_settings": {
                "arena_public": ui_cfg.get('arena_public', False),
                "contact_email": ui_cfg.get('contact_email'),
                "research_project": ui_cfg.get('research_project'),
                "repository_url": ui_cfg.get('repository_url'),
                "website_url": ui_cfg.get('website_url'),
                "info_pdf_url": ui_cfg.get('info_pdf_url'),
                "footer_title": ui_cfg.get('footer_title'),
                "footer_text": ui_cfg.get('footer_text'),
                "show_research_project": ui_cfg.get('show_research_project', True),
                "show_repository_url": ui_cfg.get('show_repository_url', True),
                "show_website_url": ui_cfg.get('show_website_url', True),
                "show_info_pdf_url": ui_cfg.get('show_info_pdf_url', True),
                "show_contact_email": ui_cfg.get('show_contact_email', True),
                "show_footer_block": ui_cfg.get('show_footer_block', True)
            }
        }
        return {"success": True, "data": payload}
    except Exception as e:
        print(f"Error loading public config: {e}")
        return {"success": False, "error": str(e), "data": {"enabled_providers": [], "ui_settings": {"arena_public": False}}}

@app.post("/api/feedback")
async def save_feedback(feedback_data: FeedbackData):
    """Salva il feedback dell'utente su messaggi o conversazioni"""
    try:
        # Crea la directory feedback se non esiste
        feedback_dir = os.path.join(os.path.dirname(__file__), "..", "feedback")
        os.makedirs(feedback_dir, exist_ok=True)
        
        # Nome file basato sulla data
        date_str = datetime.now().strftime("%Y-%m-%d")
        feedback_file = os.path.join(feedback_dir, f"feedback_{date_str}.jsonl")
        
        # Prepara i dati del feedback
        feedback_entry = {
            "messageIndex": feedback_data.messageIndex,
            "feedback": feedback_data.feedback,
            "timestamp": feedback_data.timestamp,
            "provider": feedback_data.provider,
            "personality_id": feedback_data.personality_id,
            "personality_name": feedback_data.personality_name,
            "model": feedback_data.model,
            "datetime": datetime.now().isoformat(),
            "type": "global" if feedback_data.messageIndex == -1 else "message"
        }
        
        # Salva in formato JSONL (una riga per feedback)
        with open(feedback_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(feedback_entry, ensure_ascii=False) + "\n")
        
        return {
            "success": True, 
            "message": "Feedback salvato con successo",
            "saved_at": feedback_entry["datetime"]
        }
        
    except Exception as e:
        return {
            "success": False, 
            "message": f"Errore nel salvataggio: {str(e)}"
        }

@app.get("/api/personalities")
async def get_public_personalities():
    try:
        data = load_personalities()
        # Map welcome message id -> content
        try:
            _welcome = {m.get('id'): m.get('content') for m in list_welcome_messages() if isinstance(m, dict)}
            from .welcome_guides import list_guides
            _guides = {g.get('id'): g.get('content') for g in list_guides() if isinstance(g, dict)}
        except Exception:
            _welcome = {}
            _guides = {}
        # Expose only necessary fields
        return {
            "default_id": data.get("default_id"),
            "personalities": [
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "provider": p.get("provider"),
                    "model": p.get("model"),
                    "system_prompt_id": p.get("system_prompt_id"),
                    "avatar_url": (f"/static/avatars/{p.get('avatar')}" if p.get('avatar') else None),
                    "tts_provider": p.get("tts_provider"),
                    # Provide both id and content for welcome + guide
                    "welcome_message_id": p.get("welcome_message"),
                    "welcome_message_content": _welcome.get(p.get("welcome_message")) if p.get("welcome_message") else None,
                    # Legacy alias so existing frontend keeps working until updated
                    "welcome_message": _welcome.get(p.get("welcome_message")) if p.get("welcome_message") else None,
                    "guide_id": p.get("guide_id"),
                    "guide_content": _guides.get(p.get("guide_id")) if p.get("guide_id") else None,
                    "context_window": p.get("context_window"),
                    "temperature": p.get("temperature"),
                }
                for p in data.get("personalities", []) if p.get('active', True)
            ]
        }
    except Exception as e:
        print(f"Error loading personalities: {e}")
        return {"default_id": None, "personalities": []}

@app.get("/api/feedback/stats")
async def get_feedback_stats():
    """Ottieni statistiche sui feedback"""
    try:
        feedback_dir = os.path.join(os.path.dirname(__file__), "..", "feedback")
        
        if not os.path.exists(feedback_dir):
            return {"total": 0, "likes": 0, "dislikes": 0, "by_provider": {}}
        
        stats = {"total": 0, "likes": 0, "dislikes": 0, "by_provider": {}, "by_model": {}, "by_personality": {}}
        
        # Leggi tutti i file di feedback
        for filename in os.listdir(feedback_dir):
            if filename.endswith(".jsonl"):
                file_path = os.path.join(feedback_dir, filename)
                with open(file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            entry = json.loads(line)
                            stats["total"] += 1
                            
                            if entry["feedback"] == "like":
                                stats["likes"] += 1
                            else:
                                stats["dislikes"] += 1
                            
                            provider = entry.get("provider", "unknown")
                            model = entry.get("model") or "unknown"
                            pers_id = entry.get("personality_id") or "unknown"
                            pers_name = entry.get("personality_name") or "Sconosciuta"

                            # by_provider
                            if provider not in stats["by_provider"]:
                                stats["by_provider"][provider] = {"likes": 0, "dislikes": 0}
                            stats["by_provider"][provider][entry["feedback"] + "s"] += 1

                            # by_model
                            if model not in stats["by_model"]:
                                stats["by_model"][model] = {"provider": provider, "likes": 0, "dislikes": 0}
                            stats["by_model"][model][entry["feedback"] + "s"] += 1

                            # by_personality
                            if pers_id not in stats["by_personality"]:
                                stats["by_personality"][pers_id] = {
                                    "name": pers_name,
                                    "provider": provider,
                                    "model": model,
                                    "likes": 0,
                                    "dislikes": 0
                                }
                            stats["by_personality"][pers_id][entry["feedback"] + "s"] += 1
        
        return stats
        
    except Exception as e:
        return {"error": f"Errore nel recupero statistiche: {str(e)}"}

@app.post("/api/chat/end-session")
async def end_session():
    # in questa versione non manteniamo stato server-side
    return {"ok": True}
