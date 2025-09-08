#!/usr/bin/env python3
"""
scripts/update_api_key.py

Simple helper to update API_KEY in a .env (or other env-file) and optionally recreate docker-compose service(s)
without rebuilding images.

Usage examples:
  # Edit the API_KEY constant below and run to update .env only
  ./scripts/update_api_key.py

  # Update .env and recreate a specific service (no build)
  ./scripts/update_api_key.py --service backend-agrusti

  # Update a custom env-file and multiple services
  ./scripts/update_api_key.py --env-file .env.production --service backend-agrusti --service frontend-agrusti

Notes:
- The script edits the env file in place (creates a .bak backup).
- If docker compose is invoked, the script will run `docker compose -f docker-compose.multi.yml up -d --no-build --force-recreate <services...>`
  from the repository root.
- You can change the API key by editing the API_KEY constant below, or pass --key to override at runtime.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
from typing import List
import glob
import getpass

# ----- Edit this value before running (or pass --key / --set) -----
# Backwards-compatible default: a single API_KEY constant. You can leave this
# as-is or prefer passing keys via --set NAME=VALUE on the command line.
API_KEY = "PUT_NEW_API_KEY_HERE"
# ---------------------------------------------------------

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEFAULT_ENV_FILE = os.path.join(ROOT, '.env')
DOCKER_COMPOSE_FILE = os.path.join(ROOT, 'docker-compose.multi.yml')


def update_env_file(env_path: str, replacements: dict) -> bool:
    """Update or add multiple key=value pairs in env file. Creates a backup and writes file atomically.

    replacements: dict of NAME -> VALUE
    """
    if not os.path.exists(env_path):
        print(f"Env file {env_path} does not exist, creating new one.")
        with open(env_path, 'w') as f:
            for k, v in replacements.items():
                f.write(f"{k}={v}\n")
        return True

    # read
    with open(env_path, 'r') as f:
        lines = f.readlines()

    # prepare patterns
    patterns = {k: re.compile(rf'^\s*{re.escape(k)}\s*=') for k in replacements.keys()}
    found = {k: False for k in replacements.keys()}
    new_lines: List[str] = []
    for line in lines:
        matched = False
        for k, pat in patterns.items():
            if pat.match(line):
                new_lines.append(f"{k}={replacements[k]}\n")
                found[k] = True
                matched = True
                break
        if not matched:
            new_lines.append(line)

    # append missing keys
    for k, v in replacements.items():
        if not found.get(k, False):
            new_lines.append(f"{k}={v}\n")

    # backup original
    bak_path = env_path + '.bak'
    shutil.copy2(env_path, bak_path)
    with open(env_path, 'w') as f:
        f.writelines(new_lines)
    print(f"Updated {env_path} (backup at {bak_path})")
    return True


def recreate_services(services: List[str], compose_file: str) -> int:
    """Run docker compose up -d --no-build --force-recreate for the given services."""
    if not shutil.which('docker'):
        print('docker not found in PATH; skipping recreate')
        return 1
    cmd = ['docker', 'compose', '-f', compose_file, 'up', '-d', '--no-build', '--force-recreate'] + services
    print('Running:', ' '.join(cmd))
    proc = subprocess.run(cmd, cwd=ROOT)
    return proc.returncode


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--env-file', default=DEFAULT_ENV_FILE, help='Path to .env file to update')
    p.add_argument('--key', default=None, help='(deprecated) API key value to write (overrides constant)')
    p.add_argument('--name', default=None, help='(deprecated) variable name to write when using --key (default API_KEY)')
    p.add_argument('--set', action='append', help='Set a variable: NAME=VALUE (can be repeated)')
    p.add_argument('--service', action='append', help='Service name to recreate (can be repeated)')
    p.add_argument('--compose-file', default=DOCKER_COMPOSE_FILE, help='docker-compose file to use (default docker-compose.multi.yml)')
    p.add_argument('--no-restart', action='store_true', help='Do not restart/recreate services; only update env file')
    return p.parse_args()


def main():
    args = parse_args()

    # Build replacements dict from --set or from legacy flags
    replacements = {}
    if args.set:
        for item in args.set:
            if '=' not in item:
                print(f"Invalid --set value: {item}. Use NAME=VALUE")
                sys.exit(2)
            name, val = item.split('=', 1)
            replacements[name.strip()] = val

    # Backwards compatibility: --key [--name]
    if args.key:
        name = args.name or 'API_KEY'
        replacements[name] = args.key

    # If no replacements provided on CLI, run interactive menu
    if not replacements:
        # Interactive flow
        print('\n--- Interactive update flow ---')
        # discover env files
        candidates = sorted([p for p in glob.glob(os.path.join(ROOT, '.env*')) if os.path.isfile(p) and not p.endswith('.bak')])
        # normalize paths to relative
        rel_candidates = [os.path.relpath(p, ROOT) for p in candidates]
        print('\nFound env files:')
        for i, p in enumerate(rel_candidates, start=1):
            print(f'  {i}) {p}')
        print('  n) Enter custom path')
        choice = input('\nSelect env file number (default 1): ').strip() or '1'
        if choice.lower() == 'n':
            env_file_input = input('Enter path to env file: ').strip()
            env_file = os.path.abspath(env_file_input)
        else:
            try:
                idx = int(choice) - 1
                env_file = os.path.abspath(os.path.join(ROOT, rel_candidates[idx]))
            except Exception:
                print('Invalid selection, using default .env')
                env_file = DEFAULT_ENV_FILE

        if not os.path.exists(env_file):
            print(f'Env file {env_file} does not exist. It will be created.')

        # Read keys from env_file if exists
        keys = []
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    m = re.match(r'^\s*([A-Za-z0-9_]+)\s*=.*$', line)
                    if m:
                        keys.append(m.group(1))

        print('\nDetected keys in file:')
        if keys:
            for i,k in enumerate(keys, start=1):
                print(f'  {i}) {k}')
        else:
            print('  (none)')

        print('  n) Enter a new variable name')
        key_choice = input('\nSelect variable to update (number or n): ').strip() or 'n'
        if key_choice.lower() == 'n':
            keyname = input('Enter variable name (e.g. OPENAI_API_KEY): ').strip()
        else:
            try:
                keyname = keys[int(key_choice)-1]
            except Exception:
                print('Invalid selection, aborting')
                sys.exit(2)

        # Prompt for new value (masked)
        newval = getpass.getpass(prompt=f'Enter new value for {keyname} (input hidden): ')
        if not newval:
            print('Empty value provided, aborting')
            sys.exit(2)

        # Which service to recreate
        svc = input('\nEnter docker-compose service name to recreate (e.g. backend-agrusti). Leave blank to skip recreate: ').strip()
        services = [svc] if svc else []

        # confirm
        print('\nSummary:')
        print(f'  env file: {env_file}')
        print(f'  variable: {keyname}')
        print(f'  services: {", ".join(services) if services else "(none)"}')
        ok = input('Proceed? (y/N): ').strip().lower() == 'y'
        if not ok:
            print('Aborted')
            sys.exit(0)

        replacements[keyname] = newval

    env_file = os.path.abspath(args.env_file)
    ok = update_env_file(env_file, replacements)
    if not ok:
        print('Failed to update env file')
        sys.exit(1)

    if args.no_restart:
        print('Updated env file; not restarting services (per --no-restart)')
        return

    services = args.service or []
    # if interactive collected a service earlier, keep it
    if not services and 'svc' in locals() and svc:
        services = [svc]
    if not services:
        answer = input('No services provided. Recreate all services from compose? (y/N) ')
        if answer.lower() != 'y':
            print('Skipping recreate.')
            return

    rc = recreate_services(services, args.compose_file)
    if rc == 0:
        print('Recreate complete')
    else:
        print('Recreate failed with code', rc)
        sys.exit(rc)
    # verification: check env inside container if a specific service was recreated
    if services:
        for s in services:
            if not shutil.which('docker'):
                print('docker not found; cannot exec into container to verify')
                continue
            try:
                proc = subprocess.run(['docker', 'compose', '-f', args.compose_file, 'exec', s, 'env'], capture_output=True, text=True, cwd=ROOT)
                if proc.returncode == 0:
                    found = False
                    for line in proc.stdout.splitlines():
                        if line.startswith(f"{list(replacements.keys())[0]}="):
                            print(f"Inside container {s}: {line}")
                            found = True
                            break
                    if not found:
                        print(f"Variable {list(replacements.keys())[0]} not found inside container {s}. It may not be sourced at runtime.")
                else:
                    print(f"Failed to exec into {s} to verify: exit {proc.returncode}")
            except Exception as e:
                print('Verification error:', e)


if __name__ == '__main__':
    main()
