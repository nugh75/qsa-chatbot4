"""Utility per backup e restore dei file di configurazione.

Espone funzioni usate dagli endpoint admin:
  - create_backup_zip(options)
  - restore_from_zip(file_like, options)

Il backup produce un archivio ZIP contenente:
  manifest.json   (metadata + hash + elenco file)
  files/<path_relativizzato>

Politica nomi: tutti i file di configurazione sono lowercase.
"""
from __future__ import annotations

import io
import json
import zipfile
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Iterable
import re

BASE_DIR = Path(__file__).resolve().parent.parent  # /app/backend
CONFIG_DIR = BASE_DIR / 'config'
SEED_DIR = CONFIG_DIR / 'seed'
STORAGE_BASE = Path('/app/storage')  # runtime persistente
try:
    # DB context for Postgres-aware backup (personalities)
    from .database import db_manager, USING_POSTGRES
except Exception:  # pragma: no cover
    db_manager = None
    USING_POSTGRES = False

# Runtime paths coerenti con moduli esistenti
PROMPTS_RUNTIME_DIR = STORAGE_BASE / 'prompts'
SUMMARY_RUNTIME_DIR = STORAGE_BASE / 'summary'
PERSONALITIES_RUNTIME_DIR = STORAGE_BASE / 'personalities'
"""NOTE su pipeline storage:
Prima puntava a BASE_DIR / 'storage' / 'pipeline' (non persistente). Ora usiamo lo
storage runtime persistente sotto /app/storage/pipeline così il file regex guide
viene incluso nel backup e sopravvive ai rebuild.
"""
PIPELINE_STORAGE_DIR = STORAGE_BASE / 'pipeline'
ADMIN_GUIDE_RUNTIME_PATH = STORAGE_BASE / 'admin' / 'ADMIN_GUIDE.md'


@dataclass
class ListedFile:
    id: str
    path: Path
    kind: str  # core | runtime | seed | optional
    required: bool = True
    include_by_default: bool = True

    def exists(self) -> bool:
        return self.path.exists()


def _file_list() -> List[ListedFile]:
    return [
        ListedFile('admin_config', CONFIG_DIR / 'admin_config.json', 'core'),
        ListedFile('pipeline_config', CONFIG_DIR / 'pipeline_config.json', 'core'),
        ListedFile('mcp_config', CONFIG_DIR / 'mcp_config.json', 'core', required=False),
        # Seed (non inclusi di default a meno di include_seed)
        ListedFile('seed_system_prompts', SEED_DIR / 'system_prompts.json', 'seed', required=False, include_by_default=False),
        ListedFile('seed_summary_prompt', SEED_DIR / 'summary_prompt.md', 'seed', required=False, include_by_default=False),
        # Runtime
    # Runtime principali (lowercase canonical). L'esistenza verrà verificata insieme a fallback uppercase.
    ListedFile('runtime_system_prompts', PROMPTS_RUNTIME_DIR / 'system_prompts.json', 'runtime'),
    ListedFile('runtime_summary_prompts', SUMMARY_RUNTIME_DIR / 'summary_prompts.json', 'runtime', required=False),
    # personalities.json rimosso: gestione esclusiva via Postgres
        ListedFile('pipeline_regex_guide', PIPELINE_STORAGE_DIR / 'pipeline_regex_guide.json', 'runtime', required=False, include_by_default=False),
    ListedFile('admin_guide', ADMIN_GUIDE_RUNTIME_PATH, 'runtime', required=False, include_by_default=True),
    ]


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_backup_zip(
    include_seed: bool = False,
    include_optional: bool = False,
    include_regex_guide: bool = False,
    include_admin_guide: bool = True,
    include_avatars: bool = False,
    include_db: bool = True,
) -> bytes:
    files = _file_list()
    # Gestione fallback uppercase (compatibilità). Se il file canonical lowercase NON esiste ma esiste la variante uppercase
    # la includiamo usando il path reale e nei metadati segnaliamo canonical_lowercase.
    uppercase_fallbacks: List[Dict] = []
    def _maybe_upper(real_dir: Path, lower_name: str):
        lower_path = real_dir / lower_name
        upper_path = real_dir / lower_name.upper()
        if (not lower_path.exists()) and upper_path.exists():
            # Creiamo un ListedFile ad-hoc con id consistente ma path uppercase.
            # Non modifichiamo l'oggetto originale; aggiungiamo dopo.
            lf_id = f"{lower_name.replace('.','_')}__uppercase_fallback"
            uppercase_fallbacks.append({
                'id': lf_id,
                'lower_id': lower_name,
                'path': upper_path,
                'canonical': str(lower_path)
            })

    _maybe_upper(PROMPTS_RUNTIME_DIR, 'system_prompts.json')
    _maybe_upper(SUMMARY_RUNTIME_DIR, 'summary_prompts.json')
    selection: List[ListedFile] = []
    for f in files:
        # Se usiamo Postgres, escludi personalities runtime/seed dal backup file-based
        if USING_POSTGRES and f.id in ('seed_personalities','runtime_personalities'):
            continue
        if f.kind == 'seed' and not include_seed:
            continue
        if f.id == 'pipeline_regex_guide' and not include_regex_guide:
            continue
        if f.id == 'admin_guide' and not include_admin_guide:
            continue
        if not f.include_by_default and f.kind not in ('seed',):
            # runtime optional non richiesti
            continue
        if f.kind == 'core' and not f.exists() and not f.required:
            continue
        if f.kind == 'core' and not f.exists() and f.required:
            # se manca un core richiesto saltiamo ma segnaliamo nel manifest
            pass
        selection.append(f)

    # Aggiungiamo i fallback uppercase come pseudo ListedFile dinamici
    dynamic_upper_listed: List[ListedFile] = []
    for fb in uppercase_fallbacks:
        path = fb['path']
        lf = ListedFile(fb['id'], path, 'runtime', required=False, include_by_default=True)
        dynamic_upper_listed.append(lf)
        selection.append(lf)

    avatar_files: List[Path] = []
    if include_avatars:
        avatars_dir = STORAGE_BASE / 'avatars'
        if avatars_dir.exists():
            for p in avatars_dir.iterdir():
                if p.is_file() and re.search(r"\.(png|jpg|jpeg|webp|gif)$", p.name, re.I):
                    avatar_files.append(p)

    zip_buffer = io.BytesIO()
    manifest_entries: List[Dict] = []
    with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for lf in selection:
            if not lf.exists():
                manifest_entries.append({
                    'id': lf.id,
                    'path': str(lf.path),
                    'missing': True,
                    'kind': lf.kind
                })
                continue
            data = lf.path.read_bytes()
            rel = f"files/{lf.id}__{lf.path.name}"  # simple unique mapping
            zf.writestr(rel, data)
            entry = {
                'id': lf.id,
                'path': str(lf.path),
                'archive_path': rel,
                'kind': lf.kind,
                'bytes': len(data),
                'sha256': _hash_bytes(data)
            }
            # Se entry è un fallback uppercase arricchiamo i metadati
            for fb in uppercase_fallbacks:
                if fb['path'] == lf.path and fb['id'] == lf.id:
                    entry['uppercase_fallback_for'] = fb['lower_id']
                    entry['canonical_lowercase'] = fb['canonical']
            manifest_entries.append(entry)
        if avatar_files:
            for av in avatar_files:
                try:
                    data = av.read_bytes()
                    rel = f"avatars/{av.name}"
                    zf.writestr(rel, data)
                    manifest_entries.append({
                        'id': 'avatar',
                        'path': str(av),
                        'archive_path': rel,
                        'kind': 'avatar',
                        'bytes': len(data),
                        'sha256': _hash_bytes(data)
                    })
                except Exception:
                    pass

        # Aggiungi dump DB (personalities + tabelle) se richiesto e Postgres attivo
        if include_db and USING_POSTGRES and db_manager is not None:
            try:
                with db_manager.get_connection() as conn:
                    cur = conn.cursor()
                    db_manager.exec(cur, "SELECT * FROM personalities ORDER BY name")
                    rows = cur.fetchall()
                    items = []
                    default_id = None
                    for r in rows:
                        d = dict(r)
                        if d.get('is_default'):
                            default_id = d.get('id')
                        # Ensure JSONB are serializable
                        for k in ('enabled_pipeline_topics','enabled_rag_groups','enabled_mcp_servers'):
                            v = d.get(k)
                            if isinstance(v, (bytes, str)):
                                try:
                                    d[k] = json.loads(v) if v else []
                                except Exception:
                                    d[k] = []
                        items.append(d)
                    payload = {
                        'default_id': default_id,
                        'personalities': items,
                    }
                    zf.writestr('db_personalities.json', json.dumps(payload, ensure_ascii=False, indent=2))
                    manifest_entries.append({
                        'id': 'db_personalities', 'path': 'DB:personalities', 'archive_path': 'db_personalities.json',
                        'kind': 'db', 'bytes': len(json.dumps(payload).encode('utf-8')),
                        'sha256': _hash_bytes(json.dumps(payload).encode('utf-8'))
                    })
                # Dump tabelle principali in JSONL (per ripristino manuale)
                import base64
                def _safe(val):
                    from datetime import datetime
                    if val is None:
                        return None
                    if isinstance(val, (int, float, bool, str)):
                        return val
                    # psycopg2 BYTEA -> memoryview/bytes
                    if isinstance(val, (bytes, memoryview)):
                        return {"__base64__": True, "data": base64.b64encode(bytes(val)).decode('ascii')}
                    # datetime/date
                    try:
                        if hasattr(val, 'isoformat'):
                            return val.isoformat()
                    except Exception:
                        pass
                    # fallback string
                    return str(val)

                TABLES = [
                    'users','conversations','messages','devices','device_sync_log','admin_actions',
                    'survey_responses','user_devices','rag_groups','rag_documents','rag_chunks'
                ]
                db_summary = []
                with db_manager.get_connection() as conn2:
                    cur2 = conn2.cursor()
                    for t in TABLES:
                        try:
                            db_manager.exec(cur2, f'SELECT * FROM "{t}"')
                            cols = [d[0] for d in cur2.description] if cur2.description else []
                            rows = cur2.fetchall()
                            # write jsonl
                            lines = []
                            for r in rows:
                                obj = {}
                                rowd = dict(r) if not isinstance(r, (tuple, list)) else None
                                if rowd is None:
                                    for i, c in enumerate(cols):
                                        obj[c] = _safe(r[i])
                                else:
                                    for c in cols:
                                        obj[c] = _safe(rowd.get(c))
                                lines.append(json.dumps(obj, ensure_ascii=False))
                            path = f'db_dump/{t}.jsonl'
                            zf.writestr(path, '\n'.join(lines))
                            manifest_entries.append({
                                'id': f'db_dump_{t}', 'path': f'DB:{t}', 'archive_path': path, 'kind': 'db',
                                'bytes': sum(len(l.encode('utf-8')) for l in lines),
                                'sha256': _hash_bytes('\n'.join(lines).encode('utf-8'))
                            })
                            db_summary.append({"table": t, "rows": len(rows)})
                        except Exception:
                            # Skip table on error to not block backup
                            db_summary.append({"table": t, "rows": None, "error": True})
                    zf.writestr('db_tables.json', json.dumps(db_summary, ensure_ascii=False, indent=2))
                    manifest_entries.append({
                        'id': 'db_tables', 'path': 'DB:summary', 'archive_path': 'db_tables.json', 'kind': 'db',
                        'bytes': len(json.dumps(db_summary).encode('utf-8')),
                        'sha256': _hash_bytes(json.dumps(db_summary).encode('utf-8'))
                    })
            except Exception:
                # Non bloccare backup se dump fallisce
                pass

        manifest = {
            'version': 1,
            'include_seed': include_seed,
            'include_avatars': include_avatars,
            'generated_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
            'entries': manifest_entries
        }
        zf.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False))

    return zip_buffer.getvalue()


class RestoreError(Exception):
    pass

def create_db_dump_zip(tables: Optional[List[str]] = None) -> bytes:
    """Crea uno ZIP contenente solo i dump del database (JSONL) + summary e personalities.

    tables: elenco di tabelle da includere. Se None, usa l'elenco predefinito.
    """
    if not USING_POSTGRES or db_manager is None:
        raise RuntimeError('Database Postgres richiesto per DB dump')

    default_tables = [
        'users','conversations','messages','devices','device_sync_log','admin_actions',
        'survey_responses','user_devices','rag_groups','rag_documents','rag_chunks'
    ]
    tables = tables or default_tables

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        # personalities
        try:
            with db_manager.get_connection() as conn:
                cur = conn.cursor()
                db_manager.exec(cur, "SELECT * FROM personalities ORDER BY name")
                rows = cur.fetchall()
                items = []
                default_id = None
                for r in rows:
                    d = dict(r)
                    if d.get('is_default'):
                        default_id = d.get('id')
                    for k in ('enabled_pipeline_topics','enabled_rag_groups','enabled_mcp_servers'):
                        v = d.get(k)
                        if isinstance(v, (bytes, str)):
                            try:
                                d[k] = json.loads(v) if v else []
                            except Exception:
                                d[k] = []
                    items.append(d)
                payload = {'default_id': default_id, 'personalities': items}
                zf.writestr('db_personalities.json', json.dumps(payload, ensure_ascii=False, indent=2))
        except Exception:
            pass

        # summary + dumps
        import base64
        def _safe(val):
            from datetime import datetime
            if val is None:
                return None
            if isinstance(val, (int, float, bool, str)):
                return val
            if isinstance(val, (bytes, memoryview)):
                return {"__base64__": True, "data": base64.b64encode(bytes(val)).decode('ascii')}
            try:
                if hasattr(val, 'isoformat'):
                    return val.isoformat()
            except Exception:
                pass
            return str(val)

        summary = []
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            for t in tables:
                try:
                    db_manager.exec(cur, f'SELECT * FROM "{t}"')
                    cols = [d[0] for d in cur.description] if cur.description else []
                    rows = cur.fetchall()
                    lines = []
                    for r in rows:
                        obj = {}
                        rowd = dict(r) if not isinstance(r, (tuple, list)) else None
                        if rowd is None:
                            for i, c in enumerate(cols):
                                obj[c] = _safe(r[i])
                        else:
                            for c in cols:
                                obj[c] = _safe(rowd.get(c))
                        lines.append(json.dumps(obj, ensure_ascii=False))
                    zf.writestr(f'db_dump/{t}.jsonl', '\n'.join(lines))
                    summary.append({"table": t, "rows": len(rows)})
                except Exception as e:
                    summary.append({"table": t, "rows": None, "error": str(e)})
        zf.writestr('db_tables.json', json.dumps(summary, ensure_ascii=False, indent=2))

    return zip_buffer.getvalue()


def _validate_pipeline_config(obj: dict):
    if not isinstance(obj, dict):
        raise RestoreError('pipeline_config.json non è un oggetto JSON')
    routes = obj.get('routes', [])
    if not isinstance(routes, list):
        raise RestoreError('routes deve essere una lista')
    for r in routes:
        pat = r.get('pattern') if isinstance(r, dict) else None
        if not isinstance(pat, str):
            raise RestoreError('pattern mancante o non stringa nella pipeline')
        try:
            re.compile(pat)
        except re.error as e:
            raise RestoreError(f'regex non valida: {pat} -> {e}')


def _validate_system_prompts(obj: dict):
    if not isinstance(obj, dict) or 'prompts' not in obj:
        raise RestoreError('system_prompts.json formato non valido')


def _validate_summary_prompts(obj: dict):
    if not isinstance(obj, dict) or 'prompts' not in obj:
        raise RestoreError('summary_prompts.json formato non valido')


VALIDATORS = {
    'pipeline_config.json': _validate_pipeline_config,
    'system_prompts.json': _validate_system_prompts,
    'summary_prompts.json': _validate_summary_prompts,
}


def restore_from_zip(data: bytes, dry_run: bool = False, allow_seed: bool = False) -> Dict:
    """Ritorna dettagli ripristino. Non sovrascrive file se dry_run True.

    allow_seed: se False evita di sovrascrivere file sotto seed/.
    """
    buf = io.BytesIO(data)
    with zipfile.ZipFile(buf, 'r') as zf:
        # Carica manifest se presente
        manifest = None
        if 'manifest.json' in zf.namelist():
            try:
                manifest = json.loads(zf.read('manifest.json').decode('utf-8'))
            except Exception:
                raise RestoreError('manifest.json non leggibile')
        extracted: List[Dict] = []
        errors: List[str] = []
        planned_writes: List[tuple[Path, bytes]] = []
        for name in zf.namelist():
            if name.endswith('/'):
                continue
            if name == 'manifest.json':
                continue
            # Import DB personalities dump if present and Postgres attivo
            if name == 'db_personalities.json' and USING_POSTGRES and db_manager is not None:
                try:
                    raw = zf.read(name)
                    data_obj = json.loads(raw.decode('utf-8'))
                    items = data_obj.get('personalities', [])
                    default_id = data_obj.get('default_id')
                    with db_manager.get_connection() as conn:
                        cur = conn.cursor()
                        for p in items:
                            # Normalizza JSONB
                            e_topics = json.dumps(p.get('enabled_pipeline_topics') or [])
                            e_groups = json.dumps(p.get('enabled_rag_groups') or [])
                            e_mcp = json.dumps(p.get('enabled_mcp_servers') or [])
                            db_manager.exec(cur, """
                                INSERT INTO personalities (
                                    id, name, system_prompt_id, provider, model, tts_provider, tts_voice, avatar,
                                    welcome_message, guide_id, context_window, temperature, max_tokens, active,
                                    enabled_pipeline_topics, enabled_rag_groups, enabled_mcp_servers, is_default, created_at, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
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
                                    updated_at = NOW()
                            """, (
                                p.get('id'), p.get('name'), p.get('system_prompt_id'), p.get('provider'), p.get('model'),
                                p.get('tts_provider'), p.get('tts_voice'), p.get('avatar'), p.get('welcome_message'), p.get('guide_id'),
                                p.get('context_window'), p.get('temperature'), p.get('max_tokens'), bool(p.get('active', True)),
                                e_topics, e_groups, e_mcp, bool(p.get('is_default', False))
                            ))
                        if default_id:
                            db_manager.exec(cur, "UPDATE personalities SET is_default = FALSE WHERE is_default = TRUE")
                            db_manager.exec(cur, "UPDATE personalities SET is_default = TRUE WHERE id = ?", (default_id,))
                        conn.commit()
                    extracted.append({'imported_db_personalities': len(items)})
                except Exception as e:
                    errors.append(f'db_personalities.json import failed: {e}')
                continue
            # Limita ai file sotto files/
            if not (name.startswith('files/') or name.startswith('avatars/')):
                continue
            raw = zf.read(name)
            base_name = Path(name).name
            # Determina destinazione
            target: Optional[Path] = None
            if base_name.endswith('.json') or base_name.endswith('.md'):
                # Mapping semplice su base_name
                if base_name == 'admin_config.json':
                    target = CONFIG_DIR / 'admin_config.json'
                elif base_name == 'pipeline_config.json':
                    target = CONFIG_DIR / 'pipeline_config.json'
                elif base_name == 'mcp_config.json':
                    target = CONFIG_DIR / 'mcp_config.json'
                elif base_name == 'system_prompts.json':
                    target = PROMPTS_RUNTIME_DIR / 'system_prompts.json'
                elif base_name == 'summary_prompts.json':
                    target = SUMMARY_RUNTIME_DIR / 'summary_prompts.json'
                # personalities.json rimosso (gestita via DB)
                elif base_name == 'summary_prompt.md':
                    # seed / non sovrascrivere seed se non allow_seed
                    target = SEED_DIR / 'summary_prompt.md'
                else:
                    # ignora file non riconosciuto
                    extracted.append({'ignored': name})
            elif name.startswith('avatars/'):
                avatars_dir = STORAGE_BASE / 'avatars'
                avatars_dir.mkdir(parents=True, exist_ok=True)
                target = avatars_dir / base_name
            if not target:
                continue
            # Seed protection
            if not allow_seed and SEED_DIR in target.parents:
                extracted.append({'skipped_seed': str(target)})
                continue
            # Validazione JSON se necessario
            if target.suffix == '.json':
                try:
                    parsed = json.loads(raw.decode('utf-8'))
                except Exception as e:
                    errors.append(f'{base_name}: JSON non valido ({e})')
                    continue
                validator = VALIDATORS.get(base_name)
                if validator:
                    try:
                        validator(parsed)
                    except RestoreError as ve:
                        errors.append(f'{base_name}: {ve}')
                        continue
            if target.suffix == '.md' and base_name == 'summary_prompt.md':
                # controllo minimo dimensione
                if len(raw) < 10:
                    errors.append('summary_prompt.md troppo corto')
                    continue
            planned_writes.append((target, raw))
            extracted.append({'will_write': str(target)})
        if errors:
            return {'success': False, 'errors': errors}
        if dry_run:
            return {'success': True, 'dry_run': True, 'writes': [str(p[0]) for p in planned_writes]}
        # Esegui scritture
        for target, raw in planned_writes:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        return {'success': True, 'written': [str(p[0]) for p in planned_writes]}
