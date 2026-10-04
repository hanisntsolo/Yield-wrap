"""Password hashing, JWT issuing/verification, httpOnly auth cookies and FastAPI auth dependencies."""
import uuid
from datetime import timedelta

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, Request, Response

from config import settings
from errors import APIError, forbidden, unauthorized
from services.db_service import db, serialize, utcnow

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(user: dict, kind: str) -> str:
    now = utcnow()
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if kind == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": str(user["_id"]),
        "role": user["role"],
        "type": kind,
        "tv": user.get("token_version", 0),
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, kind: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise unauthorized("Your session has expired", "TOKEN_EXPIRED") from None
    except jwt.InvalidTokenError:
        raise unauthorized("Invalid session") from None
    if payload.get("type") != kind or not ObjectId.is_valid(payload.get("sub", "")):
        raise unauthorized("Invalid session")
    return payload


def set_auth_cookies(response: Response, user: dict) -> None:
    common = {"httponly": True, "secure": settings.cookie_secure, "samesite": settings.cookie_samesite}
    response.set_cookie(
        ACCESS_COOKIE,
        create_token(user, "access"),
        max_age=settings.access_token_minutes * 60,
        path="/",
        **common,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        create_token(user, "refresh"),
        max_age=settings.refresh_token_days * 86400,
        path=REFRESH_COOKIE_PATH,
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    common = {"httponly": True, "secure": settings.cookie_secure, "samesite": settings.cookie_samesite}
    response.delete_cookie(ACCESS_COOKIE, path="/", **common)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, **common)


async def user_from_token(token: str | None, kind: str = "access") -> dict:
    """Resolve a token to an active user. Logging out bumps `token_version`, revoking older tokens."""
    if not token:
        raise unauthorized()
    payload = decode_token(token, kind)
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or user.get("token_version", 0) != payload.get("tv", 0):
        raise unauthorized("Invalid session")
    if user.get("is_suspended"):
        raise APIError(403, "This account has been suspended", "ACCOUNT_SUSPENDED")
    return user


async def get_current_user(request: Request) -> dict:
    return await user_from_token(request.cookies.get(ACCESS_COOKIE))


async def get_optional_user(request: Request) -> dict | None:
    try:
        return await get_current_user(request)
    except APIError:
        return None


def require_roles(*roles: str):
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise forbidden()
        return user

    return dependency


def public_user(user: dict | None) -> dict | None:
    """Serialise a user without secrets or internal bookkeeping."""
    if user is None:
        return None
    hidden = {"password", "fcm_token", "token_version"}
    out = {"id": str(user["_id"]), **{k: v for k, v in user.items() if k not in hidden and k != "_id"}}
    out.setdefault("is_verified", False)
    out.setdefault("is_suspended", False)
    out.setdefault("is_premium_partner", False)
    return serialize(out)
