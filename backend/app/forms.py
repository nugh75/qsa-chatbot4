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
import re
from statistics import mean

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
    # Validate against form definition (normalizes legacy shapes)
    form = get_form(form_id)
    try:
        validate_submission(form, values or {})
    except HTTPException:
        raise
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


def _normalize_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize legacy item shapes to the new schema.

    Backward compatibility: legacy shape used 'factor' and optional min/max.
    """
    if not isinstance(item, dict):
        return item
    # Legacy: { factor, description, min, max }
    if 'factor' in item:
        nid = item.get('factor')
        return {
            'id': nid,
            'type': 'scale',
            'label': item.get('description') or nid,
            'description': item.get('description') or '',
            'min': item.get('min'),
            'max': item.get('max')
        }
    # If already has id and type, return as-is
    if 'id' in item and 'type' in item:
        return item
    # Fallback: try to map description -> label
    return item


def validate_submission(form: Dict[str, Any], values: Dict[str, Any]):
    """Validate a submission payload against a form definition.

    Raises HTTPException(400) with detail {'errors': [...] } on validation errors.
    """
    items = form.get('items') or []
    norm_items: Dict[str, Dict[str, Any]] = {}
    for it in items:
        nit = _normalize_item(it)
        if not nit.get('id'):
            continue
        norm_items[nit['id']] = nit

    errors: List[Dict[str, Any]] = []

    rows = (values or {}).get('rows') or []
    # build map of provided values by id (accept legacy 'factor')
    provided: Dict[str, Any] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        rid = r.get('id') or r.get('factor')
        if rid:
            provided[rid] = r

    # Check required fields
    for iid, it in norm_items.items():
        if it.get('required'):
            if iid not in provided:
                errors.append({'field': iid, 'error': 'required'})

    import datetime as _dt
    # Validate each provided row
    for pid, prow in provided.items():
        it = norm_items.get(pid)
        if not it:
            errors.append({'field': pid, 'error': 'unknown_field'})
            continue
        typ = it.get('type') or 'scale'
        val = prow.get('value')
        # Accept legacy 'value' typed as number or string depending on type
        if typ == 'scale':
            try:
                vnum = float(val)
            except Exception:
                errors.append({'field': pid, 'error': 'not_numeric'})
                continue
            mn = it.get('min')
            mx = it.get('max')
            if mn is not None and vnum < float(mn):
                errors.append({'field': pid, 'error': 'below_min'})
            if mx is not None and vnum > float(mx):
                errors.append({'field': pid, 'error': 'above_max'})
        elif typ in ('text', 'textarea'):
            if val is None:
                if it.get('required'):
                    errors.append({'field': pid, 'error': 'required'})
                continue
            if not isinstance(val, str):
                errors.append({'field': pid, 'error': 'not_string'})
                continue
            vlen = len(val)
            vcfg = it.get('validation') or {}
            mxl = vcfg.get('max_length') or it.get('max_length')
            if mxl and vlen > int(mxl):
                errors.append({'field': pid, 'error': 'max_length_exceeded', 'max_length': mxl})
            rx = vcfg.get('regex')
            if rx:
                try:
                    if not re.match(rx, val):
                        errors.append({'field': pid, 'error': 'regex_mismatch'})
                except re.error:
                    # ignore malformed regex in form definition
                    pass
        elif typ == 'choice_single':
            opts = it.get('options') or []
            opt_vals = {o.get('value') for o in opts}
            allow_other = it.get('allow_other')
            if val is None:
                if it.get('required'):
                    errors.append({'field': pid, 'error': 'required'})
                continue
            if val not in opt_vals:
                if allow_other:
                    # expect value_other in payload
                    if not prow.get('value_other'):
                        errors.append({'field': pid, 'error': 'other_missing'})
                else:
                    errors.append({'field': pid, 'error': 'invalid_choice'})
        elif typ == 'choice_multi':
            opts = it.get('options') or []
            opt_vals = {o.get('value') for o in opts}
            if val is None:
                if it.get('required'):
                    errors.append({'field': pid, 'error': 'required'})
                continue
            if not isinstance(val, list):
                errors.append({'field': pid, 'error': 'not_list'})
                continue
            for vv in val:
                if vv not in opt_vals:
                    errors.append({'field': pid, 'error': 'invalid_choice', 'value': vv})
        elif typ == 'boolean':
            if not isinstance(val, bool):
                errors.append({'field': pid, 'error': 'not_boolean'})
        elif typ == 'date':
            if val is None:
                if it.get('required'):
                    errors.append({'field': pid, 'error': 'required'})
                continue
            try:
                # accept ISO date or datetime
                _dt.datetime.fromisoformat(str(val))
            except Exception:
                errors.append({'field': pid, 'error': 'invalid_date'})
        elif typ == 'file':
            # Expect URL or descriptor; minimal validation
            if val is None and it.get('required'):
                errors.append({'field': pid, 'error': 'required'})
            else:
                if val is not None and not isinstance(val, str):
                    errors.append({'field': pid, 'error': 'invalid_file'})
        else:
            # unknown type: skip validation but note it
            pass

    if errors:
        raise HTTPException(status_code=400, detail={'errors': errors})


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

