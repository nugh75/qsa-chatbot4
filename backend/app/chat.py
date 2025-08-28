from fastapi import APIRouter, Header, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import hashlib
import re
from .prompts import load_system_prompt, get_system_prompt_by_id
from .personalities import get_personality
from .topic_router import detect_topic
from .rag import get_context, get_rag_context, format_response_with_citations
from .llm import chat_with_provider, compute_token_stats
from .usage import log_usage
from .admin import load_config
from .memory import get_memory
from .auth import get_current_active_user
from .database import db_manager, MessageModel
from fastapi.responses import StreamingResponse
import asyncio

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
    x_personality_id: Optional[str] = Header(default=None),
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
        
    # Personality override
    effective_provider = (x_llm_provider or "local").lower()
    model_override: Optional[str] = None
    system = load_system_prompt()
    if x_personality_id:
        try:
            p = get_personality(x_personality_id)
            if p:
                if p.get("system_prompt_id"):
                    system = get_system_prompt_by_id(p["system_prompt_id"]) or system
                if p.get("provider"):
                    effective_provider = p["provider"].lower()
                if p.get("model"):
                    model_override = p["model"]
        except Exception as e:
            print(f"Personality load failed: {e}")

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
    answer = await chat_with_provider(messages, provider=effective_provider, context_hint=topic or 'generale', model=model_override)
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
        model_selected = model_override or cfg.get('ai_providers', {}).get(effective_provider, {}).get('selected_model')
    except Exception:
        model_selected = None
    
    log_usage({
        "ts": datetime.datetime.utcnow().isoformat() + 'Z',
        "provider": effective_provider,
        "model": model_selected,
        "topic": topic,
        "session_id": session_id,
        "duration_ms": duration_ms,
        "tokens": tokens_full,
    })
    return resp

@router.post("/chat/stream")
async def chat_stream(
    req: ChatIn,
    x_llm_provider: Optional[str] = Header(default="local"),
    x_personality_id: Optional[str] = Header(default=None),
    x_admin_password: Optional[str] = Header(default=None),
    current_user: dict = Depends(get_current_active_user)
):
    """Endpoint streaming (SSE-like) che invia la risposta incrementale.
    Formato eventi: linee 'data: {"delta":"..."}\n\n' e finale 'data: {"done":true,"reply":"FULL"}\n\n'"""

    provider = (x_llm_provider or 'local').lower()
    user_msg = req.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Messaggio vuoto")

    session_id = req.sessionId or "default"
    conversation_id = req.conversation_id
    frontend_history = req.conversation_history or []
    attachments = req.attachments or []
    use_memory_buffer = conversation_id is None

    # Salvataggio messaggio utente (come nell'endpoint non streaming)
    if conversation_id and current_user:
        try:
            import uuid
            user_message_id = f"msg_{uuid.uuid4().hex}"
            success = MessageModel.add_message(
                message_id=user_message_id,
                conversation_id=conversation_id,
                content_encrypted=req.message_encrypted or user_msg,
                role="user",
                token_count=0,
                processing_time=0.0
            )
            if not success:
                print("Warning: Failed to save user message to database (stream)")
        except Exception as e:
            print(f"Error saving user message (stream): {e}")

    # Contesto & topic
    from .topic_router import detect_topic
    from .rag import get_context, get_rag_context
    topic = detect_topic(user_msg)
    rag_context = get_rag_context(user_msg, session_id)
    context = rag_context or get_context(topic, user_msg)
    # Personality override
    effective_provider = provider
    model_override: Optional[str] = None
    system = load_system_prompt()
    if x_personality_id:
        try:
            from .personalities import get_personality
            from .prompts import get_system_prompt_by_id
            p = get_personality(x_personality_id)
            if p:
                if p.get("system_prompt_id"):
                    system = get_system_prompt_by_id(p["system_prompt_id"]) or system
                if p.get("provider"):
                    effective_provider = p["provider"].lower()
                if p.get("model"):
                    model_override = p["model"]
        except Exception as e:
            print(f"Personality load failed (stream): {e}")

    if use_memory_buffer:
        memory = get_memory()
        memory.add_message(session_id, "user", user_msg, {"topic": topic})
        conversation_history = memory.get_conversation_history(session_id)
    else:
        conversation_history = frontend_history

    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic or 'generale'}]\n{context[:6000]}"}
    ] + conversation_history
    if not any(m.get('role') == 'user' and m.get('content') == user_msg for m in conversation_history):
        messages.append({"role": "user", "content": user_msg})

    start_time = asyncio.get_event_loop().time()
    answer_accum = []  # parti accumulate

    async def event_generator():
        nonlocal answer_accum
        try:
            if provider == 'ollama':
                # Streaming reale da Ollama
                import httpx, json as _json, os as _os
                base_url = _os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
                model_env = _os.getenv('OLLAMA_MODEL')
                if not model_env:
                    try:
                        from .admin import load_config as _load_cfg  # type: ignore
                        cfg = _load_cfg()
                        model_env = cfg.get('ai_providers', {}).get('ollama', {}).get('selected_model') or 'llama3.1:8b'
                    except Exception:
                        model_env = 'llama3.1:8b'
                payload = {
                    "model": model_env,
                    "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
                    "stream": True,
                    "options": {"temperature": 0.3, "top_p": 0.9}
                }
                async with httpx.AsyncClient(timeout=None) as cx:
                    async with cx.stream('POST', f"{base_url}/api/chat", json=payload) as resp:
                        async for line in resp.aiter_lines():
                            if not line:
                                continue
                            try:
                                data = _json.loads(line)
                            except Exception:
                                continue
                            msg_part = (data.get('message') or {}).get('content')
                            if msg_part:
                                answer_accum.append(msg_part)
                                yield f"data: {{\"delta\":{_json.dumps(msg_part)} }}\n\n"
                            if data.get('done'):
                                break
            else:
                # Ottiene risposta completa e la spezza in chunk simulati
                from .llm import chat_with_provider, compute_token_stats
                import json as _json_local
                full = await chat_with_provider(messages, provider=effective_provider, context_hint=topic or 'generale', model=model_override)
                # Spezza per frasi o blocchi ~40 char
                import re
                parts = re.findall(r'.{1,60}(?:\s|$)', full)
                for p in parts:
                    answer_accum.append(p)
                    yield f"data: {{\"delta\":{_json_local.dumps(p)} }}\n\n"
                    await asyncio.sleep(0.02)
        except Exception as e:
            err = f"Errore streaming: {e}"
            print(err)
            try:
                import json as _json_err
                yield f"data: {{\"error\":{_json_err.dumps(str(e))}}}\n\n"
            except Exception:
                yield "data: {\"error\":\"stream error\"}\n\n"
        finally:
            # Evento finale
            full_answer = ''.join(answer_accum).strip()
            # Salvataggio nel memory buffer e DB + logging
            try:
                from .llm import compute_token_stats
                tokens_full = compute_token_stats(messages, full_answer)
            except Exception:
                tokens_full = {}

            duration_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)

            if full_answer:
                if use_memory_buffer:
                    try:
                        memory.add_message(session_id, 'assistant', full_answer, {"topic": topic, "provider": provider})
                    except Exception:
                        pass
                if conversation_id and current_user:
                    try:
                        import uuid
                        assistant_message_id = f"msg_{uuid.uuid4().hex}"
                        success = MessageModel.add_message(
                            message_id=assistant_message_id,
                            conversation_id=conversation_id,
                            content_encrypted=full_answer,
                            role='assistant',
                            token_count=tokens_full.get('total', 0),
                            processing_time=duration_ms/1000.0
                        )
                        if not success:
                            print("Warning: failed to save assistant message (stream)")
                    except Exception as e:
                        print(f"Error saving assistant message (stream): {e}")
                # Logging usage
                try:
                    cfg = load_config()
                    model_selected = model_override or cfg.get('ai_providers', {}).get(effective_provider, {}).get('selected_model')
                except Exception:
                    model_selected = None
                try:
                    log_usage({
                        "ts": __import__('datetime').datetime.utcnow().isoformat() + 'Z',
                        "provider": effective_provider,
                        "model": model_selected,
                        "topic": topic,
                        "session_id": session_id,
                        "duration_ms": duration_ms,
                        "tokens": tokens_full,
                    })
                except Exception:
                    pass
            try:
                import json as _json_final
                yield f"data: {{\"done\":true,\"reply\":{_json_final.dumps(full_answer)} }}\n\n"
            except Exception:
                yield "data: {\"done\":true}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }
    return StreamingResponse(event_generator(), headers=headers)
