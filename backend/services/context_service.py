"""Context: IP, User-Agent, Geo comparison and verification level."""
import json
import math
from difflib import SequenceMatcher

import requests

from app import db
from app.models import TrustedContext
from config import Config


def _get_geo_from_ip(ip_address: str):
    if not ip_address or ip_address in ("127.0.0.1", "::1", "localhost"):
        return {"lat": None, "lon": None, "country": "Local", "city": "Local"}
    # Try ipinfo.io first (often better city accuracy e.g. Nigeria); fallback to ip-api.com
    try:
        r = requests.get(
            f"https://ipinfo.io/{ip_address}/json",
            timeout=3,
            headers={"User-Agent": "SecurityVerificationSystem/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            city = (data.get("city") or "").strip()
            region = (data.get("region") or "").strip()
            country = (data.get("country") or "").strip()
            lat, lon = None, None
            loc = (data.get("loc") or "").strip()
            if loc and "," in loc:
                parts = loc.split(",", 1)
                try:
                    lat, lon = float(parts[0]), float(parts[1])
                except (ValueError, IndexError):
                    pass
            if city or country:
                return {"lat": lat, "lon": lon, "country": country, "city": city or region, "state": region}
    except Exception:
        pass
    try:
        r = requests.get(
            f"http://ip-api.com/json/{ip_address}?fields=lat,lon,country,city,regionName",
            timeout=3,
            headers={"User-Agent": "SecurityVerificationSystem/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            city = (data.get("city") or "").strip()
            region = (data.get("regionName") or "").strip()
            # Prefer city; if it looks like an LGA (e.g. "Abuja Municipal Area Council") use region for display when we have it
            if region and not city:
                city = region
            return {"lat": data.get("lat"), "lon": data.get("lon"), "country": data.get("country", ""), "city": city, "state": region}
    except Exception:
        pass
    return {"lat": None, "lon": None, "country": "", "city": ""}


def _reverse_geocode(lat: float, lon: float) -> dict:
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lon, "format": "json", "addressdetails": 1},
            timeout=5,
            headers={"User-Agent": "SecurityVerificationSystem/1.0"},
        )
        if r.status_code == 200:
            data = r.json()
            address = data.get("address") or {}
            city = (address.get("city") or address.get("town") or address.get("village") or address.get("municipality") or address.get("county") or address.get("state_district") or address.get("suburb") or address.get("neighbourhood") or "")
            state = address.get("state") or address.get("region") or ""
            country = address.get("country") or ""
            if not city and state:
                city = state
            if city or country:
                return {"city": city or "", "state": state, "country": country}
            display_name = (data.get("display_name") or "").strip()
            if display_name:
                parts = [p.strip() for p in display_name.split(",")]
                if len(parts) >= 2:
                    return {"city": parts[0], "state": "", "country": parts[-1]}
                if parts:
                    return {"city": parts[0], "state": "", "country": ""}
    except Exception:
        pass
    try:
        r = requests.get("https://photon.komoot.io/reverse", params={"lat": lat, "lon": lon}, timeout=5, headers={"User-Agent": "SecurityVerificationSystem/1.0"})
        if r.status_code == 200:
            data = r.json()
            features = data.get("features") or []
            if features:
                props = features[0].get("properties") or {}
                city = props.get("city") or props.get("name") or props.get("district") or ""
                country = props.get("country") or ""
                state = props.get("state") or ""
                if city or country:
                    return {"city": city or "", "state": state, "country": country}
    except Exception:
        pass
    return {"city": "", "state": "", "country": ""}


def _normalize_ip(ip: str) -> str:
    if not ip:
        return ""
    ip = ip.strip()
    if ip.startswith("::ffff:"):
        ip = ip[7:]
    if ":" in ip and "%" in ip:
        ip = ip.split("%")[0]
    return ip


def _ip_matches(a: str, b: str, strict: bool = True) -> bool:
    a, b = _normalize_ip(a), _normalize_ip(b)
    if a == b:
        return True
    if not strict and a and b and "." in a and "." in b:
        try:
            return ".".join(a.split(".")[:3]) == ".".join(b.split(".")[:3])
        except Exception:
            pass
    return False


def _ua_similarity(ua1: str, ua2: str) -> float:
    if not ua1 or not ua2:
        return 0.0
    return SequenceMatcher(None, (ua1 or "")[:512], (ua2 or "")[:512]).ratio()


def _geo_matches(geo1: dict, geo2: dict, radius_km: float) -> bool:
    lat1, lon1 = geo1.get("lat"), geo1.get("lon")
    lat2, lon2 = geo2.get("lat"), geo2.get("lon")
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        c1 = (geo1.get("country") or "") + "|" + (geo1.get("city") or "")
        c2 = (geo2.get("country") or "") + "|" + (geo2.get("city") or "")
        return bool(c1 and c2 and c1 == c2)
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlam = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return (R * c) <= radius_km


class ContextService:
    def get_request_context(self, request) -> dict:
        ip = _normalize_ip(request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr)
        user_agent = (request.headers.get("User-Agent") or "")[:512]
        geo = None
        if request.is_json and request.json:
            geo = request.json.get("geo")
        if isinstance(geo, dict) and not (geo.get("lat") is not None and geo.get("lon") is not None):
            geo = None
        if not geo and ip and ip not in ("127.0.0.1", "::1", "localhost"):
            geo = _get_geo_from_ip(ip)
        elif not geo:
            geo = {"lat": None, "lon": None, "country": "Local", "city": "Local"}
        if geo and geo.get("lat") is not None and geo.get("lon") is not None and not geo.get("city") and not geo.get("country"):
            rev = _reverse_geocode(geo["lat"], geo["lon"])
            geo = dict(geo)
            geo.setdefault("city", rev.get("city") or "")
            geo.setdefault("state", rev.get("state") or "")
            geo.setdefault("country", rev.get("country") or "")
        # Build location_display: "Local" or "City, State, Country"
        if not geo:
            location_display = "—"
        else:
            city = (geo.get("city") or "").strip()
            state = (geo.get("state") or "").strip()
            country = (geo.get("country") or "").strip()
            if city == "Local" and country == "Local":
                location_display = "Local"
            else:
                parts = [p for p in [city, state, country] if p]
                location_display = ", ".join(parts) if parts else "—"
        return {"ip_address": ip, "user_agent": user_agent, "geo": geo, "location_display": location_display}

    def compare_with_trusted(self, user_id: int, current: dict) -> tuple[bool, bool, bool]:
        trusted = TrustedContext.query.filter_by(user_id=user_id).all()
        if not trusted:
            return False, False, False
        ip_ok = any(_ip_matches(current["ip_address"], t.ip_address, Config.IP_STRICT) for t in trusted)
        ua_ok = any(_ua_similarity(current["user_agent"], t.user_agent) >= Config.USER_AGENT_SIMILARITY_THRESHOLD for t in trusted)
        geo_ok = any(_geo_matches(current.get("geo") or {}, t.get_geo() or {}, Config.GEO_RADIUS_KM) for t in trusted if t.get_geo())
        if not any(t.get_geo() and (t.get_geo().get("lat") is not None or t.get_geo().get("country")) for t in trusted):
            geo_ok = True
        return ip_ok, ua_ok, geo_ok

    def required_verification_level(self, user_id: int, current: dict) -> int:
        ip_ok, ua_ok, geo_ok = self.compare_with_trusted(user_id, current)
        d = sum([not ip_ok, not ua_ok, not geo_ok])
        return 0 if d == 0 else 1 if d == 1 else 2

    def add_trusted_context(self, user_id: int, context: dict) -> TrustedContext:
        tc = TrustedContext(user_id=user_id, ip_address=context["ip_address"], user_agent=context["user_agent"])
        tc.set_geo(context.get("geo"))
        db.session.add(tc)
        db.session.commit()
        return tc


context_service = ContextService()
