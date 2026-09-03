# -*- coding: utf-8 -*-
"""
FastAPI-бэкенд контент-машины «Залихват».
- проверяет Supabase-JWT на каждом запросе
- /api/generate: генерация под платформу с учётом профиля
- ANTHROPIC_API_KEY только на сервере; CORS ограничен app-доменом; rate limit
"""
import os
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import auth
import generate as gen
import oauth
import usage

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")
FREE_LIMIT = int(os.environ.get("FREE_LIMIT", "1"))
UNLIMITED_EMAILS = {e.strip().lower() for e in
                    os.environ.get("UNLIMITED_EMAILS", "aksenovwork@yandex.ru").split(",") if e.strip()}

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Zalihvat Content Machine API", docs_url=None, redoc_url=None)
app.state.limiter = limiter
app.add_middleware(CORSMiddleware, allow_origins=[ALLOWED_ORIGIN],
                   allow_methods=["POST", "GET"], allow_headers=["authorization", "content-type"])
app.include_router(oauth.router)

@app.exception_handler(RateLimitExceeded)
def _ratelimit(request: Request, exc):
    return JSONResponse(status_code=429, content={"error": "слишком много запросов, попробуй позже"})

def get_user(authorization: str = Header(default="")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="нет токена")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = auth.verify_full(token)
    except Exception:
        raise HTTPException(status_code=401, detail="токен невалиден")
    return {"id": claims["sub"], "email": (claims.get("email") or "").lower()}

class Profile(BaseModel):
    niche: str | None = Field(default=None, max_length=400)
    audience: str | None = Field(default=None, max_length=400)
    tone: str | None = Field(default=None, max_length=200)
    personality: str | None = Field(default=None, max_length=800)
    languages: str | None = Field(default=None, max_length=200)
    brand_notes: str | None = Field(default=None, max_length=800)

class GenReq(BaseModel):
    platform: str = Field(max_length=32)
    topic: str = Field(default="", max_length=500)
    profile: Profile | None = None

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/platforms")
def platforms():
    return {"platforms": sorted(gen.PLATFORMS)}

@app.get("/api/me")
def me(user: dict = Depends(get_user)):
    unlimited = user["email"] in UNLIMITED_EMAILS
    used = 0 if unlimited else usage.count(user["id"])
    return {"email": user["email"], "unlimited": unlimited,
            "used": used, "free_limit": FREE_LIMIT,
            "remaining": None if unlimited else max(0, FREE_LIMIT - used)}

@app.post("/api/generate")
@limiter.limit("40/hour")
def generate_endpoint(request: Request, req: GenReq, user: dict = Depends(get_user)):
    if req.platform not in gen.PLATFORMS:
        raise HTTPException(status_code=400, detail="неизвестная платформа")
    unlimited = user["email"] in UNLIMITED_EMAILS
    if not unlimited:
        used = usage.count(user["id"])
        if used >= FREE_LIMIT:
            return JSONResponse(status_code=402, content={
                "error": "limit", "reason": "free_used",
                "used": used, "free_limit": FREE_LIMIT})
    profile = req.profile.model_dump(exclude_none=True) if req.profile else None
    try:
        result = gen.generate(req.platform, req.topic, profile)
    except Exception:
        raise HTTPException(status_code=502, detail="ошибка генерации, попробуй ещё раз")
    usage.record(user["id"], req.platform, req.topic, result.get("data"))
    return result
