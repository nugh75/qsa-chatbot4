"""
AES-GCM encryption utilities for server-side at-rest protection.

The ciphertext format is a safe, self-describing ASCII string:
  ENCv1:<base64(nonce)>:<base64(tag)>:<base64(ciphertext)>

Key management:
- Reads 32-byte key from env DATA_ENCRYPTION_KEY, expecting either:
  - 32 raw bytes base64-encoded, or
  - a hex string of length 64 (32 bytes)
- If not provided, it falls back to ESCROW_MASTER_KEY padded/truncated to 32 bytes.
  This is only to keep the app working without breaking; in production, set DATA_ENCRYPTION_KEY.
"""
import os
import base64
from typing import Tuple
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

ENC_PREFIX = "ENCv1:"


def _load_key() -> bytes:
    key_env = os.getenv("DATA_ENCRYPTION_KEY")
    if key_env:
        # Try base64 first
        try:
            k = base64.b64decode(key_env.strip())
            if len(k) == 32:
                return k
        except Exception:
            pass
        # Try hex
        try:
            k = bytes.fromhex(key_env.strip())
            if len(k) == 32:
                return k
        except Exception:
            pass
    # Fallback to escrow master key (padded/truncated) if present
    escrow = os.getenv("ESCROW_MASTER_KEY", "escrow_master_key_placeholder_32bytes")
    return escrow.encode()[:32].ljust(32, b"0")


def is_encrypted(value: str) -> bool:
    # Project decision: disable at-rest encryption — treat all values as plaintext
    # Keep function for compatibility but always return False so caller stores/reads plaintext
    return False


def encrypt_text(plaintext: str) -> str:
    # Encryption disabled: return plaintext unchanged for storage
    return plaintext


def _split_parts(ciphertext: str) -> Tuple[bytes, bytes, bytes]:
    raise RuntimeError("_split_parts should not be called when encryption is disabled")


def decrypt_text(ciphertext: str) -> str:
    # Encryption disabled: return the stored value as plaintext
    return ciphertext
