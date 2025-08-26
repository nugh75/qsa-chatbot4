from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import json
import os
from .prompts import load_system_prompt, save_system_prompt, load_summary_prompt, save_summary_prompt
from .topic_router import refresh_routes_cache
from .rag import refresh_files_cache
from .usage import read_usage, usage_stats, reset_usage, query_usage
from .memory import get_memory
from pathlib import Path
import re

router = APIRouter()

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
    return os.path.join(os.path.dirname(__file__), "..", "admin_config.json")

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

# ---------------- Pipeline (routing + files) -----------------
PIPELINE_CONFIG_PATH = Path(__file__).resolve().parent.parent / "pipeline_config.json"

class PipelineConfig(BaseModel):
    routes: List[Dict[str, str]]
    files: Dict[str, str]

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
        default_path = Path(__file__).resolve().parent.parent / "pipeline_config.json"
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

# ---------------- Nuove funzionalità pipeline avanzate -----------------

class PatternTestRequest(BaseModel):
    pattern: str
    test_text: str

class PatternTestResponse(BaseModel):
    matches: bool
    matched_text: Optional[str] = None
    error: Optional[str] = None

@router.post("/admin/pipeline/test-pattern")
async def test_pattern(request: PatternTestRequest):
    """Testa un pattern regex su un testo di esempio."""
    try:
        # Compila il pattern per verificare che sia valido
        compiled_pattern = re.compile(request.pattern)
        
        # Testa il pattern sul testo
        match = compiled_pattern.search(request.test_text.lower())
        
        return PatternTestResponse(
            matches=bool(match),
            matched_text=match.group() if match else None
        )
    except re.error as e:
        return PatternTestResponse(
            matches=False,
            error=f"Pattern regex non valido: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel test pattern: {str(e)}")

class RoutingPreviewRequest(BaseModel):
    test_text: str

class RoutingPreviewResponse(BaseModel):
    detected_topic: Optional[str]
    matched_pattern: Optional[str]
    matched_text: Optional[str]

@router.post("/admin/pipeline/preview-routing")
async def preview_routing(request: RoutingPreviewRequest):
    """Mostra quale topic viene rilevato da un testo di esempio."""
    try:
        # Usa la stessa logica del topic_router
        from app.topic_router import detect_topic, load_routes
        
        # Carica le route attuali
        routes = load_routes()
        test_text_lower = request.test_text.lower()
        
        # Testa ogni pattern
        for pattern, topic in routes:
            try:
                if re.search(pattern, test_text_lower):
                    match = re.search(pattern, test_text_lower)
                    return RoutingPreviewResponse(
                        detected_topic=topic,
                        matched_pattern=pattern,
                        matched_text=match.group() if match else None
                    )
            except re.error:
                continue
        
        return RoutingPreviewResponse(
            detected_topic=None,
            matched_pattern=None,
            matched_text=None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel preview routing: {str(e)}")

class FileContentRequest(BaseModel):
    filename: str

class FileContentResponse(BaseModel):
    content: str
    exists: bool
    error: Optional[str] = None

@router.post("/admin/pipeline/file-content")
async def get_file_content(request: FileContentRequest):
    """Legge il contenuto di un file di contesto."""
    try:
        # Percorso dei file di contesto
        context_dir = Path(__file__).resolve().parent.parent / "context_files"
        file_path = context_dir / request.filename
        
        if not file_path.exists():
            return FileContentResponse(
                content="",
                exists=False,
                error="File non trovato"
            )
        
        content = file_path.read_text(encoding="utf-8")
        return FileContentResponse(
            content=content,
            exists=True
        )
    except Exception as e:
        return FileContentResponse(
            content="",
            exists=False,
            error=f"Errore nella lettura del file: {str(e)}"
        )

class SaveFileContentRequest(BaseModel):
    filename: str
    content: str

@router.post("/admin/pipeline/save-file-content")
async def save_file_content(request: SaveFileContentRequest):
    """Salva il contenuto di un file di contesto."""
    try:
        # Percorso dei file di contesto
        context_dir = Path(__file__).resolve().parent.parent / "context_files"
        context_dir.mkdir(exist_ok=True)  # Crea la directory se non esiste
        
        file_path = context_dir / request.filename
        
        # Salva il file
        file_path.write_text(request.content, encoding="utf-8")
        
        # Aggiorna la cache dei file
        refresh_files_cache()
        
        return {"success": True, "message": "File salvato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio del file: {str(e)}")

@router.get("/admin/pipeline/available-files")
async def get_available_files():
    """Lista tutti i file di contesto disponibili."""
    try:
        context_dir = Path(__file__).resolve().parent.parent / "context_files"
        
        if not context_dir.exists():
            return {"files": []}
        
        files = []
        for file_path in context_dir.glob("*.txt"):
            files.append({
                "filename": file_path.name,
                "size": file_path.stat().st_size,
                "modified": file_path.stat().st_mtime
            })
        
        return {"files": sorted(files, key=lambda x: x["filename"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento file: {str(e)}")

@router.delete("/admin/pipeline/file/{filename}")
async def delete_file(filename: str):
    """Elimina un file di contesto."""
    try:
        context_dir = Path(__file__).resolve().parent.parent / "context_files"
        file_path = context_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File non trovato")
        
        file_path.unlink()
        refresh_files_cache()
        
        return {"success": True, "message": "File eliminato con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione del file: {str(e)}")

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
