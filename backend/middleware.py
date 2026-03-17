"""Authentication decorators for the auth-as-a-service API.

Decorators:
    @require_api_key  - validates X-API-Key header, sets g.current_app_record
    @require_jwt      - validates Authorization: Bearer <token>, sets g.current_user
    @require_admin    - validates X-Admin-Secret header
"""
from __future__ import annotations

from functools import wraps

import bcrypt
from flask import request, jsonify, g

from config import Config


def require_api_key(f):
    """Validate the X-API-Key header against stored hashed keys.

    On success, sets:
        g.current_app_record  – the App model instance
        g.current_api_key     – the ApiKey model instance
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        from app.models import ApiKey, App  # deferred to avoid circular imports

        raw_key = request.headers.get("X-API-Key", "").strip()
        if not raw_key:
            return jsonify({"error": "Missing X-API-Key header"}), 401

        # Use the prefix (first 8 chars) for fast DB lookup, then bcrypt-verify
        prefix = raw_key[:8]
        candidates = ApiKey.query.filter_by(prefix=prefix, is_active=True).all()

        matched_key = None
        for candidate in candidates:
            try:
                if bcrypt.checkpw(raw_key.encode("utf-8"), candidate.key_hash.encode("utf-8")):
                    matched_key = candidate
                    break
            except Exception:
                continue

        if not matched_key:
            return jsonify({"error": "Invalid API key"}), 401

        app_record = App.query.get(matched_key.app_id)
        if not app_record or not app_record.is_active:
            return jsonify({"error": "App is deactivated"}), 403

        g.current_app_record = app_record
        g.current_api_key = matched_key
        return f(*args, **kwargs)

    return decorated


def require_jwt(f):
    """Validate Authorization: Bearer <token> header (access token).

    On success, sets:
        g.current_user        – the User model instance
        g.current_app_record  – the App model instance (if not already set by @require_api_key)
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        from app.models import User, App  # deferred
        from app.services.jwt_service import decode_access_token

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401

        token = auth_header[7:].strip()
        payload = decode_access_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired access token"}), 401

        user = User.query.get(payload.get("sub"))
        if not user:
            return jsonify({"error": "User not found"}), 401

        # Ensure the user belongs to the same app as the token claims
        token_app_id = payload.get("app_id")
        if user.app_id != token_app_id:
            return jsonify({"error": "Token app mismatch"}), 401

        g.current_user = user

        # If @require_api_key was not used (unlikely but possible), set app from token
        if not getattr(g, "current_app_record", None) and token_app_id:
            g.current_app_record = App.query.get(token_app_id)

        return f(*args, **kwargs)

    return decorated


def require_admin(f):
    """Validate the X-Admin-Secret header against the configured ADMIN_SECRET."""
    @wraps(f)
    def decorated(*args, **kwargs):
        secret = request.headers.get("X-Admin-Secret", "").strip()
        if not secret or secret != Config.ADMIN_SECRET:
            return jsonify({"error": "Invalid or missing admin secret"}), 403
        return f(*args, **kwargs)

    return decorated
