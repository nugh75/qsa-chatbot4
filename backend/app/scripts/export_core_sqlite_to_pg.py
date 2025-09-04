"""
Export core data from SQLite (qsa_chatbot.db) into a Postgres-compatible SQL file.

Output file: /app/storage/databases/export_core.sql (mounted to host under backend/storage/databases)

Run inside backend container:
  python -m app.scripts.export_core_sqlite_to_pg
"""
import os
import sqlite3
from typing import Any

SQLITE_DB = "/app/storage/databases/qsa_chatbot.db"
OUTPUT_SQL = "/app/storage/databases/export_core.sql"

TABLES = [
    "users",
    "conversations",
    "messages",
    "user_devices",
    "admin_actions",
    "survey_responses",
]

BOOL_COLUMNS = {
    "users": {"is_active", "must_change_password", "is_admin"},
    "conversations": {"is_deleted"},
    "messages": {"is_deleted"},
    "user_devices": {"is_active"},
    "admin_actions": {"success"},
    "survey_responses": set(),
}


def _pg_literal(col: str, v: Any, is_bool: bool) -> str:
    if v is None:
        return "NULL"
    if is_bool:
        if isinstance(v, (int, float)):
            return "TRUE" if int(v) != 0 else "FALSE"
        if isinstance(v, str):
            sv = v.strip().lower()
            return "TRUE" if sv in ("1", "true", "t", "y", "yes") else "FALSE"
        return "TRUE" if bool(v) else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    # strings/text
    s = str(v).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    if not os.path.exists(SQLITE_DB):
        print(f"[export] SQLite DB non trovato: {SQLITE_DB}")
        return 1

    con = sqlite3.connect(SQLITE_DB)
    cur = con.cursor()

    os.makedirs(os.path.dirname(OUTPUT_SQL), exist_ok=True)
    with open(OUTPUT_SQL, "w", encoding="utf-8") as out:
        for t in TABLES:
            cur.execute(f"PRAGMA table_info({t})")
            cols = [r[1] for r in cur.fetchall()]
            if not cols:
                print(f"[export] Tabella {t} non trovata o senza colonne, salto.")
                continue
            cur.execute(f"SELECT {', '.join(cols)} FROM {t}")
            rows = cur.fetchall()
            bset = BOOL_COLUMNS.get(t, set())
            for row in rows:
                vals = [
                    _pg_literal(c, v, c in bset)
                    for c, v in zip(cols, row)
                ]
                out.write(
                    f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({', '.join(vals)});\n"
                )
            print(f"[export] {t}: {len(rows)} righe")

    print(f"[export] Scritto: {OUTPUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

