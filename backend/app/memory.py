from pathlib import Path
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

MEMORY_DIR = Path(__file__).resolve().parent.parent / "memory"

def ensure_memory_dir():
    """Crea la directory memory se non esiste"""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)

def get_session_file(session_id: str) -> Path:
    """Ottieni il percorso del file per una sessione"""
    ensure_memory_dir()
    # Sanitize session_id per sicurezza
    safe_session_id = "".join(c for c in session_id if c.isalnum() or c in "._-")[:50]
    return MEMORY_DIR / f"session_{safe_session_id}.json"

def load_conversation_history(session_id: str) -> List[Dict[str, Any]]:
    """Carica lo storico della conversazione per una sessione"""
    session_file = get_session_file(session_id)
    if not session_file.exists():
        return []
    
    try:
        with open(session_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('messages', [])
    except Exception:
        return []

def save_conversation_history(session_id: str, messages: List[Dict[str, Any]]):
    """Salva lo storico della conversazione per una sessione"""
    session_file = get_session_file(session_id)
    
    data = {
        'session_id': session_id,
        'messages': messages,
        'last_updated': datetime.utcnow().isoformat() + 'Z'
    }
    
    try:
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def add_message_to_conversation(session_id: str, message: Dict[str, Any], max_buffer_size: int = 10):
    """Aggiungi un messaggio alla conversazione e mantieni solo gli ultimi max_buffer_size messaggi"""
    messages = load_conversation_history(session_id)
    
    # Aggiungi timestamp se non presente
    if 'timestamp' not in message:
        message['timestamp'] = datetime.utcnow().isoformat() + 'Z'
    
    messages.append(message)
    
    # Mantieni solo gli ultimi messaggi (escludendo il system prompt)
    # Contiamo solo user/assistant, non system
    user_assistant_messages = [m for m in messages if m.get('role') in ['user', 'assistant']]
    if len(user_assistant_messages) > max_buffer_size:
        # Rimuovi i messaggi più vecchi
        excess = len(user_assistant_messages) - max_buffer_size
        # Trova gli indici dei messaggi da rimuovere
        to_remove = []
        count = 0
        for i, msg in enumerate(messages):
            if msg.get('role') in ['user', 'assistant']:
                if count < excess:
                    to_remove.append(i)
                    count += 1
                else:
                    break
        
        # Rimuovi in ordine inverso per non alterare gli indici
        for i in reversed(to_remove):
            messages.pop(i)
    
    save_conversation_history(session_id, messages)
    return messages

def clear_session_history(session_id: str):
    """Cancella lo storico di una sessione"""
    session_file = get_session_file(session_id)
    try:
        if session_file.exists():
            session_file.unlink()
    except Exception:
        pass

def get_conversation_for_llm(session_id: str, system_prompt: str, context: str, max_buffer_size: int = 10) -> List[Dict[str, str]]:
    """Ottieni la conversazione formattata per l'LLM con system prompt, contesto e storico"""
    messages = load_conversation_history(session_id)
    
    # Filtra solo user/assistant e limita
    user_assistant_messages = [m for m in messages if m.get('role') in ['user', 'assistant']]
    if len(user_assistant_messages) > max_buffer_size:
        user_assistant_messages = user_assistant_messages[-max_buffer_size:]
    
    # Costruisci il prompt per l'LLM
    llm_messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    if context.strip():
        llm_messages.append({"role": "system", "content": f"[Materiali di riferimento]\n{context[:6000]}"})
    
    # Aggiungi lo storico
    for msg in user_assistant_messages:
        llm_messages.append({
            "role": msg.get('role', 'user'),
            "content": msg.get('content', '')
        })
    
    return llm_messages
