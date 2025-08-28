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
        # Auto-download del modello small al primo avvio
        self.ensure_default_model()
    
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

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    provider: str = "small"
):
    """Trascrivi un file audio usando Whisper locale"""
    try:
        # Verifica che il file sia un audio
        if not audio.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        
        # Leggi il contenuto del file
        audio_content = await audio.read()
        
        # Trascrivi usando il servizio Whisper (usa provider come model)
        text = await whisper_service.transcribe_audio(audio_content, provider)
        
        return {"text": text, "model_used": provider}
        
    except Exception as e:
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
