from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import whisper
import traceback
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
        # Directory locale per i modelli
        self.models_dir = Path(__file__).parent.parent / "models" / "whisper"
        self.models_dir.mkdir(exist_ok=True)

        # Stato runtime
        self.current_model: torch.nn.Module | None = None
        self.current_model_name: str | None = None
        self._model_lock = threading.Lock()

        # Metadati modelli disponibili (statici)
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
            try:
                self.ensure_default_model()
            except Exception as e:
                log_system(30, f"Whisper default model download skipped: {e}")
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
        """Controlla se un modello è già scaricato nella directory locale configurata."""
        model_path = self.models_dir / f"{model_name}.pt"
        return model_path.exists()
    
    def download_model(self, model_name: str):
        """Scarica un modello Whisper nella directory locale dedicata.

        Usa il parametro download_root di whisper per evitare doppio download in cache globale.
        """
        if model_name not in self.available_models:
            raise ValueError(f"Model {model_name} not available")
        try:
            print(f"[whisper] Downloading model: {model_name} -> {self.models_dir}")
            # whisper.load_model esegue il download se assente
            whisper.load_model(model_name, download_root=str(self.models_dir))
            print(f"[whisper] Model {model_name} downloaded")
            return True
        except Exception as e:
            log_system(40, f"Whisper download failed model={model_name}: {e}")
            raise
    
    def load_model(self, model_name: str = "small"):
        """Carica (con lock) un modello Whisper. Scarica se assente."""
        if not self.is_model_downloaded(model_name):
            self.download_model(model_name)
        with self._model_lock:
            if self.current_model_name == model_name and self.current_model is not None:
                return self.current_model
            print(f"[whisper] Loading model: {model_name}")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            try:
                self.current_model = whisper.load_model(
                    model_name,
                    device=device,
                    download_root=str(self.models_dir),
                    in_memory=False  # evita doppia copia in RAM per modelli grandi
                )
                self.current_model_name = model_name
                print(f"[whisper] Model {model_name} ready on {device}")
            except Exception as e:
                tb = traceback.format_exc(limit=6)
                log_system(40, f"Whisper load failed model={model_name}: {e}\n{tb}")
                raise
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
        """Trascrive un file audio usando Whisper."""
        try:
            model = self.load_model(model_name)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file.write(audio_file)
                temp_path = temp_file.name
            try:
                result = model.transcribe(
                    temp_path,
                    fp16=False,
                    language="it",
                    task="transcribe"
                )
                return result.get("text", "").strip()
            finally:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        except HTTPException:
            raise
        except Exception as e:
            tb = traceback.format_exc(limit=8)
            log_system(40, f"Whisper transcription failed model={model_name}: {e}\n{tb}")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

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
    """Trascrivi un file audio usando Whisper locale."""
    import time as _time
    import uuid as _uuid
    start = _time.perf_counter()
    request_id = f"req_{_uuid.uuid4().hex}"
    try:
        if not audio.content_type or not audio.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        audio_content = await audio.read()
        log_interaction({
            "event": "transcribe_start",
            "request_id": request_id,
            "provider": "whisper_local",
            "model": provider,
            "content_type": audio.content_type,
            "file_bytes": len(audio_content)
        })
        text = await whisper_service.transcribe_audio(audio_content, provider)
        dur_ms = int((_time.perf_counter() - start) * 1000)
        log_interaction({
            "event": "transcribe",
            "request_id": request_id,
            "provider": "whisper_local",
            "model": provider,
            "duration_ms": dur_ms
        })
        log_system(20, f"REQUEST transcribe done: id={request_id} model={provider} dur={dur_ms}ms")
        return {"text": text, "model_used": provider, "request_id": request_id, "duration_ms": dur_ms}
    except HTTPException:
        raise
    except Exception as e:
        log_interaction({
            "event": "transcribe_error",
            "request_id": request_id,
            "provider": "whisper_local",
            "model": provider,
            "error": str(e)
        })
        log_system(40, f"REQUEST transcribe failed: id={request_id} model={provider} err={e}")
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

@router.post("/whisper/models/{model_name}/activate")
async def activate_whisper_model(model_name: str):
    """Precarica (o valida) un modello Whisper in memoria.
    Ritorna lo stato post-caricamento.
    """
    try:
        if model_name not in whisper_service.available_models:
            raise HTTPException(status_code=400, detail=f"Model {model_name} not available")
        whisper_service.load_model(model_name)
        return {"success": True, "model": model_name, "loaded": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Activation failed: {e}")

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

@router.get("/whisper/health")
async def whisper_health():
    """Diagnostica Whisper: stato modelli, modello corrente, GPU, ffmpeg e versioni."""
    import shutil, subprocess
    gpu = torch.cuda.is_available()
    ffmpeg_path = shutil.which("ffmpeg")
    ffmpeg_version = None
    if ffmpeg_path:
        try:
            out = subprocess.run([ffmpeg_path, '-version'], capture_output=True, text=True, timeout=2)
            if out.returncode == 0:
                ffmpeg_version = out.stdout.split('\n',1)[0]
        except Exception:
            pass
    models_status = whisper_service.get_models_status()
    return {
        "current_model": whisper_service.current_model_name,
        "models": [m.dict() for m in models_status],
        "gpu_available": gpu,
        "ffmpeg": {"found": bool(ffmpeg_path), "path": ffmpeg_path, "version": ffmpeg_version},
        "versions": {
            "torch": getattr(torch, '__version__', 'n/a'),
            "whisper": getattr(whisper, '__version__', 'n/a')
        }
    }

@router.post("/whisper/warm")
async def whisper_warm(model: str | None = None):
    """Forza il caricamento (warm-up) di un modello Whisper (default small)."""
    try:
        target = model or whisper_service.current_model_name or "small"
        whisper_service.load_model(target)
        return {"success": True, "model": target, "warmed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Warm failed: {e}")
