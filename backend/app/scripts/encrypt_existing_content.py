"""
Encrypt existing plaintext conversation titles and messages in-place.
Idempotent: rows already encrypted (ENCv1: prefix) are skipped.

Run inside the backend container context (PYTHONPATH includes /app):
  python -m app.scripts.encrypt_existing_content
"""
from app.database import db_manager
from app.crypto_at_rest import encrypt_text, is_encrypted


def _encrypt_table(conn, table: str, column: str, pk: str):
    cur = conn.cursor()
    # Fetch rows where content is not marked as encrypted
    cur.execute(f"SELECT {pk}, {column} FROM {table}")
    rows = cur.fetchall()
    count_total = 0
    count_updated = 0
    for r in rows:
        count_total += 1
        rid = r[0]
        val = r[1]
        if not val or is_encrypted(val):
            continue
        try:
            enc = encrypt_text(val)
            cur.execute(
                f"UPDATE {table} SET {column} = ? WHERE {pk} = ?",
                (enc, rid)
            )
            count_updated += 1
        except Exception as e:
            print(f"Skip {table}:{rid} due to error: {e}")
    return count_total, count_updated


def main():
    with db_manager.get_connection() as conn:
        # Conversations.title_encrypted
        t_total, t_upd = _encrypt_table(conn, 'conversations', 'title_encrypted', 'id')
        print(f"conversations processed={t_total} updated={t_upd}")
        # Messages.content_encrypted
        m_total, m_upd = _encrypt_table(conn, 'messages', 'content_encrypted', 'id')
        print(f"messages processed={m_total} updated={m_upd}")
        conn.commit()


if __name__ == '__main__':
    main()
