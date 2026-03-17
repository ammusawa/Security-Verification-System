"""Admin API for managing tenant apps, API keys, users, and activity.

All routes require the X-Admin-Secret header matching Config.ADMIN_SECRET.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

import bcrypt
import os
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import func, desc

from app import db
from app.models import App, ApiKey, User, LoginAttempt, TrustedContext, DemoRequest, SubscriptionRequest
from app.middleware import require_admin

admin_bp = Blueprint("admin", __name__)


def _generate_raw_key() -> str:
    """Generate a raw API key like sk_live_<32 random chars>."""
    return "sk_live_" + secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# Apps
# ---------------------------------------------------------------------------

@admin_bp.route("/apps", methods=["POST"])
@require_admin
def create_app():
    """Create a new tenant application.

    Optionally auto-creates an app_admin user if admin_username and admin_password
    are provided in the request body.
    """
    from app.services.auth_service import auth_service

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    owner_email = (data.get("owner_email") or "").strip()

    if not name or not owner_email:
        return jsonify({"error": "name and owner_email are required"}), 400

    if App.query.filter_by(name=name).first():
        return jsonify({"error": "App name already taken"}), 400

    # Create the app
    app_record = App(name=name, owner_email=owner_email)
    db.session.add(app_record)
    db.session.flush()  # get app_record.id before commit

    result = {
        "ok": True,
        "app": {
            "id": app_record.id,
            "name": app_record.name,
            "owner_email": app_record.owner_email,
            "is_active": app_record.is_active,
            "created_at": app_record.created_at.isoformat() if app_record.created_at else None,
        },
    }

    # Auto-create app_admin user if credentials are provided
    admin_username = (data.get("admin_username") or "").strip()
    admin_password = data.get("admin_password") or ""
    if admin_username and admin_password:
        if User.query.filter_by(username=admin_username).first():
            db.session.rollback()
            return jsonify({"error": f"Username '{admin_username}' already taken"}), 400
        if User.query.filter_by(email=owner_email).first():
            db.session.rollback()
            return jsonify({"error": f"Email '{owner_email}' already registered"}), 400

        admin_user = User(
            app_id=app_record.id,
            role=User.ROLE_APP_ADMIN,
            username=admin_username,
            email=owner_email,
            password_hash=auth_service.hash_password(admin_password),
        )
        db.session.add(admin_user)
        result["app_admin"] = {
            "id": admin_user.id if admin_user.id else None,
            "username": admin_username,
            "email": owner_email,
            "role": User.ROLE_APP_ADMIN,
        }

    db.session.commit()

    # Update the admin user id after commit
    if "app_admin" in result and result["app_admin"]["id"] is None:
        admin_user_obj = User.query.filter_by(username=admin_username).first()
        if admin_user_obj:
            result["app_admin"]["id"] = admin_user_obj.id

    return jsonify(result), 201


@admin_bp.route("/apps", methods=["GET"])
@require_admin
def list_apps():
    """List all tenant applications."""
    apps = App.query.order_by(App.created_at.desc()).all()
    return jsonify({
        "apps": [
            {
                "id": a.id,
                "name": a.name,
                "owner_email": a.owner_email,
                "is_active": a.is_active,
                "created_at": a.created_at.isoformat(),
                "user_count": User.query.filter_by(app_id=a.id).count(),
                "key_count": ApiKey.query.filter_by(app_id=a.id, is_active=True).count(),
            }
            for a in apps
        ]
    })


@admin_bp.route("/apps/<int:app_id>", methods=["GET"])
@require_admin
def get_app(app_id: int):
    """Get details for a single app."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    keys = ApiKey.query.filter_by(app_id=app_id).order_by(ApiKey.created_at.desc()).all()

    return jsonify({
        "app": {
            "id": app_record.id,
            "name": app_record.name,
            "owner_email": app_record.owner_email,
            "is_active": app_record.is_active,
            "created_at": app_record.created_at.isoformat(),
            "user_count": User.query.filter_by(app_id=app_id).count(),
            "keys": [
                {
                    "prefix": k.prefix,
                    "label": k.label,
                    "is_active": k.is_active,
                    "created_at": k.created_at.isoformat(),
                    "revoked_at": k.revoked_at.isoformat() if k.revoked_at else None,
                }
                for k in keys
            ],
        }
    })


@admin_bp.route("/apps/<int:app_id>", methods=["PATCH"])
@require_admin
def update_app(app_id: int):
    """Update app (e.g. deactivate)."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    data = request.get_json() or {}
    if "is_active" in data:
        app_record.is_active = bool(data["is_active"])
    if "owner_email" in data:
        app_record.owner_email = data["owner_email"]

    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------

@admin_bp.route("/apps/<int:app_id>/keys", methods=["POST"])
@require_admin
def create_key(app_id: int):
    """Generate a new API key for an app. The raw key is returned ONCE."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    data = request.get_json() or {}
    label = (data.get("label") or "").strip() or None

    raw_key = _generate_raw_key()
    key_hash = bcrypt.hashpw(raw_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    prefix = raw_key[:8]

    api_key = ApiKey(
        app_id=app_id,
        key_hash=key_hash,
        prefix=prefix,
        label=label,
    )
    db.session.add(api_key)
    db.session.commit()

    return jsonify({
        "ok": True,
        "key": raw_key,          # shown only once
        "prefix": prefix,
        "label": label,
        "message": "Store this key securely. It will not be shown again.",
    }), 201


@admin_bp.route("/apps/<int:app_id>/keys/<prefix>", methods=["DELETE"])
@require_admin
def revoke_key(app_id: int, prefix: str):
    """Revoke an API key by its prefix."""
    key = ApiKey.query.filter_by(app_id=app_id, prefix=prefix, is_active=True).first()
    if not key:
        return jsonify({"error": "Active key with that prefix not found"}), 404

    key.is_active = False
    key.revoked_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"ok": True, "message": f"Key {prefix}... revoked."})


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@admin_bp.route("/apps/<int:app_id>/stats", methods=["GET"])
@require_admin
def app_stats(app_id: int):
    """Basic usage stats for an app."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    user_count = User.query.filter_by(app_id=app_id).count()

    cutoff = datetime.utcnow() - timedelta(hours=24)
    recent_logins = (
        LoginAttempt.query
        .join(User, LoginAttempt.user_id == User.id)
        .filter(User.app_id == app_id, LoginAttempt.created_at >= cutoff)
        .count()
    )

    active_keys = ApiKey.query.filter_by(app_id=app_id, is_active=True).count()

    return jsonify({
        "app_id": app_id,
        "user_count": user_count,
        "login_attempts_24h": recent_logins,
        "active_api_keys": active_keys,
    })


@admin_bp.route("/apps/<int:app_id>/activity", methods=["GET"])
@require_admin
def app_activity(app_id: int):
    """Recent login attempts for users belonging to an app."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    q = (
        db.session.query(LoginAttempt, User)
        .join(User, LoginAttempt.user_id == User.id)
        .filter(User.app_id == app_id)
        .order_by(LoginAttempt.created_at.desc())
    )

    total = q.count()
    rows = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "activity": [
            {
                "id": attempt.id,
                "username": user.username,
                "email": user.email,
                "step": attempt.step,
                "ip_address": attempt.ip_address,
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


@admin_bp.route("/apps/<int:app_id>/keys", methods=["GET"])
@require_admin
def list_keys(app_id: int):
    """List all API keys for an app (active and revoked)."""
    app_record = App.query.get(app_id)
    if not app_record:
        return jsonify({"error": "App not found"}), 404

    keys = ApiKey.query.filter_by(app_id=app_id).order_by(ApiKey.created_at.desc()).all()
    return jsonify({
        "keys": [
            {
                "id": k.id,
                "prefix": k.prefix,
                "label": k.label,
                "is_active": k.is_active,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "revoked_at": k.revoked_at.isoformat() if k.revoked_at else None,
            }
            for k in keys
        ]
    })


# ---------------------------------------------------------------------------
# Dashboard overview
# ---------------------------------------------------------------------------

@admin_bp.route("/overview", methods=["GET"])
@require_admin
def overview():
    """Global dashboard stats."""
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    total_users = User.query.count()
    total_apps = App.query.count()
    total_keys = ApiKey.query.filter_by(is_active=True).count()

    logins_24h = LoginAttempt.query.filter(LoginAttempt.created_at >= day_ago).count()
    logins_7d = LoginAttempt.query.filter(LoginAttempt.created_at >= week_ago).count()
    users_with_face = User.query.filter(
        (User.face_encoding_blob.isnot(None)) | (User.face_encodings_json.isnot(None))
    ).count()

    new_users_24h = User.query.filter(User.created_at >= day_ago).count()
    new_users_7d = User.query.filter(User.created_at >= week_ago).count()

    return jsonify({
        "total_users": total_users,
        "total_apps": total_apps,
        "total_active_keys": total_keys,
        "logins_24h": logins_24h,
        "logins_7d": logins_7d,
        "users_with_face": users_with_face,
        "new_users_24h": new_users_24h,
        "new_users_7d": new_users_7d,
    })


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@admin_bp.route("/users", methods=["POST"])
@require_admin
def create_user():
    """Create a new user from the admin dashboard."""
    from app.services.auth_service import auth_service

    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "user").strip()
    app_id = data.get("app_id")  # optional, can be None

    if not username or not email or not password:
        return jsonify({"error": "Username, email and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if role not in (User.ROLE_USER, User.ROLE_APP_ADMIN, User.ROLE_SUPER_ADMIN):
        return jsonify({"error": f"Invalid role. Must be one of: user, app_admin, super_admin"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400

    # Validate app_id if provided
    if app_id is not None:
        app_record = App.query.get(app_id)
        if not app_record:
            return jsonify({"error": "App not found"}), 404
    else:
        app_record = None

    # app_admin must have an app
    if role == User.ROLE_APP_ADMIN and app_id is None:
        return jsonify({"error": "App admin users must be linked to an app"}), 400

    user = User(
        username=username,
        email=email,
        password_hash=auth_service.hash_password(password),
        role=role,
        app_id=app_id,
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
            "app_id": user.app_id,
            "app_name": app_record.name if app_record else "Internal",
        },
    }), 201


@admin_bp.route("/users", methods=["GET"])
@require_admin
def list_users():
    """List all users with optional filtering."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    search = (request.args.get("search") or "").strip()
    app_id_filter = request.args.get("app_id", type=int)

    q = User.query
    if search:
        like = f"%{search}%"
        q = q.filter((User.username.ilike(like)) | (User.email.ilike(like)))
    if app_id_filter is not None:
        q = q.filter_by(app_id=app_id_filter)

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "app_id": u.app_id,
                "app_name": u.app.name if u.app else "Internal",
                "has_face": bool(u.face_encoding_blob or u.face_encodings_json),
                "has_totp": bool(u.totp_secret),
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "updated_at": u.updated_at.isoformat() if u.updated_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@require_admin
def get_user(user_id: int):
    """Get details for a single user including recent login attempts."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    recent_attempts = (
        LoginAttempt.query
        .filter_by(user_id=user_id)
        .order_by(LoginAttempt.created_at.desc())
        .limit(10)
        .all()
    )

    trusted = (
        TrustedContext.query
        .filter_by(user_id=user_id)
        .order_by(TrustedContext.created_at.desc())
        .limit(10)
        .all()
    )

    return jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "app_id": user.app_id,
            "app_name": user.app.name if user.app else "Internal",
            "has_face": bool(user.face_encoding_blob or user.face_encodings_json),
            "has_totp": bool(user.totp_secret),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "recent_logins": [
            {
                "id": a.id,
                "step": a.step,
                "ip_address": a.ip_address,
                "user_agent": a.user_agent[:80] if a.user_agent else "",
                "verification_level": a.verification_level_required,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent_attempts
        ],
        "trusted_contexts": [
            {
                "id": tc.id,
                "ip_address": tc.ip_address,
                "user_agent": tc.user_agent[:80] if tc.user_agent else "",
                "geo": tc.get_geo(),
                "created_at": tc.created_at.isoformat() if tc.created_at else None,
            }
            for tc in trusted
        ],
    })


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id: int):
    """Delete a user and all associated data."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True, "message": f"User {user.username} deleted."})


@admin_bp.route("/users/<int:user_id>/reset-face", methods=["POST"])
@require_admin
def reset_user_face(user_id: int):
    """Clear a user's face data (forces re-enrollment)."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.face_encoding_blob = None
    user.face_encodings_json = None
    db.session.commit()
    return jsonify({"ok": True, "message": f"Face data cleared for {user.username}."})


@admin_bp.route("/users/<int:user_id>/reset-password", methods=["POST"])
@require_admin
def reset_user_password(user_id: int):
    """Set a new password for the user (super admin only)."""
    from app.services.auth_service import auth_service

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    data = request.get_json() or {}
    new_password = data.get("new_password") or ""
    if not new_password or len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    user.password_hash = auth_service.hash_password(new_password)
    db.session.commit()
    return jsonify({"ok": True, "message": f"Password updated for {user.username}."})


# ---------------------------------------------------------------------------
# Activity / Login attempts
# ---------------------------------------------------------------------------

@admin_bp.route("/activity", methods=["GET"])
@require_admin
def recent_activity():
    """Recent login attempts across all users."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 25, type=int)

    q = (
        db.session.query(LoginAttempt, User)
        .outerjoin(User, LoginAttempt.user_id == User.id)
        .order_by(LoginAttempt.created_at.desc())
    )

    total = q.count()
    rows = q.offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "activity": [
            {
                "id": attempt.id,
                "username": user.username if user else "(unknown)",
                "email": user.email if user else "",
                "step": attempt.step,
                "ip_address": attempt.ip_address,
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
# Demo Requests
# ---------------------------------------------------------------------------

@admin_bp.route("/demo-requests", methods=["GET"])
@require_admin
def list_demo_requests():
    """List all demo requests with optional status filter."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    status_filter = request.args.get("status", "").strip() or None

    q = DemoRequest.query
    if status_filter:
        q = q.filter_by(status=status_filter)

    total = q.count()
    rows = q.order_by(DemoRequest.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    # Stats
    pending_count = DemoRequest.query.filter_by(status=DemoRequest.STATUS_PENDING).count()
    sent_count = DemoRequest.query.filter_by(status=DemoRequest.STATUS_SENT).count()
    viewed_count = DemoRequest.query.filter_by(status=DemoRequest.STATUS_VIEWED).count()

    return jsonify({
        "demo_requests": [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "company": r.company,
                "message": r.message,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                "viewed_at": r.viewed_at.isoformat() if r.viewed_at else None,
            }
            for r in rows
        ],
        "stats": {
            "pending": pending_count,
            "sent": sent_count,
            "viewed": viewed_count,
        },
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@admin_bp.route("/demo-requests/<int:req_id>", methods=["GET"])
@require_admin
def get_demo_request(req_id: int):
    """Get a single demo request detail."""
    demo_req = DemoRequest.query.get(req_id)
    if not demo_req:
        return jsonify({"error": "Demo request not found."}), 404

    return jsonify({
        "demo_request": {
            "id": demo_req.id,
            "name": demo_req.name,
            "email": demo_req.email,
            "company": demo_req.company,
            "message": demo_req.message,
            "status": demo_req.status,
            "demo_token": demo_req.demo_token,
            "demo_subject": demo_req.demo_subject,
            "demo_content": demo_req.demo_content,
            "created_at": demo_req.created_at.isoformat() if demo_req.created_at else None,
            "sent_at": demo_req.sent_at.isoformat() if demo_req.sent_at else None,
            "viewed_at": demo_req.viewed_at.isoformat() if demo_req.viewed_at else None,
        }
    })


@admin_bp.route("/demo-requests/<int:req_id>/send", methods=["POST"])
@require_admin
def send_demo(req_id: int):
    """Admin composes demo content and sends it to the requester via email.

    Body: { subject: str, content: str }
    """
    from app.services.email_service import send_demo_email

    demo_req = DemoRequest.query.get(req_id)
    if not demo_req:
        return jsonify({"error": "Demo request not found."}), 404

    data = request.get_json() or {}
    subject = (data.get("subject") or "").strip()
    content = (data.get("content") or "").strip()

    if not subject or not content:
        return jsonify({"error": "Subject and content are required."}), 400

    # Build the demo URL (frontend page that renders the demo)
    origin = request.headers.get("Origin") or request.host_url.rstrip("/")
    demo_url = f"{origin}/demo/{demo_req.demo_token}"

    # Save the content
    demo_req.demo_subject = subject
    demo_req.demo_content = content
    demo_req.status = DemoRequest.STATUS_SENT
    demo_req.sent_at = datetime.utcnow()
    db.session.commit()

    # Send the email
    email_ok = send_demo_email(
        to_email=demo_req.email,
        name=demo_req.name,
        subject=subject,
        content=content,
        demo_url=demo_url,
    )

    return jsonify({
        "ok": True,
        "email_sent": email_ok,
        "demo_url": demo_url,
        "message": "Demo sent successfully." if email_ok else "Demo saved but email delivery may have failed.",
    })


@admin_bp.route("/demo-requests/<int:req_id>", methods=["DELETE"])
@require_admin
def delete_demo_request(req_id: int):
    """Delete a demo request."""
    demo_req = DemoRequest.query.get(req_id)
    if not demo_req:
        return jsonify({"error": "Demo request not found."}), 404

    db.session.delete(demo_req)
    db.session.commit()
    return jsonify({"ok": True, "message": "Demo request deleted."})


# ---------------------------------------------------------------------------
# Subscription Requests (app admin subscribe; admin approves)
# ---------------------------------------------------------------------------

@admin_bp.route("/subscription-requests", methods=["GET"])
@require_admin
def list_subscription_requests():
    """List all subscription requests with optional status filter."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)
    status_filter = request.args.get("status", "").strip() or None

    q = SubscriptionRequest.query
    if status_filter:
        q = q.filter_by(status=status_filter)

    total = q.count()
    rows = q.order_by(SubscriptionRequest.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    pending_count = SubscriptionRequest.query.filter_by(status=SubscriptionRequest.STATUS_PENDING).count()
    approved_count = SubscriptionRequest.query.filter_by(status=SubscriptionRequest.STATUS_APPROVED).count()
    rejected_count = SubscriptionRequest.query.filter_by(status=SubscriptionRequest.STATUS_REJECTED).count()
    revoked_count = SubscriptionRequest.query.filter_by(status=SubscriptionRequest.STATUS_REVOKED).count()

    return jsonify({
        "subscription_requests": [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "company": r.company,
                "message": r.message,
                "plan_type": getattr(r, "plan_type", None) or "monthly",
                "amount": float(r.amount) if r.amount is not None else None,
                "currency": getattr(r, "currency", None) or "NGN",
                "payment_reference": getattr(r, "payment_reference", None),
                "receipt_filename": getattr(r, "receipt_filename", None),
                "payment_status": getattr(r, "payment_status", None) or "pending",
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "app_id": r.app_id,
            }
            for r in rows
        ],
        "stats": {"pending": pending_count, "approved": approved_count, "rejected": rejected_count, "revoked": revoked_count},
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page if total else 0,
    })


@admin_bp.route("/subscription-requests/<int:req_id>", methods=["GET"])
@require_admin
def get_subscription_request(req_id: int):
    """Get a single subscription request (full review: plan, payment, and if approved, app + app_admin)."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404

    app_data = None
    app_admin_data = None
    if sub.app_id:
        app_record = App.query.get(sub.app_id)
        if app_record:
            app_data = {"id": app_record.id, "name": app_record.name, "owner_email": app_record.owner_email}
            admin_user = User.query.filter_by(app_id=app_record.id, role=User.ROLE_APP_ADMIN).first()
            if admin_user:
                app_admin_data = {"id": admin_user.id, "username": admin_user.username, "email": admin_user.email}

    return jsonify({
        "subscription_request": {
            "id": sub.id,
            "name": sub.name,
            "email": sub.email,
            "company": sub.company,
            "message": sub.message,
            "plan_type": getattr(sub, "plan_type", None) or "monthly",
            "amount": float(sub.amount) if sub.amount is not None else None,
            "currency": getattr(sub, "currency", None) or "NGN",
            "payment_reference": getattr(sub, "payment_reference", None),
            "receipt_filename": getattr(sub, "receipt_filename", None),
            "payment_status": getattr(sub, "payment_status", None) or "pending",
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "reviewed_at": sub.reviewed_at.isoformat() if sub.reviewed_at else None,
            "app_id": sub.app_id,
            "app": app_data,
            "app_admin": app_admin_data,
        }
    })


@admin_bp.route("/subscription-requests/<int:req_id>/receipt", methods=["GET"])
@require_admin
def get_subscription_receipt(req_id: int):
    """Download receipt file for a subscription request."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    fn = getattr(sub, "receipt_filename", None)
    if not fn:
        return jsonify({"error": "No receipt uploaded for this request."}), 404
    from flask import current_app
    root = current_app.config.get("UPLOAD_FOLDER")
    subfolder = current_app.config.get("RECEIPTS_SUBFOLDER", "receipts")
    filepath = os.path.join(str(root), subfolder, fn)
    if not os.path.isfile(filepath):
        return jsonify({"error": "Receipt file not found on server."}), 404
    return send_file(filepath, as_attachment=True, download_name=fn)


@admin_bp.route("/subscription-requests/<int:req_id>/verify-payment", methods=["POST"])
@require_admin
def verify_subscription_payment(req_id: int):
    """Mark payment as verified for a subscription request."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    if sub.status != SubscriptionRequest.STATUS_PENDING:
        return jsonify({"error": "Only pending requests can have payment verified."}), 400
    sub.payment_status = SubscriptionRequest.PAYMENT_VERIFIED
    db.session.commit()
    return jsonify({"ok": True, "message": "Payment marked as verified.", "payment_status": "verified"})


@admin_bp.route("/subscription-requests/<int:req_id>/unverify-payment", methods=["POST"])
@require_admin
def unverify_subscription_payment(req_id: int):
    """Revert payment verification for a pending subscription request."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    if sub.status != SubscriptionRequest.STATUS_PENDING:
        return jsonify({"error": "Only pending requests can have payment unverified."}), 400
    if sub.payment_status != SubscriptionRequest.PAYMENT_VERIFIED:
        return jsonify({"error": "Payment is not verified; nothing to revert."}), 400
    sub.payment_status = SubscriptionRequest.PAYMENT_PENDING
    db.session.commit()
    return jsonify({"ok": True, "message": "Payment verification reverted.", "payment_status": "pending"})


@admin_bp.route("/subscription-requests/<int:req_id>/approve", methods=["POST"])
@require_admin
def approve_subscription_request(req_id: int):
    """Approve a subscription request: create an App and an app_admin user. Returns temp password for admin to share."""
    from app.services.auth_service import auth_service

    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    if sub.status != SubscriptionRequest.STATUS_PENDING:
        return jsonify({"error": "Subscription request is not pending."}), 400

    data = request.get_json() or {}
    app_name = (data.get("app_name") or "").strip()
    if not app_name:
        app_name = (sub.company or "").strip() or f"app-{sub.id}"
    # Sanitize for unique name
    app_name = "".join(c for c in app_name if c.isalnum() or c in " -_")[:100].strip() or f"app-{sub.id}"
    base_name = app_name
    counter = 0
    while App.query.filter_by(name=app_name).first():
        counter += 1
        app_name = f"{base_name}-{counter}"

    username = (data.get("admin_username") or "").strip()
    if not username:
        local = sub.email.split("@")[0]
        username = "".join(c for c in local if c.isalnum() or c in "._")[:60] or f"appadmin_{sub.id}"
        counter = 0
        orig = username
        while User.query.filter_by(username=username).first():
            counter += 1
            username = f"{orig}{counter}"

    if User.query.filter_by(email=sub.email).first():
        return jsonify({"error": f"User with email {sub.email} already exists."}), 400

    temp_password = secrets.token_urlsafe(12)
    app_record = App(name=app_name, owner_email=sub.email)
    db.session.add(app_record)
    db.session.flush()

    admin_user = User(
        app_id=app_record.id,
        role=User.ROLE_APP_ADMIN,
        username=username,
        email=sub.email,
        password_hash=auth_service.hash_password(temp_password),
    )
    db.session.add(admin_user)
    db.session.flush()

    sub.status = SubscriptionRequest.STATUS_APPROVED
    sub.reviewed_at = datetime.utcnow()
    sub.app_id = app_record.id
    db.session.commit()

    # Build login URL for the app (same /login page; after login they're redirected to /app-admin)
    origin = request.headers.get("Origin") or request.host_url.rstrip("/")
    login_url = f"{origin}/login"

    from app.services.email_service import send_subscription_approved_email
    email_sent = send_subscription_approved_email(
        to_email=sub.email,
        name=sub.name,
        username=username,
        temp_password=temp_password,
        login_url=login_url,
        app_name=app_record.name,
    )

    return jsonify({
        "ok": True,
        "message": "Subscription approved. App and app_admin user created."
        + (" Login details sent by email." if email_sent else " Share the login details below with the applicant."),
        "app": {"id": app_record.id, "name": app_record.name, "owner_email": app_record.owner_email},
        "app_admin": {"id": admin_user.id, "username": username, "email": sub.email},
        "temp_password": temp_password,
        "login_url": login_url,
        "email_sent": email_sent,
        "note": "Applicant signs in at the login URL with username and temporary password, then changes password after first login.",
    })


@admin_bp.route("/subscription-requests/<int:req_id>/reject", methods=["POST"])
@require_admin
def reject_subscription_request(req_id: int):
    """Reject a subscription request."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    if sub.status != SubscriptionRequest.STATUS_PENDING:
        return jsonify({"error": "Subscription request is not pending."}), 400

    sub.status = SubscriptionRequest.STATUS_REJECTED
    sub.reviewed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True, "message": "Subscription request rejected."})


@admin_bp.route("/subscription-requests/<int:req_id>/revoke", methods=["POST"])
@require_admin
def revoke_subscription_request(req_id: int):
    """Revoke an approved subscription: deactivate the app and mark the request as revoked."""
    sub = SubscriptionRequest.query.get(req_id)
    if not sub:
        return jsonify({"error": "Subscription request not found."}), 404
    if sub.status != SubscriptionRequest.STATUS_APPROVED:
        return jsonify({"error": "Only approved subscriptions can be revoked."}), 400

    sub.status = SubscriptionRequest.STATUS_REVOKED
    sub.reviewed_at = datetime.utcnow()
    if sub.app_id:
        app_record = App.query.get(sub.app_id)
        if app_record:
            app_record.is_active = False
    db.session.commit()
    return jsonify({"ok": True, "message": "Subscription revoked. App has been deactivated."})
