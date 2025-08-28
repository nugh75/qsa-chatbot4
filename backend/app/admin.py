from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import json
import os
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

# Configurazione database - usa il percorso relativo alla directory backend
BASE_DIR = Path(__file__).parent.parent
DATABASE_PATH = BASE_DIR / "storage" / "databases" / "qsa_chatbot.db"

router = APIRouter(dependencies=[Depends(get_current_admin_user)])

class AdminConfig(BaseModel):
    ai_providers: Dict[str, Any]
    tts_providers: Dict[str, Any]
    default_provider: str
    default_tts: str

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
    "summary_settings": {
        "provider": "anthropic",  # Provider dedicato per i summary (NON local)
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
    provider = summary_settings.get("provider", "anthropic")
    enabled = summary_settings.get("enabled", True)
    
    # Fallback se il provider è local (non dovrebbe mai succedere)
    if provider == "local":
        provider = "anthropic"
    
    return provider if enabled else "anthropic"  # Fallback sicuro

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
        return {"prompt": load_summary_prompt()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento summary prompt: {str(e)}")

@router.post("/admin/summary-prompt")
async def update_summary_prompt(payload: SystemPromptIn):
    """Aggiorna il prompt di riassunto conversazioni."""
    try:
        save_summary_prompt(payload.prompt)
        return {"success": True, "message": "Summary prompt salvato"}
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

# ---- Summary settings endpoints ----
class SummarySettingsIn(BaseModel):
    provider: str
    enabled: bool

@router.get("/admin/summary-settings")
async def get_summary_settings():
    """Ottiene le impostazioni correnti per la generazione dei summary"""
    try:
        config = load_config()
        summary_settings = config.get("summary_settings", {"provider": "anthropic", "enabled": True})
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
        
        # Verifica che il file esista nella directory data
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        file_path = data_dir / file_mapping.filename
        if not file_path.exists():
            raise HTTPException(status_code=400, detail=f"File {file_mapping.filename} non trovato nella directory data")
        
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
        
        # Verifica che il file esista nella directory data
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        file_path = data_dir / update.new_filename
        if not file_path.exists():
            raise HTTPException(status_code=400, detail=f"File {update.new_filename} non trovato nella directory data")
        
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
    """Ottieni la lista dei file disponibili nella directory data"""
    try:
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
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
    return Path(__file__).resolve().parent.parent.parent / "data"

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

class RAGGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None

class RAGGroupUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

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
            SELECT id, email, created_at, last_login 
            FROM users 
            ORDER BY created_at DESC
        """)
        
        users = []
        for row in cursor.fetchall():
            users.append({
                "id": row[0],
                "email": row[1],
                "created_at": row[2],
                "last_login": row[3]
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
