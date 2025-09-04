"""
Migrate RAG metadata from SQLite (backend/storage/databases/rag.db) to Postgres tables.

Usage inside backend container (with DATABASE_URL set to Postgres):

  python -m app.scripts.migrate_rag_sqlite_to_postgres

Idempotent: uses ON CONFLICT DO NOTHING for rag_documents (file_hash, group_id) and preserves ids.
After import, sequences are advanced to max(id)+1 to avoid conflicts on future inserts.
"""
import os
import sqlite3
import json

SQLITE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'storage', 'databases', 'rag.db')
SQLITE_PATH = os.path.abspath(SQLITE_PATH)

def main():
    db_url = os.getenv('DATABASE_URL')
    if not db_url or not db_url.startswith('postgres'):
        print('[migrate_rag] DATABASE_URL non configurato o non Postgres')
        return 1
    if not os.path.exists(SQLITE_PATH):
        print(f"[migrate_rag] sorgente SQLite non trovato: {SQLITE_PATH}")
        return 2
    try:
        import psycopg2
        from psycopg2.extras import Json
    except Exception as e:
        print(f"[migrate_rag] psycopg2 non disponibile: {e}")
        return 3

    # Read from SQLite
    src = sqlite3.connect(SQLITE_PATH)
    sc = src.cursor()
    sc.execute("SELECT id, name, description, created_at, updated_at FROM rag_groups")
    groups = sc.fetchall()
    sc.execute("SELECT id, group_id, filename, original_filename, stored_filename, file_hash, file_size, content_preview, chunk_count, archived, updated_at, created_at FROM rag_documents")
    documents = sc.fetchall()
    sc.execute("SELECT id, document_id, group_id, chunk_index, content, embedding_vector, metadata, created_at FROM rag_chunks ORDER BY id")
    chunks = sc.fetchall()
    src.close()

    # Write to Postgres
    pg = psycopg2.connect(db_url)
    try:
        cur = pg.cursor()
        # Ensure tables exist
        cur.execute("SELECT 1")
        # Import groups (preserve ids)
        for g in groups:
            cur.execute(
                """
                INSERT INTO rag_groups (id, name, description, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (g[0], g[1], g[2], g[3], g[4])
            )
        # Import documents
        for d in documents:
            archived = bool(d[9]) if d[9] is not None else False
            cur.execute(
                """
                INSERT INTO rag_documents (id, group_id, filename, original_filename, stored_filename, file_hash, file_size, content_preview, chunk_count, archived, updated_at, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (file_hash, group_id) DO NOTHING
                """,
                (d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], archived, d[10], d[11])
            )
        # Import chunks
        for c in chunks:
            md = {}
            try:
                md = json.loads(c[6]) if c[6] else {}
            except Exception:
                md = {}
            cur.execute(
                """
                INSERT INTO rag_chunks (id, document_id, group_id, chunk_index, content, embedding_vector, metadata, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (c[0], c[1], c[2], c[3], c[4], c[5], Json(md), c[7])
            )
        # Advance sequences
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM rag_groups")
        next_id = cur.fetchone()[0]
        cur.execute("SELECT setval(pg_get_serial_sequence('rag_groups','id'), %s, true)", (next_id,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM rag_documents")
        next_id = cur.fetchone()[0]
        cur.execute("SELECT setval(pg_get_serial_sequence('rag_documents','id'), %s, true)", (next_id,))
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM rag_chunks")
        next_id = cur.fetchone()[0]
        cur.execute("SELECT setval(pg_get_serial_sequence('rag_chunks','id'), %s, true)", (next_id,))

        pg.commit()
        print('[migrate_rag] ✅ Migrazione completata')
        return 0
    except Exception as e:
        pg.rollback()
        print(f"[migrate_rag] ❌ Errore migrazione: {e}")
        return 4
    finally:
        pg.close()

if __name__ == '__main__':
    raise SystemExit(main())

