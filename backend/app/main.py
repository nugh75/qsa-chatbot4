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
from .forms_routes import router as forms_router, admin_router as forms_admin_router
from .survey_routes import router as survey_router
from .welcome_guides import router as welcome_guides_router
from .data_tables_routes import router as data_tables_router
from .personalities import load_personalities
from .welcome_guides import list_welcome_messages
from .prompts import load_system_prompts, load_summary_prompt
from .logging_utils import get_system_logger, log_system
from .health_routes import router as health_router
from .database import db_manager as _dbm
from .queries_routes import router as queries_router

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
    # Attach shared db_manager and run a health ping early
    try:
        app.state.db_manager = _dbm
        _ping = _dbm.ping()
        if not _ping.get('ok'):
            print(f"[startup][DB] Health ping FAILED backend={_ping.get('backend')} error={_ping.get('error')}")
        else:
            print(f"[startup][DB] Health ping OK backend={_ping.get('backend')}")
    except Exception as _e:
        print(f"[startup][DB] Initialization error: {_e}")
    # Seed default provider/model if needed
    try:
        ensure_default_ai_provider(seed=True)
    except Exception as _e:
        print(f"[startup] default provider seed skipped: {_e}")
    # Seed default admin user (idempotente)
    try:
        from .seed_admin import seed_admin as _seed_admin
        email = os.getenv('DEFAULT_ADMIN_EMAIL', 'ai4educ@gmail.com')
        password = os.getenv('DEFAULT_ADMIN_PASSWORD', 'admin123!')
        overwrite_flag = os.getenv('DEFAULT_ADMIN_OVERWRITE', '0').lower() in ('1','true','yes','on')
        _seed_admin(email, password, overwrite_password=overwrite_flag)
        log_system(20, f"Default admin ensured for {email} overwrite={overwrite_flag}")
    except Exception as _e:
        print(f"[startup] default admin seed skipped: {_e}")
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
    # 1) Ensure runtime prompt files exist (copy from seed if first run)
    _ = load_system_prompts()
    _ = load_summary_prompt()
    # 2) Ensure Counselorbot system prompt exists even on existing installs
    try:
        from .prompts import upsert_system_prompt
        counselorbot_text = (
            "# Prompt di sistema\n\n"
            "# Personalità\n\n"
            "Sei un compagno di apprendimento amichevole e disponibile, di nome Counselorbot. Sei entusiasta di aiutare gli utenti a migliorare le proprie strategie di apprendimento. Sei paziente, incoraggiante e fornisci feedback costruttivi.\n\n"
            "# Ambiente\n\n"
            "Stai interagendo con un utente che ha appena completato il \"Questionario Strategie di Apprendimento\" (QSA) sul sito competenzestrategiche.it. Il QSA è un questionario di self-assessment, ovvero di autovalutazione, che aiuta l’utente a riflettere sulle proprie abitudini e strategie nello studio. L'utente cerca feedback e approfondimenti sui propri risultati. Hai accesso a informazioni generali sulle strategie di apprendimento, ma non puoi accedere direttamente ai risultati specifici dell'utente. Presumi che l’utente sia un adulto interessato al miglioramento personale.\n\n"
            "# Tono\n\n"
            "Le tue risposte sono positive, incoraggianti e di supporto. Usi un linguaggio chiaro e semplice, evitando il gergo tecnico. Sei conversazionale e coinvolgente, usando frasi come “Che interessante!” o “Parlami di più di...”. Sei paziente e comprensivo, e lasci spazio all’utente per esprimere pensieri ed emozioni.\n\n"
            "# Obiettivo\n\n"
            "Il tuo obiettivo principale è aiutare l’utente a comprendere i risultati del QSA e a identificare aree di miglioramento nelle sue strategie di apprendimento. Segui questi passaggi:\n\n"
            "1. **Comprensione iniziale:** Chiedi all’utente la sua impressione generale sull’esperienza del QSA e i suoi pensieri iniziali sui risultati. Cosa lo ha sorpreso? Cosa si aspettava?\n"
            "2. **Aree specifiche:** Invita l’utente a condividere aree o domande specifiche del QSA che ha trovato stimolanti o difficili.\n"
            "3. **Richiesta dei risultati:** Chiedi i risultati del QSA iniziando dai fattori **cognitivi (C1–C7)** e, una volta ricevuti, procedi con i fattori **affettivo-motivazionali (A1–A7)**.\n"
            "4. **Analisi dei fattori cognitivi:** Commenta uno per uno i fattori cognitivi, spiegando il significato e offrendo spunti di riflessione personalizzati. Alla fine, chiedi all’utente se si ritrova in questa descrizione.\n"
            "5. **Analisi dei fattori affettivo-motivazionali:** Procedi con i fattori affettivo-motivazionali, anche in questo caso analizzandoli uno per uno e commentando. Alla fine, chiedi all’utente un riscontro.\n"
            "6. **Analisi di secondo livello:** Collega tra loro i fattori in base ai seguenti raggruppamenti tematici e commenta ogni gruppo con una riflessione trasversale, poi chiedi se l’utente si riconosce nelle sintesi proposte:\n\n"
            "   - **Gestione cognitiva**: C1, C5, C7\n"
            "   - **Autoregolazione e pianificazione**: C2, A2, A3\n"
            "   - **Ostacoli affettivo-emotivi**: A1, A4, A5, A7\n"
            "   - **Disorientamento e concentrazione**: C3, C6\n"
            "   - **Auto-percezione**: A6\n"
            "   - **Collaborazione**: C4\n\n"
            "7. **Suggerimenti personalizzati:** In base a ciò che l’utente condivide, offri suggerimenti personalizzati per migliorare le strategie di apprendimento in aree specifiche.\n"
            "8. **Condivisione di risorse:** Suggerisci risorse aggiuntive, come articoli, libri o siti web, che l’utente può esplorare per approfondire le strategie di apprendimento efficaci.\n"
            "9. **Incoraggiamento:** Offri incoraggiamento e supporto, sottolineando che l’apprendimento è un processo continuo e che anche piccoli miglioramenti possono fare una grande differenza.\n\n"
            "# Regole\n\n"
            "Parla sempre in italiano.\n"
            "Evita di dare consigli specifici o interpretazioni dei risultati individuali del QSA, poiché non ne hai accesso. Non fornire consigli medici o psicologici. Non chiedere informazioni personali identificabili (PII). Mantieni il focus su strategie di apprendimento generali e su risorse utili. Se l’utente esprime frustrazione o confusione, offri rassicurazione e suggerisci di suddividere il compito in passaggi più piccoli.\n\n"
            "# tabella valori\n"
            "| Fattore | Descrizione | (1-3) | Medio (4-6) | (7-9) |\n"
            "|---------|-------------|-------------|-------------|------------|\n"
            "| C1 | Strategie elaborative | Debolezza | Adeguato | Forza |\n"
            "| C2 | Autoregolazione | Debolezza | Adeguato | Forza |\n"
            "| C3 | Disorientamento | Forza | Normale | Debolezza |\n"
            "| C4 | Disponibilità alla collaborazione | Debolezza | Adeguato | Forza |\n"
            "| C5 | Organizzatori semantici | Debolezza | Adeguato | Forza |\n"
            "| C6 | Difficoltà di concentrazione | Forza | Normale | Debolezza |\n"
            "| C7 | Autointerrogazione | Debolezza | Adeguato | Forza |\n"
            "| A1 | Ansietà di base | Forza | Moderata/positiva | Debolezza |\n"
            "| A2 | Volizione | Debolezza | Adeguato | Forza |\n"
            "| A3 | Attribuzione a cause controllabili | Debolezza | Equilibrata | Forza |\n"
            "| A4 | Attribuzione a cause incontrollabili | Forza | Normale | Debolezza |\n"
            "| A5 | Mancanza di perseveranza | Forza | Normale | Debolezza |\n"
            "| A6 | Percezione di competenza | Debolezza | Adeguata | Forza |\n"
            "| A7 | Interferenze emotive | Forza | Normale | Debolezza |\n\n"
            "###markdown\n"
            "- utilizza il markdown. Usa la formattazione standard. Quando usi punti elenco dopo manda sempre a capo e ripristina il la tabulazione giusta. Crea sempre un po' di spazio."
        )
        # Idempotent upsert; do not force as active (personalities will reference it)
        upsert_system_prompt(name="Counselorbot (QSA)", text=counselorbot_text, prompt_id="counselorbot", set_active=False)
    except Exception as _e:
        print(f"Counselorbot prompt ensure skipped: {_e}")
except Exception as e:
    print(f"Prompt bootstrap error: {e}")

# Seed default Counselorbot personality in Postgres (idempotent)
try:
    from .database import USING_POSTGRES, db_manager
    if USING_POSTGRES:
        # compute provider/model from admin config
        try:
            from .admin import load_config
            cfg = load_config()
            provider = (cfg.get('default_provider') or 'openrouter').lower()
            model = cfg.get('ai_providers', {}).get(provider, {}).get('selected_model') or 'gpt-oss-20b:free'
        except Exception:
            provider = 'openrouter'
            model = 'gpt-oss-20b:free'
        # Do not force default: personality selection drives prompt; just ensure it exists
        set_default_flag = False
        # Upsert counselorbot personality
        from .personalities import upsert_personality
        upsert_personality(
            name="Counselorbot",
            system_prompt_id="counselorbot",
            provider=provider,
            model=model,
            welcome_message=None,
            guide_id=None,
            context_window=None,
            temperature=0.3,
            personality_id="counselorbot",
            set_default=set_default_flag,
            avatar=None,
            tts_provider=None,
            tts_voice=None,
            active=True,
            enabled_pipeline_topics=None,
            enabled_rag_groups=None,
            enabled_mcp_servers=None,
            enabled_data_tables=None,
            max_tokens=None
        )
        print("[seed] Counselorbot personality ensured (no default change)")
except Exception as e:
    print(f"Counselorbot personality seed skipped: {e}")

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
app.include_router(data_tables_router, prefix="/api")
app.include_router(forms_router, prefix="/api")
app.include_router(forms_admin_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(queries_router, prefix="/api")

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
        # TTS abilitati esplicitamente
        enabled_tts_providers = [p for p, s in config.get('tts_providers', {}).items() if s.get('enabled')]
        # Auto-abilitazione se presente API key ambiente anche se non ancora marcato enabled nel file
        tts_env_map = {
            'elevenlabs': 'ELEVENLABS_API_KEY',
            'openai': 'OPENAI_API_KEY'
        }
        for prov, env_var in tts_env_map.items():
            if prov not in enabled_tts_providers and os.getenv(env_var):
                enabled_tts_providers.append(prov)
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
                    "enabled_forms": p.get("enabled_forms") or [],
                    "enabled_data_tables": p.get("enabled_data_tables") or [],
                    # UI visibility flags
                    "show_pipeline_topics": p.get("show_pipeline_topics", True),
                    "show_source_docs": p.get("show_source_docs", True),
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
