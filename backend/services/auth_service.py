"""Authentication: password, OTP (email), face."""
from __future__ import annotations

import base64
import io
import json
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from PIL import Image

from app import db
from app.models import User, LoginAttempt
from app.services.email_service import send_otp_email
from config import Config

try:
    import face_recognition
    import numpy as np
    FACE_AVAILABLE = True
except ImportError:
    FACE_AVAILABLE = False


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def _generate_session_token() -> str:
    return secrets.token_urlsafe(32)


class AuthService:
    def hash_password(self, password: str) -> str:
        return _hash_password(password)

    def verify_password(self, user: User, password: str) -> bool:
        return _check_password(password, user.password_hash)

    def generate_email_otp(self) -> str:
        length = getattr(Config, "OTP_LENGTH", 6)
        return "".join(secrets.choice("0123456789") for _ in range(length))

    def set_attempt_otp(self, attempt: LoginAttempt, code: str) -> None:
        attempt.otp_code_hash = bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        minutes = getattr(Config, "OTP_EXPIRE_MINUTES", 10)
        attempt.otp_expires_at = datetime.utcnow() + timedelta(minutes=minutes)

    def send_otp_to_user(self, user: User, code: str) -> bool:
        """Send OTP to the user's registered email (not to the MAIL_* sender)."""
        return send_otp_email(user.email, code, username=user.username)

    def verify_email_otp(self, attempt: LoginAttempt, code: str) -> bool:
        if not attempt.otp_code_hash or not attempt.otp_expires_at:
            return False
        if datetime.utcnow() > attempt.otp_expires_at:
            return False
        try:
            return bcrypt.checkpw(code.encode("utf-8"), attempt.otp_code_hash.encode("utf-8"))
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Face duplicate tolerance: how close two faces need to be for us to
    # consider them the same person.  Lower = stricter.
    # ------------------------------------------------------------------
    DUPLICATE_TOLERANCE = 0.45  # strict — catch duplicates reliably
    VERIFY_TOLERANCE = 0.50     # verification during login

    def check_face_in_image(self, image_data: bytes) -> bool:
        """Return True if at least one face is detected in the image (for step-by-step validation)."""
        if not FACE_AVAILABLE:
            return False
        try:
            img = Image.open(io.BytesIO(image_data)).convert("RGB")
            arr = np.array(img)
            encodings = face_recognition.face_encodings(arr)
            return len(encodings) > 0
        except Exception:
            return False

    def _find_duplicate_face(self, encoding, exclude_user_id: int | None = None) -> User | None:
        """Check if a face encoding already belongs to another user.

        Scans all users who have face data and returns the first match,
        or None if no duplicate is found.
        """
        if not FACE_AVAILABLE:
            return None
        all_users = User.query.filter(
            (User.face_encodings_json.isnot(None)) | (User.face_encoding_blob.isnot(None))
        ).all()
        for u in all_users:
            if exclude_user_id is not None and u.id == exclude_user_id:
                continue
            stored = self._get_stored_face_encodings(u)
            if not stored:
                continue
            distances = face_recognition.face_distance(stored, encoding)
            if len(distances) > 0 and float(np.min(distances)) < self.DUPLICATE_TOLERANCE:
                return u
        return None

    def set_face_encoding_from_image(self, user: User, image_data: bytes) -> tuple[bool, str]:
        if not FACE_AVAILABLE:
            return False, "Face recognition library not available"
        try:
            img = Image.open(io.BytesIO(image_data)).convert("RGB")
            arr = np.array(img)
            encodings = face_recognition.face_encodings(arr)
            if not encodings:
                return False, "No face detected in image"

            # Duplicate check
            dup = self._find_duplicate_face(encodings[0], exclude_user_id=user.id)
            if dup:
                return False, f"This face is already registered to another account."

            user.face_encoding_blob = encodings[0].tobytes()
            user.face_encodings_json = json.dumps([base64.b64encode(encodings[0].tobytes()).decode("ascii")])
            db.session.commit()
            return True, ""
        except Exception as e:
            return False, str(e)

    def set_face_encodings_from_images(self, user: User, images_data: list[bytes]) -> tuple[bool, str]:
        """Register multiple face angles (e.g. center, left, right).

        Before saving, checks that:
        1. Every image contains a face.
        2. All captured faces belong to the same person (cross-check).
        3. The face does not already belong to a different user (duplicate check).
        """
        if not FACE_AVAILABLE:
            return False, "Face recognition library not available"
        if not images_data:
            return False, "At least one image required"
        try:
            new_encodings = []
            for idx, image_data in enumerate(images_data):
                img = Image.open(io.BytesIO(image_data)).convert("RGB")
                arr = np.array(img)
                encodings = face_recognition.face_encodings(arr)
                if not encodings:
                    return False, f"No face detected in image {idx + 1}"
                new_encodings.append(encodings[0])

            # ── Same-person check across all captured poses ──────────
            # Compare every pose to the first. If any pair is too far
            # apart, the images likely show different people.
            if len(new_encodings) > 1:
                reference = new_encodings[0]
                for idx, enc in enumerate(new_encodings[1:], start=2):
                    dist = float(face_recognition.face_distance([reference], enc)[0])
                    if dist > 0.55:
                        return False, (
                            f"Image {idx} appears to be a different person than image 1. "
                            "Please make sure the same person is in every capture."
                        )

            # ── Duplicate check against existing users ───────────────
            dup = self._find_duplicate_face(new_encodings[0], exclude_user_id=user.id)
            if dup:
                return False, "This face is already registered to another account."

            # ── Save ─────────────────────────────────────────────────
            encoded_list = [
                base64.b64encode(enc.tobytes()).decode("ascii")
                for enc in new_encodings
            ]
            user.face_encodings_json = json.dumps(encoded_list)
            user.face_encoding_blob = base64.b64decode(encoded_list[0])  # first for backward compat
            db.session.commit()
            return True, ""
        except Exception as e:
            return False, str(e)

    def _get_stored_face_encodings(self, user: User) -> list:
        """Return list of numpy arrays (128-d) for all stored encodings."""
        if not FACE_AVAILABLE:
            return []
        out = []
        if user.face_encodings_json:
            try:
                for b64 in json.loads(user.face_encodings_json):
                    out.append(np.frombuffer(base64.b64decode(b64), dtype=np.float64))
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        if not out and user.face_encoding_blob:
            out.append(np.frombuffer(user.face_encoding_blob, dtype=np.float64))
        return out

    def verify_face_from_image(self, user: User, image_data: bytes, tolerance: float | None = None) -> tuple[bool, str]:
        """Verify that the face in *image_data* matches *user*'s stored encodings.

        Uses face_distance for precise comparison:
        - Computes distances to all stored pose encodings.
        - Best (lowest) distance must be below *tolerance* to pass.
        - Returns True/False plus a descriptive message.
        """
        if tolerance is None:
            tolerance = self.VERIFY_TOLERANCE

        if not FACE_AVAILABLE:
            return False, "Face recognition not available"
        stored_list = self._get_stored_face_encodings(user)
        if not stored_list:
            return False, "No face registered for user"
        try:
            img = Image.open(io.BytesIO(image_data)).convert("RGB")
            arr = np.array(img)
            encodings = face_recognition.face_encodings(arr)
            if not encodings:
                return False, "No face detected in image"

            distances = face_recognition.face_distance(stored_list, encodings[0])
            best_distance = float(np.min(distances))

            if best_distance < tolerance:
                return True, ""
            else:
                return False, "Face does not match the registered user."
        except Exception as e:
            return False, str(e)

    def create_login_attempt(self, user_id: int, context: dict, verification_level: int) -> LoginAttempt:
        token = _generate_session_token()
        attempt = LoginAttempt(
            user_id=user_id,
            session_token=token,
            step="password_sent",
            ip_address=context["ip_address"],
            user_agent=context["user_agent"],
            verification_level_required=verification_level,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
        attempt.set_geo(context.get("geo"))
        db.session.add(attempt)
        db.session.commit()
        return attempt

    def get_attempt_by_token(self, session_token: str) -> Optional[LoginAttempt]:
        return LoginAttempt.query.filter(
            LoginAttempt.session_token == session_token,
            LoginAttempt.expires_at > datetime.utcnow(),
        ).first()

    def requires_otp(self, level: int) -> bool:
        return level >= Config.REQUIRE_OTP_WHEN_LEVEL

    def requires_face(self, level: int) -> bool:
        return level >= Config.REQUIRE_FACE_WHEN_LEVEL


auth_service = AuthService()
