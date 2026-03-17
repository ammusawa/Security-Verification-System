"""JWT token creation, decoding, and refresh for the auth-as-a-service API."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from config import Config


_ALGORITHM = "HS256"


def create_access_token(user_id: int, app_id: int) -> str:
    """Create a short-lived access token (default 1 hour)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "app_id": app_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=Config.JWT_ACCESS_EXPIRE_SECONDS),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm=_ALGORITHM)


def create_refresh_token(user_id: int, app_id: int) -> str:
    """Create a long-lived refresh token (default 7 days)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "app_id": app_id,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(seconds=Config.JWT_REFRESH_EXPIRE_SECONDS),
    }
    return jwt.encode(payload, Config.JWT_SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token.

    Returns the payload dict on success.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    return jwt.decode(token, Config.JWT_SECRET, algorithms=[_ALGORITHM])


def decode_access_token(token: str) -> Optional[dict]:
    """Decode an access token, returning None on any error."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode a refresh token, returning None on any error."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
