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

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Zalihvat Content Machine API", docs_url=None, redoc_url=None)
app.state.limiter = limiter
app.add_middleware(CORSMiddleware, allow_origins=[ALLOWED_ORIGIN],
                   allow_methods=["POST", "GET"], allow_headers=["authorization", "content-type"])
app.include_router(oauth.router)

@app.exception_handler(RateLimitExceeded)
def _ratelimit(request: Request, exc):
    return JSONResponse(status_code=429, content={"error": "слишком много запросов, попробуй позже"})

def get_user(authorization: str = Header(default="")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="нет токена")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return auth.verify(token)
    except Exception:
        raise HTTPException(status_code=401, detail="токен невалиден")

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

@app.post("/api/generate")
@limiter.limit("40/hour")
def generate_endpoint(request: Request, req: GenReq, user_id: str = Depends(get_user)):
    if req.platform not in gen.PLATFORMS:
        raise HTTPException(status_code=400, detail="неизвестная платформа")
    profile = req.profile.model_dump(exclude_none=True) if req.profile else None
    try:
        result = gen.generate(req.platform, req.topic, profile)
    except Exception:
        raise HTTPException(status_code=502, detail="ошибка генерации, попробуй ещё раз")
    return result
