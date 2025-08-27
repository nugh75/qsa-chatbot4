"""
Database models and configuration for QSA Chatbot with encrypted conversations
"""
import sqlite3
import hashlib
import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

DATABASE_PATH = "qsa_chatbot.db"

class DatabaseManager:
    """Gestisce la connessione e le operazioni sul database SQLite"""
    
    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        self.init_database()
    
    @contextmanager
    def get_connection(self):
        """Context manager per gestire connessioni al database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Permette accesso per nome colonna
        try:
            yield conn
        finally:
            conn.close()
    
    def init_database(self):
        """Inizializza il database e crea le tabelle"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Tabella utenti
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    user_key_hash TEXT NOT NULL,
                    escrow_key_encrypted TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1,
                    failed_login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP NULL
                )
            """)
            
            # Tabella conversazioni
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    title_encrypted TEXT NOT NULL,
                    title_hash TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    message_count INTEGER DEFAULT 0,
                    is_deleted BOOLEAN DEFAULT 0,
                    device_id TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            """)
            
            # Tabella messaggi
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    content_encrypted TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    token_count INTEGER DEFAULT 0,
                    processing_time REAL DEFAULT 0,
                    is_deleted BOOLEAN DEFAULT 0,
                    FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
                )
            """)
            
            # Tabella dispositivi utente
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_devices (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    device_name TEXT NOT NULL,
                    device_fingerprint TEXT NOT NULL,
                    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_ip TEXT,
                    user_agent TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            """)
            
            # Tabella azioni amministrative (audit log)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_email TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    target_user_id INTEGER,
                    target_email TEXT,
                    description TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ip_address TEXT,
                    success BOOLEAN DEFAULT 1
                )
            """)
            
            # Indici per performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages (timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_user_id ON user_devices (user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON user_devices (device_fingerprint)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions (timestamp DESC)")

            # Tabella risposte survey anonime (non legata a user_id)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS survey_responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    session_id TEXT, -- identificatore client anonimo per prevenire duplicati semplici
                    q_utilita INTEGER,
                    q_pertinenza INTEGER,
                    q_chiarezza INTEGER,
                    q_dettaglio INTEGER,
                    q_facilita INTEGER,
                    q_velocita INTEGER,
                    q_fiducia INTEGER,
                    q_riflessione INTEGER,
                    q_coinvolgimento INTEGER,
                    q_riuso INTEGER,
                    q_riflessioni TEXT,
                    q_commenti TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_survey_session ON survey_responses (session_id)")
            
            conn.commit()
            print("Database initialized successfully")

# Istanza globale del database manager
db_manager = DatabaseManager()

class UserModel:
    """Modello per gestire gli utenti"""
    
    @staticmethod
    def create_user(email: str, password_hash: str, user_key_hash: str, escrow_key_encrypted: str) -> Optional[int]:
        """Crea un nuovo utente"""
        try:
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted)
                    VALUES (?, ?, ?, ?)
                """, (email, password_hash, user_key_hash, escrow_key_encrypted))
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None  # Email già esistente
    
    @staticmethod
    def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Recupera un utente per email"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        """Recupera un utente per ID"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ? AND is_active = 1", (user_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def update_last_login(user_id: int):
        """Aggiorna timestamp ultimo login"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE users SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0
                WHERE id = ?
            """, (user_id,))
            conn.commit()
    
    @staticmethod
    def increment_failed_login(email: str):
        """Incrementa tentativi di login falliti"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE users SET failed_login_attempts = failed_login_attempts + 1
                WHERE email = ?
            """, (email,))
            conn.commit()

class ConversationModel:
    """Modello per gestire le conversazioni"""
    
    @staticmethod
    def create_conversation(conversation_id: str, user_id: int, title_encrypted: str, device_id: str = None) -> bool:
        """Crea una nuova conversazione"""
        try:
            title_hash = hashlib.sha256(title_encrypted.encode()).hexdigest()
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO conversations (id, user_id, title_encrypted, title_hash, device_id)
                    VALUES (?, ?, ?, ?, ?)
                """, (conversation_id, user_id, title_encrypted, title_hash, device_id))
                conn.commit()
                return True
        except sqlite3.Error:
            return False
    
    @staticmethod
    def get_user_conversations(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
        """Recupera le conversazioni di un utente"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM conversations 
                WHERE user_id = ? AND is_deleted = 0
                ORDER BY updated_at DESC
                LIMIT ?
            """, (user_id, limit))
            return [dict(row) for row in cursor.fetchall()]
    
    @staticmethod
    def get_conversation(conversation_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        """Recupera una conversazione specifica"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM conversations 
                WHERE id = ? AND user_id = ? AND is_deleted = 0
            """, (conversation_id, user_id))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def update_conversation_timestamp(conversation_id: str):
        """Aggiorna timestamp ultima modifica conversazione"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (conversation_id,))
            conn.commit()

class MessageModel:
    """Modello per gestire i messaggi"""
    
    @staticmethod
    def add_message(message_id: str, conversation_id: str, content_encrypted: str, 
                   role: str, token_count: int = 0, processing_time: float = 0) -> bool:
        """Aggiunge un messaggio alla conversazione"""
        try:
            content_hash = hashlib.sha256(content_encrypted.encode()).hexdigest()
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                
                # Inserisci messaggio
                cursor.execute("""
                    INSERT INTO messages (id, conversation_id, content_encrypted, content_hash, 
                                        role, token_count, processing_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (message_id, conversation_id, content_encrypted, content_hash, 
                     role, token_count, processing_time))
                
                # Aggiorna contatore messaggi nella conversazione
                cursor.execute("""
                    UPDATE conversations 
                    SET message_count = message_count + 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (conversation_id,))
                
                conn.commit()
                return True
        except sqlite3.Error:
            return False
    
    @staticmethod
    def get_conversation_messages(conversation_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Recupera i messaggi di una conversazione"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM messages 
                WHERE conversation_id = ? AND is_deleted = 0
                ORDER BY timestamp ASC
                LIMIT ?
            """, (conversation_id, limit))
            return [dict(row) for row in cursor.fetchall()]

class DeviceModel:
    """Modello per gestire i dispositivi utente"""
    
    @staticmethod
    def register_device(device_id: str, user_id: int, device_name: str, 
                       device_fingerprint: str, user_agent: str = None, ip: str = None) -> bool:
        """Registra un nuovo dispositivo"""
        try:
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO user_devices 
                    (id, user_id, device_name, device_fingerprint, user_agent, last_ip)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (device_id, user_id, device_name, device_fingerprint, user_agent, ip))
                conn.commit()
                return True
        except sqlite3.Error:
            return False
    
    @staticmethod
    def get_user_devices(user_id: int) -> List[Dict[str, Any]]:
        """Recupera i dispositivi di un utente"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM user_devices 
                WHERE user_id = ? AND is_active = 1
                ORDER BY last_sync DESC
            """, (user_id,))
            return [dict(row) for row in cursor.fetchall()]

class AdminModel:
    """Modello per azioni amministrative"""
    
    @staticmethod
    def log_admin_action(admin_email: str, action_type: str, target_user_id: int = None,
                        target_email: str = None, description: str = "", 
                        ip_address: str = None, success: bool = True):
        """Registra un'azione amministrativa"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO admin_actions 
                (admin_email, action_type, target_user_id, target_email, description, ip_address, success)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (admin_email, action_type, target_user_id, target_email, description, ip_address, success))
            conn.commit()

class SurveyModel:
    """Modello per risposte del questionario anonimo"""

    FIELDS = [
        'q_utilita','q_pertinenza','q_chiarezza','q_dettaglio','q_facilita','q_velocita',
        'q_fiducia','q_riflessione','q_coinvolgimento','q_riuso'
    ]

    @staticmethod
    def add_response(data: dict) -> bool:
        try:
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cols = [*SurveyModel.FIELDS, 'q_riflessioni','q_commenti','session_id']
                placeholders = ','.join(['?']*len(cols))
                values = [data.get(f) for f in SurveyModel.FIELDS]
                values.append(data.get('q_riflessioni'))
                values.append(data.get('q_commenti'))
                values.append(data.get('session_id'))
                cursor.execute(f"INSERT INTO survey_responses ({','.join(cols)}) VALUES ({placeholders})", values)
                conn.commit()
                return True
        except Exception:
            return False

    @staticmethod
    def get_summary() -> dict:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            summary = {}
            for f in SurveyModel.FIELDS:
                cursor.execute(f"SELECT COUNT({f}) as n, AVG({f}) as avg, MIN({f}) as min, MAX({f}) as max FROM survey_responses WHERE {f} IS NOT NULL")
                row = cursor.fetchone()
                # distribuzione valori 1-5
                cursor.execute(f"SELECT {f} as val, COUNT(*) as c FROM survey_responses WHERE {f} IS NOT NULL GROUP BY {f}")
                dist_rows = cursor.fetchall()
                dist = {i:0 for i in range(1,6)}
                for dr in dist_rows:
                    dist[dr['val']] = dr['c']
                summary[f] = { 'count': row['n'], 'avg': row['avg'], 'min': row['min'], 'max': row['max'], 'distribution': dist }
            cursor.execute("SELECT COUNT(*) as total FROM survey_responses")
            total = cursor.fetchone()['total']
            return { 'total': total, 'questions': summary }

    @staticmethod
    def get_open_answers(limit: int = 500):
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT q_riflessioni, q_commenti, submitted_at FROM survey_responses ORDER BY submitted_at DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                if r['q_riflessioni']:
                    results.append({'type':'riflessioni','text': r['q_riflessioni'], 'submitted_at': r['submitted_at']})
                if r['q_commenti']:
                    results.append({'type':'commenti','text': r['q_commenti'], 'submitted_at': r['submitted_at']})
            return results
