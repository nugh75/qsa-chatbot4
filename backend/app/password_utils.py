"""Password hashing utilities with bcrypt and legacy SHA256 fallback/upgrade.

Format conventions:
- New bcrypt hashes stored as returned by bcrypt (prefix $2b$ or $2a$).
- Legacy SHA256 hashes detected as 64 hex chars matching re ^[0-9a-f]{64}$.
On successful login with a legacy hash, the caller can re-hash with bcrypt and store the upgraded hash.
"""
from __future__ import annotations
import re
import hashlib
import bcrypt
from typing import Tuple

_SHA256_RE = re.compile(r'^[0-9a-f]{64}$')

def hash_password_bcrypt(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def is_legacy_sha256(hash_value: str) -> bool:
    return bool(_SHA256_RE.match(hash_value)) and not hash_value.startswith('$2')

def verify_password(password: str, stored_hash: str) -> Tuple[bool, bool]:
    """Verify password.
    Returns (valid, needs_upgrade).
    needs_upgrade=True when the stored hash is legacy SHA256 and password matches, so caller can upgrade.
    """
    if stored_hash.startswith('$2a$') or stored_hash.startswith('$2b$') or stored_hash.startswith('$2y$'):
        try:
            ok = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
            return ok, False
        except Exception:
            return False, False
    # Legacy SHA256
    if is_legacy_sha256(stored_hash):
        sha = hashlib.sha256(password.encode('utf-8')).hexdigest()
        if sha == stored_hash:
            return True, True
        return False, False
    # Unknown format -> fail safe
    return False, False

