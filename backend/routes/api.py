"""REST API for context-aware multi-step login and registration."""
import os
import re
import secrets
from datetime import datetime, timedelta

import bcrypt
from flask import Blueprint, request, jsonify, session, current_app

from app import db
from app.models import User, LoginAttempt, DemoRequest, SubscriptionRequest, PasswordResetToken
from app.services.auth_service import auth_service
from app.services.context_service import context_service
from app.services.email_service import send_password_reset_email
from config import Config

api_bp = Blueprint("api", __name__)


def _current_context():
    return context_service.get_request_context(request)


# --- Session (for Next.js) ---
@api_bp.route("/me", methods=["GET"])
def me():
    """Return current user if session exists."""
    if not session.get("user_id"):
        return jsonify({"error": "Not authenticated"}), 401
    user = User.query.get(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "Not authenticated"}), 401
    data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }
    if user.app_id:
        from app.models import App
        app_record = App.query.get(user.app_id)
        data["app_id"] = user.app_id
        data["app_name"] = app_record.name if app_record else None
    return jsonify({"user": data})


@api_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# --- Register ---
@api_bp.route("/register", methods=["POST"])
def register():
    """Create a new user. Returns user_id for redirect to setup-mfa."""
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not username or not email or not password:
        return jsonify({"error": "Username, email and password are required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400
    user = User(
        username=username,
        email=email,
        password_hash=auth_service.hash_password(password),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({"ok": True, "user_id": user.id, "message": "Register your face to complete setup."}), 201


# --- Forgot / Reset password ---
@api_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """Send a password reset link to the user's email if the account exists. Always returns ok to avoid leaking existence."""
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400
    user = User.query.filter_by(email=email).first()
    if user:
        # Remove any existing reset tokens for this user
        PasswordResetToken.query.filter_by(user_id=user.id).delete()
        raw_token = secrets.token_urlsafe(32)
        token_hash = bcrypt.hashpw(raw_token.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        expires_at = datetime.utcnow() + timedelta(hours=1)
        prt = PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
        db.session.add(prt)
        db.session.commit()
        base = getattr(Config, "FRONTEND_BASE_URL", None) or (Config.CORS_ORIGINS[0] if Config.CORS_ORIGINS else "http://localhost:3000")
        reset_url = f"{base.rstrip('/')}/reset-password?token={raw_token}"
        send_password_reset_email(user.email, user.username, reset_url)
    return jsonify({"ok": True, "message": "If that email is registered, you will receive a reset link."})


@api_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """Set a new password using a valid reset token. Token is single-use."""
    data = request.get_json() or {}
    raw_token = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""
    if not raw_token:
        return jsonify({"error": "Reset token is required"}), 400
    if not new_password or len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    now = datetime.utcnow()
    for prt in PasswordResetToken.query.filter(PasswordResetToken.expires_at > now).all():
        try:
            if bcrypt.checkpw(raw_token.encode("utf-8"), prt.token_hash.encode("utf-8")):
                user = User.query.get(prt.user_id)
                if not user:
                    db.session.delete(prt)
                    db.session.commit()
                    return jsonify({"error": "Invalid or expired reset link"}), 400
                user.password_hash = auth_service.hash_password(new_password)
                db.session.delete(prt)
                db.session.commit()
                return jsonify({"ok": True, "message": "Password updated. You can sign in now."})
        except Exception:
            continue
    return jsonify({"error": "Invalid or expired reset link"}), 400


# --- Context & Login flow ---
@api_bp.route("/context", methods=["POST"])
def capture_context():
    ctx = _current_context()
    return jsonify({"context": ctx})


def _user_needs_face(user, level: int) -> bool:
    """App-admin users skip face recognition; regular users follow the normal level check."""
    if user.role == User.ROLE_APP_ADMIN:
        return False
    return auth_service.requires_face(level)


@api_bp.route("/login/start", methods=["POST"])
def login_start():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username required"}), 400
    user = User.query.filter_by(username=username).first()
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


@api_bp.route("/login/verify-password", methods=["POST"])
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


@api_bp.route("/login/verify-otp", methods=["POST"])
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


@api_bp.route("/login/verify-face", methods=["POST"])
def verify_face():
    token = request.headers.get("X-Session-Token") or (request.get_json() or {}).get("session_token")
    image_data = None
    if request.files and "image" in request.files:
        image_data = request.files["image"].read()
    elif request.is_json and request.json:
        b64 = request.json.get("image_base64") or request.json.get("image")
        if b64:
            import base64
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


@api_bp.route("/login/complete", methods=["POST"])
def login_complete():
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
    session.permanent = True
    session["user_id"] = user.id
    ctx = {
        "ip_address": attempt.ip_address,
        "user_agent": attempt.user_agent,
        "geo": attempt.get_geo(),
    }
    context_service.add_trusted_context(user.id, ctx)
    attempt.expires_at = datetime.utcnow()
    db.session.commit()
    # Determine redirect based on role
    if user.role == "app_admin":
        redirect_url = "/app-admin"
    elif user.role == "super_admin":
        redirect_url = "/admin"
    else:
        redirect_url = "/dashboard"

    return jsonify({
        "ok": True,
        "user": {"id": user.id, "username": user.username, "email": user.email, "role": user.role},
        "redirect": redirect_url,
    })


@api_bp.route("/setup/face", methods=["POST"])
def setup_face():
    user_id = request.form.get("user_id") or (request.get_json() or {}).get("user_id")
    image_data = None
    if request.files and "image" in request.files:
        image_data = request.files["image"].read()
    elif request.is_json and request.json:
        b64 = request.json.get("image_base64") or request.json.get("image")
        if b64:
            import base64
            try:
                image_data = base64.b64decode(b64)
            except Exception:
                pass
    if not user_id or not image_data:
        return jsonify({"error": "user_id and image required"}), 400
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    ok, msg = auth_service.set_face_encoding_from_image(user, image_data)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


@api_bp.route("/check-face", methods=["POST"])
def check_face():
    """Check if a face is detected in the given image. JSON: { image: base64 }. Returns { face_detected: true/false }."""
    if not request.is_json or not request.json:
        return jsonify({"error": "JSON body with image (base64) required"}), 400
    b64 = request.json.get("image")
    if not b64:
        return jsonify({"error": "image (base64) required"}), 400
    try:
        import base64
        image_data = base64.b64decode(b64)
    except Exception:
        return jsonify({"error": "Invalid base64 image"}), 400
    face_detected = auth_service.check_face_in_image(image_data)
    return jsonify({"face_detected": face_detected})


@api_bp.route("/setup/face/multi", methods=["POST"])
def setup_face_multi():
    """Register face from multiple poses. Accepts (a) form: user_id + image_0, image_1, ... or (b) JSON: user_id + images: [base64, ...]."""
    user_id = request.form.get("user_id")
    images_data = []

    if request.files:
        user_id = user_id or request.form.get("user_id")
        for key in sorted(request.files.keys()):
            if key.startswith("image_"):
                images_data.append(request.files[key].read())

    if request.is_json and request.json and not images_data:
        data = request.get_json()
        user_id = user_id or data.get("user_id")
        raw = data.get("images") or data.get("image_list")
        if isinstance(raw, list):
            import base64
            for b64 in raw:
                if isinstance(b64, str):
                    try:
                        images_data.append(base64.b64decode(b64))
                    except Exception:
                        pass
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    if not images_data:
        return jsonify({"error": "At least one image required (image_0, image_1, ... or JSON images: [base64,...])"}), 400
    ok, msg = auth_service.set_face_encodings_from_images(user, images_data)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Demo Requests (public)
# ---------------------------------------------------------------------------

@api_bp.route("/subscription-plans", methods=["GET"])
def get_subscription_plans():
    """Return available subscription plans (monthly, yearly) with prices in Naira."""
    monthly = current_app.config.get("SUBSCRIPTION_MONTHLY_PRICE", 15000)
    yearly = current_app.config.get("SUBSCRIPTION_YEARLY_PRICE", 150000)
    currency = current_app.config.get("SUBSCRIPTION_CURRENCY", "NGN")
    return jsonify({
        "plans": [
            {"id": "monthly", "label": "Monthly", "interval": "month", "amount": monthly, "currency": currency, "description": "Billed monthly"},
            {"id": "yearly", "label": "Yearly", "interval": "year", "amount": yearly, "currency": currency, "description": "Billed annually (save vs monthly)"},
        ]
    })


def _sanitize_receipt_filename(name: str) -> str:
    """Keep only safe chars for stored receipt filename."""
    base = re.subn(r"[^\w.\-]", "_", (name or "receipt")[:80])[0].strip("._") or "receipt"
    return base[:60]


@api_bp.route("/subscription-request", methods=["POST"])
def submit_subscription_request():
    """Public endpoint: subscribe as app admin with plan, payment reference, optional receipt. Accepts JSON or multipart."""
    # Support both JSON and form-data (for receipt upload)
    if request.is_json:
        data = request.get_json() or {}
        receipt_file = None
    else:
        data = request.form.to_dict() if request.form else {}
        receipt_file = request.files.get("receipt") if request.files else None

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    company = (data.get("company") or "").strip() or None
    message = (data.get("message") or "").strip() or None
    plan_type = (data.get("plan_type") or "monthly").strip().lower()
    if plan_type not in (SubscriptionRequest.PLAN_MONTHLY, SubscriptionRequest.PLAN_YEARLY):
        plan_type = SubscriptionRequest.PLAN_MONTHLY
    payment_reference = (data.get("payment_reference") or "").strip() or None

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email address."}), 400

    # Resolve amount from plan (Naira)
    if plan_type == SubscriptionRequest.PLAN_YEARLY:
        amount = current_app.config.get("SUBSCRIPTION_YEARLY_PRICE", 150000)
    else:
        amount = current_app.config.get("SUBSCRIPTION_MONTHLY_PRICE", 15000)
    currency = current_app.config.get("SUBSCRIPTION_CURRENCY", "NGN")

    sub = SubscriptionRequest(
        name=name,
        email=email,
        company=company,
        message=message,
        plan_type=plan_type,
        amount=amount,
        currency=currency,
        payment_reference=payment_reference,
    )
    db.session.add(sub)
    db.session.flush()

    # Save receipt file if provided
    if receipt_file and receipt_file.filename:
        allowed = current_app.config.get("ALLOWED_RECEIPT_EXTENSIONS", {"pdf", "png", "jpg", "jpeg", "webp"})
        ext = (receipt_file.filename.rsplit(".", 1)[-1].lower() if "." in receipt_file.filename else "").strip()
        if ext not in allowed:
            db.session.rollback()
            return jsonify({"error": f"Receipt must be one of: {', '.join(sorted(allowed))}"}), 400
        max_size = current_app.config.get("MAX_RECEIPT_SIZE", 10 * 1024 * 1024)
        receipt_file.seek(0, 2)
        size = receipt_file.tell()
        receipt_file.seek(0)
        if size > max_size:
            db.session.rollback()
            return jsonify({"error": "Receipt file too large (max 10 MB)."}), 400
        upload_root = current_app.config.get("UPLOAD_FOLDER")
        receipts_dir = os.path.join(upload_root, current_app.config.get("RECEIPTS_SUBFOLDER", "receipts"))
        os.makedirs(receipts_dir, exist_ok=True)
        safe_name = _sanitize_receipt_filename(receipt_file.filename)
        stored_name = f"{sub.id}_{safe_name}.{ext}" if ext else f"{sub.id}_{safe_name}"
        filepath = os.path.join(receipts_dir, stored_name)
        try:
            receipt_file.save(filepath)
            sub.receipt_filename = stored_name
        except OSError as e:
            current_app.logger.warning("Failed to save receipt: %s", e)
            # Continue without receipt

    db.session.commit()

    return jsonify({"ok": True, "message": "Subscription request submitted. An admin will review your payment and approve."}), 201


@api_bp.route("/demo-request", methods=["POST"])
def submit_demo_request():
    """Public endpoint: submit a demo request from the landing page."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    company = (data.get("company") or "").strip() or None
    message = (data.get("message") or "").strip() or None

    if not name or not email:
        return jsonify({"error": "Name and email are required."}), 400

    # Basic email check
    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email address."}), 400

    demo_req = DemoRequest(
        name=name,
        email=email,
        company=company,
        message=message,
    )
    db.session.add(demo_req)
    db.session.commit()

    return jsonify({"ok": True, "message": "Demo request submitted successfully."}), 201


@api_bp.route("/demo/<token>", methods=["GET"])
def view_demo(token: str):
    """Public endpoint: retrieve demo content by token (for the demo viewer page)."""
    demo_req = DemoRequest.query.filter_by(demo_token=token).first()
    if not demo_req:
        return jsonify({"error": "Demo not found."}), 404

    if demo_req.status != DemoRequest.STATUS_SENT and demo_req.status != DemoRequest.STATUS_VIEWED:
        return jsonify({"error": "This demo is not yet available."}), 403

    # Mark as viewed on first access
    if demo_req.status == DemoRequest.STATUS_SENT:
        demo_req.status = DemoRequest.STATUS_VIEWED
        demo_req.viewed_at = datetime.utcnow()
        db.session.commit()

    return jsonify({
        "name": demo_req.name,
        "subject": demo_req.demo_subject or "Your SecureAuth Demo",
        "content": demo_req.demo_content or "",
        "sent_at": demo_req.sent_at.isoformat() if demo_req.sent_at else None,
    })
