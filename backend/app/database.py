"""Database layer with dynamic backend (SQLite default, optional PostgreSQL via DATABASE_URL).

Se la variabile d'ambiente `DATABASE_URL` è impostata (formato postgresql://), userà psycopg2.
Altrimenti mantiene il comportamento SQLite esistente.

NOTE: Le query originali usavano placeholder `?` (stile SQLite). Per compatibilità rapida
quando è attivo Postgres vengono convertiti in `%s`. Le differenze di schema (AUTOINCREMENT,
CURRENT_TIMESTAMP, BOOLEAN) sono gestite creando uno schema compatibile in Postgres se mancano le tabelle.

Per migrazione schema vedi `postgres_migration.md`. Questa implementazione NON tenta di alterare tabelle
già esistenti in Postgres: assume che la migrazione sia stata eseguita. Se il DB è vuoto, crea lo schema base.
"""
import sqlite3
import hashlib
import os
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
import math
from pathlib import Path
from contextlib import contextmanager

# Rileva se usare Postgres
DATABASE_URL = os.getenv("DATABASE_URL")
USING_POSTGRES = bool(DATABASE_URL and DATABASE_URL.startswith("postgres"))
if USING_POSTGRES:
    try:
        import psycopg2  # type: ignore
        import psycopg2.extras  # type: ignore
    except Exception as _e:
        print(f"[DB] psycopg2 non disponibile ({_e}), fallback a SQLite")
        USING_POSTGRES = False

# Configura il percorso del database nella nuova struttura
BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = str(BASE_DIR / "storage" / "databases" / "qsa_chatbot.db")

class DatabaseManager:
    """Gestisce la connessione e le operazioni sul database (SQLite default, Postgres opzionale)."""

    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        if not USING_POSTGRES:
            try:
                Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                print(f"[DB] Warning: cannot create database directory: {e}")
        self.init_database()

    @contextmanager
    def get_connection(self):
        if USING_POSTGRES:
            # Use DictCursor so rows behave like sqlite3.Row (mapping-like)
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)  # type: ignore
            try:
                yield conn
            finally:
                conn.close()
        else:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
            finally:
                conn.close()
    
    def adapt_sql(self, sql: str) -> str:
        """Converte placeholder '?' in '%s' per Postgres se necessario."""
        if USING_POSTGRES:
            # Placeholder conversion
            sql = sql.replace('?', '%s')
            # Boolean field normalization: SQLite used 0/1, Postgres wants TRUE/FALSE
            # Simple regex replacements (word boundary)
            sql = re.sub(r'\bis_active\s*=\s*1\b', 'is_active IS TRUE', sql)
            sql = re.sub(r'\bis_active\s*=\s*0\b', 'is_active IS FALSE', sql)
            sql = re.sub(r'\bis_deleted\s*=\s*1\b', 'is_deleted IS TRUE', sql)
            sql = re.sub(r'\bis_deleted\s*=\s*0\b', 'is_deleted IS FALSE', sql)
            sql = re.sub(r'\barchived\s*=\s*1\b', 'archived IS TRUE', sql)
            sql = re.sub(r'\barchived\s*=\s*0\b', 'archived IS FALSE', sql)
            return sql
        return sql

    def exec(self, cursor, sql: str, params=()):
        cursor.execute(self.adapt_sql(sql), params)

    def init_database(self):
        """Inizializza il database e crea le tabelle.

        - SQLite: crea lo schema completo come in precedenza.
        - Postgres: applica in modo idempotente lo schema core e le tabelle accessorie
          se il DB è fresco (assenza tabella users) o mancano tabelle note.
        """
        if USING_POSTGRES:
            # Best-effort: se DB vuoto o mancano tabelle core, applica DDL idempotenti forniti negli script.
            try:
                from pathlib import Path as _P
                schema_dir = _P(__file__).resolve().parent / 'scripts'
                core_sql = (schema_dir / 'postgres_core_schema.sql')
                extra_sql = (schema_dir / 'postgres_create_missing.sql')
                with self.get_connection() as conn:
                    cur = conn.cursor()
                    # Check present tables
                    self.exec(cur, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
                    present = {r[0] for r in cur.fetchall()}
                    need_core = any(t not in present for t in {'users','conversations','messages'})
                    ran_any = False
                    if need_core and core_sql.exists():
                        try:
                            sql = core_sql.read_text(encoding='utf-8')
                            cur.execute(sql)
                            ran_any = True
                            print("[DB] Applied Postgres core schema (users/conversations/messages).")
                        except Exception as e:
                            print(f"[DB] Warning: core schema apply failed: {e}")
                    # Apply accessories (devices, rag_*, feedback, personalities)
                    self.exec(cur, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
                    present = {r[0] for r in cur.fetchall()}
                    need_extra = any(t not in present for t in {'devices','device_sync_log','rag_groups','rag_documents','rag_chunks','feedback','personalities'})
                    if need_extra and extra_sql.exists():
                        try:
                            sql2 = extra_sql.read_text(encoding='utf-8')
                            cur.execute(sql2)
                            ran_any = True
                            print("[DB] Applied Postgres accessory schema (devices/rag/feedback/personalities).")
                        except Exception as e:
                            print(f"[DB] Warning: accessory schema apply failed: {e}")
                    if ran_any:
                        conn.commit()
                # Continue without raising; later queries will fail loudly if schema still missing
            except Exception as e:
                print(f"[DB] PostgreSQL init best-effort skipped due to error: {e}")
            # Keep a note for clarity
            print("[DB] PostgreSQL attivo: schema verificato (best-effort).")
            return
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
            # Ensure column must_change_password exists
            cursor.execute("PRAGMA table_info(users)")
            cols = [row[1] for row in cursor.fetchall()]
            if 'must_change_password' not in cols:
                try:
                    cursor.execute("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0")
                except Exception:
                    pass
            # Ensure column is_admin exists
            cursor.execute("PRAGMA table_info(users)")
            cols = [row[1] for row in cursor.fetchall()]
            if 'is_admin' not in cols:
                try:
                    cursor.execute("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0")
                except Exception:
                    pass
            
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
                    -- Dati anagrafici (facoltativi)
                    demo_eta INTEGER,
                    demo_sesso TEXT,
                    demo_istruzione TEXT,
                    demo_tipo_istituto TEXT,
                    demo_provenienza TEXT,
                    demo_area TEXT,
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

            # Aggiungi colonne demografiche se mancanti (migrazione leggera)
            cursor.execute("PRAGMA table_info(survey_responses)")
            existing_cols = [row[1] for row in cursor.fetchall()]
            for col, ddl in [
                ('demo_eta', 'INTEGER'),
                ('demo_sesso', 'TEXT'),
                ('demo_istruzione', 'TEXT'),
                ('demo_tipo_istituto', 'TEXT'),
                ('demo_provenienza', 'TEXT'),
                ('demo_area', 'TEXT'),
            ]:
                if col not in existing_cols:
                    try:
                        cursor.execute(f"ALTER TABLE survey_responses ADD COLUMN {col} {ddl}")
                    except Exception:
                        pass
            
            # Promote default admin if present
            try:
                cursor.execute("UPDATE users SET is_admin = 1 WHERE email = ?", ("daniele.dragoni@gmail.com",))
            except Exception:
                pass
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
                if USING_POSTGRES:
                    db_manager.exec(cursor, "INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted) VALUES (?, ?, ?, ?) RETURNING id", (email, password_hash, user_key_hash, escrow_key_encrypted))
                    user_id = cursor.fetchone()[0]
                else:
                    db_manager.exec(cursor, "INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted) VALUES (?, ?, ?, ?)", (email, password_hash, user_key_hash, escrow_key_encrypted))
                    user_id = cursor.lastrowid
                conn.commit()
                return user_id
        except sqlite3.IntegrityError:
            return None  # Email già esistente
    
    @staticmethod
    def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Recupera un utente per email"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            # Use boolean parameter for is_active for cross-DB compatibility
            db_manager.exec(cursor, "SELECT * FROM users WHERE email = ? AND is_active = ?", (email, True))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        """Recupera un utente per ID"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, "SELECT * FROM users WHERE id = ? AND is_active = ?", (user_id, True))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    @staticmethod
    def update_last_login(user_id: int):
        """Aggiorna timestamp ultimo login"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE users SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL
                WHERE id = ?
            """, (user_id,))
            conn.commit()
    
    @staticmethod
    def increment_failed_login(email: str):
        """Incrementa tentativi di login falliti"""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE users SET failed_login_attempts = failed_login_attempts + 1
                WHERE email = ?
            """, (email,))
            conn.commit()

    @staticmethod
    def increment_failed_login_and_lock_if_needed(email: str, max_attempts: int, lock_minutes: int):
        """Incrementa i tentativi falliti e imposta locked_until se si supera la soglia."""
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            # Lettura tentativi correnti
            db_manager.exec(cursor, "SELECT failed_login_attempts FROM users WHERE email = ?", (email,))
            row = cursor.fetchone()
            if not row:
                return
            # Both sqlite3.Row and DictRow support key access; fallback to index
            current = (row[0] if isinstance(row, (tuple, list)) else row.get("failed_login_attempts")) or 0
            new_val = current + 1
            if new_val >= max_attempts:
                if USING_POSTGRES:
                    # Postgres: add interval using cast
                    db_manager.exec(
                        cursor,
                        "UPDATE users SET failed_login_attempts = ?, locked_until = NOW() + ( ? )::interval WHERE email = ?",
                        (new_val, f"{int(lock_minutes)} minutes", email),
                    )
                else:
                    # SQLite: use datetime modifier
                    db_manager.exec(
                        cursor,
                        """
                        UPDATE users
                        SET failed_login_attempts = ?, locked_until = datetime('now', ?)
                        WHERE email = ?
                        """,
                        (new_val, f"+{int(lock_minutes)} minutes", email),
                    )
            else:
                db_manager.exec(
                    cursor,
                    "UPDATE users SET failed_login_attempts = ? WHERE email = ?",
                    (new_val, email),
                )
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
                db_manager.exec(cursor, """
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
            db_manager.exec(cursor, """
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
            db_manager.exec(cursor, """
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
            db_manager.exec(cursor, """
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
                db_manager.exec(cursor, """
                    INSERT INTO messages (id, conversation_id, content_encrypted, content_hash, 
                                        role, token_count, processing_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (message_id, conversation_id, content_encrypted, content_hash, 
                     role, token_count, processing_time))
                
                # Aggiorna contatore messaggi nella conversazione
                db_manager.exec(cursor, """
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
            db_manager.exec(cursor, """
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
                if USING_POSTGRES:
                    # Write into unified 'devices' table; upsert on id
                    db_manager.exec(cursor, """
                        INSERT INTO devices (id, user_id, device_name, device_type, fingerprint, user_agent, last_ip)
                        VALUES (?, ?, ?, 'unknown', ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET 
                            user_id = EXCLUDED.user_id,
                            device_name = EXCLUDED.device_name,
                            device_type = EXCLUDED.device_type,
                            fingerprint = EXCLUDED.fingerprint,
                            user_agent = EXCLUDED.user_agent,
                            last_ip = EXCLUDED.last_ip
                    """, (device_id, user_id, device_name, device_fingerprint, user_agent, ip))
                else:
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
            if USING_POSTGRES:
                db_manager.exec(cursor, """
                    SELECT * FROM devices 
                    WHERE user_id = ? AND is_active = ?
                    ORDER BY last_sync DESC
                """, (user_id, True))
            else:
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
            db_manager.exec(cursor, """
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
                cols = [
                    # demografia
                    'demo_eta','demo_sesso','demo_istruzione','demo_tipo_istituto','demo_provenienza','demo_area',
                    # likert
                    *SurveyModel.FIELDS,
                    'q_riflessioni','q_commenti','session_id'
                ]
                placeholders = ','.join(['?']*len(cols))
                values = [
                    data.get('demo_eta'), data.get('demo_sesso'), data.get('demo_istruzione'), data.get('demo_tipo_istituto'), data.get('demo_provenienza'), data.get('demo_area')
                ]
                values += [data.get(f) for f in SurveyModel.FIELDS]
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
                cursor.execute(
                    f"SELECT COUNT({f}) as n, AVG({f}) as avg, MIN({f}) as min, MAX({f}) as max, SUM({f}) as sum, SUM({f}*{f}) as sumsq FROM survey_responses WHERE {f} IS NOT NULL"
                )
                row = cursor.fetchone()
                n = row['n'] or 0
                avg = row['avg']
                # distribuzione valori 1-5
                cursor.execute(f"SELECT {f} as val, COUNT(*) as c FROM survey_responses WHERE {f} IS NOT NULL GROUP BY {f}")
                dist_rows = cursor.fetchall()
                dist = {i:0 for i in range(1,6)}
                for dr in dist_rows:
                    dist[dr['val']] = dr['c']
                # deviazione standard (popolazione)
                std = None
                if n and avg is not None and row['sumsq'] is not None:
                    var = (row['sumsq'] / n) - (avg * avg)
                    std = math.sqrt(var) if var is not None and var > 0 else 0.0
                # mediana
                median = None
                cursor.execute(f"SELECT {f} as val FROM survey_responses WHERE {f} IS NOT NULL ORDER BY {f}")
                vals = [r['val'] for r in cursor.fetchall()]
                if vals:
                    m = len(vals)
                    if m % 2 == 1:
                        median = vals[m//2]
                    else:
                        median = (vals[m//2 - 1] + vals[m//2]) / 2.0
                summary[f] = {
                    'count': n,
                    'avg': avg,
                    'min': row['min'],
                    'max': row['max'],
                    'std': std,
                    'median': median,
                    'distribution': dist
                }
            cursor.execute("SELECT COUNT(*) as total FROM survey_responses")
            total = cursor.fetchone()['total']

            # Demografia
            # Età: min, max, avg e distribuzione per fasce
            cursor.execute("SELECT MIN(demo_eta) as min, MAX(demo_eta) as max, AVG(demo_eta) as avg FROM survey_responses WHERE demo_eta IS NOT NULL")
            eta_row = cursor.fetchone()
            cursor.execute("SELECT demo_eta as eta FROM survey_responses WHERE demo_eta IS NOT NULL")
            bins = {'<=17':0,'18-24':0,'25-34':0,'35-44':0,'45-54':0,'55+':0}
            for r in cursor.fetchall():
                e = r['eta']
                if e is None: continue
                if e <= 17: bins['<=17'] += 1
                elif e <= 24: bins['18-24'] += 1
                elif e <= 34: bins['25-34'] += 1
                elif e <= 44: bins['35-44'] += 1
                elif e <= 54: bins['45-54'] += 1
                else: bins['55+'] += 1

            # Sesso e istruzione
            cursor.execute("SELECT demo_sesso as k, COUNT(*) as c FROM survey_responses WHERE demo_sesso IS NOT NULL AND demo_sesso!='' GROUP BY demo_sesso")
            sesso = {row['k']: row['c'] for row in cursor.fetchall()}
            cursor.execute("SELECT demo_istruzione as k, COUNT(*) as c FROM survey_responses WHERE demo_istruzione IS NOT NULL AND demo_istruzione!='' GROUP BY demo_istruzione")
            istruzione = {row['k']: row['c'] for row in cursor.fetchall()}

            # Top categorie per tipo istituto e provenienza
            cursor.execute("SELECT demo_tipo_istituto as k, COUNT(*) as c FROM survey_responses WHERE demo_tipo_istituto IS NOT NULL AND demo_tipo_istituto!='' GROUP BY demo_tipo_istituto ORDER BY c DESC LIMIT 20")
            tipo_istituto = {row['k']: row['c'] for row in cursor.fetchall()}
            cursor.execute("SELECT demo_provenienza as k, COUNT(*) as c FROM survey_responses WHERE demo_provenienza IS NOT NULL AND demo_provenienza!='' GROUP BY demo_provenienza ORDER BY c DESC LIMIT 20")
            provenienza = {row['k']: row['c'] for row in cursor.fetchall()}

            demographics = {
                'eta': { 'min': eta_row['min'], 'max': eta_row['max'], 'avg': eta_row['avg'], 'bins': bins },
                'sesso': sesso,
                'istruzione': istruzione,
                'tipo_istituto': tipo_istituto,
                'provenienza': provenienza
            }

            # Confronto per area (STEM vs Umanistiche)
            by_area = {}
            for area in ['STEM','Umanistiche']:
                area_avgs = {}
                for f in SurveyModel.FIELDS:
                    cursor.execute(f"SELECT AVG({f}) as avg FROM survey_responses WHERE demo_area = ? AND {f} IS NOT NULL", (area,))
                    row = cursor.fetchone()
                    area_avgs[f] = row['avg']
                by_area[area] = area_avgs
            demographics['by_area'] = by_area

            # Correlazioni dinamiche: medie per età (bin), sesso, istruzione
            correlations = {}
            # Age bins averages
            age_bins_def = [
                ('<=17', 'demo_eta <= 17'),
                ('18-24', 'demo_eta BETWEEN 18 AND 24'),
                ('25-34', 'demo_eta BETWEEN 25 AND 34'),
                ('35-44', 'demo_eta BETWEEN 35 AND 44'),
                ('45-54', 'demo_eta BETWEEN 45 AND 54'),
                ('55+', 'demo_eta >= 55'),
            ]
            by_age_bins = {}
            for label, cond in age_bins_def:
                avgs = {}
                for f in SurveyModel.FIELDS:
                    cursor.execute(f"SELECT AVG({f}) as avg FROM survey_responses WHERE {cond} AND {f} IS NOT NULL")
                    r = cursor.fetchone()
                    avgs[f] = r['avg']
                by_age_bins[label] = avgs
            correlations['by_age_bins'] = by_age_bins

            # By sesso
            by_sesso = {}
            for s in ['F','M','Altro','ND']:
                avgs = {}
                for f in SurveyModel.FIELDS:
                    cursor.execute(f"SELECT AVG({f}) as avg FROM survey_responses WHERE demo_sesso = ? AND {f} IS NOT NULL", (s,))
                    r = cursor.fetchone()
                    avgs[f] = r['avg']
                by_sesso[s] = avgs
            correlations['by_sesso'] = by_sesso

            # By istruzione
            by_istruzione = {}
            for istr in ['Scuola','Università','Dottorato','Altro']:
                avgs = {}
                for f in SurveyModel.FIELDS:
                    cursor.execute(f"SELECT AVG({f}) as avg FROM survey_responses WHERE demo_istruzione = ? AND {f} IS NOT NULL", (istr,))
                    r = cursor.fetchone()
                    avgs[f] = r['avg']
                by_istruzione[istr] = avgs
            correlations['by_istruzione'] = by_istruzione

            return { 'total': total, 'questions': summary, 'demographics': demographics, 'correlations': correlations }

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
