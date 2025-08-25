from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import Optional
from .prompts import load_system_prompt
from .topic_router import detect_topic
from .rag import get_context
from .llm import chat_with_provider, compute_token_stats
from .usage import log_usage
from .admin import load_config

router = APIRouter()

class ChatIn(BaseModel):
    message: str
    sessionId: Optional[str] = None

ADMIN_PASSWORD = "Lagom192."

@router.post("/chat")
async def chat(req: ChatIn, x_llm_provider: Optional[str] = Header(default="local"), x_admin_password: Optional[str] = Header(default=None)):
    user_msg = req.message
    topic = detect_topic(user_msg)
    context = get_context(topic, user_msg)
    system = load_system_prompt()

    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic or 'generale'}]\n{context[:6000]}"},
        {"role": "user", "content": user_msg}
    ]
    import time, datetime
    start_time = time.perf_counter()
    answer = await chat_with_provider(messages, provider=x_llm_provider, context_hint=topic or 'generale')
    # Calcolo token sempre per logging interno
    tokens_full = compute_token_stats(messages, answer)
    resp = {"reply": answer, "topic": topic}
    if x_admin_password == ADMIN_PASSWORD:
        resp["tokens"] = tokens_full
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
        "duration_ms": duration_ms,
        "tokens": tokens_full,
    })
    return resp
