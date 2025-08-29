from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import whisper
import torch
import os
import tempfile
import json
import asyncio
from typing import Dict, List
import requests
from pathlib import Path
import shutil
import warnings
from .logging_utils import log_interaction, log_system
import threading, time, uuid

# Supprime il warning FP16 per CPU
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU; using FP32 instead")

router = APIRouter()

# Modello per la gestione dei modelli Whisper
class WhisperModelInfo(BaseModel):
    name: str
    size: str
    accuracy: str
    speed: str
    memory: str
    disk_space: str
    downloaded: bool
    download_progress: float = 0.0

class WhisperService:
    def __init__(self):
        self.models_dir = Path(__file__).parent.parent / "models" / "whisper"
        self.models_dir.mkdir(exist_ok=True)
        self.current_model = None
        self.current_model_name = None
        self.available_models = {
            "tiny": {
                "size": "~150MB",
                "accuracy": "Lowest", 
                "speed": "10x",
                "memory": "~1GB",
                "disk_space": "~150MB"
            },
            "base": {
                "size": "~300MB",
                "accuracy": "Low",
                "speed": "7x", 
                "memory": "~1GB",
                "disk_space": "~300MB"
            },
            "small": {
                "size": "~1GB",
                "accuracy": "Medium",
                "speed": "4x",
                "memory": "~2GB", 
                "disk_space": "~1GB"
            },
            "medium": {
                "size": "~3GB",
                "accuracy": "High",
                "speed": "2x",
                "memory": "~5GB",
                "disk_space": "~3GB"
            },
            "large": {
                "size": "~6GB",
                "accuracy": "Highest",
                "speed": "1x",
                "memory": "~10GB",
                "disk_space": "~6GB"
            }
        }
        # Auto-download del modello small al primo avvio (configurabile)
        auto_dl = os.environ.get("WHISPER_AUTO_DOWNLOAD", "1")
        if auto_dl.lower() in ("1", "true", "yes", "on"):
            self.ensure_default_model()
        else:
            print("WHISPER_AUTO_DOWNLOAD disabilitato: nessun download automatico del modello 'small'.")
    
    def ensure_default_model(self):
        """Assicura che ci sia almeno il modello small disponibile"""
        if not self.is_model_downloaded("small"):
            print("Downloading Whisper small model for first time setup...")
            try:
                self.download_model("small")
            except Exception as e:
                print(f"Failed to download small model: {e}")
    
    def is_model_downloaded(self, model_name: str) -> bool:
        """Controlla se un modello è già scaricato"""
        model_path = self.models_dir / f"{model_name}.pt"
        return model_path.exists()
    
    def download_model(self, model_name: str):
        """Scarica un modello Whisper"""
        if model_name not in self.available_models:
            raise ValueError(f"Model {model_name} not available")
        
        print(f"Downloading Whisper model: {model_name}")
        
        # Whisper scarica automaticamente nella cache
        model = whisper.load_model(model_name)
        
        # Salva il modello nella nostra directory
        model_path = self.models_dir / f"{model_name}.pt"
        torch.save(model.state_dict(), model_path)
        
        print(f"Model {model_name} downloaded successfully")
        return True
    
    def load_model(self, model_name: str = "small"):
        """Carica un modello Whisper"""
        if not self.is_model_downloaded(model_name):
            self.download_model(model_name)
        
        if self.current_model_name != model_name:
            print(f"Loading Whisper model: {model_name}")
            
            # Configura device - forza CPU se non c'è GPU disponibile
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            # Carica il modello con configurazione ottimizzata per CPU
            self.current_model = whisper.load_model(
                model_name, 
                device=device,
                # Usa FP32 su CPU per evitare warning
                in_memory=True
            )
            self.current_model_name = model_name
            
            print(f"Model {model_name} loaded on {device}")
        
        return self.current_model
    
    def get_models_status(self) -> List[WhisperModelInfo]:
        """Restituisce lo stato di tutti i modelli disponibili"""
        models = []
        for name, info in self.available_models.items():
            models.append(WhisperModelInfo(
                name=name,
                size=info["size"],
                accuracy=info["accuracy"],
                speed=info["speed"],
                memory=info["memory"],
                disk_space=info["disk_space"],
                downloaded=self.is_model_downloaded(name)
            ))
        return models
    
    async def transcribe_audio(self, audio_file: bytes, model_name: str = "small") -> str:
        """Trascrive un file audio usando Whisper"""
        try:
            # Carica il modello
            model = self.load_model(model_name)
            
            # Salva temporaneamente il file audio
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file.write(audio_file)
                temp_path = temp_file.name
            
            try:
                # Trascrivi l'audio con parametri ottimizzati
                result = model.transcribe(
                    temp_path,
                    # Parametri ottimizzati per CPU
                    fp16=False,  # Forza FP32 su CPU
                    language="it",  # Specifica italiano per migliore accuratezza
                    task="transcribe"
                )
                return result["text"].strip()
            finally:
                # Rimuovi il file temporaneo
                os.unlink(temp_path)
                
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

# Istanza globale del servizio
whisper_service = WhisperService()

# ---- Async download task management ----
_download_tasks: dict[str, dict] = {}
_tasks_lock = threading.Lock()

def _spawn_download_task(model_name: str) -> str:
    task_id = uuid.uuid4().hex
    with _tasks_lock:
        _download_tasks[task_id] = {
            'task_id': task_id,
            'model': model_name,
            'status': 'pending',  # pending|running|completed|error|skipped
            'error': None,
            'started_at': None,
            'ended_at': None,
            'progress_pct': 0.0
        }

    def _run():
        with _tasks_lock:
            task = _download_tasks.get(task_id)
            if not task:
                return
            task['status'] = 'running'
            task['started_at'] = time.time()
        try:
            if whisper_service.is_model_downloaded(model_name):
                with _tasks_lock:
                    task = _download_tasks.get(task_id)
                    if task:
                        task['status'] = 'skipped'
                        task['progress_pct'] = 100.0
                        task['ended_at'] = time.time()
                return
            # Non abbiamo progress reale intermedio (whisper salva a fine) -> impostiamo step fittizi
            # Simuliamo qualche tick per dare feedback prima del completamento reale.
            pseudo_ticks = [10, 25, 40, 55, 70, 85]
            for pct in pseudo_ticks:
                time.sleep(1.0)
                with _tasks_lock:
                    task = _download_tasks.get(task_id)
                    if not task or task['status'] != 'running':
                        return
                    task['progress_pct'] = pct
            whisper_service.download_model(model_name)
            with _tasks_lock:
                task = _download_tasks.get(task_id)
                if task:
                    task['progress_pct'] = 100.0
                    task['status'] = 'completed'
                    task['ended_at'] = time.time()
        except Exception as e:  # noqa
            with _tasks_lock:
                task = _download_tasks.get(task_id)
                if task:
                    task['status'] = 'error'
                    task['error'] = str(e)
                    task['ended_at'] = time.time()

    threading.Thread(target=_run, daemon=True).start()
    return task_id

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    provider: str = "small"
):
    """Trascrivi un file audio usando Whisper locale"""
    try:
        import time
        _start = time.perf_counter()
        try:
            log_interaction({
                "event": "transcribe_start",
                "request_id": locals().get('request_id'),
                "provider": "whisper_local",
                "model": provider,
                "content_type": audio.content_type,
            })
            log_system(20, f"REQUEST transcribe start: id={locals().get('request_id')} model={provider} type={audio.content_type}")
        except Exception:
            pass
        # Verifica che il file sia un audio
        if not audio.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        
        # Leggi il contenuto del file
        audio_content = await audio.read()
        
        # Trascrivi usando il servizio Whisper (usa provider come model)
        import uuid as _uuid
        request_id = f"req_{_uuid.uuid4().hex}"
        text = await whisper_service.transcribe_audio(audio_content, provider)
        duration_ms = int((time.perf_counter() - _start) * 1000)
        try:
            log_interaction({
                "event": "transcribe",
                "request_id": request_id,
                "provider": "whisper_local",
                "model": provider,
                "file_bytes": len(audio_content),
                "content_type": audio.content_type,
                "duration_ms": duration_ms,
            })
        except Exception:
            pass
        try:
            log_system(20, f"REQUEST transcribe done: id={request_id} model={provider} dur={duration_ms}ms")
        except Exception:
            pass
        return {"text": text, "model_used": provider}
        
    except Exception as e:
        try:
            log_interaction({
                "event": "transcribe_error",
                "request_id": locals().get('request_id'),
                "provider": "whisper_local",
                "model": provider,
                "error": str(e),
            })
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))
    """Trascrivi un file audio usando Whisper locale"""
    try:
        # Verifica che il file sia un audio
        if not audio.content_type or not audio.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        
        # Leggi il contenuto del file
        audio_content = await audio.read()
        
        # Trascrivi usando il servizio Whisper (usa provider come model_name)
        text = await whisper_service.transcribe_audio(audio_content, provider)
        return {"text": text, "model_used": provider}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/whisper/models")
async def get_whisper_models():
    """Ottieni la lista di tutti i modelli Whisper disponibili"""
    try:
        models = whisper_service.get_models_status()
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/whisper/models/{model_name}/download")
async def download_whisper_model(model_name: str):
    """Scarica un modello Whisper specifico"""
    try:
        if model_name not in whisper_service.available_models:
            raise HTTPException(status_code=400, detail=f"Model {model_name} not available")
        
        if whisper_service.is_model_downloaded(model_name):
            return {"message": f"Model {model_name} already downloaded", "success": True}
        
        # Esegui il download in background
        success = whisper_service.download_model(model_name)
        
        if success:
            return {"message": f"Model {model_name} downloaded successfully", "success": True}
        else:
            raise HTTPException(status_code=500, detail=f"Failed to download model {model_name}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/whisper/models/{model_name}/download-async")
async def download_whisper_model_async(model_name: str):
    """Avvia download asincrono di un modello Whisper e ritorna task_id."""
    try:
        if model_name not in whisper_service.available_models:
            raise HTTPException(status_code=400, detail=f"Model {model_name} not available")
        task_id = _spawn_download_task(model_name)
        return {"task_id": task_id, "model": model_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/whisper/models/download-tasks/{task_id}")
async def get_download_task_status(task_id: str):
    with _tasks_lock:
        task = _download_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        # Clona dict per sicurezza
        return {**task}

@router.delete("/whisper/models/{model_name}")
async def delete_whisper_model(model_name: str):
    """Elimina un modello Whisper scaricato"""
    try:
        if model_name not in whisper_service.available_models:
            raise HTTPException(status_code=400, detail=f"Model {model_name} not available")
        
        if not whisper_service.is_model_downloaded(model_name):
            raise HTTPException(status_code=400, detail=f"Model {model_name} not downloaded")
        
        # Non permettere di eliminare il modello attualmente in uso
        if whisper_service.current_model_name == model_name:
            raise HTTPException(status_code=400, detail=f"Cannot delete model {model_name} - currently in use")
        
        model_path = whisper_service.models_dir / f"{model_name}.pt"
        model_path.unlink()
        
        return {"message": f"Model {model_name} deleted successfully", "success": True}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/whisper/models/{model_name}/status")
async def whisper_model_status(model_name: str):
    """Ritorna stato download di un singolo modello Whisper.
    Fornisce:
      - downloaded: True/False
      - file_size_bytes: dimensione reale del file .pt se esiste
      - expected_size_bytes: stima dalla tabella (parsed da disk_space)
      - progress_pct: percentuale stimata (file_size/expected)
      - disk_space_label: stringa originale (es. "~1GB")
    Nota: il processo di download attuale usa whisper.load_model e salva il file
    solo a completamento, quindi non è disponibile una progressione incrementale;
    il valore sara' 0% oppure 100% nella maggior parte dei casi.
    """
    try:
        if model_name not in whisper_service.available_models:
            raise HTTPException(status_code=400, detail=f"Model {model_name} not available")

        disk_label = whisper_service.available_models[model_name]["disk_space"]

        def _parse_disk_space(label: str) -> int | None:
            # Esempi: "~150MB", "~1GB", "~3GB"
            import re
            m = re.match(r"~?(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)", label, re.I)
            if not m:
                return None
            val = float(m.group(1))
            unit = m.group(2).upper()
            mult = {"KB":1024, "MB":1024**2, "GB":1024**3, "TB":1024**4}.get(unit, 1)
            return int(val * mult)

        expected_bytes = _parse_disk_space(disk_label) or None
        model_path = whisper_service.models_dir / f"{model_name}.pt"
        downloaded = model_path.exists()
        file_size_bytes = model_path.stat().st_size if downloaded else None
        if expected_bytes and file_size_bytes:
            progress = min(100.0, (file_size_bytes / expected_bytes) * 100.0)
        else:
            # Se non esiste ancora il file, progress=0
            progress = 100.0 if downloaded and not expected_bytes else (0.0 if not downloaded else 100.0)

        # Se esiste un task attivo per questo modello includilo
        active_task_id = None
        with _tasks_lock:
            for tid, t in _download_tasks.items():
                if t['model'] == model_name and t['status'] in ('pending','running'):
                    active_task_id = tid
                    break

        return {
            "model": model_name,
            "downloaded": downloaded,
            "file_size_bytes": file_size_bytes,
            "expected_size_bytes": expected_bytes,
            "progress_pct": round(progress, 2),
            "disk_space_label": disk_label,
            "active_task_id": active_task_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
