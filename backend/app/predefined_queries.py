from __future__ import annotations

"""
Predefined, parameterized queries registry with safe execution.

Each query has:
- id: str
- label: str
- description: str
- sql: str (use named placeholders :param)
- params: [{ name, type: text|integer|number|date|enum, required?, default?, enum?[], min?, max? }]
- order_by: { allowed: ["col"...], default?: { column, direction } }
- limit: { default: int, min: int, max: int }

Execution compiles named placeholders to positional for db_manager ('?' -> adapted to %s for Postgres).
ORDER BY and LIMIT are validated/whitelisted.
"""

from typing import Any, Dict, List, Optional, Tuple
import re
from datetime import datetime

from .database import db_manager, USING_POSTGRES


_REGISTRY: Dict[str, Dict[str, Any]] = {}


def _bootstrap_defaults():
    # Users recent
    _REGISTRY["users_recent"] = {
        "id": "users_recent",
        "label": "Utenti recenti",
        "description": "Lista utenti attivi ordinati per creazione o ultimo accesso",
        "sql": (
            "SELECT id, email, created_at, last_login, is_active, is_admin "
            "FROM users "
            "WHERE (:only_active IS NULL OR (is_active = :only_active)) "
            "ORDER BY {ORDER_BY} {ORDER_DIR} "
            "LIMIT :limit"
        ),
        "params": [
            {"name": "only_active", "type": "integer", "required": False, "default": None},
            {"name": "limit", "type": "integer", "required": False, "default": 50, "min": 1, "max": 200},
        ],
        "order_by": {
            "allowed": ["created_at", "last_login", "email", "id"],
            "default": {"column": "created_at", "direction": "DESC"},
        },
        "limit": {"default": 50, "min": 1, "max": 200},
    }
    # Conversations by user
    _REGISTRY["user_conversations"] = {
        "id": "user_conversations",
        "label": "Conversazioni per utente",
        "description": "Elenco conversazioni di un utente (non cancellate)",
        "sql": (
            "SELECT id, user_id, title_encrypted, title_hash, message_count, device_id, created_at, updated_at "
            "FROM conversations "
            "WHERE user_id = :user_id AND is_deleted = 0 "
            "ORDER BY {ORDER_BY} {ORDER_DIR} "
            "LIMIT :limit"
        ),
        "params": [
            {"name": "user_id", "type": "integer", "required": True},
            {"name": "limit", "type": "integer", "required": False, "default": 100, "min": 1, "max": 500},
        ],
        "order_by": {
            "allowed": ["updated_at", "created_at", "message_count", "id"],
            "default": {"column": "updated_at", "direction": "DESC"},
        },
        "limit": {"default": 100, "min": 1, "max": 500},
    }
    # RAG: documents in group
    if USING_POSTGRES:
        _REGISTRY["rag_documents_by_group"] = {
            "id": "rag_documents_by_group",
            "label": "Documenti RAG per gruppo",
            "description": "Elenco documenti e metadati per un gruppo RAG",
            "sql": (
                "SELECT id, group_id, filename, original_filename, stored_filename, file_size, chunk_count, archived, created_at "
                "FROM rag_documents "
                "WHERE group_id = :group_id "
                "ORDER BY {ORDER_BY} {ORDER_DIR} "
                "LIMIT :limit"
            ),
            "params": [
                {"name": "group_id", "type": "integer", "required": True},
                {"name": "limit", "type": "integer", "required": False, "default": 100, "min": 1, "max": 500},
            ],
            "order_by": {
                "allowed": ["created_at", "updated_at", "chunk_count", "file_size", "filename", "id"],
                "default": {"column": "created_at", "direction": "DESC"},
            },
            "limit": {"default": 100, "min": 1, "max": 500},
        }


_bootstrap_defaults()


def list_queries() -> List[Dict[str, Any]]:
    return [
        {k: v for k, v in q.items() if k in ("id", "label", "description", "params", "order_by", "limit")}
        for q in _REGISTRY.values()
    ]


def get_query(query_id: str) -> Optional[Dict[str, Any]]:
    return _REGISTRY.get(query_id)


_NAMED_PARAM_RE = re.compile(r":([a-zA-Z_][a-zA-Z0-9_]*)")


def _compile_sql(sql: str, params: Dict[str, Any]) -> Tuple[str, List[Any]]:
    """Replace :name placeholders with '?' and produce a positional values list.
    Non-sql substitutions (ORDER BY, DIR) must be applied beforehand.
    """
    used: List[str] = []

    def repl(match):
        name = match.group(1)
        used.append(name)
        return "?"

    compiled = _NAMED_PARAM_RE.sub(repl, sql)
    values = [params.get(n) for n in used]
    return compiled, values


def _coerce_param(value: Any, spec: Dict[str, Any]) -> Any:
    if value is None:
        return spec.get("default")
    t = (spec.get("type") or "text").lower()
    if t == "integer":
        try:
            iv = int(value)
        except Exception:
            raise ValueError(f"Parametro '{spec['name']}' deve essere un intero")
        if "min" in spec and iv < int(spec["min"]):
            iv = int(spec["min"])  # clamp
        if "max" in spec and iv > int(spec["max"]):
            iv = int(spec["max"])  # clamp
        return iv
    if t == "number":
        try:
            return float(value)
        except Exception:
            raise ValueError(f"Parametro '{spec['name']}' deve essere numerico")
    if t == "enum":
        allowed = spec.get("enum") or []
        if str(value) not in [str(x) for x in allowed]:
            raise ValueError(f"Parametro '{spec['name']}' non è tra i valori consentiti")
        return value
    if t == "date":
        # Accept YYYY-MM-DD; pass raw to DB driver
        s = str(value)
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            raise ValueError(f"Parametro '{spec['name']}' deve essere una data (YYYY-MM-DD)")
        return s
    # text
    return str(value)


def _validate_and_prepare(q: Dict[str, Any], raw_params: Dict[str, Any]) -> Tuple[str, List[Any]]:
    # Build clean params
    clean: Dict[str, Any] = {}
    for spec in q.get("params", []):
        name = spec["name"]
        val = raw_params.get(name, None)
        if val is None and spec.get("required") and spec.get("default") is None:
            raise ValueError(f"Parametro richiesto assente: {name}")
        clean[name] = _coerce_param(val, spec)
    # Order by
    ob_cfg = q.get("order_by") or {}
    allowed = ob_cfg.get("allowed") or []
    ob = raw_params.get("order_by") or {}
    if not isinstance(ob, dict):
        ob = {}
    ob_col = ob.get("column") or (ob_cfg.get("default") or {}).get("column") or (allowed[0] if allowed else "id")
    if ob_col not in allowed and allowed:
        ob_col = (ob_cfg.get("default") or {}).get("column") or allowed[0]
    ob_dir = str((ob.get("direction") or (ob_cfg.get("default") or {}).get("direction") or "ASC")).upper()
    if ob_dir not in ("ASC", "DESC"):
        ob_dir = "ASC"
    # Limit
    lim_cfg = q.get("limit") or {}
    lim_default = int(lim_cfg.get("default", 50))
    lim_min = int(lim_cfg.get("min", 1))
    lim_max = int(lim_cfg.get("max", 500))
    limit = int(raw_params.get("limit", clean.get("limit", lim_default) or lim_default))
    limit = max(lim_min, min(limit, lim_max))
    clean["limit"] = limit
    # Inject ORDER BY into SQL (whitelisted)
    sql = q["sql"].replace("{ORDER_BY}", ob_col).replace("{ORDER_DIR}", ob_dir)
    # Compile named params to positional
    compiled_sql, values = _compile_sql(sql, clean)
    return compiled_sql, values


def execute_query(query_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
    q = get_query(query_id)
    if not q:
        raise ValueError("Query non trovata")
    sql, values = _validate_and_prepare(q, params or {})
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, sql, tuple(values))
        rows = cur.fetchall()
        # Try dict mapping
        out: List[Dict[str, Any]] = []
        for r in rows:
            try:
                out.append(dict(r))  # sqlite Row or psycopg2 DictRow
            except Exception:
                # fallback positional mapping
                cols = [desc[0] for desc in getattr(cur, "description", []) or []]
                if cols and len(cols) == len(r):
                    out.append({cols[i]: r[i] for i in range(len(cols))})
                else:
                    out.append({"_": list(r) if isinstance(r, (list, tuple)) else r})
        return {"query_id": query_id, "count": len(out), "rows": out}
