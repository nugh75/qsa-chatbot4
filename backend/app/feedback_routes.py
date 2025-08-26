from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from pathlib import Path
import sqlite3
import hashlib
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Percorso database
DATABASE_PATH = Path(__file__).parent.parent / "qsa_chatbot.db"

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# Modelli Pydantic
class FeedbackSubmission(BaseModel):
    # Scale Likert (1-5)
    ease_of_use: int = Field(..., ge=1, le=5)
    interface_clarity: int = Field(..., ge=1, le=5)
    response_speed: int = Field(..., ge=1, le=5)
    response_quality: int = Field(..., ge=1, le=5)
    rag_relevance: int = Field(..., ge=1, le=5)
    comprehension: int = Field(..., ge=1, le=5)
    conversation_flow: int = Field(..., ge=1, le=5)
    emotional_support: int = Field(..., ge=1, le=5)
    advice_utility: int = Field(..., ge=1, le=5)
    recommendation: int = Field(..., ge=1, le=5)
    
    # Domande aperte
    feeling_description: Optional[str] = Field(None, max_length=300)
    feature_requests: Optional[str] = Field(None, max_length=200)
    experience_summary: Optional[str] = Field(None, max_length=150)
    
    # Metadati opzionali
    session_duration: Optional[int] = None  # millisecondi
    messages_count: Optional[int] = None

class FeedbackStats(BaseModel):
    total_responses: int
    avg_scores: Dict[str, float]
    score_distribution: Dict[str, Dict[int, int]]
    recent_comments: List[Dict[str, Any]]
    response_trend: List[Dict[str, Any]]

# Inizializzazione database
def init_feedback_db():
    """Inizializza le tabelle per i feedback se non esistono"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # Tabella principali feedback
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback_surveys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Scale Likert (1-5)
                ease_of_use INTEGER NOT NULL,
                interface_clarity INTEGER NOT NULL,
                response_speed INTEGER NOT NULL,
                response_quality INTEGER NOT NULL,
                rag_relevance INTEGER NOT NULL,
                comprehension INTEGER NOT NULL,
                conversation_flow INTEGER NOT NULL,
                emotional_support INTEGER NOT NULL,
                advice_utility INTEGER NOT NULL,
                recommendation INTEGER NOT NULL,
                
                -- Domande aperte
                feeling_description TEXT,
                feature_requests TEXT,
                experience_summary TEXT,
                
                -- Metadati anonimi
                session_duration INTEGER,
                messages_count INTEGER,
                ip_hash TEXT,
                
                -- Indici per prestazioni
                UNIQUE(ip_hash, DATE(submitted_at))
            )
        ''')
        
        # Tabella statistiche aggregate (aggiornata periodicamente)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback_stats_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cache_date DATE DEFAULT (DATE('now')),
                stats_json TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info("✅ Database feedback inizializzato con successo")
        
    except Exception as e:
        logger.error(f"❌ Errore inizializzazione database feedback: {e}")
        raise

# Funzione helper per hash IP
def hash_ip(ip: str) -> str:
    """Crea hash anonimo dell'IP per prevenire spam"""
    return hashlib.sha256(f"{ip}:feedback".encode()).hexdigest()[:16]

# Endpoint per submit questionario
@router.post("/submit")
async def submit_feedback(feedback: FeedbackSubmission, request: Request):
    """Submit questionario di gradimento anonimo"""
    try:
        # Hash IP per controllo anti-spam
        client_ip = request.client.host
        ip_hash_val = hash_ip(client_ip)
        
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # Controllo: solo 1 feedback per IP per giorno
        cursor.execute('''
            SELECT COUNT(*) FROM feedback_surveys 
            WHERE ip_hash = ? AND DATE(submitted_at) = DATE('now')
        ''', (ip_hash_val,))
        
        if cursor.fetchone()[0] > 0:
            raise HTTPException(
                status_code=429, 
                detail="Hai già inviato un feedback oggi. Grazie per il tuo contributo!"
            )
        
        # Inserimento feedback
        cursor.execute('''
            INSERT INTO feedback_surveys (
                ease_of_use, interface_clarity, response_speed, response_quality,
                rag_relevance, comprehension, conversation_flow, emotional_support,
                advice_utility, recommendation, feeling_description, feature_requests,
                experience_summary, session_duration, messages_count, ip_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            feedback.ease_of_use, feedback.interface_clarity, feedback.response_speed,
            feedback.response_quality, feedback.rag_relevance, feedback.comprehension,
            feedback.conversation_flow, feedback.emotional_support, feedback.advice_utility,
            feedback.recommendation, feedback.feeling_description, feedback.feature_requests,
            feedback.experience_summary, feedback.session_duration, feedback.messages_count,
            ip_hash_val
        ))
        
        feedback_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Nuovo feedback ricevuto: ID {feedback_id}")
        
        # Invalida cache statistiche
        await invalidate_stats_cache()
        
        return {
            "success": True,
            "message": "Grazie per il tuo feedback! È stato registrato con successo.",
            "feedback_id": feedback_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Errore submit feedback: {e}")
        raise HTTPException(status_code=500, detail="Errore interno del server")

# Endpoint per statistiche pubbliche
@router.get("/stats", response_model=FeedbackStats)
async def get_feedback_stats():
    """Recupera statistiche pubbliche dei feedback"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # Conteggio totale
        cursor.execute("SELECT COUNT(*) FROM feedback_surveys")
        total_responses = cursor.fetchone()[0]
        
        if total_responses == 0:
            return FeedbackStats(
                total_responses=0,
                avg_scores={},
                score_distribution={},
                recent_comments=[],
                response_trend=[]
            )
        
        # Calcolo medie per tutte le scale Likert
        likert_fields = [
            'ease_of_use', 'interface_clarity', 'response_speed', 'response_quality',
            'rag_relevance', 'comprehension', 'conversation_flow', 'emotional_support',
            'advice_utility', 'recommendation'
        ]
        
        avg_scores = {}
        for field in likert_fields:
            cursor.execute(f"SELECT AVG({field}) FROM feedback_surveys")
            avg_scores[field] = round(cursor.fetchone()[0], 2)
        
        # Distribuzione punteggi
        score_distribution = {}
        for field in likert_fields:
            cursor.execute(f'''
                SELECT {field}, COUNT(*) 
                FROM feedback_surveys 
                GROUP BY {field} 
                ORDER BY {field}
            ''')
            score_distribution[field] = dict(cursor.fetchall())
        
        # Commenti recenti (ultimi 10, non vuoti)
        cursor.execute('''
            SELECT feeling_description, feature_requests, experience_summary, 
                   submitted_at, recommendation
            FROM feedback_surveys 
            WHERE (feeling_description IS NOT NULL AND feeling_description != '') 
               OR (feature_requests IS NOT NULL AND feature_requests != '') 
               OR (experience_summary IS NOT NULL AND experience_summary != '')
            ORDER BY submitted_at DESC 
            LIMIT 10
        ''')
        
        recent_comments = []
        for row in cursor.fetchall():
            comment_data = {
                "submitted_at": row[3],
                "recommendation_score": row[4],
                "comments": {}
            }
            if row[0]: comment_data["comments"]["feeling"] = row[0]
            if row[1]: comment_data["comments"]["requests"] = row[1]
            if row[2]: comment_data["comments"]["summary"] = row[2]
            
            recent_comments.append(comment_data)
        
        # Trend risposte per giorno (ultimi 30 giorni)
        cursor.execute('''
            SELECT DATE(submitted_at) as date, 
                   COUNT(*) as count,
                   AVG(recommendation) as avg_recommendation
            FROM feedback_surveys 
            WHERE submitted_at >= DATE('now', '-30 days')
            GROUP BY DATE(submitted_at)
            ORDER BY date DESC
        ''')
        
        response_trend = [
            {
                "date": row[0], 
                "count": row[1], 
                "avg_recommendation": round(row[2], 2)
            } 
            for row in cursor.fetchall()
        ]
        
        conn.close()
        
        return FeedbackStats(
            total_responses=total_responses,
            avg_scores=avg_scores,
            score_distribution=score_distribution,
            recent_comments=recent_comments,
            response_trend=response_trend
        )
        
    except Exception as e:
        logger.error(f"❌ Errore recupero statistiche feedback: {e}")
        raise HTTPException(status_code=500, detail="Errore nel recupero delle statistiche")

# Endpoint per commenti pubblici (paginato)
@router.get("/comments")
async def get_public_comments(page: int = 1, limit: int = 20):
    """Recupera commenti pubblici paginati"""
    try:
        offset = (page - 1) * limit
        
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        
        # Conteggio totale commenti
        cursor.execute('''
            SELECT COUNT(*) FROM feedback_surveys 
            WHERE (feeling_description IS NOT NULL AND feeling_description != '') 
               OR (feature_requests IS NOT NULL AND feature_requests != '') 
               OR (experience_summary IS NOT NULL AND experience_summary != '')
        ''')
        total_comments = cursor.fetchone()[0]
        
        # Commenti con paginazione
        cursor.execute('''
            SELECT feeling_description, feature_requests, experience_summary, 
                   submitted_at, recommendation, ease_of_use, response_quality
            FROM feedback_surveys 
            WHERE (feeling_description IS NOT NULL AND feeling_description != '') 
               OR (feature_requests IS NOT NULL AND feature_requests != '') 
               OR (experience_summary IS NOT NULL AND experience_summary != '')
            ORDER BY submitted_at DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
        comments = []
        for row in cursor.fetchall():
            comment_data = {
                "submitted_at": row[3],
                "recommendation": row[4],
                "ease_of_use": row[5],
                "response_quality": row[6],
                "texts": {}
            }
            if row[0]: comment_data["texts"]["feeling"] = row[0]
            if row[1]: comment_data["texts"]["requests"] = row[1]
            if row[2]: comment_data["texts"]["summary"] = row[2]
            
            comments.append(comment_data)
        
        conn.close()
        
        total_pages = (total_comments + limit - 1) // limit
        
        return {
            "comments": comments,
            "pagination": {
                "current_page": page,
                "total_pages": total_pages,
                "total_comments": total_comments,
                "per_page": limit
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Errore recupero commenti: {e}")
        raise HTTPException(status_code=500, detail="Errore nel recupero dei commenti")

async def invalidate_stats_cache():
    """Invalida cache statistiche per forzare ricalcolo"""
    try:
        conn = sqlite3.connect(str(DATABASE_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM feedback_stats_cache WHERE cache_date < DATE('now')")
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Errore invalidazione cache: {e}")

# Inizializza database all'import
init_feedback_db()
