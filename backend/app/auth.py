from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe

import jwt
from fastapi import Cookie, HTTPException, Request, Response
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from .config import get_settings

COOKIE_NAME = "rds_session"
ALGORITHM = "HS256"
AUDIENCE = "rds-lead-finder"
ISSUER = "rds-lead-finder-api"
MAX_FAILED_LOGINS = 5
LOGIN_WINDOW_SECONDS = 15 * 60

password_hash = PasswordHash.recommended()
_failed_logins: dict[str, deque[float]] = defaultdict(deque)
_failed_logins_lock = threading.Lock()


def _configured() -> None:
    if not get_settings().auth_configured:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the server. Set ADMIN_PASSWORD_HASH and SESSION_SECRET.",
        )


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_login_limit(request: Request) -> None:
    now = time.monotonic()
    key = _client_key(request)
    with _failed_logins_lock:
        attempts = _failed_logins[key]
        while attempts and attempts[0] <= now - LOGIN_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= MAX_FAILED_LOGINS:
            retry_after = max(1, int(LOGIN_WINDOW_SECONDS - (now - attempts[0])))
            raise HTTPException(
                status_code=429,
                detail="Too many failed sign-in attempts. Try again later.",
                headers={"Retry-After": str(retry_after)},
            )


def record_failed_login(request: Request) -> None:
    with _failed_logins_lock:
        _failed_logins[_client_key(request)].append(time.monotonic())


def clear_failed_logins(request: Request) -> None:
    with _failed_logins_lock:
        _failed_logins.pop(_client_key(request), None)


def authenticate(username: str, password: str) -> bool:
    _configured()
    settings = get_settings()
    username_ok = hmac.compare_digest(username.strip(), settings.admin_username.strip())
    try:
        password_ok = password_hash.verify(password, settings.admin_password_hash)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="The server password hash is invalid.") from exc
    return username_ok and password_ok


def create_session_token(username: str) -> str:
    _configured()
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=max(1, min(settings.session_hours, 168)))
    return jwt.encode(
        {
            "sub": username,
            "iat": now,
            "exp": expires,
            "jti": token_urlsafe(18),
            "aud": AUDIENCE,
            "iss": ISSUER,
        },
        settings.session_secret,
        algorithm=ALGORITHM,
    )


def session_username(token: str) -> str | None:
    settings = get_settings()
    if not settings.auth_configured:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.session_secret,
            algorithms=[ALGORITHM],
            audience=AUDIENCE,
            issuer=ISSUER,
            options={"require": ["sub", "iat", "exp", "jti"]},
        )
    except InvalidTokenError:
        return None
    username = payload.get("sub")
    if not isinstance(username, str) or not hmac.compare_digest(username, settings.admin_username.strip()):
        return None
    return username


def require_user(rds_session: str = Cookie(default="", alias=COOKIE_NAME)) -> str:
    username = session_username(rds_session)
    if not username:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return username


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    max_age = max(1, min(settings.session_hours, 168)) * 60 * 60
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
