"""
Migrate core data from SQLite (qsa_chatbot.db) to Postgres with ID remapping.

Handles existing users by matching on email and remapping user_id for conversations/devices/actions.

Run inside backend container:
  python -m app.scripts.migrate_core_sqlite_to_postgres
"""
import os
import sqlite3
from typing import Dict, Any

SQLITE_DB = "/app/storage/databases/qsa_chatbot.db"

def _fetch_all(cur, sql: str) -> list[sqlite3.Row]:
    cur.execute(sql)
    return cur.fetchall()

def _get_cols(cur, table: str) -> list[str]:
    cur.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]

def main() -> int:
    db_url = os.getenv('DATABASE_URL')
    if not db_url or not db_url.startswith('postgres'):
        print('[migrate_core] DATABASE_URL non configurato o non Postgres')
        return 1
    if not os.path.exists(SQLITE_DB):
        print(f"[migrate_core] Sorgente SQLite non trovato: {SQLITE_DB}")
        return 2
    try:
        import psycopg2
        from psycopg2.extras import DictCursor
    except Exception as e:
        print(f"[migrate_core] psycopg2 non disponibile: {e}")
        return 3

    src = sqlite3.connect(SQLITE_DB)
    src.row_factory = sqlite3.Row
    sc = src.cursor()

    pg = psycopg2.connect(db_url, cursor_factory=DictCursor)
    pc = pg.cursor()

    # Build column sets
    users_cols = _get_cols(sc, 'users')
    conv_cols = _get_cols(sc, 'conversations')
    msg_cols  = _get_cols(sc, 'messages')
    udev_cols = _get_cols(sc, 'user_devices') if _get_cols(sc, 'sqlite_master') is not None else []
    # mapping sqlite user_id -> postgres user_id
    idmap: Dict[int, int] = {}

    # 1) Users: match by email
    for r in _fetch_all(sc, 'SELECT * FROM users'):
        email = r['email']
        pc.execute('SELECT id FROM users WHERE email = %s', (email,))
        hit = pc.fetchone()
        if hit:
            idmap[r['id']] = int(hit['id'])
            continue
        # Insert new user
        must_change = r['must_change_password'] if 'must_change_password' in users_cols else 0
        is_admin = r['is_admin'] if 'is_admin' in users_cols else 0
        locked_until = r['locked_until'] if 'locked_until' in users_cols else None
        pc.execute(
            '''INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted,
                                  created_at, last_login, is_active, failed_login_attempts,
                                  locked_until, must_change_password, is_admin, role, username)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, %s, %s)
               RETURNING id''',
            (
                r['email'], r['password_hash'], r['user_key_hash'], r['escrow_key_encrypted'],
                r['created_at'], r['last_login'], bool(r['is_active']), r['failed_login_attempts'],
                locked_until, bool(must_change), bool(is_admin), 'user', None
            )
        )
        new_id = int(pc.fetchone()['id'])
        idmap[r['id']] = new_id
        pg.commit()

    # 2) Conversations: keep id, remap user_id
    for r in _fetch_all(sc, 'SELECT * FROM conversations'):
        uid = idmap.get(r['user_id'])
        if not uid:
            print(f"[migrate_core] Skip conversation {r['id']} (no mapped user)")
            continue
        pc.execute('''
            INSERT INTO conversations (id, user_id, title_encrypted, title_hash, created_at, updated_at, message_count, is_deleted, device_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING
        ''', (
            r['id'], uid, r['title_encrypted'], r['title_hash'], r['created_at'], r['updated_at'],
            r['message_count'], bool(r['is_deleted']), r['device_id']
        ))
    pg.commit()

    # 3) Messages: keep id, rely on conversation_id existing
    for r in _fetch_all(sc, 'SELECT * FROM messages'):
        # ensure conversation exists
        pc.execute('SELECT 1 FROM conversations WHERE id = %s', (r['conversation_id'],))
        if not pc.fetchone():
            # skip messages for missing conversations
            continue
        pc.execute('''
            INSERT INTO messages (id, conversation_id, content_encrypted, content_hash, role, timestamp, token_count, processing_time, is_deleted)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING
        ''', (
            r['id'], r['conversation_id'], r['content_encrypted'], r['content_hash'], r['role'], r['timestamp'],
            r['token_count'], r['processing_time'], bool(r['is_deleted'])
        ))
    pg.commit()

    # 4) user_devices: remap user_id
    try:
        for r in _fetch_all(sc, 'SELECT * FROM user_devices'):
            uid = idmap.get(r['user_id'])
            if not uid:
                continue
            pc.execute('''
                INSERT INTO user_devices (id, user_id, device_name, device_fingerprint, last_sync, last_ip, user_agent, is_active, created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (id) DO NOTHING
            ''', (
                r['id'], uid, r['device_name'], r['device_fingerprint'], r['last_sync'], r['last_ip'], r['user_agent'], bool(r['is_active']), r['created_at']
            ))
        pg.commit()
    except sqlite3.OperationalError:
        pass

    # 5) admin_actions: remap target_user_id if present
    for r in _fetch_all(sc, 'SELECT * FROM admin_actions'):
        tgt = r['target_user_id']
        mapped = idmap.get(tgt) if tgt is not None else None
        pc.execute('''
            INSERT INTO admin_actions (id, admin_email, action_type, target_user_id, target_email, description, timestamp, ip_address, success)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING
        ''', (
            r['id'], r['admin_email'], r['action_type'], mapped, r['target_email'], r['description'], r['timestamp'], r['ip_address'], bool(r['success'])
        ))
    pg.commit()

    # 6) survey_responses: bulk insert
    for r in _fetch_all(sc, 'SELECT * FROM survey_responses'):
        cols = _get_cols(sc, 'survey_responses')
        placeholders = ','.join(['%s']*len(cols))
        pc.execute(
            f"INSERT INTO survey_responses ({','.join(cols)}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING",
            [r[c] for c in cols]
        )
    pg.commit()

    print('[migrate_core] ✅ Migrazione core completata')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
