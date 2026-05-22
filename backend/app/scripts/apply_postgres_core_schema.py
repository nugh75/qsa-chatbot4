"""
Apply the Postgres core schema (users, conversations, messages, user_devices, admin_actions, survey_responses).

Run inside backend container:
  python -m app.scripts.apply_postgres_core_schema
"""
import os
import sys

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'postgres_core_schema.sql')

def main():
    db_url = os.getenv('DATABASE_URL')
    if not db_url or not db_url.startswith('postgres'):
        print('[core_schema] DATABASE_URL non configurato o non Postgres')
        return 1
    try:
        import psycopg2
    except Exception as e:
        print(f"[core_schema] psycopg2 non disponibile: {e}")
        return 2
    try:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            sql = f.read()
    except Exception as e:
        print(f"[core_schema] Impossibile leggere schema: {e}")
        return 3
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        print('[core_schema] ✅ Schema applicato/verificato')
        return 0
    except Exception as e:
        conn.rollback()
        print(f"[core_schema] ❌ Errore applicazione schema: {e}")
        return 4
    finally:
        conn.close()

if __name__ == '__main__':
    raise SystemExit(main())

