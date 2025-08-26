from fastapi import APIRouter, Header, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import hashlib
import re
from .prompts import load_system_prompt
from .topic_router import detect_topic
from .rag import get_context, get_rag_context, format_response_with_citations
from .llm import chat_with_provider, compute_token_stats
from .usage import log_usage
from .admin import load_config
from .memory import get_memory
from .auth import get_current_active_user
from .database import db_manager, MessageModel

router = APIRouter()

class FileAttachment(BaseModel):
    id: str
    filename: str
    file_type: str
    content: Optional[str] = None  # Extracted text
    base64_data: Optional[str] = None  # For images

class ChatIn(BaseModel):
    message: str  # Messaggio in chiaro per elaborazione LLM
    sessionId: Optional[str] = None
    conversation_id: Optional[str] = None
    conversation_history: Optional[list] = None  # Cronologia dal frontend per conversazioni crittografate
    message_encrypted: Optional[str] = None  # Messaggio crittografato per salvataggio database
    attachments: Optional[List[FileAttachment]] = None  # File allegati

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
    user_msg = req.message  # Messaggio in chiaro per LLM
    session_id = req.sessionId or "default"
    conversation_id = req.conversation_id
    frontend_history = req.conversation_history or []
    user_msg_encrypted = req.message_encrypted or user_msg  # Fallback al messaggio in chiaro se non crittografato
    attachments = req.attachments or []
    
    # Processa gli allegati per aggiungere il contenuto al messaggio
    attachment_content = ""
    if attachments:
        print(f"📎 Processing {len(attachments)} attachments")
        for attachment in attachments:
            if attachment.content:  # Testo estratto da PDF/Word
                attachment_content += f"\n\n[Contenuto di {attachment.filename}]:\n{attachment.content}"
            elif attachment.base64_data and attachment.file_type in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']:
                # Per le immagini, aggiungiamo una nota che l'immagine è allegata
                attachment_content += f"\n\n[Immagine allegata: {attachment.filename}]"
    
    # Combina messaggio utente con contenuto allegati
    full_user_message = user_msg + attachment_content
    
    # Ottieni l'istanza della memoria solo se NON c'è conversation_id
    # Se c'è conversation_id usiamo solo il database per evitare conflitti
    use_memory_buffer = conversation_id is None
    
    if use_memory_buffer:
        memory = get_memory()
        # Aggiungi il messaggio dell'utente alla memoria (con allegati)
        topic = detect_topic(full_user_message)
        memory.add_message(session_id, "user", full_user_message, {"topic": topic})
    else:
        topic = detect_topic(full_user_message)
    
    # Se abbiamo un conversation_id, salva nel database
    if conversation_id and current_user:
        try:
            # Genera ID unico per il messaggio utente
            import uuid
            user_message_id = f"msg_{uuid.uuid4().hex}"
            
            # Salva messaggio utente usando MessageModel
            # Usa la versione crittografata per il database
            success = MessageModel.add_message(
                message_id=user_message_id,
                conversation_id=conversation_id,
                content_encrypted=user_msg_encrypted,  # Versione crittografata per database
                role="user",
                token_count=0,
                processing_time=0.0
            )
            
            if not success:
                print(f"Warning: Failed to save user message to database")
                
        except Exception as e:
            print(f"Error saving user message: {e}")
    
    # Ottieni il contesto RAG con ricerca semantica avanzata
    rag_context = get_rag_context(full_user_message, session_id)
    
    # Fallback al sistema legacy se RAG non trova nulla
    if not rag_context:
        context = get_context(topic, user_msg)
    else:
        context = rag_context
        
    system = load_system_prompt()

    # Costruisci la cronologia della conversazione
    if use_memory_buffer:
        # Usa memoria in-memory per sessioni temporanee
        conversation_history = memory.get_conversation_history(session_id)
    else:
        # Per conversazioni persistenti con crittografia client-side,
        # usa la cronologia fornita dal frontend (già decrittata)
        conversation_history = frontend_history
        print(f"Using persistent conversation {conversation_id}, frontend provided {len(conversation_history)} history messages")
    
    # Prepara i messaggi per il provider LLM
    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic or 'generale'}]\n{context[:6000]}"}
    ]
    
    # Aggiungi la cronologia della conversazione
    messages.extend(conversation_history)
    
    # Se non c'è cronologia, aggiungi il messaggio corrente (con allegati)
    if not any(msg["role"] == "user" and msg["content"] == full_user_message for msg in conversation_history):
        # Prepara il messaggio per l'LLM includendo immagini se presenti
        user_message_for_llm = {"role": "user", "content": full_user_message}
        
        # Per modelli che supportano immagini (come Claude, GPT-4V), aggiungi le immagini
        if attachments and x_llm_provider in ['anthropic', 'openai']:
            image_attachments = [att for att in attachments if att.base64_data and att.file_type in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']]
            if image_attachments:
                # Formato per modelli che supportano immagini
                user_message_for_llm["images"] = [
                    {
                        "type": "image",
                        "data": att.base64_data,
                        "filename": att.filename
                    } for att in image_attachments
                ]
        
        messages.append(user_message_for_llm)
    
    import time, datetime
    start_time = time.perf_counter()
    answer = await chat_with_provider(messages, provider=x_llm_provider, context_hint=topic or 'generale')
    processing_time = time.perf_counter() - start_time
    
    # Se abbiamo usato RAG, aggiungi citazioni ai file sorgente
    if rag_context:
        try:
            # Recupera risultati RAG per le citazioni
            from .rag_engine import rag_engine
            from .rag_routes import get_user_context
            
            selected_groups = get_user_context(session_id)
            if selected_groups:
                search_results = rag_engine.search(
                    query=full_user_message,
                    group_ids=selected_groups,
                    top_k=5
                )
                answer = format_response_with_citations(answer, search_results)
        except Exception as e:
            print(f"Errore nell'aggiunta citazioni: {e}")
            # Continua senza citazioni se c'è un errore
    
    # Aggiungi la risposta alla memoria appropriata
    if use_memory_buffer:
        memory.add_message(session_id, "assistant", answer, {"topic": topic, "provider": x_llm_provider})
    
    # Salva sempre nel database se abbiamo conversation_id
    if conversation_id and current_user:
        try:
            # Genera ID unico per il messaggio assistente
            assistant_message_id = f"msg_{uuid.uuid4().hex}"
            
            # Calcola token per statistiche
            tokens_stats = compute_token_stats(messages, answer)
            token_count = tokens_stats.get('total_tokens', 0)
            
            # Salva messaggio assistente - IMPORTANTE: salviamo in chiaro per ora 
            # ma aggiungeremo crittografia server-side in futuro
            success = MessageModel.add_message(
                message_id=assistant_message_id,
                conversation_id=conversation_id,
                content_encrypted=answer,  # TODO: Implementare crittografia server-side
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
        if use_memory_buffer:
            resp["session_stats"] = memory.get_session_stats(session_id)
        else:
            # Statistiche dal database per conversazioni persistenti
            try:
                messages_count = len(MessageModel.get_conversation_messages(conversation_id, limit=1000))
                resp["session_stats"] = {
                    "messages": messages_count,
                    "conversation_id": conversation_id,
                    "storage": "database"
                }
            except Exception:
                resp["session_stats"] = {"storage": "database", "error": "Could not retrieve stats"}
    
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
