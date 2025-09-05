"""
Predefined queries API (list, describe, preview, execute) + simple NLQ mapping.
"""
from typing import Any, Dict, Optional, Tuple
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .auth import get_current_admin_user
from .predefined_queries import list_queries, get_query, execute_query
from .database import db_manager
from .logging_utils import log_interaction as _log_interaction


router = APIRouter()


class ExecParams(BaseModel):
    params: Dict[str, Any] = {}


@router.get("/queries")
async def list_predefined_queries(current_user = Depends(get_current_admin_user)):
    try:
        return {"success": True, "queries": list_queries()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queries/{query_id}")
async def describe_query(query_id: str, current_user = Depends(get_current_admin_user)):
    try:
        q = get_query(query_id)
        if not q:
            raise HTTPException(status_code=404, detail="Query non trovata")
        # Return metadata without raw SQL
        meta = {k: v for k, v in q.items() if k in ("id", "label", "description", "params", "order_by", "limit")}
        return {"success": True, "query": meta}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/queries/{query_id}/preview")
async def preview_query(query_id: str, payload: ExecParams, current_user = Depends(get_current_admin_user)):
    """Executes query with safe limit caps; intended for quick previews in UI."""
    try:
        # Force a smaller limit for preview by overriding payload
        p = dict(payload.params or {})
        if "limit" not in p or p.get("limit") is None:
            p["limit"] = 25
        else:
            p["limit"] = min(int(p["limit"]), 50)
        result = execute_query(query_id, p)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore esecuzione: {e}")


@router.post("/queries/{query_id}/execute")
async def run_query(query_id: str, payload: ExecParams, current_user = Depends(get_current_admin_user)):
    try:
        result = execute_query(query_id, dict(payload.params or {}))
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore esecuzione: {e}")


# ------------------ Simple NLQ mapping (uman-like) ------------------

from pydantic import Field
import re


def _extract_limit(text: str, default: int, cap: int = 500) -> int:
    m = re.search(r"\b(ultimi|ultimo|limite|max)\s+(\d{1,4})\b", text)
    if m:
        try:
            v = int(m.group(2))
            return max(1, min(v, cap))
        except Exception:
            return default
    return default


def _extract_order(text: str, allowed: list[str], default_col: str, default_dir: str) -> Tuple[str, str]:
    # Support synonyms -> columns
    syn_map = {
        'aggiornato': 'updated_at',
        'aggiornamento': 'updated_at',
        'creato': 'created_at',
        'creazione': 'created_at',
        'messaggi': 'message_count',
        'email': 'email',
        'login': 'last_login',
        'accesso': 'last_login',
        'id': 'id',
        'nome': 'name',
        'dimensione': 'file_size',
        'dimensioni': 'file_size',
        'chunks': 'chunk_count',
        'file': 'filename',
    }
    m = re.search(r"ordina(?:re)?\s+per\s+([a-z_]+)(?:\s+(asc|desc))?", text)
    if m:
        raw = m.group(1)
        direction = (m.group(2) or default_dir).upper()
        col = syn_map.get(raw, raw)
        if col in allowed:
            return col, ('ASC' if direction == 'ASC' else 'DESC')
    return default_col, default_dir


def _extract_int_after(pattern: str, text: str) -> Optional[int]:
    m = re.search(pattern, text)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return None
    return None


def _find_user_id_by_email(email: str) -> Optional[int]:
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            db_manager.exec(cur, "SELECT id FROM users WHERE email = ?", (email,))
            row = cur.fetchone()
            if row:
                try:
                    return int(row[0] if isinstance(row, (list, tuple)) else row['id'])
                except Exception:
                    return int(dict(row).get('id'))
    except Exception:
        return None
    return None


class NLQRequest(BaseModel):
    text: str = Field(..., min_length=1)


@router.post("/queries/nlq")
async def nlq_map(payload: NLQRequest, current_user = Depends(get_current_admin_user)):
    """Best-effort mapping from natural request to a predefined query and params.

    Rules are simple and extendable. Returns suggestions when not recognized.
    """
    text = payload.text.strip().lower()
    # Normalize spaces
    text = re.sub(r"\s+", " ", text)

    # 1) Conversazioni dell'utente (by id o email)
    if re.search(r"\b(conversazioni|chat|messaggi)\b", text) and re.search(r"\b(utente|user)\b", text):
        # user_id
        uid = _extract_int_after(r"(?:utente|user)\s*(?:id)?\s*(\d{1,10})", text)
        if uid is None:
            # try email
            m_email = re.search(r"([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})", text)
            if m_email:
                uid = _find_user_id_by_email(m_email.group(1))
                if uid is None:
                    return {
                        "matched": False,
                        "message": f"Utente con email '{m_email.group(1)}' non trovato",
                        "suggestions": [
                            {"text": "conversazioni utente 42", "query_id": "user_conversations"}
                        ]
                    }
        if uid is not None:
            meta = get_query("user_conversations") or {}
            allowed = (meta.get('order_by') or {}).get('allowed') or ["updated_at"]
            ob_def = (meta.get('order_by') or {}).get('default') or {"column": "updated_at", "direction": "DESC"}
            ob_col, ob_dir = _extract_order(text, allowed, ob_def.get('column', 'updated_at'), ob_def.get('direction', 'DESC'))
            limit = _extract_limit(text, (meta.get('limit') or {}).get('default', 100), (meta.get('limit') or {}).get('max', 500))
            result = {
                "matched": True,
                "query_id": "user_conversations",
                "params": {"user_id": uid, "limit": limit, "order_by": {"column": ob_col, "direction": ob_dir}},
                "label": "Conversazioni per utente"
            }
            _log_interaction({"event":"nlq", "matched": True, "query_id":"user_conversations", "params": result["params"], "text": payload.text})
            return result

    # 2) Utenti: attivi / inattivi / recenti / tutti
    if re.search(r"\butenti\b", text):
        only_active: Optional[int] = None
        if re.search(r"\battiv[oi]\b", text):
            only_active = 1
        elif re.search(r"\binattiv[oi]\b", text):
            only_active = 0
        # order/limit
        meta = get_query("users_recent") or {}
        allowed = (meta.get('order_by') or {}).get('allowed') or ["created_at"]
        ob_def = (meta.get('order_by') or {}).get('default') or {"column": "created_at", "direction": "DESC"}
        ob_col, ob_dir = _extract_order(text, allowed, ob_def.get('column', 'created_at'), ob_def.get('direction', 'DESC'))
        limit = _extract_limit(text, (meta.get('limit') or {}).get('default', 50), (meta.get('limit') or {}).get('max', 200))
        result = {
            "matched": True,
            "query_id": "users_recent",
            "params": {"only_active": only_active, "limit": limit, "order_by": {"column": ob_col, "direction": ob_dir}},
            "label": "Utenti"
        }
        _log_interaction({"event":"nlq", "matched": True, "query_id":"users_recent", "params": result["params"], "text": payload.text})
        return result

    # 3) Documenti RAG per gruppo N (solo se query disponibile)
    if get_query("rag_documents_by_group"):
        m2 = re.search(r"(documenti|files?).*(rag)?.*(gruppo|group)\s+(\d+)", text)
        if m2:
            gid = int(m2.group(4))
            meta = get_query("rag_documents_by_group") or {}
            allowed = (meta.get('order_by') or {}).get('allowed') or ["created_at"]
            ob_def = (meta.get('order_by') or {}).get('default') or {"column": "created_at", "direction": "DESC"}
            ob_col, ob_dir = _extract_order(text, allowed, ob_def.get('column', 'created_at'), ob_def.get('direction', 'DESC'))
            limit = _extract_limit(text, (meta.get('limit') or {}).get('default', 100), (meta.get('limit') or {}).get('max', 500))
            result = {
                "matched": True,
                "query_id": "rag_documents_by_group",
                "params": {"group_id": gid, "limit": limit, "order_by": {"column": ob_col, "direction": ob_dir}},
                "label": "Documenti RAG per gruppo"
            }
            _log_interaction({"event":"nlq", "matched": True, "query_id":"rag_documents_by_group", "params": result["params"], "text": payload.text})
            return result
    # Fallback
    out = {
        "matched": False,
        "message": "Richiesta non riconosciuta. Esempi: 'conversazioni utente 42', 'utenti attivi', 'documenti rag gruppo 1'",
        "suggestions": [
            {"text": "conversazioni utente 42", "query_id": "user_conversations"},
            {"text": "utenti attivi", "query_id": "users_recent"},
            {"text": "documenti rag gruppo 1", "query_id": "rag_documents_by_group"}
        ]
    }
    _log_interaction({"event":"nlq", "matched": False, "text": payload.text, "message": out.get("message")})
    return out


@router.post("/queries/{query_id}/export")
async def export_query_csv(query_id: str, payload: ExecParams, current_user = Depends(get_current_admin_user)):
    """Export query results as CSV.

    Returns text/csv with header row. Uses the same validation as execute.
    """
    import csv
    import io
    try:
        result = execute_query(query_id, dict(payload.params or {}))
        rows = result.get("rows") or []
        # Infer columns
        cols = list(rows[0].keys()) if rows else []
        buf = io.StringIO()
        w = csv.writer(buf)
        if cols:
            w.writerow(cols)
            for r in rows:
                w.writerow([r.get(c, "") for c in cols])
        else:
            # empty set -> no header, keep empty body
            pass
        buf.seek(0)
        filename = f"{query_id}.csv"
        return StreamingResponse(buf, media_type="text/csv", headers={
            "Content-Disposition": f"attachment; filename={filename}"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore export: {e}")
