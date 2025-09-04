from __future__ import annotations

import json
import re
from pathlib import Path
import shutil
import logging
from typing import Dict, List, Optional
from .database import db_manager, USING_POSTGRES

"""Gestione delle personalities (seed vs runtime).

Standard 2025-09:
    Seed versionati (lowercase): backend/config/seed/personalities.json
    Runtime persistente: /app/storage/personalities/personalities.json

Compat legacy rimossa: eliminati fallback /app/data. Solo seed lowercase e runtime persistente.
"""

SEED_BASE = Path(__file__).resolve().parent.parent / 'config' / 'seed'
# Runtime storage base (rimane invariato)
RUNTIME_BASE = Path('/app/storage')
RUNTIME_PERSONALITIES_DIR = RUNTIME_BASE / 'personalities'
# Replace old constant usage
SEED_PERSONALITIES_DIR = SEED_BASE
# Lowercase runtime file
PERSONALITIES_FILE = RUNTIME_PERSONALITIES_DIR / "personalities.json"
TOPIC_DESCRIPTIONS_FILE = SEED_BASE / 'system_prompts.json'
# Legacy fallback list
LEGACY_PERSONALITIES_CANDIDATES: list[Path] = []  # legacy support rimosso

_cached_topic_descriptions = None

def _ensure_personality_schema():
    """Ensure `personalities` table and required columns exist on Postgres.
    - Creates the table if missing (idempotent)
    - Ensures enabled_data_tables column exists
    No-op on SQLite.
    """
    if not USING_POSTGRES:
        return
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            # Check if table exists
            db_manager.exec(cur, """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'personalities'
            """)
            has_table = bool(cur.fetchone())
            if not has_table:
                # Minimal schema aligned with backend/app/scripts/postgres_create_missing.sql
                ddl = """
                CREATE TABLE IF NOT EXISTS personalities (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  system_prompt_id TEXT NOT NULL,
                  provider TEXT NOT NULL,
                  model TEXT NOT NULL,
                  tts_provider TEXT,
                  tts_voice TEXT,
                  avatar TEXT,
                  welcome_message TEXT,
                  guide_id TEXT,
                  context_window INTEGER,
                  temperature DOUBLE PRECISION,
                  max_tokens INTEGER,
                  active BOOLEAN NOT NULL DEFAULT TRUE,
                  enabled_pipeline_topics JSONB,
                  enabled_rag_groups JSONB,
                  enabled_mcp_servers JSONB,
                  enabled_data_tables JSONB DEFAULT '[]'::jsonb,
                  is_default BOOLEAN NOT NULL DEFAULT FALSE,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
                db_manager.exec(cur, ddl)
                # Partial unique index to allow only one default
                db_manager.exec(cur, """
                DO $$ BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_one_default_personality'
                  ) THEN
                    CREATE UNIQUE INDEX uniq_one_default_personality ON personalities((is_default)) WHERE is_default IS TRUE;
                  END IF;
                END $$;
                """)
                conn.commit()
            # Ensure optional JSON column exists
            db_manager.exec(cur, """
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'personalities' AND column_name = 'enabled_data_tables'
            """)
            exists = cur.fetchone()
            if not exists:
                db_manager.exec(cur, "ALTER TABLE personalities ADD COLUMN enabled_data_tables JSONB DEFAULT '[]'::jsonb")
            conn.commit()
    except Exception:
        # Best-effort; if DDL not permitted, subsequent calls may still fail gracefully upstream
        pass

def load_topic_descriptions() -> dict:
    global _cached_topic_descriptions
    if _cached_topic_descriptions is not None:
        return _cached_topic_descriptions
    try:
        if TOPIC_DESCRIPTIONS_FILE.exists():
            data = json.loads(TOPIC_DESCRIPTIONS_FILE.read_text(encoding='utf-8'))
            # Atteso formato { "topics": { "topic_name": "descrizione" } } oppure semplice dict
            if isinstance(data, dict):
                if 'topics' in data and isinstance(data['topics'], dict):
                    _cached_topic_descriptions = data['topics']
                else:
                    _cached_topic_descriptions = data
            else:
                _cached_topic_descriptions = {}
        else:
            _cached_topic_descriptions = {}
    except Exception:
        _cached_topic_descriptions = {}
    return _cached_topic_descriptions

def _bootstrap_personalities():
    RUNTIME_PERSONALITIES_DIR.mkdir(parents=True, exist_ok=True)
    # Se manca il runtime e c'è seed standard lo copia
    if not PERSONALITIES_FILE.exists():
        seed_std = SEED_BASE / 'personalities.json'
        if seed_std.exists():
            try:
                shutil.copy2(seed_std, PERSONALITIES_FILE)
                logging.info('[personalities] Copiato seed personalities.json nel runtime (source=%s)', seed_std)
            except Exception as e:
                logging.warning('[personalities] Impossibile copiare seed personalities.json: %s', e)


def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "default"


def load_personalities() -> Dict:
    if not USING_POSTGRES:
        raise RuntimeError('Postgres richiesto: personalities sono gestite esclusivamente via DB')
    _ensure_personality_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT * FROM personalities ORDER BY name")
        rows = cur.fetchall()
        default_id = None
        items: List[Dict] = []
        for r in rows:
            d = dict(r)
            for k in ['enabled_pipeline_topics','enabled_rag_groups','enabled_mcp_servers','enabled_data_tables']:
                v = d.get(k)
                if isinstance(v, (bytes, str)):
                    try:
                        d[k] = json.loads(v) if v else []
                    except Exception:
                        d[k] = []
            if d.get('is_default'):
                default_id = d.get('id')
            items.append({
                'id': d.get('id'),
                'name': d.get('name'),
                'system_prompt_id': d.get('system_prompt_id'),
                'provider': d.get('provider'),
                'model': d.get('model'),
                'avatar': d.get('avatar'),
                'tts_provider': d.get('tts_provider'),
                'tts_voice': d.get('tts_voice'),
                'welcome_message': d.get('welcome_message'),
                'guide_id': d.get('guide_id'),
                'context_window': d.get('context_window'),
                'temperature': d.get('temperature'),
                'max_tokens': d.get('max_tokens'),
                'active': bool(d.get('active', True)),
                'enabled_pipeline_topics': d.get('enabled_pipeline_topics') or [],
                'enabled_rag_groups': d.get('enabled_rag_groups') or [],
                'enabled_mcp_servers': d.get('enabled_mcp_servers') or [],
                'enabled_data_tables': d.get('enabled_data_tables') or [],
            })
        return {'default_id': default_id, 'personalities': items}


def save_personalities(data: Dict) -> None:
    raise RuntimeError('save_personalities non supportato: usare DB Postgres')


def upsert_personality(
    name: str,
    system_prompt_id: str,
    provider: str,
    model: str,
    welcome_message: Optional[str] = None,
    guide_id: Optional[str] = None,
    context_window: Optional[int] = None,
    temperature: Optional[float] = None,
    personality_id: Optional[str] = None,
    set_default: bool = False,
    avatar: Optional[str] = None,
    tts_provider: Optional[str] = None,
    tts_voice: Optional[str] = None,
    active: bool = True,
    enabled_pipeline_topics: Optional[List[str]] = None,
    enabled_rag_groups: Optional[List[int]] = None,
    enabled_mcp_servers: Optional[List[str]] = None,
    enabled_data_tables: Optional[List[str]] = None,
    max_tokens: Optional[int] = None,
) -> Dict:
    if not USING_POSTGRES:
        raise RuntimeError('Postgres richiesto: upsert_personality usa il DB')
    _ensure_personality_schema()
    if personality_id is None:
        personality_id = _slugify(name)
    e_topics = json.dumps(enabled_pipeline_topics or [])
    e_groups = json.dumps(enabled_rag_groups or [])
    e_mcp = json.dumps(enabled_mcp_servers or [])
    e_tables = json.dumps(enabled_data_tables or [])
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, """
            INSERT INTO personalities (
                id, name, system_prompt_id, provider, model, tts_provider, tts_voice, avatar,
                welcome_message, guide_id, context_window, temperature, max_tokens, active,
                enabled_pipeline_topics, enabled_rag_groups, enabled_mcp_servers, enabled_data_tables, is_default, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                system_prompt_id = EXCLUDED.system_prompt_id,
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                tts_provider = EXCLUDED.tts_provider,
                tts_voice = EXCLUDED.tts_voice,
                avatar = COALESCE(EXCLUDED.avatar, personalities.avatar),
                welcome_message = EXCLUDED.welcome_message,
                guide_id = EXCLUDED.guide_id,
                context_window = EXCLUDED.context_window,
                temperature = EXCLUDED.temperature,
                max_tokens = EXCLUDED.max_tokens,
                active = EXCLUDED.active,
                enabled_pipeline_topics = EXCLUDED.enabled_pipeline_topics,
                enabled_rag_groups = EXCLUDED.enabled_rag_groups,
                enabled_mcp_servers = EXCLUDED.enabled_mcp_servers,
                enabled_data_tables = EXCLUDED.enabled_data_tables,
                updated_at = NOW()
        """, (
            personality_id, name, system_prompt_id, provider, model, tts_provider, tts_voice, avatar,
            welcome_message, guide_id, context_window, temperature, max_tokens, bool(active),
            e_topics, e_groups, e_mcp, e_tables, bool(False)
        ))
        if set_default:
            db_manager.exec(cur, "UPDATE personalities SET is_default = FALSE WHERE is_default = TRUE")
            db_manager.exec(cur, "UPDATE personalities SET is_default = TRUE, updated_at = NOW() WHERE id = ?", (personality_id,))
        conn.commit()
    return {"id": personality_id}


def delete_personality(personality_id: str) -> None:
    if not USING_POSTGRES:
        raise RuntimeError('Postgres richiesto: delete_personality usa il DB')
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT is_default FROM personalities WHERE id = ?", (personality_id,))
        row = cur.fetchone()
        if not row:
            raise ValueError("Personalità non trovata")
        was_default = bool(row[0]) if isinstance(row, (tuple, list)) else bool(row.get('is_default', False))
        db_manager.exec(cur, "DELETE FROM personalities WHERE id = ?", (personality_id,))
        if was_default:
            db_manager.exec(cur, "UPDATE personalities SET is_default = TRUE WHERE id = (SELECT id FROM personalities ORDER BY created_at LIMIT 1)")
        conn.commit()


def set_default_personality(personality_id: str) -> None:
    if not USING_POSTGRES:
        raise RuntimeError('Postgres richiesto: set_default_personality usa il DB')
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT 1 FROM personalities WHERE id = ?", (personality_id,))
        if not cur.fetchone():
            raise ValueError("Personalità non trovata")
        db_manager.exec(cur, "UPDATE personalities SET is_default = FALSE WHERE is_default = TRUE")
        db_manager.exec(cur, "UPDATE personalities SET is_default = TRUE, updated_at = NOW() WHERE id = ?", (personality_id,))
        conn.commit()


def get_personality(personality_id: str) -> Optional[Dict]:
    if not USING_POSTGRES:
        raise RuntimeError('Postgres richiesto: get_personality usa il DB')
    _ensure_personality_schema()
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        db_manager.exec(cur, "SELECT * FROM personalities WHERE id = ?", (personality_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        for k in ['enabled_pipeline_topics','enabled_rag_groups','enabled_mcp_servers','enabled_data_tables']:
            if k in d and isinstance(d[k], (bytes, str)):
                try:
                    d[k] = json.loads(d[k]) if d[k] else []
                except Exception:
                    d[k] = []
        return {
            'id': d.get('id'),
            'name': d.get('name'),
            'system_prompt_id': d.get('system_prompt_id'),
            'provider': d.get('provider'),
            'model': d.get('model'),
            'avatar': d.get('avatar'),
            'tts_provider': d.get('tts_provider'),
            'tts_voice': d.get('tts_voice'),
            'welcome_message': d.get('welcome_message'),
            'guide_id': d.get('guide_id'),
            'context_window': d.get('context_window'),
            'temperature': d.get('temperature'),
            'max_tokens': d.get('max_tokens'),
            'active': bool(d.get('active', True)),
            'enabled_pipeline_topics': d.get('enabled_pipeline_topics') or [],
            'enabled_rag_groups': d.get('enabled_rag_groups') or [],
            'enabled_mcp_servers': d.get('enabled_mcp_servers') or [],
            'enabled_data_tables': d.get('enabled_data_tables') or [],
        }
