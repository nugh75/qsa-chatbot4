from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import Optional
from .prompts import load_system_prompt
from .topic_router import detect_topic
from .rag import get_context
from .llm import chat_with_provider, compute_token_stats

router = APIRouter()

class ChatIn(BaseModel):
    message: str
    sessionId: Optional[str] = None

ADMIN_PASSWORD = "Lagom192."

@router.post("/chat")
async def chat(payload: ChatIn, x_llm_provider: Optional[str] = Header(default="local"), x_admin_password: Optional[str] = Header(default=None)):
    user_msg = payload.message
    topic = detect_topic(user_msg)
    context = get_context(topic, user_msg)
    system = load_system_prompt()

    messages = [
        {"role": "system", "content": system},
        {"role": "system", "content": f"[Materiali di riferimento per il topic: {topic or 'generale'}]\n{context[:6000]}"},
        {"role": "user", "content": user_msg}
    ]
    answer = await chat_with_provider(messages, provider=x_llm_provider, context_hint=topic or 'generale')
    resp = {"reply": answer, "topic": topic}
    if x_admin_password == ADMIN_PASSWORD:
        resp["tokens"] = compute_token_stats(messages, answer)
    return resp
