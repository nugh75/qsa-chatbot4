"""
Create missing Postgres tables required by admin panel and RAG features.

Usage (inside backend container with DATABASE_URL set):

  python -m app.scripts.pg_create_missing_tables

It is safe to re-run: every statement uses IF NOT EXISTS.
"""
import os
import sys

DDL_PATH = os.path.join(os.path.dirname(__file__), 'postgres_create_missing.sql')

def main():
    db_url = os.getenv('DATABASE_URL')
    if not db_url or not db_url.startswith('postgres'):
        print('[pg_create_missing_tables] DATABASE_URL non configurato o non Postgres.')
        sys.exit(1)
    try:
        import psycopg2
    except Exception as e:
        print(f"[pg_create_missing_tables] psycopg2 non disponibile: {e}")
        sys.exit(2)

    sql = ''
    try:
        with open(DDL_PATH, 'r', encoding='utf-8') as f:
            sql = f.read()
    except Exception as e:
        print(f"[pg_create_missing_tables] Impossibile leggere DDL: {e}")
        sys.exit(3)

    print('[pg_create_missing_tables] Connessione a Postgres...')
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        present = {r[0] for r in cur.fetchall()}
        needed = {'devices','device_sync_log','rag_groups','rag_documents','rag_chunks','feedback','personalities'}
        missing = sorted([t for t in needed if t not in present])
        print(f"[pg_create_missing_tables] Tabelle presenti: {len(present)}; mancanti: {missing or 'nessuna'}")

        # Esegue DDL atomico
        cur.execute(sql)
        conn.commit()

        # Ricontrolla
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        present2 = {r[0] for r in cur.fetchall()}
        still_missing = sorted([t for t in needed if t not in present2])
        if still_missing:
            print(f"[pg_create_missing_tables] Attenzione: ancora mancanti: {still_missing}")
            sys.exit(4)
        print('[pg_create_missing_tables] ✅ Tabelle create/verificate con successo.')
    finally:
        conn.close()

if __name__ == '__main__':
    main()
