"""
ml/hash_utils.py
Consistent SHA-256 anonymisation for account IDs.
16-character hex prefix — no collision risk at ~515K accounts.
"""
import hashlib


def hash_account(account_id: str) -> str:
    """Return a 16-char SHA-256 hex digest for the given account ID string."""
    return hashlib.sha256(str(account_id).encode()).hexdigest()[:16]
