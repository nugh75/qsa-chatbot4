"""
Search functionality with hash-based indexing for encrypted conversations
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import hashlib
import re
from datetime import datetime, timedelta

from .auth import get_current_active_user
from .database import db_manager

router = APIRouter(prefix="/search", tags=["search"])

class SearchQuery(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    limit: int = 50

class SearchResult(BaseModel):
    conversation_id: str
    title_encrypted: str
    title_hash: str
    message_id: Optional[str] = None
    content_encrypted: Optional[str] = None
    content_hash: Optional[str] = None
    message_role: Optional[str] = None
    timestamp: str
    relevance_score: float

class SearchStats(BaseModel):
    total_conversations: int
    total_messages: int
    search_time_ms: float
    results_count: int

@router.get("/conversations", response_model=Dict[str, Any])
async def search_conversations(
    q: str = Query(..., description="Search query"),
    conversation_id: Optional[str] = Query(None, description="Specific conversation ID"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(50, description="Maximum results"),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Ricerca nelle conversazioni usando hash-based indexing
    
    La ricerca funziona sui hash dei contenuti, non sui contenuti in chiaro.
    L'utente deve fornire il termine esatto per trovare corrispondenze.
    """
    
    start_time = datetime.now()
    
    try:
        # Genera hash di ricerca per diversi pattern
        search_hashes = generate_search_hashes(q)
        
        # Query di base
        query_conditions = ["c.user_id = ?"]
        query_params = [current_user["id"]]
        
        # Filtro per conversazione specifica
        if conversation_id:
            query_conditions.append("c.id = ?")
            query_params.append(conversation_id)
        
        # Filtri data
        if date_from:
            query_conditions.append("c.updated_at >= ?")
            query_params.append(date_from)
        if date_to:
            query_conditions.append("c.updated_at <= ?")
            query_params.append(date_to + " 23:59:59")
        
        # Costruisci placeholders per hash search
        hash_placeholders = ",".join(["?" for _ in search_hashes])
        
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Ricerca nei titoli delle conversazioni
            title_query = f"""
                SELECT DISTINCT c.id as conversation_id, c.title_encrypted, c.title_hash,
                       NULL as message_id, NULL as content_encrypted, NULL as content_hash,
                       NULL as message_role, c.updated_at as timestamp,
                       1.0 as relevance_score, 'title' as match_type
                FROM conversations c
                WHERE {' AND '.join(query_conditions)} 
                AND c.is_deleted = 0
                AND c.title_hash IN ({hash_placeholders})
                ORDER BY c.updated_at DESC
                LIMIT ?
            """
            
            title_params = query_params + search_hashes + [limit // 2]
            cursor.execute(title_query, title_params)
            title_results = [dict(row) for row in cursor.fetchall()]
            
            # Ricerca nei messaggi
            message_query = f"""
                SELECT c.id as conversation_id, c.title_encrypted, c.title_hash,
                       m.id as message_id, m.content_encrypted, m.content_hash,
                       m.role as message_role, m.timestamp,
                       0.8 as relevance_score, 'message' as match_type
                FROM conversations c
                JOIN messages m ON c.id = m.conversation_id
                WHERE {' AND '.join(query_conditions)}
                AND c.is_deleted = 0 AND m.is_deleted = 0
                AND m.content_hash IN ({hash_placeholders})
                ORDER BY m.timestamp DESC
                LIMIT ?
            """
            
            message_params = query_params + search_hashes + [limit // 2]
            cursor.execute(message_query, message_params)
            message_results = [dict(row) for row in cursor.fetchall()]
            
            # Combina risultati
            all_results = title_results + message_results
            
            # Ordina per rilevanza e data
            all_results.sort(key=lambda x: (x['relevance_score'], x['timestamp']), reverse=True)
            
            # Limita risultati finali
            final_results = all_results[:limit]
            
            # Statistiche
            stats_query = """
                SELECT COUNT(DISTINCT c.id) as total_conversations,
                       COUNT(m.id) as total_messages
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                WHERE c.user_id = ? AND c.is_deleted = 0
            """
            cursor.execute(stats_query, [current_user["id"]])
            stats_row = cursor.fetchone()
            
            search_time = (datetime.now() - start_time).total_seconds() * 1000
            
            stats = SearchStats(
                total_conversations=stats_row[0] if stats_row else 0,
                total_messages=stats_row[1] if stats_row else 0,
                search_time_ms=round(search_time, 2),
                results_count=len(final_results)
            )
            
            return {
                "results": final_results,
                "statistics": stats.dict(),
                "search_hashes": len(search_hashes),
                "query": q
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search error: {str(e)}"
        )

@router.post("/index-content")
async def index_content_for_search(
    content: str,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Genera hash per indicizzazione contenuto (utility per frontend)
    """
    try:
        hashes = generate_search_hashes(content)
        primary_hash = hashlib.sha256(content.encode()).hexdigest()
        
        return {
            "primary_hash": primary_hash,
            "search_hashes": hashes,
            "total_hashes": len(hashes)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Indexing error: {str(e)}"
        )

@router.get("/suggestions")
async def get_search_suggestions(
    q: str = Query(..., description="Partial query for suggestions"),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Suggerimenti di ricerca basati su titoli delle conversazioni
    """
    try:
        # Per ora restituiamo suggerimenti basati sui pattern comuni
        suggestions = []
        
        # Pattern comuni
        common_patterns = [
            "oggi", "ieri", "settimana", "mese",
            "problema", "errore", "aiuto", "come",
            "python", "javascript", "database", "api",
        ]
        
        # Filtra pattern che iniziano con la query
        matching_patterns = [p for p in common_patterns if p.startswith(q.lower())]
        suggestions.extend(matching_patterns)
        
        # Aggiungi suggerimenti basati su data
        if q.lower() in ["oggi", "ier"]:
            suggestions.extend(["oggi", "ieri", "questa settimana"])
        
        return {
            "suggestions": suggestions[:10],
            "query": q
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Suggestions error: {str(e)}"
        )

@router.get("/recent")
async def get_recent_searches(
    limit: int = Query(10, description="Number of recent searches"),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Ricerche recenti dell'utente (placeholder - implementare storage se necessario)
    """
    # Per ora restituiamo lista vuota
    # In futuro si potrebbero salvare le ricerche in una tabella dedicata
    return {
        "recent_searches": [],
        "limit": limit
    }

def generate_search_hashes(content: str) -> List[str]:
    """
    Genera hash multipli per ricerca flessibile
    
    Crea hash per:
    - Contenuto completo
    - Parole singole
    - Bigrammi
    - Versioni normalizzate (lowercase, senza punteggiatura)
    """
    hashes = []
    
    # Hash contenuto completo
    hashes.append(hashlib.sha256(content.encode()).hexdigest())
    
    # Normalizza contenuto
    normalized = re.sub(r'[^\w\s]', '', content.lower())
    hashes.append(hashlib.sha256(normalized.encode()).hexdigest())
    
    # Hash parole singole
    words = normalized.split()
    for word in words:
        if len(word) >= 3:  # Solo parole di almeno 3 caratteri
            word_hash = hashlib.sha256(word.encode()).hexdigest()
            hashes.append(word_hash)
    
    # Hash bigrammi (coppie di parole)
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i+1]}"
        if len(bigram) >= 5:
            bigram_hash = hashlib.sha256(bigram.encode()).hexdigest()
            hashes.append(bigram_hash)
    
    # Rimuovi duplicati
    return list(set(hashes))

def calculate_relevance_score(match_type: str, content_length: int, query_length: int) -> float:
    """
    Calcola punteggio di rilevanza per risultato di ricerca
    """
    base_score = {
        'title': 1.0,
        'message': 0.8,
        'partial': 0.6
    }.get(match_type, 0.5)
    
    # Bonus per corrispondenze esatte
    if content_length == query_length:
        base_score += 0.2
    
    # Penalty per contenuti molto lunghi (meno specifici)
    if content_length > 1000:
        base_score -= 0.1
    
    return max(0.1, min(1.0, base_score))
