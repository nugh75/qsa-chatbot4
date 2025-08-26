from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
from datetime import datetime
import json
import os
from dotenv import load_dotenv
from .chat import router as chat_router
from .tts import router as tts_router
from .transcribe import router as asr_router
from .admin import router as admin_router
from .auth_routes import router as auth_router
from .conversation_routes import router as conversation_router
from .search_routes import router as search_router
from .admin_panel import router as admin_panel_router
from .import_export import router as import_export_router

# Carica le variabili di ambiente dal file .env
load_dotenv()

app = FastAPI(title="QSA Chatbot – Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modello per il feedback
class FeedbackData(BaseModel):
    messageIndex: int
    feedback: str  # 'like' o 'dislike'
    timestamp: int
    provider: str

app.include_router(chat_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
app.include_router(asr_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(conversation_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(admin_panel_router, prefix="/api")
app.include_router(import_export_router, prefix="/api")

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

@app.get("/api/feedback/stats")
async def get_feedback_stats():
    """Ottieni statistiche sui feedback"""
    try:
        feedback_dir = os.path.join(os.path.dirname(__file__), "..", "feedback")
        
        if not os.path.exists(feedback_dir):
            return {"total": 0, "likes": 0, "dislikes": 0, "by_provider": {}}
        
        stats = {"total": 0, "likes": 0, "dislikes": 0, "by_provider": {}}
        
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
                            if provider not in stats["by_provider"]:
                                stats["by_provider"][provider] = {"likes": 0, "dislikes": 0}
                            
                            stats["by_provider"][provider][entry["feedback"] + "s"] += 1
        
        return stats
        
    except Exception as e:
        return {"error": f"Errore nel recupero statistiche: {str(e)}"}

@app.post("/api/chat/end-session")
async def end_session():
    # in questa versione non manteniamo stato server-side
    return {"ok": True}
