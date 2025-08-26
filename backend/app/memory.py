from typing import Dict, List, Any, Optional
import json
import time
from pathlib import Path

class ConversationMemory:
    """
    Gestisce la memoria delle conversazioni con un buffer limitato.
    Mantiene un numero configurabile di messaggi per ogni sessione.
    """
    
    def __init__(self, max_messages_per_session: int = 10):
        self.max_messages = max_messages_per_session
        self.sessions: Dict[str, List[Dict[str, Any]]] = {}
        self.last_access: Dict[str, float] = {}
        
    def set_max_messages(self, max_messages: int):
        """Aggiorna il limite massimo di messaggi per sessione"""
        self.max_messages = max_messages
        # Applica il nuovo limite alle sessioni esistenti
        for session_id in self.sessions:
            self._trim_session(session_id)
    
    def add_message(self, session_id: str, role: str, content: str, metadata: Optional[Dict] = None):
        """Aggiunge un messaggio alla sessione"""
        if session_id not in self.sessions:
            self.sessions[session_id] = []
        
        message = {
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "metadata": metadata or {}
        }
        
        self.sessions[session_id].append(message)
        self.last_access[session_id] = time.time()
        
        # Mantieni solo gli ultimi N messaggi
        self._trim_session(session_id)
        
        # Periodicamente pulisci la memoria (ogni 100 messaggi)
        if len(self.sessions) > 0 and sum(len(msgs) for msgs in self.sessions.values()) % 100 == 0:
            cleaned_old = self.cleanup_old_sessions(max_idle_hours=6)  # Più aggressivo
            cleaned_excess = self.cleanup_memory_intensive_sessions(max_sessions=30)
            if cleaned_old > 0 or cleaned_excess > 0:
                print(f"Memory cleanup: removed {cleaned_old} old sessions, {cleaned_excess} excess sessions")
    
    def get_conversation_history(self, session_id: str, include_system: bool = False) -> List[Dict[str, str]]:
        """
        Ottiene la cronologia della conversazione per una sessione.
        Restituisce solo role e content per compatibilità con i provider LLM.
        """
        if session_id not in self.sessions:
            return []
        
        messages = self.sessions[session_id]
        
        if not include_system:
            # Filtra i messaggi di sistema se richiesto
            messages = [msg for msg in messages if msg["role"] != "system"]
        
        # Restituisce solo role e content
        return [{"role": msg["role"], "content": msg["content"]} for msg in messages]
    
    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """Ottiene statistiche per una sessione"""
        if session_id not in self.sessions:
            return {"messages": 0, "last_activity": None}
        
        messages = self.sessions[session_id]
        return {
            "messages": len(messages),
            "last_activity": self.last_access.get(session_id),
            "user_messages": len([m for m in messages if m["role"] == "user"]),
            "assistant_messages": len([m for m in messages if m["role"] == "assistant"])
        }
    
    def clear_session(self, session_id: str):
        """Cancella una sessione specifica"""
        if session_id in self.sessions:
            del self.sessions[session_id]
        if session_id in self.last_access:
            del self.last_access[session_id]
    
    def clear_all_sessions(self):
        """Cancella tutte le sessioni"""
        self.sessions.clear()
        self.last_access.clear()
    
    def cleanup_old_sessions(self, max_idle_hours: int = 24):
        """Rimuove sessioni inattive da più di X ore"""
        current_time = time.time()
        cutoff_time = current_time - (max_idle_hours * 3600)
        
        sessions_to_remove = [
            session_id for session_id, last_time in self.last_access.items()
            if last_time < cutoff_time
        ]
        
        for session_id in sessions_to_remove:
            self.clear_session(session_id)
        
        return len(sessions_to_remove)
    
    def cleanup_memory_intensive_sessions(self, max_sessions: int = 50):
        """Limita il numero totale di sessioni per preservare memoria"""
        if len(self.sessions) <= max_sessions:
            return 0
            
        # Ordina per ultimo accesso (meno recenti prima)
        sorted_sessions = sorted(
            self.last_access.items(), 
            key=lambda x: x[1]
        )
        
        # Rimuovi le sessioni più vecchie
        sessions_to_remove = sorted_sessions[:-max_sessions]
        removed_count = 0
        
        for session_id, _ in sessions_to_remove:
            self.clear_session(session_id)
            removed_count += 1
            
        return removed_count
    
    def get_all_sessions_stats(self) -> Dict[str, Any]:
        """Ottiene statistiche globali di tutte le sessioni"""
        total_sessions = len(self.sessions)
        total_messages = sum(len(messages) for messages in self.sessions.values())
        
        active_sessions = [
            session_id for session_id, last_time in self.last_access.items()
            if time.time() - last_time < 3600  # Attive nell'ultima ora
        ]
        
        return {
            "total_sessions": total_sessions,
            "active_sessions": len(active_sessions),
            "total_messages": total_messages,
            "max_messages_per_session": self.max_messages,
            "sessions": {
                session_id: self.get_session_stats(session_id)
                for session_id in self.sessions.keys()
            }
        }
    
    def _trim_session(self, session_id: str):
        """Mantiene solo gli ultimi N messaggi per una sessione"""
        if session_id in self.sessions:
            messages = self.sessions[session_id]
            if len(messages) > self.max_messages:
                # Mantieni gli ultimi max_messages messaggi
                self.sessions[session_id] = messages[-self.max_messages:]

# Istanza globale della memoria
memory = ConversationMemory()

def get_memory() -> ConversationMemory:
    """Ottiene l'istanza globale della memoria delle conversazioni"""
    return memory
