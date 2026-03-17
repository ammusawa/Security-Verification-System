"""Database models for users, trusted contexts, login attempts, apps, API keys, and demo requests."""
from datetime import datetime
import json
import secrets

from app import db


# ---------------------------------------------------------------------------
# Multi-tenant: App & ApiKey
# ---------------------------------------------------------------------------

class App(db.Model):
    """An external application (tenant) that uses the auth service."""
    __tablename__ = "apps"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False, index=True)
    owner_email = db.Column(db.String(200), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    api_keys = db.relationship("ApiKey", backref="app", lazy="dynamic", cascade="all, delete-orphan")
    users = db.relationship("User", backref="app", lazy="dynamic")

    def __repr__(self):
        return f"<App {self.name}>"


class ApiKey(db.Model):
    """Hashed API key belonging to an App. The raw key is shown only once on creation."""
    __tablename__ = "api_keys"

    id = db.Column(db.Integer, primary_key=True)
    app_id = db.Column(db.Integer, db.ForeignKey("apps.id"), nullable=False, index=True)
    key_hash = db.Column(db.String(128), nullable=False)
    prefix = db.Column(db.String(16), nullable=False, index=True)
    label = db.Column(db.String(200), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    revoked_at = db.Column(db.DateTime, nullable=True)

    def __repr__(self):
        return f"<ApiKey {self.prefix}...>"


# ---------------------------------------------------------------------------
# User (now with optional tenant scoping via app_id)
# ---------------------------------------------------------------------------

class User(db.Model):
    __tablename__ = "users"

    # Roles
    ROLE_USER = "user"
    ROLE_APP_ADMIN = "app_admin"
    ROLE_SUPER_ADMIN = "super_admin"

    id = db.Column(db.Integer, primary_key=True)
    app_id = db.Column(db.Integer, db.ForeignKey("apps.id"), nullable=True, index=True)
    role = db.Column(db.String(20), nullable=False, default="user", index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    totp_secret = db.Column(db.String(32), nullable=True)
    face_encoding_blob = db.Column(db.LargeBinary, nullable=True)
    face_encodings_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    trusted_contexts = db.relationship("TrustedContext", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    login_attempts = db.relationship("LoginAttempt", backref="user", lazy="dynamic", cascade="all, delete-orphan")
    password_reset_tokens = db.relationship("PasswordResetToken", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    @property
    def is_app_admin(self) -> bool:
        return self.role == self.ROLE_APP_ADMIN

    @property
    def is_super_admin(self) -> bool:
        return self.role == self.ROLE_SUPER_ADMIN

    def __repr__(self):
        return f"<User {self.username} ({self.role})>"


class PasswordResetToken(db.Model):
    """Single-use token for password reset. Token is hashed before storage."""
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(128), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<PasswordResetToken user_id={self.user_id} expires={self.expires_at}>"


class TrustedContext(db.Model):
    __tablename__ = "trusted_contexts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    ip_address = db.Column(db.String(45), nullable=False)
    user_agent = db.Column(db.String(512), nullable=False)
    geo_data = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_geo(self):
        if not self.geo_data:
            return None
        try:
            return json.loads(self.geo_data)
        except (json.JSONDecodeError, TypeError):
            return None

    def set_geo(self, obj):
        self.geo_data = json.dumps(obj) if obj else None


class LoginAttempt(db.Model):
    __tablename__ = "login_attempts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    session_token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    step = db.Column(db.String(32), nullable=False, default="password_sent")
    otp_code_hash = db.Column(db.String(128), nullable=True)
    otp_expires_at = db.Column(db.DateTime, nullable=True)
    ip_address = db.Column(db.String(45), nullable=False)
    user_agent = db.Column(db.String(512), nullable=False)
    geo_data = db.Column(db.Text, nullable=True)
    verification_level_required = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)

    def get_geo(self):
        if not self.geo_data:
            return None
        try:
            return json.loads(self.geo_data)
        except (json.JSONDecodeError, TypeError):
            return None

    def set_geo(self, obj):
        self.geo_data = json.dumps(obj) if obj else None


# ---------------------------------------------------------------------------
# Demo Requests
# ---------------------------------------------------------------------------

class DemoRequest(db.Model):
    """A request-demo submission from the public landing page."""
    __tablename__ = "demo_requests"

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_VIEWED = "viewed"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False, index=True)
    company = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(20), nullable=False, default=STATUS_PENDING, index=True)

    # Token for the unique demo link sent to the requester
    demo_token = db.Column(db.String(64), unique=True, nullable=False, index=True,
                           default=lambda: secrets.token_urlsafe(32))

    # Admin-composed demo content
    demo_subject = db.Column(db.String(300), nullable=True)
    demo_content = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sent_at = db.Column(db.DateTime, nullable=True)
    viewed_at = db.Column(db.DateTime, nullable=True)

    def __repr__(self):
        return f"<DemoRequest {self.email} ({self.status})>"


# ---------------------------------------------------------------------------
# Subscription Requests (app admin subscribe, admin approves)
# ---------------------------------------------------------------------------

class SubscriptionRequest(db.Model):
    """A request to subscribe as an app admin. Includes plan, payment details, receipt. Admin approves to create App + user."""
    __tablename__ = "subscription_requests"

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_REVOKED = "revoked"

    PLAN_MONTHLY = "monthly"
    PLAN_YEARLY = "yearly"

    PAYMENT_PENDING = "pending"
    PAYMENT_VERIFIED = "verified"
    PAYMENT_FAILED = "failed"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False, index=True)
    company = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=True)

    plan_type = db.Column(db.String(20), nullable=False, default=PLAN_MONTHLY, index=True)
    amount = db.Column(db.Numeric(10, 2), nullable=True)
    currency = db.Column(db.String(3), nullable=True, default="NGN")
    payment_reference = db.Column(db.String(200), nullable=True)
    receipt_filename = db.Column(db.String(255), nullable=True)
    payment_status = db.Column(db.String(20), nullable=False, default=PAYMENT_PENDING, index=True)

    status = db.Column(db.String(20), nullable=False, default=STATUS_PENDING, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    app_id = db.Column(db.Integer, db.ForeignKey("apps.id"), nullable=True, index=True)

    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_id])
    app = db.relationship("App", foreign_keys=[app_id])

    def __repr__(self):
        return f"<SubscriptionRequest {self.email} ({self.status})>"
