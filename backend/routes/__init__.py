from app.routes.api import api_bp
from app.routes.v1 import v1_bp
from app.routes.admin import admin_bp
from app.routes.app_admin import app_admin_bp

__all__ = ["api_bp", "v1_bp", "admin_bp", "app_admin_bp"]
