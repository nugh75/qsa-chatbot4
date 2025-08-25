from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import Optional
from .prompts import load_system_prompt
from .topic_router import detect_topic
from .rag import get_context
from .llm import chat_with_provider

router = APIRouter()

class ChatIn(BaseModel):
    message: str
    sessionId: Optional[str] = None

@router.post("/chat")
async def chat(payload: ChatIn, x_llm_provider: Optional[str] = Header(default="local")):
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
    return {"reply": answer, "topic": topic}
