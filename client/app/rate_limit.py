"""
Rate Limiter — shared slowapi Limiter instance.

Extracted from main.py to avoid circular imports (router.py ↔ main.py).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
