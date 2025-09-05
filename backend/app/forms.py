from __future__ import annotations

"""
Questionnaire Forms: definitions (builder) and submissions storage.

Schema (works on SQLite and Postgres via db_manager):
- forms_definitions: id, name, description, items(json), created_by, timestamps
- form_submissions: id, form_id, user_id, conversation_id, personality_id, values(json), timestamps

Each form item shape: { factor: str, description: str, min?: int, max?: int }
Submission values: { rows: [{ factor: str, description?: str, value: number }], notes?: str }
"""

import json
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import HTTPException

from .database import db_manager, USING_POSTGRES


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + 'Z'


def init_forms_schema():
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        if USING_POSTGRES:
            db_manager.exec(cur, """
                CREATE TABLE IF NOT EXISTS forms_definitions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    items JSONB NOT NULL,
                    created_by INTEGER NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            db_manager.exec(cur, """
                CREATE TABLE IF NOT EXISTS form_submissions (
                    id TEXT PRIMARY KEY,
                    form_id TEXT NOT NULL REFERENCES forms_definitions(id) ON DELETE CASCADE,
                    user_id INTEGER NULL,
                    conversation_id TEXT NULL,
                    personality_id TEXT NULL,
                    values JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            db_manager.exec(cur, "CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id)")
        else:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS forms_definitions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    items TEXT NOT NULL,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS form_submissions (
                    id TEXT PRIMARY KEY,
                    form_id TEXT NOT NULL,
                    user_id INTEGER,
                    conversation_id TEXT,
                    personality_id TEXT,
                    values TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (form_id) REFERENCES forms_definitions(id) ON DELETE CASCADE
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id)")
        conn.commit()


def list_forms() -> List[Dict[str, Any]]:
    init_forms_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT id, name, description, items, created_at, updated_at FROM forms_definitions ORDER BY name")
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            items = d.get('items')
            if isinstance(items, (bytes, str)):
                try:
                    d['items'] = json.loads(items)
                except Exception:
                    d['items'] = []
            out.append(d)
        return out


def get_form(form_id: str) -> Optional[Dict[str, Any]]:
    init_forms_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT * FROM forms_definitions WHERE id = ?", (form_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        items = d.get('items')
        if isinstance(items, (bytes, str)):
            try:
                d['items'] = json.loads(items)
            except Exception:
                d['items'] = []
        return d


def upsert_form(*, form_id: Optional[str], name: str, description: Optional[str], items: List[Dict[str, Any]], created_by: Optional[int] = None) -> Dict[str, Any]:
    init_forms_schema()
    if not form_id:
        # Slug from name
        import re
        slug = re.sub(r"[^a-z0-9\-\s]", "", name.lower()).strip().replace(' ', '-')
        form_id = slug or f"form-{uuid.uuid4().hex[:8]}"
    payload = json.dumps(items or [], ensure_ascii=False)
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        if USING_POSTGRES:
            db_manager.exec(cur, """
                INSERT INTO forms_definitions (id, name, description, items, created_by)
                VALUES (?, ?, ?, %s::jsonb, ?)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    items = EXCLUDED.items,
                    updated_at = NOW()
            """, (form_id, name, description or None, payload, created_by))
        else:
            db_manager.exec(cur, """
                INSERT INTO forms_definitions (id, name, description, items, created_by)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, items=excluded.items, updated_at=CURRENT_TIMESTAMP
            """, (form_id, name, description or None, payload, created_by))
        conn.commit()
    return {"id": form_id}


def delete_form(form_id: str) -> bool:
    init_forms_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "DELETE FROM forms_definitions WHERE id = ?", (form_id,))
        conn.commit()
    return True


def submit_form_values(*, form_id: str, values: Dict[str, Any], user_id: Optional[int] = None, conversation_id: Optional[str] = None, personality_id: Optional[str] = None) -> Dict[str, Any]:
    init_forms_schema()
    if not get_form(form_id):
        raise HTTPException(status_code=404, detail="Form non trovato")
    submission_id = f"sub_{uuid.uuid4().hex}"
    payload = json.dumps(values or {}, ensure_ascii=False)
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        if USING_POSTGRES:
            db_manager.exec(cur, "INSERT INTO form_submissions (id, form_id, user_id, conversation_id, personality_id, values) VALUES (?, ?, ?, ?, ?, %s::jsonb)", (submission_id, form_id, user_id, conversation_id, personality_id, payload))
        else:
            db_manager.exec(cur, "INSERT INTO form_submissions (id, form_id, user_id, conversation_id, personality_id, values) VALUES (?, ?, ?, ?, ?, ?)", (submission_id, form_id, user_id, conversation_id, personality_id, payload))
        conn.commit()
    return {"id": submission_id}


def list_submissions(form_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    init_forms_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        if form_id:
            db_manager.exec(cur, "SELECT * FROM form_submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", (form_id, limit, offset))
        else:
            db_manager.exec(cur, "SELECT * FROM form_submissions ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset))
        rows = cur.fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            vv = d.get('values')
            if isinstance(vv, (bytes, str)):
                try:
                    d['values'] = json.loads(vv)
                except Exception:
                    d['values'] = {}
            out.append(d)
        return out

