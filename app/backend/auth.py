# -*- coding: utf-8 -*-
"""Проверка Supabase-JWT по JWKS (асимметричные ключи). Секрет на сервере не хранится."""
import os
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
ISSUER = f"{SUPABASE_URL}/auth/v1"
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

_jwk_client = None
def _client():
    global _jwk_client
    if _jwk_client is None:
        if not SUPABASE_URL:
            raise RuntimeError("SUPABASE_URL не задан")
        _jwk_client = PyJWKClient(JWKS_URL)
    return _jwk_client

def verify(token: str) -> str:
    """Вернуть user_id (sub) если токен валиден, иначе бросить исключение."""
    signing_key = _client().get_signing_key_from_jwt(token).key
    claims = jwt.decode(
        token, signing_key,
        algorithms=["RS256", "ES256"],
        audience="authenticated",
        issuer=ISSUER,
        options={"require": ["exp", "sub"]},
    )
    return claims["sub"]
