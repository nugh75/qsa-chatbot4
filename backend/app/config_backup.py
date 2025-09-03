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
        ListedFile('seed_personalities', SEED_DIR / 'personalities.json', 'seed', required=False, include_by_default=False),
        # Runtime
    # Runtime principali (lowercase canonical). L'esistenza verrà verificata insieme a fallback uppercase.
    ListedFile('runtime_system_prompts', PROMPTS_RUNTIME_DIR / 'system_prompts.json', 'runtime'),
    ListedFile('runtime_summary_prompts', SUMMARY_RUNTIME_DIR / 'summary_prompts.json', 'runtime', required=False),
    ListedFile('runtime_personalities', PERSONALITIES_RUNTIME_DIR / 'personalities.json', 'runtime'),
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
    _maybe_upper(PERSONALITIES_RUNTIME_DIR, 'personalities.json')
    selection: List[ListedFile] = []
    for f in files:
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


def _validate_personalities(obj: dict):
    if not isinstance(obj, dict) or 'personalities' not in obj:
        raise RestoreError('personalities.json formato non valido')


VALIDATORS = {
    'pipeline_config.json': _validate_pipeline_config,
    'system_prompts.json': _validate_system_prompts,
    'summary_prompts.json': _validate_summary_prompts,
    'personalities.json': _validate_personalities,
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
                elif base_name == 'personalities.json':
                    target = PERSONALITIES_RUNTIME_DIR / 'personalities.json'
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
