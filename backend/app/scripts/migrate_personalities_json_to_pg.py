"""
Migrate personalities from JSON runtime file to Postgres table.

Reads /app/storage/personalities/personalities.json and inserts into 'personalities'.

Run inside backend container:
  python -m app.scripts.migrate_personalities_json_to_pg
"""
import os
import json
from pathlib import Path

RUNTIME_FILE = Path('/app/storage/personalities/personalities.json')

def main() -> int:
    db_url = os.getenv('DATABASE_URL')
    if not db_url or not db_url.startswith('postgres'):
        print('[migrate_personalities] DATABASE_URL non configurato o non Postgres')
        return 1
    if not RUNTIME_FILE.exists():
        print(f"[migrate_personalities] File non trovato: {RUNTIME_FILE}")
        return 2
    try:
        import psycopg2
        from psycopg2.extras import Json
    except Exception as e:
        print(f"[migrate_personalities] psycopg2 non disponibile: {e}")
        return 3
    data = json.loads(RUNTIME_FILE.read_text(encoding='utf-8'))
    items = data.get('personalities', []) if isinstance(data, dict) else []
    default_id = data.get('default_id') if isinstance(data, dict) else None
    if not items:
        print('[migrate_personalities] Nessuna personalità trovata')
        return 0
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        for p in items:
            cur.execute(
                '''INSERT INTO personalities (
                       id, name, system_prompt_id, provider, model, tts_provider, tts_voice, avatar,
                       welcome_message, guide_id, context_window, temperature, max_tokens, active,
                       enabled_pipeline_topics, enabled_rag_groups, enabled_mcp_servers, is_default, created_at, updated_at
                   ) VALUES (
                       %(id)s, %(name)s, %(system_prompt_id)s, %(provider)s, %(model)s, %(tts_provider)s, %(tts_voice)s, %(avatar)s,
                       %(welcome_message)s, %(guide_id)s, %(context_window)s, %(temperature)s, %(max_tokens)s, %(active)s,
                       %(enabled_pipeline_topics)s, %(enabled_rag_groups)s, %(enabled_mcp_servers)s, %(is_default)s, NOW(), NOW()
                   )
                   ON CONFLICT (id) DO UPDATE SET
                       name=EXCLUDED.name,
                       system_prompt_id=EXCLUDED.system_prompt_id,
                       provider=EXCLUDED.provider,
                       model=EXCLUDED.model,
                       tts_provider=EXCLUDED.tts_provider,
                       tts_voice=EXCLUDED.tts_voice,
                       avatar=COALESCE(EXCLUDED.avatar, personalities.avatar),
                       welcome_message=EXCLUDED.welcome_message,
                       guide_id=EXCLUDED.guide_id,
                       context_window=EXCLUDED.context_window,
                       temperature=EXCLUDED.temperature,
                       max_tokens=EXCLUDED.max_tokens,
                       active=EXCLUDED.active,
                       enabled_pipeline_topics=EXCLUDED.enabled_pipeline_topics,
                       enabled_rag_groups=EXCLUDED.enabled_rag_groups,
                       enabled_mcp_servers=EXCLUDED.enabled_mcp_servers,
                       updated_at=NOW()
                ''', {
                    'id': p.get('id'),
                    'name': p.get('name'),
                    'system_prompt_id': p.get('system_prompt_id'),
                    'provider': p.get('provider'),
                    'model': p.get('model'),
                    'tts_provider': p.get('tts_provider'),
                    'tts_voice': p.get('tts_voice'),
                    'avatar': p.get('avatar'),
                    'welcome_message': p.get('welcome_message'),
                    'guide_id': p.get('guide_id'),
                    'context_window': p.get('context_window'),
                    'temperature': p.get('temperature'),
                    'max_tokens': p.get('max_tokens'),
                    'active': bool(p.get('active', True)),
                    'enabled_pipeline_topics': Json(p.get('enabled_pipeline_topics') or []),
                    'enabled_rag_groups': Json(p.get('enabled_rag_groups') or []),
                    'enabled_mcp_servers': Json(p.get('enabled_mcp_servers') or []),
                    'is_default': False,
                }
            )
        if default_id:
            cur.execute("UPDATE personalities SET is_default = FALSE WHERE is_default = TRUE")
            cur.execute("UPDATE personalities SET is_default = TRUE WHERE id = %s", (default_id,))
        conn.commit()
        print('[migrate_personalities] ✅ Migrazione completata')
        return 0
    except Exception as e:
        conn.rollback()
        print(f"[migrate_personalities] ❌ Errore migrazione: {e}")
        return 4
    finally:
        conn.close()

if __name__ == '__main__':
    raise SystemExit(main())

