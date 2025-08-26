from fastapi import APIRouter, Header, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
import hashlib
import re
from .prompts import load_system_prompt
from .topic_router import detect_topic
from .rag import get_context
from .llm import chat_with_provider, compute_token_stats
from .usage import log_usage
from .admin import load_config
from .memory import get_memory
from .auth import get_current_active_user
from .database import db_manager, MessageModel

router = APIRouter()

class ChatIn(BaseModel):
    message: str
    sessionId: Optional[str] = None
    conversation_id: Optional[str] = None

def generate_content_hash(content: str) -> str:
    """Generate hash for search indexing"""
    return hashlib.sha256(content.encode()).hexdigest()

def generate_search_hashes(content: str) -> list:
    """Generate multiple hashes for flexible search"""
    hashes = []
    
    # Primary hash
    hashes.append(generate_content_hash(content))
    
    # Normalized content hash
    normalized = re.sub(r'[^\w\s]', '', content.lower())
    hashes.append(hashlib.sha256(normalized.encode()).hexdigest())
    
    # Word hashes
    words = normalized.split()
    for word in words:
        if len(word) >= 3:
            hashes.append(hashlib.sha256(word.encode()).hexdigest())
    
    # Bigram hashes
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i+1]}"
        if len(bigram) >= 5:
            hashes.append(hashlib.sha256(bigram.encode()).hexdigest())
    
    return list(set(hashes))

ADMIN_PASSWORD = "Lagom192."

@router.post("/chat")
async def chat(
    req: ChatIn, 
    x_llm_provider: Optional[str] = Header(default="local"), 
    x_admin_password: Optional[str] = Header(default=None),
    current_user: dict = Depends(get_current_active_user)
):
    user_msg = req.message
    session_id = req.sessionId or "default"
    conversation_id = req.conversation_id
    
    # Ottieni l'istanza della memoria
    memory = get_memory()
    
    # Aggiungi il messaggio dell'utente alla memoria
    topic = detect_topic(user_msg)
    memory.add_message(session_id, "user", user_msg, {"topic": topic})
    
    # Se abbiamo un conversation_id, salva nel database
    if conversation_id and current_user:
        try:
            # Genera ID unico per il messaggio utente
            import uuid
            user_message_id = f"msg_{uuid.uuid4().hex}"
            
            # Salva messaggio utente usando MessageModel
            success = MessageModel.add_message(
                message_id=user_message_id,
                conversation_id=conversation_id,
                content_encrypted=user_msg,  # Già crittografato dal frontend se necessario
                role="user",
                token_count=0,
                processing_time=0.0
            )
            
            if not success:
                print(f"Warning: Failed to save user message to database")
                
        except Exception as e:
            print(f"Error saving user message: {e}")
    
    # Ottieni il contesto RAG
    context = get_context(topic, user_msg)
    system = load_system_prompt()

    # Costruisci la cronologia della conversazione
    conversation_history = memory.get_conversation_history(session_id)
    
    # Prepara i messaggi per il provider LLM
    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic or 'generale'}]\n{context[:6000]}"}
    ]
    
    # Aggiungi la cronologia della conversazione
    messages.extend(conversation_history)
    
    # Se non c'è cronologia, aggiungi il messaggio corrente
    if not any(msg["role"] == "user" and msg["content"] == user_msg for msg in conversation_history):
        messages.append({"role": "user", "content": user_msg})
    
    import time, datetime
    start_time = time.perf_counter()
    answer = await chat_with_provider(messages, provider=x_llm_provider, context_hint=topic or 'generale')
    processing_time = time.perf_counter() - start_time
    
    # Aggiungi la risposta dell'assistente alla memoria
    memory.add_message(session_id, "assistant", answer, {"topic": topic, "provider": x_llm_provider})
    
    # Salva risposta assistente nel database
    if conversation_id and current_user:
        try:
            # Genera ID unico per il messaggio assistente
            assistant_message_id = f"msg_{uuid.uuid4().hex}"
            
            # Calcola token per statistiche
            tokens_stats = compute_token_stats(messages, answer)
            token_count = tokens_stats.get('total_tokens', 0)
            
            # Salva messaggio assistente usando MessageModel
            success = MessageModel.add_message(
                message_id=assistant_message_id,
                conversation_id=conversation_id,
                content_encrypted=answer,  # Il backend salva sempre in chiaro per ora
                role="assistant",
                token_count=token_count,
                processing_time=processing_time
            )
            
            if not success:
                print(f"Warning: Failed to save assistant message to database")
                
        except Exception as e:
            print(f"Error saving assistant message: {e}")
    
    # Calcolo token sempre per logging interno
    tokens_full = compute_token_stats(messages, answer)
    resp = {"reply": answer, "topic": topic}
    if x_admin_password == ADMIN_PASSWORD:
        resp["tokens"] = tokens_full
        resp["session_stats"] = memory.get_session_stats(session_id)
    
    duration_ms = int((time.perf_counter() - start_time) * 1000)
    # Recupera modello selezionato da config
    try:
        cfg = load_config()
        model_selected = cfg.get('ai_providers', {}).get(x_llm_provider, {}).get('selected_model')
    except Exception:
        model_selected = None
    
    log_usage({
        "ts": datetime.datetime.utcnow().isoformat() + 'Z',
        "provider": x_llm_provider,
        "model": model_selected,
        "topic": topic,
        "session_id": session_id,
        "duration_ms": duration_ms,
        "tokens": tokens_full,
    })
    return resp
