from fastapi import APIRouter, Header, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import hashlib
import re
from .prompts import load_system_prompt, get_system_prompt_by_id
from .personalities import get_personality  # includes temperature & context config
from .topic_router import detect_topic, detect_topics
from .rag import get_context, get_rag_context, format_response_with_citations
from .llm import chat_with_provider, compute_token_stats
from .logging_utils import log_interaction, log_system
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
    x_llm_temperature: Optional[float] = Header(default=None, convert_underscores=False),
    current_user: dict = Depends(get_current_active_user)
):
    import uuid as _uuid
    request_id = f"req_{_uuid.uuid4().hex}"
    user_msg = req.message  # Messaggio in chiaro per LLM
    session_id = req.sessionId or "default"
    conversation_id = req.conversation_id
    frontend_history = req.conversation_history or []
    user_msg_encrypted = req.message_encrypted or user_msg  # Fallback al messaggio in chiaro se non crittografato
    attachments = req.attachments or []

    # Log start request (anche se fallisce dopo)
    try:
        try:
            _cfg = load_config()
            _model_hdr = None
            _prov_hdr = (x_llm_provider or "local").lower()
            if isinstance(_cfg, dict):
                _model_hdr = _cfg.get('ai_providers', {}).get(_prov_hdr, {}).get('selected_model')
        except Exception:
            _model_hdr = None
        log_interaction({
            "event": "chat_start",
            "request_id": request_id,
            "provider_header": (x_llm_provider or "local").lower(),
            "personality_id": x_personality_id,
            "session_id": session_id,
            "conversation_id": conversation_id,
            "user_id": (current_user or {}).get("id") if isinstance(current_user, dict) else None,
            "message_chars": len(user_msg or ""),
            "attachments_count": len(attachments),
            "model": _model_hdr,
        })
    except Exception:
        pass
    try:
        log_system(20, f"REQUEST chat start: id={request_id} provider_hdr={x_llm_provider} personality={x_personality_id} user={getattr(current_user,'id', None) if not isinstance(current_user, dict) else current_user.get('id')} conv={conversation_id} msg_chars={len(user_msg or '')}")
    except Exception:
        pass
    
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
        topics_multi = detect_topics(full_user_message)
        memory.add_message(session_id, "user", full_user_message, {"topic": topic, "topics_multi": topics_multi})
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
    
    # Contesto & topic con filtri personalità (imports already at module level; avoid re-import inside to prevent UnboundLocalError)
    
    # Ottieni informazioni sulla personalità per i filtri
    personality_enabled_topics = None
    personality_enabled_rag_groups = None
    if x_personality_id:
        try:
            p = get_personality(x_personality_id)
            if p:
                personality_enabled_topics = p.get("enabled_pipeline_topics")
                personality_enabled_rag_groups = p.get("enabled_rag_groups")
        except Exception as e:
            print(f"Error getting personality filters: {e}")
    
    topic = detect_topic(user_msg, enabled_topics=personality_enabled_topics)
    # Rileva TUTTI i topic (max_topics=None -> illimitato)
    topics_multi = detect_topics(user_msg, enabled_topics=personality_enabled_topics, max_topics=None)
    # Filtra topic quasi duplicati (Jaccard similarity su set parole >= soglia)
    def _normalize_words(s: str) -> set:
        import re as _re
        return {w for w in _re.findall(r"[a-zA-ZàèéìòùA-Z0-9]+", s.lower()) if len(w) > 2}
    filtered_topics = []
    seen_sets = []
    JACCARD_THRESHOLD = 0.8
    for tinfo in (topics_multi or []):
        nm = tinfo.get('topic')
        if not nm:
            continue
        wset = _normalize_words(nm)
        if not wset:
            filtered_topics.append(tinfo)
            seen_sets.append(wset)
            continue
        duplicate = False
        for sset in seen_sets:
            if not sset:
                continue
            inter = len(wset & sset)
            union = len(wset | sset) or 1
            if inter / union >= JACCARD_THRESHOLD:
                duplicate = True
                break
        if not duplicate:
            filtered_topics.append(tinfo)
            seen_sets.append(wset)
    topics_multi = filtered_topics
    # --- Dynamic context assembly (topics priority + RAG by similarity) ---
    import os as _os
    from .rag import load_files_mapping, load_text
    # Budgets configurabili (token-approx). Fallback a caratteri.
    TOTAL_BUDGET = int(_os.getenv("CONTEXT_TOTAL_BUDGET", "9000"))
    MIN_TOPICS = int(_os.getenv("CONTEXT_MIN_TOPICS_CHARS", "3000"))
    MIN_RAG = int(_os.getenv("CONTEXT_MIN_RAG_CHARS", "2000"))
    # Stima token: approx 4 char per token (euristica media lingua mista)
    def _estimate_tokens(txt: str) -> int:
        return max(1, len(txt)//4)
    # Convert budgets (interpretiamo come caratteri se > 2000 e non ridefiniti da *_TOKENS )
    TOKENS_TOTAL = int(_os.getenv("CONTEXT_TOTAL_TOKENS", str(max(1000, TOTAL_BUDGET//4))))
    TOKENS_MIN_TOPICS = int(_os.getenv("CONTEXT_MIN_TOPICS_TOKENS", str(max(500, MIN_TOPICS//4))))
    TOKENS_MIN_RAG = int(_os.getenv("CONTEXT_MIN_RAG_TOKENS", str(max(300, MIN_RAG//4))))
    # Usare token come baseline; riconvertiamo a caratteri target per fine truncation
    TOTAL_BUDGET = TOKENS_TOTAL * 4
    MIN_TOPICS = TOKENS_MIN_TOPICS * 4
    MIN_RAG = TOKENS_MIN_RAG * 4
    # Safety clamps
    if TOTAL_BUDGET < 3000:
        TOTAL_BUDGET = 3000
    if MIN_TOPICS + MIN_RAG > TOTAL_BUDGET:
        # shrink RAG first
        overflow = (MIN_TOPICS + MIN_RAG) - TOTAL_BUDGET
        reduce_rag = min(overflow, max(0, MIN_RAG - 1000))  # keep at least 1000 for RAG if possible
        MIN_RAG -= reduce_rag
        if MIN_TOPICS + MIN_RAG > TOTAL_BUDGET:
            MIN_TOPICS = max(1000, TOTAL_BUDGET - MIN_RAG)

    # Collect topic raw snippets
    file_map = load_files_mapping()
    topic_snippets: list[tuple[str,str]] = []  # (topic, snippet)
    seen_topics = set()
    for tinfo in (topics_multi or []):
        tname = tinfo.get('topic')
        if not tname or tname in seen_topics:
            continue
        seen_topics.add(tname)
        if tname in file_map:
            try:
                raw_txt = load_text(tname)
                topic_snippets.append((tname, raw_txt))
            except Exception:
                continue
    # Fallback single-topic context if none collected
    if not topic_snippets and topic:
        try:
            raw_txt = load_text(topic)
            topic_snippets.append((topic, raw_txt))
        except Exception:
            pass

    # We also pre-fetch RAG search results (ordered by similarity) for granular budgeting
    rag_search_results = []
    try:
        from .rag_engine import rag_engine
        from .rag_routes import get_user_context as _guc
        selected_groups = _guc(session_id)
        if personality_enabled_rag_groups is not None:
            if selected_groups:
                selected_groups = [g for g in selected_groups if g in personality_enabled_rag_groups]
            else:
                selected_groups = personality_enabled_rag_groups
        if not selected_groups:
            # attempt auto groups (non-invasive; same logic as get_rag_context)
            try:
                all_groups = rag_engine.get_groups()
                selected_groups = [g['id'] for g in all_groups if g.get('document_count')][:5]
            except Exception:
                selected_groups = []
        if selected_groups:
            raw_results = rag_engine.search(query=full_user_message, group_ids=selected_groups, top_k=12) or []
            # sort by similarity_score descending if present
            rag_search_results = sorted(raw_results, key=lambda r: r.get('similarity_score') or 0.0, reverse=True)
    except Exception:
        rag_search_results = []

    # Compose topic section with dynamic allocation
    # Weight topics by (snippet length truncated + length of topic name)
    topic_weights = []
    for name, txt in topic_snippets:
        weight = 1 + min(len(txt), 5000)/5000 + len(name)/20
        topic_weights.append((name, txt, weight))
    total_w = sum(w for _,_,w in topic_weights) or 1
    remaining_budget = TOTAL_BUDGET
    # First assign min budgets
    topic_budget = min(max(MIN_TOPICS, 0), remaining_budget)
    remaining_budget -= topic_budget
    rag_budget = min(max(MIN_RAG, 0), remaining_budget)
    remaining_budget -= rag_budget
    # Distribute leftover: priority topics then rag
    if remaining_budget > 0:
        # 70% leftover to topics, rest to rag
        extra_topics = int(remaining_budget * 0.7)
        topic_budget += extra_topics
        rag_budget += (remaining_budget - extra_topics)

    def _truncate_sentence_boundary(text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        cut = text[:limit]
        # try to end at period or newline
        for sep in ['.\n', '. ', '\n', '! ', '? ']:
            idx = cut.rfind(sep)
            if idx > limit * 0.5:
                return cut[:idx+len(sep)].strip()
        return cut.strip()

    # Build topic context
    topic_sections = []
    for name, txt, w in topic_weights:
        share = int(topic_budget * (w / total_w))
        # bounding per-topic min 300 max 4000
        share = max(300, min(4000, share))
        snippet = _truncate_sentence_boundary(txt, share)
        topic_sections.append(f"[TOPIC: {name}]\n{snippet}")
    topic_context_combined = "\n\n".join(topic_sections)
    if len(topic_context_combined) > topic_budget:
        topic_context_combined = topic_context_combined[:topic_budget]

    # Build RAG context ordered by similarity
    rag_sections = []
    if rag_search_results:
        # weight rag docs by similarity directly
        rag_total_sim = sum((r.get('similarity_score') or 0.0001) for r in rag_search_results) or 1
        for r in rag_search_results:
            sim = r.get('similarity_score') or 0.0001
            share = int(rag_budget * (sim / rag_total_sim))
            share = max(250, min(2500, share))
            content = r.get('content') or ''
            snippet = _truncate_sentence_boundary(content, share)
            fname = r.get('original_filename') or r.get('filename') or 'documento'
            rag_sections.append(f"[RAG Fonte: {fname} sim={sim:.3f}]\n{snippet}")
            if sum(len(s) for s in rag_sections) > rag_budget * 1.3:  # soft cap to stop early
                break
    rag_context_combined = "\n\n".join(rag_sections)
    if len(rag_context_combined) > rag_budget:
        rag_context_combined = rag_context_combined[:rag_budget]

    # Reclaim unused topic space for RAG if rag is truncated severely and topic underused
    unused_topic = max(0, topic_budget - len(topic_context_combined))
    if unused_topic > 500 and rag_search_results:
        rag_extra_allow = min(unused_topic, 2000)
        # try extend each existing rag section a bit if original content longer (skipped for simplicity)
        rag_context_combined = (rag_context_combined + '\n')[:(rag_budget + rag_extra_allow)]

    sections = []
    if topic_context_combined:
        sections.append(f"[SEZIONE TOPICS]\n{topic_context_combined.strip()}")
    if rag_context_combined:
        sections.append(f"[SEZIONE RAG]\n{rag_context_combined.strip()}")
    context = "\n\n".join(sections)[:TOTAL_BUDGET]
    # Provide simple rag_context flag for downstream logic (used in logging)
    rag_context = rag_context_combined if rag_context_combined else ""

    # --- Logging dettagliato regex & contesto ---
    try:
        from .logging_utils import log_interaction as _li, log_system as _ls
        _li({
            "event": "pipeline_context_built",
            "request_id": request_id,
            "topics_detected": topics_multi,
            "topic_primary": topic,
            "topic_files_loaded": [t for t,_ in topic_snippets],
            "topic_budget_chars": topic_budget,
            "rag_budget_chars": rag_budget,
            "total_budget_chars": TOTAL_BUDGET,
            "rag_results_count": len(rag_search_results),
            "rag_used": bool(rag_context),
            "user_message_sample": (user_msg or "")[:180],
        })
        _ls(20, f"CTX req={request_id} topics={','.join([t.get('topic') for t in topics_multi]) if topics_multi else '-'} rag_docs={len(rag_search_results)} budgets(topic/rag/total)={topic_budget}/{rag_budget}/{TOTAL_BUDGET}")
    except Exception:
        pass
        
    # Personality override
    effective_provider = (x_llm_provider or "local").lower()
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
            print(f"Personality load failed: {e}")
    # Log risoluzione provider/modello
    try:
        log_interaction({
            "event": "chat_resolved",
            "request_id": request_id,
            "provider": effective_provider,
            "model": model_override,
            "personality_id": x_personality_id,
            "session_id": session_id,
            "conversation_id": conversation_id,
        })
        log_system(20, f"REQUEST chat resolved: id={request_id} provider={effective_provider} model={model_override or '-'}")
    except Exception:
        pass

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
    # Costruisci descrizione topics per prompt se multi
    if topics_multi:
        topic_names = ", ".join([t['topic'] for t in topics_multi])
        topic_label = f"topics: {topic_names} (dinamico)"
    else:
        topic_label = f"topic: {topic or 'generale'} (dinamico)"

    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento - {topic_label}]\n{context[:6000]}"}
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
    # Determina temperatura: header ha priorità, poi personalità, poi default 0.3
    temp_value = 0.3
    if x_llm_temperature is not None:
        try:
            temp_value = float(x_llm_temperature)
        except Exception:
            pass
    else:
        try:
            if x_personality_id:
                _p = get_personality(x_personality_id)
                if _p and _p.get('temperature') is not None:
                    temp_value = float(_p.get('temperature'))
        except Exception:
            pass
    answer = await chat_with_provider(messages, provider=effective_provider, context_hint=topic or 'generale', model=model_override, temperature=temp_value)
    processing_time = time.perf_counter() - start_time
    
    # Se abbiamo usato RAG, aggiungi citazioni ai file sorgente
    rag_results = None
    if rag_context:
        try:
            # Recupera risultati RAG per le citazioni
            from .rag_engine import rag_engine
            from .rag_routes import get_user_context
            
            selected_groups = get_user_context(session_id)
            if selected_groups:
                # Se l'utente non ha selezionato gruppi ma il contesto RAG è stato creato, effettua fallback auto-select
                if not selected_groups:
                    try:
                        all_groups = rag_engine.get_groups()
                        auto_groups = [g['id'] for g in all_groups if g.get('document_count')]
                        selected_groups = auto_groups[:5]
                        if selected_groups:
                            print(f"[RAG][fallback][non-stream] uso gruppi {selected_groups} per costruire rag_results")
                    except Exception as _ae:
                        print(f"[RAG][fallback][non-stream] errore selezione gruppi: {_ae}")

                search_results = []
                if selected_groups:
                    search_results = rag_engine.search(
                        query=full_user_message,
                        group_ids=selected_groups,
                        top_k=5
                    ) or []
                # Conserva per logging (propaga tutti i campi utili inclusi chunk_label / download_url se presenti)
                rag_results = []
                for r in search_results:
                    rag_results.append({
                        "chunk_id": r.get("chunk_id"),
                        "document_id": r.get("document_id"),
                        "filename": r.get("filename"),
                        "original_filename": r.get("original_filename"),
                        "stored_filename": r.get("stored_filename"),
                        "chunk_index": r.get("chunk_index"),
                        "similarity": r.get("similarity_score"),
                        "preview": (r.get("content") or "")[:200],
                        "content": r.get("content"),
                        "chunk_label": r.get("chunk_label"),
                        "download_url": r.get("download_url") or (f"/api/rag/download/{r.get('document_id')}" if r.get('document_id') else None)
                    })
                print(f"[RAG][non-stream] rag_results={len(rag_results)}")
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
    resp = {"reply": answer, "topic": topic, "topics": [t["topic"] for t in topics_multi] if topics_multi else ([topic] if topic else [])}
    # Sezione fonti compatta: solo ciò che è stato realmente usato
    try:
        sources = {"rag_chunks": [], "pipeline_topics": [], "rag_groups": []}
        if rag_results:
            sources["rag_chunks"] = [
                {
                    "chunk_index": r.get("chunk_index"),
                    "filename": r.get("filename"),
                    "document_id": r.get("document_id"),
                    "stored_filename": r.get("stored_filename"),
                    "similarity": r.get("similarity"),
                    "preview": r.get("preview"),
                    "content": r.get("content"),
                    "chunk_label": r.get("chunk_label"),
                    "download_url": f"/api/rag/download/{r.get('document_id')}" if r.get('document_id') else None
                } for r in rag_results[:10]
            ]
        # Aggiungi tutti i topic rilevati (multi) mantenendo anche quello principale se non già incluso
        topics_for_sources = topics_multi or ([] if not topic else [{"topic": topic, "pattern": "(single_detect)"}])
        # Filtra per personality_enabled_topics se definito
        topics_filtered = [t for t in topics_for_sources if (not personality_enabled_topics or t['topic'] in (personality_enabled_topics or []))]
        seen_topics = set()
        try:
            from .personalities import load_topic_descriptions
            _td = load_topic_descriptions()
        except Exception:
            _td = {}
        for t in topics_filtered:
            nm = t['topic']
            if nm in seen_topics:
                continue
            seen_topics.add(nm)
            descr = _td.get(nm) if isinstance(_td, dict) else None
            sources["pipeline_topics"].append({"name": nm, "description": descr, "pattern": t.get('pattern')})
        try:
            from .rag_routes import get_user_context
            from .rag_engine import rag_engine
            sel_groups = get_user_context(session_id)
            if sel_groups:
                all_groups = {g['id']: g['name'] for g in rag_engine.get_groups()}
                for gid in sel_groups:
                    nm = all_groups.get(gid)
                    if nm:
                        sources["rag_groups"].append({"id": gid, "name": nm})
        except Exception:
            pass
        if any(sources.values()):
            resp['source_docs'] = sources
    except Exception:
        pass
    
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
    # Detailed interaction log (JSONL)
    try:
        interaction = {
            "event": "chat_completion",
            "request_id": request_id,
            "provider": effective_provider,
            "model": model_selected,
            "personality_id": x_personality_id,
            "personality_name": (get_personality(x_personality_id).get("name") if x_personality_id else None),
            "topic": topic,
            "topics_multi": topics_multi,
            # Estrarre anche solo la lista semplice di pattern per analisi rapida (senza duplicare tutta la struttura rag_results)
            "topics_patterns": [t.get('pattern') for t in (topics_multi or [])],
            "conversation_id": conversation_id,
            "session_id": session_id,
            "user_id": (current_user or {}).get("id") if isinstance(current_user, dict) else None,
            "attachments_count": len(attachments),
            "rag_used": bool(rag_context),
            "rag_results": rag_results,
            "duration_ms": duration_ms,
            "tokens": tokens_full,
        }
        log_interaction(interaction)
    except Exception:
        pass
    try:
        from .logging_utils import log_system as _ls
        _ls(20, f"REQUEST chat done: id={request_id} provider={effective_provider} model={model_selected or model_override or '-'} dur={duration_ms}ms")
    except Exception:
        pass
    return resp

@router.post("/chat/stream")
async def chat_stream(
    req: ChatIn,
    x_llm_provider: Optional[str] = Header(default="local"),
    x_personality_id: Optional[str] = Header(default=None),
    x_admin_password: Optional[str] = Header(default=None),
    x_llm_temperature: Optional[float] = Header(default=None, convert_underscores=False),
    current_user: dict = Depends(get_current_active_user)
):
    import uuid as _uuid
    request_id = f"req_{_uuid.uuid4().hex}"
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

    # Log start request stream
    try:
        try:
            _cfg = load_config()
            _model_hdr = None
            if isinstance(_cfg, dict):
                _model_hdr = _cfg.get('ai_providers', {}).get(provider, {}).get('selected_model')
        except Exception:
            _model_hdr = None
        log_interaction({
            "event": "chat_start_stream",
            "request_id": request_id,
            "provider_header": provider,
            "personality_id": x_personality_id,
            "session_id": session_id,
            "conversation_id": conversation_id,
            "user_id": (current_user or {}).get("id") if isinstance(current_user, dict) else None,
            "message_chars": len(user_msg or ""),
            "model": _model_hdr,
        })
        log_system(20, f"REQUEST chat_stream start: id={request_id} provider_hdr={provider} personality={x_personality_id} user={getattr(current_user,'id', None) if not isinstance(current_user, dict) else current_user.get('id')} conv={conversation_id} msg_chars={len(user_msg or '')}")
    except Exception:
        pass

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

    # Contesto & topic con filtri personalità (imports already at module level)
    
    # Ottieni informazioni sulla personalità per i filtri
    personality_enabled_topics = None
    personality_enabled_rag_groups = None
    if x_personality_id:
        try:
            p = get_personality(x_personality_id)
            if p:
                personality_enabled_topics = p.get("enabled_pipeline_topics")
                personality_enabled_rag_groups = p.get("enabled_rag_groups")
        except Exception as e:
            print(f"Error getting personality filters: {e}")
    
    topic = detect_topic(user_msg, enabled_topics=personality_enabled_topics)
    topics_multi = detect_topics(user_msg, enabled_topics=personality_enabled_topics, max_topics=None)
    if not topic:
        topic = 'generale'
    # Costruisci full_user_message coerente col non-stream (allegati non gestiti qui per semplicità futura estensione)
    full_user_message = user_msg
    rag_context = get_rag_context(full_user_message, session_id, personality_enabled_groups=personality_enabled_rag_groups)
    context = rag_context or get_context(topic, user_msg, personality_enabled_groups=personality_enabled_rag_groups)
    # Personality override
    effective_provider = provider
    model_override: Optional[str] = None
    system = load_system_prompt()
    if x_personality_id:
        try:
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
    # Log risoluzione stream
    try:
        log_interaction({
            "event": "chat_resolved_stream",
            "request_id": request_id,
            "provider": effective_provider,
            "model": model_override,
            "personality_id": x_personality_id,
            "session_id": session_id,
            "conversation_id": conversation_id,
        })
        log_system(20, f"REQUEST chat_stream resolved: id={request_id} provider={effective_provider} model={model_override or '-'}")
    except Exception:
        pass

    if use_memory_buffer:
        memory = get_memory()
        memory.add_message(session_id, "user", user_msg, {"topic": topic})
        conversation_history = memory.get_conversation_history(session_id)
    else:
        conversation_history = frontend_history

    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic}]\n{context[:6000]}"}
    ] + conversation_history
    if not any(m.get('role') == 'user' and m.get('content') == user_msg for m in conversation_history):
        messages.append({"role": "user", "content": user_msg})

    start_time = asyncio.get_event_loop().time()
    answer_accum = []  # parti accumulate
    rag_results = []

    # Pre-calcola temperatura effettiva
    temp_value = 0.3
    if x_llm_temperature is not None:
        try:
            temp_value = float(x_llm_temperature)
        except Exception:
            pass
    else:
        try:
            if x_personality_id:
                _p = get_personality(x_personality_id)
                if _p and _p.get('temperature') is not None:
                    temp_value = float(_p.get('temperature'))
        except Exception:
            pass

    async def event_generator():
        nonlocal answer_accum, rag_results, topic
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
                # Pre-raccolta RAG risultati (anche se risposta poi fallisce) e invio meta iniziale
                from .llm import chat_with_provider, compute_token_stats
                import json as _json_local
                # Se RAG attivo, raccogli anche i top chunk per logging
                if rag_context:
                    try:
                        from .rag_engine import rag_engine
                        from .rag_routes import get_user_context as _get_uc
                        sel_groups = _get_uc(session_id)
                        # Fallback auto-select se vuoto
                        if not sel_groups:
                            try:
                                all_groups = rag_engine.get_groups()
                                sel_groups = [g['id'] for g in all_groups if g.get('document_count')][:5]
                                if sel_groups:
                                    print(f"[RAG][fallback][stream] uso gruppi {sel_groups}")
                            except Exception as _se:
                                print(f"[RAG][fallback][stream] errore selezione gruppi: {_se}")
                        _sr = []
                        if sel_groups:
                            _sr = rag_engine.search(query=full_user_message, group_ids=sel_groups, top_k=5) or []
                        rag_results = []
                        for r in _sr:
                            rag_results.append({
                                "chunk_id": r.get("chunk_id"),
                                "document_id": r.get("document_id"),
                                "filename": r.get("filename"),
                                "original_filename": r.get("original_filename"),
                                "stored_filename": r.get("stored_filename"),
                                "chunk_index": r.get("chunk_index"),
                                "similarity": r.get("similarity_score"),
                                "preview": (r.get("content") or "")[:200],
                                "content": r.get("content"),
                                "chunk_label": r.get("chunk_label"),
                                "download_url": r.get("download_url") or (f"/api/rag/download/{r.get('document_id')}" if r.get('document_id') else None)
                            })
                        try:
                            rag_results.sort(key=lambda x: x.get('similarity') or 0, reverse=True)
                        except Exception:
                            pass
                        print(f"[RAG][stream] rag_results={len(rag_results)}")
                    except Exception as _re:
                        print(f"[RAG][stream] errore recupero rag_results: {_re}")
                        rag_results = []
                # Invia meta iniziale con source_docs
                try:
                    from .personalities import load_topic_descriptions as _ltd
                    _td2 = _ltd()
                    sources = {"rag_chunks": [], "pipeline_topics": [], "rag_groups": []}
                    if rag_results:
                        sources["rag_chunks"] = [
                            {
                                "chunk_id": r.get("chunk_id"),
                                "document_id": r.get("document_id"),
                                "chunk_index": r.get("chunk_index"),
                                "filename": r.get("original_filename") or r.get("filename"),
                                "stored_filename": r.get("stored_filename"),
                                "similarity": r.get("similarity"),
                                "preview": r.get("preview"),
                                "content": r.get("content"),
                                "chunk_label": r.get("chunk_label"),
                                "download_url": r.get("download_url")
                            } for r in rag_results[:10]
                        ]
                    # Inserisci multi-topic
                    topics_for_sources = topics_multi or ([] if not topic else [{"topic": topic, "pattern": "(single_detect)"}])
                    try:
                        descr_map = _td2 if isinstance(_td2, dict) else {}
                    except Exception:
                        descr_map = {}
                    seen_mt = set()
                    for t in topics_for_sources:
                        nm = t['topic']
                        if nm in seen_mt:
                            continue
                        seen_mt.add(nm)
                        descr = descr_map.get(nm)
                        sources["pipeline_topics"].append({"name": nm, "description": descr, "pattern": t.get('pattern')})
                    try:
                        from .rag_routes import get_user_context
                        all_groups = {g['id']: g['name'] for g in rag_engine.get_groups()}
                        sel_groups2 = get_user_context(session_id)
                        if sel_groups2:
                            for gid in sel_groups2:
                                nm = all_groups.get(gid)
                                if nm:
                                    sources["rag_groups"].append({"id": gid, "name": nm})
                    except Exception:
                        pass
                    meta_evt = {"meta": True, "topic": topic, "source_docs": sources if any(sources.values()) else None}
                    yield f"data: {_json_local.dumps(meta_evt)}\n\n"
                except Exception:
                    pass
                # Ottiene risposta completa e la spezza in chunk simulati
                full = await chat_with_provider(messages, provider=effective_provider, context_hint=topic or 'generale', model=model_override, temperature=temp_value)
                # Inserisci citazioni/links se abbiamo risultati RAG
                if rag_results:
                    try:
                        from .rag import format_response_with_citations
                        # format_response_with_citations richiede search_results stile rag_engine.search
                        # rag_results già possiede filename, document_id, chunk_index, similarity
                        full = format_response_with_citations(full, rag_results)
                    except Exception as _fe:
                        print(f"[stream][citations] fallita iniezione citazioni: {_fe}")
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
                # Detailed interaction log (JSONL)
                try:
                    log_interaction({
                        "event": "chat_completion_stream",
                        "request_id": request_id,
                        "provider": effective_provider,
                        "model": model_selected,
                        "personality_id": x_personality_id,
                        "personality_name": (get_personality(x_personality_id).get("name") if x_personality_id else None),
                        "topic": topic,
                        "topics_patterns": [t.get('pattern') for t in (topics_multi or [])],
                        "conversation_id": conversation_id,
                        "session_id": session_id,
                        "user_id": (current_user or {}).get("id") if isinstance(current_user, dict) else None,
                        "attachments_count": len(attachments),
                        "rag_used": bool(rag_context),
                        "rag_results": rag_results,
                        "duration_ms": duration_ms,
                        "tokens": tokens_full,
                    })
                except Exception:
                    pass
            try:
                import json as _json_final
                # Includi metadati finali (topic e rag_results) nell'evento conclusivo
                # Aggiungi pipeline topics e rag group names anche nell'evento finale
                from .personalities import load_topic_descriptions as _ltd3
                _td3 = _ltd3()
                sources_final = {"rag_chunks": [], "pipeline_topics": [], "rag_groups": []}
                if rag_results:
                    sources_final["rag_chunks"] = [
                        {
                            "chunk_id": r.get("chunk_id"),
                            "document_id": r.get("document_id"),
                            "chunk_index": r.get("chunk_index"),
                            "filename": r.get("original_filename") or r.get("filename"),
                            "stored_filename": r.get("stored_filename"),
                            "similarity": r.get("similarity"),
                            "preview": r.get("preview"),
                            "content": r.get("content"),
                            "chunk_label": r.get("chunk_label"),
                            "download_url": r.get("download_url")
                        } for r in rag_results[:10]
                    ]
                topics_for_sources2 = topics_multi or ([] if not topic else [{"topic": topic, "pattern": "(single_detect)"}])
                try:
                    descr_map2 = _td3 if isinstance(_td3, dict) else {}
                except Exception:
                    descr_map2 = {}
                seen_mt2 = set()
                for t in topics_for_sources2:
                    nm = t['topic']
                    if nm in seen_mt2:
                        continue
                    seen_mt2.add(nm)
                    descr = descr_map2.get(nm)
                    sources_final["pipeline_topics"].append({"name": nm, "description": descr, "pattern": t.get('pattern')})
                try:
                    from .rag_routes import get_user_context
                    all_groups = {g['id']: g['name'] for g in rag_engine.get_groups()}
                    sel_groups3 = get_user_context(session_id)
                    if sel_groups3:
                        for gid in sel_groups3:
                            nm = all_groups.get(gid)
                            if nm:
                                sources_final["rag_groups"].append({"id": gid, "name": nm})
                except Exception:
                    pass
                meta = {"done": True, "reply": full_answer, "topic": topic, "topics": [t['topic'] for t in topics_multi] if topics_multi else ([topic] if topic else []), "source_docs": sources_final if any(sources_final.values()) else None}
                yield f"data: {_json_final.dumps(meta)}\n\n"
            except Exception:
                yield "data: {\"done\":true}\n\n"
            try:
                from .logging_utils import log_system as _ls
                _ls(20, f"REQUEST chat_stream done: id={request_id} provider={effective_provider} model={model_selected or model_override or '-'} dur={duration_ms}ms")
            except Exception:
                pass

    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }
    return StreamingResponse(event_generator(), headers=headers)
