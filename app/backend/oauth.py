# -*- coding: utf-8 -*-
"""Мост Яндекс ID -> сессия Supabase (через admin generate_link / magiclink)."""
import os, json, secrets, hmac, hashlib, time, urllib.request, urllib.parse
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

router = APIRouter()

YANDEX_ID = os.environ.get("YANDEX_CLIENT_ID", "").strip()
YANDEX_SECRET = os.environ.get("YANDEX_CLIENT_SECRET", "").strip()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
APP_URL = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")
REDIRECT = APP_URL + "/api/auth/yandex/callback"
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()

def _supabase_magiclink(email, meta=None):
    admin_h = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    body = {"type": "magiclink", "email": email, "options": {"redirect_to": APP_URL}}
    if meta:
        body["options"]["data"] = meta
    link = _post_json(SUPABASE_URL + "/auth/v1/admin/generate_link", body, admin_h)
    return link.get("action_link") or (link.get("properties") or {}).get("action_link")

# простая защита от CSRF: одноразовый state в куке
_STATE_COOKIE = "yx_state"

def _post_form(url, data, headers=None):
    body = urllib.parse.urlencode(data).encode()
    h = {"Content-Type": "application/x-www-form-urlencoded"}
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h), timeout=30) as r:
        return json.loads(r.read().decode())

def _get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=30) as r:
        return json.loads(r.read().decode())

def _post_json(url, obj, headers=None):
    body = json.dumps(obj).encode()
    h = {"Content-Type": "application/json"}
    if headers: h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h), timeout=30) as r:
        return json.loads(r.read().decode())

def _fail(reason):
    return RedirectResponse(APP_URL + "/?auth_error=" + reason, status_code=302)

@router.get("/api/auth/yandex/start")
def yandex_start():
    state = secrets.token_urlsafe(16)
    url = "https://oauth.yandex.ru/authorize?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": YANDEX_ID, "redirect_uri": REDIRECT, "state": state})
    resp = RedirectResponse(url, status_code=302)
    resp.set_cookie(_STATE_COOKIE, state, max_age=600, httponly=True, secure=True, samesite="lax")
    return resp

@router.get("/api/auth/yandex/callback")
def yandex_callback(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code:
        return _fail("yandex_denied")
    if not state or state != request.cookies.get(_STATE_COOKIE):
        return _fail("state")
    try:
        tok = _post_form("https://oauth.yandex.ru/token", {
            "grant_type": "authorization_code", "code": code,
            "client_id": YANDEX_ID, "client_secret": YANDEX_SECRET})
        at = tok.get("access_token")
        if not at:
            return _fail("token")
        info = _get("https://login.yandex.ru/info?format=json", {"Authorization": "OAuth " + at})
        email = info.get("default_email")
        if not email and info.get("emails"):
            email = info["emails"][0]
        if not email:
            return _fail("noemail")
        action = _supabase_magiclink(email, {"provider": "yandex"})
        if not action:
            return _fail("link")
        resp = RedirectResponse(action, status_code=302)
        resp.delete_cookie(_STATE_COOKIE)
        return resp
    except Exception:
        return _fail("yandex")


@router.get("/api/auth/telegram/callback")
def telegram_callback(request: Request):
    params = dict(request.query_params)
    tg_hash = params.pop("hash", None)
    if not tg_hash or not TG_BOT_TOKEN:
        return _fail("tg")
    check = "\n".join(f"{k}={params[k]}" for k in sorted(params))
    secret = hashlib.sha256(TG_BOT_TOKEN.encode()).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, tg_hash):
        return _fail("tg_hash")
    try:
        if int(time.time()) - int(params.get("auth_date", "0")) > 86400:
            return _fail("tg_old")
    except Exception:
        return _fail("tg")
    tg_id = params.get("id")
    if not tg_id:
        return _fail("tg")
    email = f"tg{tg_id}@tg.aksalex.com"
    try:
        action = _supabase_magiclink(email, {
            "provider": "telegram", "telegram_id": tg_id,
            "name": params.get("first_name"), "username": params.get("username")})
        if not action:
            return _fail("link")
        return RedirectResponse(action, status_code=302)
    except Exception:
        return _fail("tg")
