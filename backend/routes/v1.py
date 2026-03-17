"""Versioned auth-as-a-service API (v1).

All routes require a valid X-API-Key header. User lookups are scoped to the
tenant application so different apps have isolated user pools.
"""
from __future__ import annotations

import base64
from datetime import datetime

from flask import Blueprint, request, jsonify, g

from app import db
from app.models import User, LoginAttempt
from app.middleware import require_api_key, require_jwt
from app.services.auth_service import auth_service
from app.services.context_service import context_service
from app.services import jwt_service
from config import Config

v1_bp = Blueprint("v1", __name__)


# ---------------------------------------------------------------------------
# Ping (test API key)
# ---------------------------------------------------------------------------

@v1_bp.route("/ping", methods=["GET"])
@require_api_key
def ping():
    """Validate API key and return app info. Use this to test that your key works."""
    return jsonify({
        "ok": True,
        "message": "API key is valid",
        "app_id": g.current_app_record.id,
        "app_name": g.current_app_record.name,
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _current_context():
    return context_service.get_request_context(request)


def _app_id() -> int:
    """Return the current tenant app id from the API key middleware."""
    return g.current_app_record.id


def _find_user(username: str):
    """Find a user scoped to the current tenant app."""
    return User.query.filter_by(username=username, app_id=_app_id()).first()


def _user_needs_face(user, level: int) -> bool:
    """App-admin users skip face recognition; regular users follow the normal level check."""
    if user.role == User.ROLE_APP_ADMIN:
        return False
    return auth_service.requires_face(level)


def _find_user_by_email(email: str):
    return User.query.filter_by(email=email, app_id=_app_id()).first()


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@v1_bp.route("/register", methods=["POST"])
@require_api_key
def register():
    """Register a new user scoped to the calling app."""
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "username, email and password are required"}), 400

    if _find_user(username):
        return jsonify({"error": "Username already taken"}), 400
    if _find_user_by_email(email):
        return jsonify({"error": "Email already registered"}), 400

    user = User(
        app_id=_app_id(),
        username=username,
        email=email,
        password_hash=auth_service.hash_password(password),
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "ok": True,
        "user_id": user.id,
        "message": "User registered. Optionally set up face recognition.",
    }), 201


# ---------------------------------------------------------------------------
# Login flow
# ---------------------------------------------------------------------------

@v1_bp.route("/login/start", methods=["POST"])
@require_api_key
def login_start():
    """Start multi-step login. Returns session_token and required verification steps."""
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username required"}), 400

    user = _find_user(username)
    if not user:
        return jsonify({"error": "Invalid username"}), 401

    ctx = _current_context()
    if data.get("geo") is not None:
        ctx["geo"] = data["geo"]

    level = context_service.required_verification_level(user.id, ctx)
    attempt = auth_service.create_login_attempt(user.id, ctx, level)

    return jsonify({
        "session_token": attempt.session_token,
        "steps": {
            "password": True,
            "otp": auth_service.requires_otp(level),
            "face": _user_needs_face(user, level),
        },
        "verification_level": level,
        "context": ctx,
    })


@v1_bp.route("/login/verify-password", methods=["POST"])
@require_api_key
def verify_password():
    data = request.get_json() or {}
    token = data.get("session_token") or request.headers.get("X-Session-Token")
    password = data.get("password") or ""

    if not token or not password:
        return jsonify({"error": "session_token and password required"}), 400

    attempt = auth_service.get_attempt_by_token(token)
    if not attempt:
        return jsonify({"error": "Invalid or expired session"}), 401
    if attempt.step != "password_sent":
        return jsonify({"error": "Password already verified"}), 400

    user = User.query.get(attempt.user_id)
    if user.app_id != _app_id():
        return jsonify({"error": "User does not belong to this app"}), 403

    if not auth_service.verify_password(user, password):
        return jsonify({"error": "Invalid password"}), 401

    needs_face = _user_needs_face(user, attempt.verification_level_required)
    if auth_service.requires_otp(attempt.verification_level_required):
        otp_code = auth_service.generate_email_otp()
        auth_service.set_attempt_otp(attempt, otp_code)
        auth_service.send_otp_to_user(user, otp_code)
        attempt.step = "otp_sent"
    elif needs_face:
        attempt.step = "face_sent"
    else:
        attempt.step = "completed"

    db.session.commit()

    return jsonify({
        "ok": True,
        "next_step": attempt.step,
        "require_otp": auth_service.requires_otp(attempt.verification_level_required),
        "require_face": needs_face,
        "message": "Check your email for the verification code." if attempt.step == "otp_sent" else None,
    })


@v1_bp.route("/login/verify-otp", methods=["POST"])
@require_api_key
def verify_otp():
    data = request.get_json() or {}
    token = data.get("session_token") or request.headers.get("X-Session-Token")
    otp_code = (data.get("otp") or data.get("code") or "").strip()

    if not token or not otp_code:
        return jsonify({"error": "session_token and otp required"}), 400

    attempt = auth_service.get_attempt_by_token(token)
    if not attempt:
        return jsonify({"error": "Invalid or expired session"}), 401
    if attempt.step != "otp_sent":
        return jsonify({"error": "OTP step not current"}), 400

    if not auth_service.verify_email_otp(attempt, otp_code):
        return jsonify({"error": "Invalid or expired OTP"}), 401

    user = User.query.get(attempt.user_id)
    needs_face = _user_needs_face(user, attempt.verification_level_required)
    if needs_face:
        attempt.step = "face_sent"
    else:
        attempt.step = "completed"

    db.session.commit()

    return jsonify({
        "ok": True,
        "next_step": attempt.step,
        "require_face": needs_face,
    })


@v1_bp.route("/login/verify-face", methods=["POST"])
@require_api_key
def verify_face():
    token = request.headers.get("X-Session-Token") or (request.get_json() or {}).get("session_token")
    image_data = None

    if request.files and "image" in request.files:
        image_data = request.files["image"].read()
    elif request.is_json and request.json:
        b64 = request.json.get("image_base64") or request.json.get("image")
        if b64:
            try:
                image_data = base64.b64decode(b64)
            except Exception:
                pass

    if not token or not image_data:
        return jsonify({"error": "session_token and image required"}), 400

    attempt = auth_service.get_attempt_by_token(token)
    if not attempt:
        return jsonify({"error": "Invalid or expired session"}), 401
    if attempt.step != "face_sent":
        return jsonify({"error": "Face step not current"}), 400

    user = User.query.get(attempt.user_id)
    ok, msg = auth_service.verify_face_from_image(user, image_data)
    if not ok:
        return jsonify({"error": msg or "Face verification failed"}), 401

    attempt.step = "completed"
    db.session.commit()
    return jsonify({"ok": True, "next_step": "completed"})


@v1_bp.route("/login/complete", methods=["POST"])
@require_api_key
def login_complete():
    """Complete login and return JWT tokens (instead of setting a session cookie)."""
    data = request.get_json() or {}
    token = data.get("session_token") or request.headers.get("X-Session-Token")

    if not token:
        return jsonify({"error": "session_token required"}), 400

    attempt = auth_service.get_attempt_by_token(token)
    if not attempt:
        return jsonify({"error": "Invalid or expired session"}), 401
    if attempt.step != "completed":
        return jsonify({"error": "Login not fully verified"}), 400

    user = User.query.get(attempt.user_id)
    if user.app_id != _app_id():
        return jsonify({"error": "User does not belong to this app"}), 403

    # Trust the context
    ctx = {
        "ip_address": attempt.ip_address,
        "user_agent": attempt.user_agent,
        "geo": attempt.get_geo(),
    }
    context_service.add_trusted_context(user.id, ctx)

    # Expire the login attempt
    attempt.expires_at = datetime.utcnow()
    db.session.commit()

    # Issue JWT tokens
    access_token = jwt_service.create_access_token(user.id, _app_id())
    refresh_token = jwt_service.create_refresh_token(user.id, _app_id())

    return jsonify({
        "ok": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": Config.JWT_ACCESS_EXPIRE_SECONDS,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        },
    })


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

@v1_bp.route("/token/refresh", methods=["POST"])
@require_api_key
def token_refresh():
    """Exchange a refresh token for a new access token."""
    data = request.get_json() or {}
    refresh_token = data.get("refresh_token") or ""

    if not refresh_token:
        return jsonify({"error": "refresh_token required"}), 400

    payload = jwt_service.decode_refresh_token(refresh_token)
    if not payload:
        return jsonify({"error": "Invalid or expired refresh token"}), 401

    user = User.query.get(payload.get("sub"))
    if not user or user.app_id != _app_id():
        return jsonify({"error": "Invalid token"}), 401

    new_access = jwt_service.create_access_token(user.id, _app_id())

    return jsonify({
        "access_token": new_access,
        "token_type": "bearer",
        "expires_in": Config.JWT_ACCESS_EXPIRE_SECONDS,
    })


# ---------------------------------------------------------------------------
# Protected: current user
# ---------------------------------------------------------------------------

@v1_bp.route("/user/me", methods=["GET"])
@require_api_key
@require_jwt
def user_me():
    """Return current user info from the JWT."""
    user = g.current_user
    return jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "has_face": bool(user.face_encoding_blob or user.face_encodings_json),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    })


# ---------------------------------------------------------------------------
# Face setup (tenant-scoped)
# ---------------------------------------------------------------------------

@v1_bp.route("/setup/face/multi", methods=["POST"])
@require_api_key
def setup_face_multi():
    """Register face from multiple poses. JSON: { user_id, images: [base64, ...] }."""
    data = request.get_json() or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    user = User.query.get(int(user_id))
    if not user or user.app_id != _app_id():
        return jsonify({"error": "User not found"}), 404

    images_data = []
    raw = data.get("images") or data.get("image_list") or []
    if isinstance(raw, list):
        for b64 in raw:
            if isinstance(b64, str):
                try:
                    images_data.append(base64.b64decode(b64))
                except Exception:
                    pass

    if not images_data:
        return jsonify({"error": "At least one image required (images: [base64, ...])"}), 400

    ok, msg = auth_service.set_face_encodings_from_images(user, images_data)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@v1_bp.route("/check-face", methods=["POST"])
@require_api_key
def check_face():
    """Check if a face is detected in the given image. JSON: { image: base64 }."""
    data = request.get_json() or {}
    b64 = data.get("image")
    if not b64:
        return jsonify({"error": "image (base64) required"}), 400
    try:
        image_data = base64.b64decode(b64)
    except Exception:
        return jsonify({"error": "Invalid base64 image"}), 400

    face_detected = auth_service.check_face_in_image(image_data)
    return jsonify({"face_detected": face_detected})


# ---------------------------------------------------------------------------
# Context inspection
# ---------------------------------------------------------------------------

@v1_bp.route("/verify-context", methods=["POST"])
@require_api_key
def verify_context():
    """Check the risk level for a given context (useful for pre-login UI decisions)."""
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username required"}), 400

    user = _find_user(username)
    if not user:
        return jsonify({"error": "User not found"}), 404

    ctx = _current_context()
    if data.get("geo") is not None:
        ctx["geo"] = data["geo"]

    level = context_service.required_verification_level(user.id, ctx)

    return jsonify({
        "verification_level": level,
        "steps": {
            "password": True,
            "otp": auth_service.requires_otp(level),
            "face": _user_needs_face(user, level),
        },
        "context": ctx,
    })
