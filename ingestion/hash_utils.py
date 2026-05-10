import hashlib                              # Python's built-in hashing library

def hash_id(account_id: str) -> str:       # takes an account ID string, returns a string
    return hashlib.sha256(                 # use SHA-256 algorithm
        str(account_id).encode()           # convert to bytes first (sha256 needs bytes not string)
    ).hexdigest()[:16]                     # get the result as hex characters, take first 16 only