"""App-admin API routes.

These endpoints are session-authenticated (the app admin logs in normally)
and scoped to the app that the admin belongs to.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
from flask import Blueprint, request, jsonify, session

from app import db
from app.models import App, ApiKey, User, LoginAttempt, TrustedContext

app_admin_bp = Blueprint("app_admin", __name__)


# ---------------------------------------------------------------------------
# Auth decorator
# ---------------------------------------------------------------------------

def require_app_admin(f):
    """Ensure the session user is an app_admin and attach their app."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "Not authenticated"}), 401
        user = User.query.get(user_id)
        if not user or user.role != User.ROLE_APP_ADMIN:
            return jsonify({"error": "App admin access required"}), 403
        if not user.app_id:
            return jsonify({"error": "No app linked to this account"}), 403
        app_record = App.query.get(user.app_id)
        if not app_record:
            return jsonify({"error": "App not found"}), 404
        # Attach to request context
        request._app_admin_user = user
        request._app_record = app_record
        return f(*args, **kwargs)
    return decorated


def _app_id():
    return request._app_record.id


# ---------------------------------------------------------------------------
# Dashboard overview
# ---------------------------------------------------------------------------

@app_admin_bp.route("/overview", methods=["GET"])
@require_app_admin
def overview():
    """Stats for the app admin's own app."""
    aid = _app_id()
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    total_users = User.query.filter_by(app_id=aid).count()
    active_keys = ApiKey.query.filter_by(app_id=aid, is_active=True).count()

    logins_24h = (
        LoginAttempt.query
        .join(User, LoginAttempt.user_id == User.id)
        .filter(User.app_id == aid, LoginAttempt.created_at >= day_ago)
        .count()
    )
    logins_7d = (
        LoginAttempt.query
        .join(User, LoginAttempt.user_id == User.id)
        .filter(User.app_id == aid, LoginAttempt.created_at >= week_ago)
        .count()
    )

    users_with_face = User.query.filter(
        User.app_id == aid,
        (User.face_encoding_blob.isnot(None)) | (User.face_encodings_json.isnot(None)),
    ).count()

    new_users_24h = User.query.filter(User.app_id == aid, User.created_at >= day_ago).count()

    return jsonify({
        "app_name": request._app_record.name,
        "total_users": total_users,
        "active_api_keys": active_keys,
        "logins_24h": logins_24h,
        "logins_7d": logins_7d,
        "users_with_face": users_with_face,
        "new_users_24h": new_users_24h,
    })


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@app_admin_bp.route("/users", methods=["POST"])
@require_app_admin
def create_user():
    """Create a new user scoped to this app."""
    from app.services.auth_service import auth_service

    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "Username, email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400

    user = User(
        app_id=_app_id(),
        role=User.ROLE_USER,
        username=username,
        email=email,
        password_hash=auth_service.hash_password(password),
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "ok": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }), 201


@app_admin_bp.route("/users", methods=["GET"])
@require_app_admin
def list_users():
    """List users belonging to this app."""
    aid = _app_id()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    search = (request.args.get("search") or "").strip()

    q = User.query.filter_by(app_id=aid)
    if search:
        like = f"%{search}%"
        q = q.filter((User.username.ilike(like)) | (User.email.ilike(like)))

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "has_face": bool(u.face_encoding_blob or u.face_encodings_json),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@app_admin_bp.route("/users/<int:user_id>", methods=["GET"])
@require_app_admin
def get_user(user_id: int):
    """Get user detail (must belong to this app)."""
    user = User.query.get(user_id)
    if not user or user.app_id != _app_id():
        return jsonify({"error": "User not found"}), 404

    recent_attempts = (
        LoginAttempt.query.filter_by(user_id=user_id)
        .order_by(LoginAttempt.created_at.desc()).limit(10).all()
    )
    trusted = (
        TrustedContext.query.filter_by(user_id=user_id)
        .order_by(TrustedContext.created_at.desc()).limit(10).all()
    )

    return jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "has_face": bool(user.face_encoding_blob or user.face_encodings_json),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "recent_logins": [
            {
                "id": a.id, "step": a.step, "ip_address": a.ip_address,
                "user_agent": a.user_agent[:80] if a.user_agent else "",
                "verification_level": a.verification_level_required,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent_attempts
        ],
        "trusted_contexts": [
            {
                "id": tc.id, "ip_address": tc.ip_address,
                "user_agent": tc.user_agent[:80] if tc.user_agent else "",
                "geo": tc.get_geo(),
                "created_at": tc.created_at.isoformat() if tc.created_at else None,
            }
            for tc in trusted
        ],
    })


@app_admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_app_admin
def delete_user(user_id: int):
    """Delete a user (must belong to this app, cannot delete self)."""
    user = User.query.get(user_id)
    if not user or user.app_id != _app_id():
        return jsonify({"error": "User not found"}), 404
    if user.id == session.get("user_id"):
        return jsonify({"error": "Cannot delete your own account"}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True, "message": f"User {user.username} deleted."})


@app_admin_bp.route("/users/<int:user_id>/reset-face", methods=["POST"])
@require_app_admin
def reset_user_face(user_id: int):
    """Clear face data for a user in this app."""
    user = User.query.get(user_id)
    if not user or user.app_id != _app_id():
        return jsonify({"error": "User not found"}), 404
    user.face_encoding_blob = None
    user.face_encodings_json = None
    db.session.commit()
    return jsonify({"ok": True, "message": f"Face data cleared for {user.username}."})


@app_admin_bp.route("/me/change-password", methods=["POST"])
@require_app_admin
def change_own_password():
    """App admin changes their own password. Requires current password."""
    from app.services.auth_service import auth_service

    data = request.get_json() or {}
    current = (data.get("current_password") or "").strip()
    new_password = (data.get("new_password") or "").strip()

    if not current or not new_password:
        return jsonify({"error": "Current password and new password are required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user = request._app_admin_user
    if not auth_service.verify_password(user, current):
        return jsonify({"error": "Current password is incorrect"}), 401

    user.password_hash = auth_service.hash_password(new_password)
    db.session.commit()
    return jsonify({"ok": True, "message": "Password updated. Use your new password next time you sign in."})


@app_admin_bp.route("/users/<int:user_id>/change-password", methods=["POST"])
@require_app_admin
def change_user_password(user_id: int):
    """App admin sets a new password for a user in their app."""
    from app.services.auth_service import auth_service

    user = User.query.get(user_id)
    if not user or user.app_id != _app_id():
        return jsonify({"error": "User not found"}), 404

    data = request.get_json() or {}
    new_password = (data.get("new_password") or "").strip()
    if not new_password:
        return jsonify({"error": "New password is required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    user.password_hash = auth_service.hash_password(new_password)
    db.session.commit()
    return jsonify({"ok": True, "message": f"Password updated for {user.username}."})


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------

@app_admin_bp.route("/keys", methods=["GET"])
@require_app_admin
def list_keys():
    """List all API keys for this app."""
    keys = ApiKey.query.filter_by(app_id=_app_id()).order_by(ApiKey.created_at.desc()).all()
    return jsonify({
        "keys": [
            {
                "id": k.id, "prefix": k.prefix, "label": k.label,
                "is_active": k.is_active,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "revoked_at": k.revoked_at.isoformat() if k.revoked_at else None,
            }
            for k in keys
        ]
    })


@app_admin_bp.route("/keys", methods=["POST"])
@require_app_admin
def create_key():
    """Generate a new API key for this app."""
    data = request.get_json() or {}
    label = (data.get("label") or "").strip() or None

    raw_key = "sk_live_" + secrets.token_urlsafe(32)
    key_hash = bcrypt.hashpw(raw_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    prefix = raw_key[:8]

    api_key = ApiKey(
        app_id=_app_id(),
        key_hash=key_hash,
        prefix=prefix,
        label=label,
    )
    db.session.add(api_key)
    db.session.commit()

    return jsonify({
        "ok": True,
        "key": raw_key,
        "prefix": prefix,
        "label": label,
        "message": "Store this key securely. It will not be shown again.",
    }), 201


@app_admin_bp.route("/keys/<prefix>", methods=["DELETE"])
@require_app_admin
def revoke_key(prefix: str):
    """Revoke an API key."""
    key = ApiKey.query.filter_by(app_id=_app_id(), prefix=prefix, is_active=True).first()
    if not key:
        return jsonify({"error": "Active key not found"}), 404
    key.is_active = False
    key.revoked_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True, "message": f"Key {prefix}… revoked."})


# ---------------------------------------------------------------------------
# Activity
# ---------------------------------------------------------------------------

@app_admin_bp.route("/activity", methods=["GET"])
@require_app_admin
def activity():
    """Recent login attempts for this app."""
    aid = _app_id()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    q = (
        db.session.query(LoginAttempt, User)
        .join(User, LoginAttempt.user_id == User.id)
        .filter(User.app_id == aid)
        .order_by(LoginAttempt.created_at.desc())
    )

    total = q.count()
    rows = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "activity": [
            {
                "id": attempt.id, "username": user.username, "email": user.email,
                "step": attempt.step, "ip_address": attempt.ip_address,
                "user_agent": attempt.user_agent[:80] if attempt.user_agent else "",
                "verification_level": attempt.verification_level_required,
                "created_at": attempt.created_at.isoformat() if attempt.created_at else None,
                "completed": attempt.step == "completed",
            }
            for attempt, user in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


# ---------------------------------------------------------------------------
# App settings (for the app admin to view/edit their own app)
# ---------------------------------------------------------------------------

@app_admin_bp.route("/app", methods=["GET"])
@require_app_admin
def get_app():
    """Get own app details."""
    a = request._app_record
    return jsonify({
        "app": {
            "id": a.id,
            "name": a.name,
            "owner_email": a.owner_email,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
    })
