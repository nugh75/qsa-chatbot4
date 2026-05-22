import os, sys, json, asyncio, httpx, tempfile
from pathlib import Path

"""Dry-run backup + restore validation script.
Usage:
  python -m app.scripts.test_config_backup_restore [BASE_URL] [ADMIN_TOKEN]
Notes:
  - Performs dry_run backup (include_seed=true) to inspect manifest.
  - Downloads real backup ZIP (dry_run=false) to temp file.
  - Re-uploads the ZIP with restore dry_run=true to validate.
  - Does NOT modify server state.
Exit codes:
  0 success, 1 failure.
"""

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else os.getenv('BASE_URL', 'http://localhost:8000')
TOKEN = sys.argv[2] if len(sys.argv) > 2 else os.getenv('ADMIN_BEARER')

if not TOKEN:
    print("[ERROR] Missing admin bearer token. Provide as arg or env ADMIN_BEARER.")
    sys.exit(1)

async def main():
    async with httpx.AsyncClient(timeout=30) as cx:
        base = BASE_URL.rstrip('/')
        # Dry run backup manifest only
        dry_url = f"{base}/api/admin/config/backup?include_seed=true&dry_run=true"
        r = await cx.get(dry_url, headers={'Authorization': f'Bearer {TOKEN}'})
        if r.status_code != 200:
            print('[FAIL] dry_run backup error', r.status_code, r.text)
            return 1
        manifest_preview = r.json()
        print('[INFO] Dry-run entries:', len(manifest_preview.get('manifest', {}).get('entries', [])))
        # Real backup download
        real_url = f"{base}/api/admin/config/backup?include_seed=true&dry_run=false"
        r2 = await cx.get(real_url, headers={'Authorization': f'Bearer {TOKEN}'})
        if r2.status_code != 200 or 'application/zip' not in r2.headers.get('content-type',''):
            print('[FAIL] real backup error', r2.status_code, r2.text[:200])
            return 1
        with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tf:
            tf.write(r2.content)
            zip_path = tf.name
        print('[INFO] Saved backup ZIP to', zip_path)
        # Restore dry-run
        restore_url = f"{base}/api/admin/config/restore?dry_run=true&allow_seed=false"
        with open(zip_path, 'rb') as fh:
            files = {'file': ('backup.zip', fh, 'application/zip')}
            r3 = await cx.post(restore_url, headers={'Authorization': f'Bearer {TOKEN}'}, files=files)
        if r3.status_code != 200:
            print('[FAIL] restore dry_run validation error', r3.status_code, r3.text[:300])
            return 1
        resp = r3.json()
        print('[INFO] Restore dry_run applied count:', resp.get('applied_count'))
        print('[INFO] Restore skipped count:', resp.get('skipped_count'))
        print('[INFO] Validation errors:', resp.get('validation_errors'))
        if resp.get('validation_errors'):
            print('[WARN] There were validation warnings/errors.')
        print('[SUCCESS] Backup/restore dry-run sequence OK')
        return 0

if __name__ == '__main__':
    rc = asyncio.run(main())
    sys.exit(rc if isinstance(rc, int) else 0)
