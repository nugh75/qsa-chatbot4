import os, sys, json, asyncio, httpx
from pathlib import Path

"""Quick script: fetch /api/admin/config/status and print aggregate hash.
Usage:
  python -m app.scripts.test_config_status [BASE_URL] [ADMIN_TOKEN]
Defaults:
  BASE_URL = http://localhost:8000
  ADMIN_TOKEN from env ADMIN_BEARER or passed as arg
Exit code 0 if success, 1 if request fails.
"""

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else os.getenv('BASE_URL', 'http://localhost:8000')
TOKEN = sys.argv[2] if len(sys.argv) > 2 else os.getenv('ADMIN_BEARER')

if not TOKEN:
    print("[ERROR] Missing admin bearer token. Provide as arg or env ADMIN_BEARER.")
    sys.exit(1)

async def main():
    url = BASE_URL.rstrip('/') + '/api/admin/config/status'
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(url, headers={'Authorization': f'Bearer {TOKEN}'})
        if r.status_code != 200:
            print(f"[FAIL] {r.status_code} {r.text}")
            sys.exit(1)
        data = r.json()
        print("Aggregate SHA256:", data.get('aggregate_sha256'))
        print("Files:")
        for f in data.get('files', []):
            print(f"  - {f.get('relative')}: {f.get('sha256')}{' (missing)' if not f.get('exists') else ''}")
        # Simple machine-readable line
        print("STATUS_OK aggregate=", data.get('aggregate_sha256'))

if __name__ == '__main__':
    asyncio.run(main())
