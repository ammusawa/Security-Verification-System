"""Application configuration. Load .env from backend folder."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
# Load .env so CORS_ORIGINS etc. are set whether we run via run.py or flask run
_env = BASE_DIR / ".env"
if _env.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env)
    except ImportError:
        pass


def _mysql_uri():
    user = os.environ.get("MYSQL_USER", "root")
    password = os.environ.get("MYSQL_PASSWORD", "")
    host = os.environ.get("MYSQL_HOST", "localhost")
    port = os.environ.get("MYSQL_PORT", "3306")
    database = os.environ.get("MYSQL_DATABASE", "security_verification")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-secret-change-in-production"
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URI") or _mysql_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Context similarity thresholds
    IP_STRICT = True
    USER_AGENT_SIMILARITY_THRESHOLD = 0.8
    GEO_RADIUS_KM = 50
    REQUIRE_FACE_WHEN_LEVEL = 2
    REQUIRE_OTP_WHEN_LEVEL = 1

    # Session
    PERMANENT_SESSION_LIFETIME = 3600
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Email (OTP)
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 25))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "false").lower() == "true"
    MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "false").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "noreply@security-verification.local")
    OTP_EXPIRE_MINUTES = 10
    OTP_LENGTH = 6

    # JWT (auth-as-a-service)
    JWT_SECRET = os.environ.get("JWT_SECRET") or "jwt-dev-secret-change-in-production"
    JWT_ACCESS_EXPIRE_SECONDS = int(os.environ.get("JWT_ACCESS_EXPIRE_SECONDS", 3600))        # 1 hour
    JWT_REFRESH_EXPIRE_SECONDS = int(os.environ.get("JWT_REFRESH_EXPIRE_SECONDS", 604800))    # 7 days

    # Admin API
    ADMIN_SECRET = os.environ.get("ADMIN_SECRET") or "admin-dev-secret-change-in-production"

    # CORS (frontend and other API consumers; comma-separated origins)
    _cors = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
    _list = [o.strip() for o in _cors.split(",") if o.strip()]
    # Always allow test-client origins (Live Server / http.server 5500) so test-client works without .env tweaks
    for _origin in ("http://127.0.0.1:5500", "http://localhost:5500"):
        if _origin not in _list:
            _list.append(_origin)
    CORS_ORIGINS = _list
    # Base URL of the frontend (for password reset links in emails)
    FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")

    # Uploads (receipts for subscription requests)
    UPLOAD_FOLDER = Path(BASE_DIR) / "uploads"
    RECEIPTS_SUBFOLDER = "receipts"
    MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB
    ALLOWED_RECEIPT_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "webp"}

    # Subscription plan prices (NGN - Nigerian Naira); override via env if needed
    SUBSCRIPTION_MONTHLY_PRICE = float(os.environ.get("SUBSCRIPTION_MONTHLY_PRICE", "15000"))
    SUBSCRIPTION_YEARLY_PRICE = float(os.environ.get("SUBSCRIPTION_YEARLY_PRICE", "150000"))
    SUBSCRIPTION_CURRENCY = os.environ.get("SUBSCRIPTION_CURRENCY", "NGN")
