# -*- coding: utf-8 -*-
"""
FastAPI-бэкенд контент-машины «Залихват».
- проверяет Supabase-JWT на каждом запросе
- /api/generate: генерация под платформу с учётом профиля
- ANTHROPIC_API_KEY только на сервере; CORS ограничен app-доменом; rate limit
"""
import os, logging
from fastapi import FastAPI, Depends, HTTPException, Header, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import auth
import generate as gen
import oauth
import usage
import mailer
import voice
import feedback
import trends
import lab
import audience
import edits
import access
import tg
import prodamus

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")
FREE_LIMIT = int(os.environ.get("FREE_LIMIT", "1"))
UNLIMITED_EMAILS = {e.strip().lower() for e in
                    os.environ.get("UNLIMITED_EMAILS", "aksenovwork@yandex.ru").split(",") if e.strip()}
WELCOME_HOOK_SECRET = os.environ.get("WELCOME_HOOK_SECRET", "").strip()
CAROUSEL_WEEKLY = int(os.environ.get("CAROUSEL_WEEKLY", "3"))
VISUAL_MONTHLY = int(os.environ.get("VISUAL_MONTHLY", "30"))  # пост/сториз - 30 картинок в месяц
START_DAILY = int(os.environ.get("START_DAILY", "5"))   # тариф Старт - тем/сценариев в день
PRO_DAILY = int(os.environ.get("PRO_DAILY", "20"))      # тариф Pro - тем/сценариев в день
PLAN_DAILY = {"start": START_DAILY, "pro": PRO_DAILY}

def paid_plan(email: str):
    """Активный платный доступ пользователя: 'unlimited' (белый список) | plan | None."""
    if (email or "").lower() in UNLIMITED_EMAILS:
        return "unlimited"
    a = access.active(email)
    return a.get("plan") if a else None

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
    gender: str | None = Field(default=None, max_length=12)

class GenReq(BaseModel):
    platform: str = Field(max_length=32)
    topic: str = Field(default="", max_length=500)
    profile: Profile | None = None
    lang: str = Field(default="ru", max_length=5)
    user_text: str = Field(default="", max_length=6000)
    design: str = Field(default="", max_length=32)
    design_layout: str = Field(default="", max_length=32)
    design_photos: list[str] = Field(default_factory=list, max_length=20)
    count: int = Field(default=0, ge=0, le=20)
    # бриф ролика (только reels): подробные вводные из формы
    b_audience: str = Field(default="", max_length=600)
    b_goal: str = Field(default="", max_length=400)
    b_promo: str = Field(default="", max_length=100)
    b_idea: str = Field(default="", max_length=400)
    b_style: str = Field(default="", max_length=60)
    b_format: str = Field(default="", max_length=60)
    b_length: str = Field(default="", max_length=60)

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/hooks/user-created")
async def user_created(request: Request):
    if not WELCOME_HOOK_SECRET or request.headers.get("x-webhook-secret") != WELCOME_HOOK_SECRET:
        raise HTTPException(status_code=401, detail="bad secret")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="bad payload")
    rec = (body or {}).get("record") or {}
    email = (rec.get("email") or "").strip()
    if email and "@" in email and not email.endswith("@tg.aksalex.com"):
        mailer.send_welcome(email)
    return {"ok": True}

@app.get("/api/platforms")
def platforms():
    return {"platforms": sorted(gen.PLATFORMS)}

@app.get("/api/me")
def me(user: dict = Depends(get_user)):
    plan = paid_plan(user["email"])
    unlimited = plan is not None      # активная подписка / белый список = без пейвола
    used = usage.count(user["id"])
    def _cr(p, days):
        try:
            return usage.count_recent(user["id"], p, days)
        except Exception:
            return 0
    car_used = _cr("carousel", 7)
    post_used = _cr("post", 30)
    stories_used = _cr("stories", 30)
    cover_used = _cr("reels_cover", 30)
    visual_pro = plan in ("pro", "unlimited")
    visual_unlimited = plan == "unlimited"   # белый список - визуалы без лимитов
    # текстовый блок: дневной лимит по тарифу (Старт 5/день, Pro 30/день), whitelist - безлимит, free - пробный
    if plan == "unlimited":
        text_unlimited = True; text_used = used; text_limit = None; text_left = None
    elif plan in PLAN_DAILY:
        try:
            td = usage.count_text_daily(user["id"])
        except Exception:
            td = 0
        text_unlimited = False; text_used = td; text_limit = PLAN_DAILY[plan]; text_left = max(0, PLAN_DAILY[plan] - td)
    else:
        text_unlimited = False; text_used = used; text_limit = FREE_LIMIT; text_left = max(0, FREE_LIMIT - used)
    return {"email": user["email"], "unlimited": unlimited, "plan": plan,
            "used": used, "free_limit": FREE_LIMIT,
            "remaining": None if unlimited else max(0, FREE_LIMIT - used),
            "text_unlimited": text_unlimited, "text_used": text_used,
            "text_limit": text_limit, "text_left": text_left,
            "visual_pro": visual_pro, "carousel_pro": visual_pro,
            "visual_unlimited": visual_unlimited,
            "carousel_limit": CAROUSEL_WEEKLY, "carousel_left": max(0, CAROUSEL_WEEKLY - car_used),
            "visual_monthly": VISUAL_MONTHLY,
            "post_left": max(0, VISUAL_MONTHLY - post_used),
            "stories_left": max(0, VISUAL_MONTHLY - stories_used),
            "cover_left": max(0, VISUAL_MONTHLY - cover_used)}

@app.post("/api/generate")
@limiter.limit("40/hour")
def generate_endpoint(request: Request, req: GenReq, user: dict = Depends(get_user)):
    if req.platform not in gen.PLATFORMS:
        raise HTTPException(status_code=400, detail="неизвестная платформа")
    if req.platform in ("carousel", "post", "stories", "reels_cover"):
        # визуальные генераторы картинок - только Pro (или безлимит-белый список)
        vplan = paid_plan(user["email"])
        if vplan not in ("pro", "unlimited"):
            return JSONResponse(status_code=402, content={"error": "limit", "reason": "visual_pro"})
        # белый список (unlimited) - без недельных/месячных лимитов на визуалы
        if vplan != "unlimited":
            if req.platform == "carousel":
                try:
                    cw = usage.count_recent(user["id"], "carousel", 7)
                except Exception:
                    cw = 0
                if cw >= CAROUSEL_WEEKLY:
                    return JSONResponse(status_code=402, content={
                        "error": "limit", "reason": "carousel_weekly", "used": cw, "limit": CAROUSEL_WEEKLY})
            else:
                try:
                    vm = usage.count_recent(user["id"], req.platform, 30)
                except Exception:
                    vm = 0
                if vm >= VISUAL_MONTHLY:
                    return JSONResponse(status_code=402, content={
                        "error": "limit", "reason": "visual_monthly", "used": vm, "limit": VISUAL_MONTHLY})
    else:
        tplan = paid_plan(user["email"])
        if tplan == "unlimited":
            pass  # белый список - без лимита
        elif tplan in PLAN_DAILY:
            try:
                td = usage.count_text_daily(user["id"])
            except Exception:
                td = 0
            if td >= PLAN_DAILY[tplan]:
                return JSONResponse(status_code=402, content={
                    "error": "limit", "reason": "text_daily", "used": td, "limit": PLAN_DAILY[tplan]})
        else:
            # бесплатно: 1 проба КАЖДОГО текстового формата (reels/shorts/tiktok/youtube_long/content_plan)
            try:
                used = usage.count_recent(user["id"], req.platform, 3650)
            except Exception:
                used = 0
            if used >= FREE_LIMIT:
                return JSONResponse(status_code=402, content={
                    "error": "limit", "reason": "free_used",
                    "used": used, "free_limit": FREE_LIMIT})
    profile = req.profile.model_dump(exclude_none=True) if req.profile else None
    try:
        avoid = usage.recent_titles(user["id"], req.platform)
    except Exception:
        avoid = []
    try:
        author_voice = voice.sample(user["id"])
    except Exception:
        author_voice = ""
    try:
        liked, disliked = feedback.for_prompt(user["id"], req.platform)
    except Exception:
        liked, disliked = [], []
    lang = "en" if (req.lang or "").lower().startswith("en") else "ru"
    try:
        niche = (profile or {}).get("niche") or ""
        # для обложек и карты аудитории тренды не нужны
        live_trends = "" if req.platform in ("reels_cover", "audience", "scriptcheck") else trends.get(user["id"], niche, req.platform, req.topic, lang)
    except Exception:
        live_trends = ""
    # карту аудитории/болей подмешиваем во ВСЕ генерации, кроме самого инструмента аудитории
    try:
        aud = "" if req.platform == "audience" else audience.for_prompt(user["id"])
    except Exception:
        aud = ""
    try:
        brief = None
        if req.platform == "reels":
            brief = {"audience": req.b_audience, "goal": req.b_goal, "promo": req.b_promo,
                     "idea": req.b_idea, "style": req.b_style, "format": req.b_format, "length": req.b_length}
        result = gen.generate(req.platform, req.topic, profile, avoid=avoid, voice=author_voice,
                              liked=liked, disliked=disliked, trends=live_trends, lang=lang,
                              user_text=(req.user_text or "").strip(), audience=aud, count=req.count, brief=brief)
    except Exception:
        raise HTTPException(status_code=502, detail="ошибка генерации, попробуй ещё раз")
    data = result.get("data")
    # сохраняем карту аудитории, чтобы она кормила будущие генерации
    if isinstance(data, dict) and req.platform == "audience":
        try:
            audience.save_map(user["id"], data)
        except Exception:
            pass
    # обложка: заголовок на картинке - ровно тот, что ввёл автор (не выдумка ИИ)
    if isinstance(data, dict) and req.platform == "reels_cover" and (req.topic or "").strip():
        data["title"] = req.topic.strip()
    # запоминаем выбранный дизайн визуала, чтобы история открывала картинки в том же шаблоне
    if isinstance(data, dict) and req.platform in ("carousel", "post", "stories", "reels_cover") and req.design:
        data["_design"] = req.design
        # для своего фото-дизайна храним раскладку и пути фото (история переживёт удаление из библиотеки)
        if req.design_layout:
            data["_design_layout"] = req.design_layout
        if req.design_photos:
            data["_design_photos"] = [str(p)[:300] for p in req.design_photos[:20]]
    # сохраняем бриф ролика (заполненные пункты) в историю
    if isinstance(data, dict) and req.platform == "reels" and brief:
        filled = {k: str(v).strip() for k, v in brief.items() if v and str(v).strip()}
        if filled:
            data["_brief"] = filled
    gid = usage.record(user["id"], req.platform, req.topic, data)
    if gid:
        result["generation_id"] = gid
    return result

class RedoReq(BaseModel):
    platform: str = Field(max_length=32)
    title: str = Field(default="", max_length=1200)
    text: str = Field(default="", max_length=2500)
    has_text: bool = False
    instruction: str = Field(max_length=500)
    profile: Profile | None = None
    lang: str = Field(default="ru", max_length=5)

@app.post("/api/redo")
@limiter.limit("60/hour")
def redo_endpoint(request: Request, req: RedoReq, user: dict = Depends(get_user)):
    if req.platform not in ("carousel", "post", "stories", "reels_cover"):
        raise HTTPException(status_code=400, detail="только для визуалов")
    if paid_plan(user["email"]) not in ("pro", "unlimited"):
        return JSONResponse(status_code=402, content={"error": "limit", "reason": "visual_pro"})
    if not (req.instruction or "").strip():
        raise HTTPException(status_code=400, detail="пустое указание")
    profile = req.profile.model_dump(exclude_none=True) if req.profile else None
    lang = "en" if (req.lang or "").lower().startswith("en") else "ru"
    try:
        out = gen.redo(req.platform, req.title, req.text, bool(req.has_text),
                       req.instruction.strip(), profile, lang)
    except Exception:
        raise HTTPException(status_code=502, detail="не удалось переделать, попробуй ещё раз")
    return {"data": out}

class FeedbackReq(BaseModel):
    platform: str = Field(max_length=32)
    item: str = Field(max_length=300)
    vote: str = Field(max_length=8)

@app.post("/api/feedback")
@limiter.limit("120/hour")
def feedback_endpoint(request: Request, req: FeedbackReq, user: dict = Depends(get_user)):
    if req.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="плохая оценка")
    ok = feedback.record(user["id"], req.platform, req.item, req.vote)
    return {"ok": bool(ok)}

class CarEditReq(BaseModel):
    generation_id: str = Field(max_length=64)
    index: int = Field(ge=0, le=60)
    shape: int | None = None
    rot: int | None = None
    fontScale: float | None = None
    alignV: str | None = Field(default=None, max_length=8)
    alignH: str | None = Field(default=None, max_length=8)
    photo: str | None = Field(default=None, max_length=12_000_000)
    shape2: int | None = None
    rot2: int | None = None
    photo2: str | None = Field(default=None, max_length=12_000_000)

@app.post("/api/carousel-edits")
@limiter.limit("240/hour")
def carousel_edits(request: Request, req: CarEditReq, user: dict = Depends(get_user)):
    ok, msg = edits.save_edit(user["id"], req.generation_id, req.index, {
        "shape": req.shape, "rot": req.rot, "fontScale": req.fontScale,
        "alignV": req.alignV, "alignH": req.alignH, "photo": req.photo,
        "shape2": req.shape2, "rot2": req.rot2, "photo2": req.photo2})
    if not ok:
        raise HTTPException(status_code=(403 if msg == "forbidden" else 400), detail=msg)
    return {"ok": True}

# ---------- Лаборатория /trash (эксперименты, только владелец) ----------
class LabTTS(BaseModel):
    text: str = Field(max_length=2000)

class LabReel(BaseModel):
    script: str = Field(max_length=5000)

def _lab_gate(user: dict):
    if not lab.is_owner(user.get("email", "")):
        raise HTTPException(status_code=403, detail="доступ только для владельца")

@app.get("/api/trash/voice")
def lab_voice_get(user: dict = Depends(get_user)):
    _lab_gate(user)
    return lab.get_voice(user["id"])

@app.post("/api/trash/voice/create")
@limiter.limit("20/hour")
async def lab_voice_create(request: Request, sample: UploadFile = File(...),
                           name: str = Form("Мой голос"), user: dict = Depends(get_user)):
    _lab_gate(user)
    content = await sample.read()
    if not content or len(content) < 2000:
        raise HTTPException(status_code=400, detail="файл слишком маленький или пустой")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="файл больше 25 МБ - загрузи покороче")
    try:
        return lab.create_voice(user["id"], name, sample.filename or "sample.mp3",
                                content, sample.content_type or "audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.post("/api/trash/voice/tts")
@limiter.limit("60/hour")
def lab_voice_tts(request: Request, req: LabTTS, user: dict = Depends(get_user)):
    _lab_gate(user)
    if not (req.text or "").strip():
        raise HTTPException(status_code=400, detail="пустой текст")
    try:
        audio = lab.tts(user["id"], req.text.strip())
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return Response(content=audio, media_type="audio/mpeg")

@app.post("/api/trash/avatar/create")
@limiter.limit("20/hour")
async def lab_avatar_create(request: Request, photo: UploadFile = File(...), user: dict = Depends(get_user)):
    _lab_gate(user)
    await photo.read()  # принимаем файл; провайдер аватаров подключим отдельно
    return {"detail": "Фото принято. Генерацию аватаров включим, когда подключим провайдера (HeyGen/D-ID) и его ключ."}

@app.post("/api/trash/reel/create")
@limiter.limit("20/hour")
def lab_reel_create(request: Request, req: LabReel, user: dict = Depends(get_user)):
    _lab_gate(user)
    return {"detail": "Сценарий принят. Сборку рилз включим после подключения видео-провайдера и готовых голоса+аватара."}

@app.post("/api/hooks/prodamus")
async def prodamus_hook(request: Request):
    import urllib.parse
    raw = await request.body()
    items = urllib.parse.parse_qsl(raw.decode("utf-8", errors="replace"), keep_blank_values=True)
    data = prodamus.parse_form(items)
    sign = request.headers.get("sign") or request.headers.get("Sign") or ""
    ok_sign = prodamus.verify(data, sign)
    logging.warning("PRODAMUS hook: sign_ok=%s status=%s sum=%s email=%s raw=%s",
                    ok_sign, data.get("payment_status"), data.get("sum"),
                    data.get("customer_email"), raw.decode(errors="replace")[:600])
    if not ok_sign:
        # подпись не сошлась - логируем и не выдаём доступ (тест поможет донастроить)
        return JSONResponse(status_code=200, content={"ok": False, "reason": "bad_sign"})
    if not prodamus.is_success(data):
        return {"ok": True, "skipped": "not_success"}
    email = (data.get("customer_email") or "").strip()
    item = prodamus.route(data)
    if not email or not item:
        logging.error("PRODAMUS: no email/route email=%s item=%s", email, item)
        return {"ok": True, "unrouted": True}
    try:
        if item["kind"] == "guide":
            mailer.send_guide(email, item["guide"])
        elif item["kind"] == "sub":
            access.grant(email, item["plan"])
            mailer.send_sub_activated(email, item["label"])
            try:
                mailer.send_bonus_guide(email)   # бесплатный гайд каждому оплатившему подписку
            except Exception as e:
                logging.error("PRODAMUS bonus guide failed: %r", e)
    except Exception as e:
        logging.error("PRODAMUS deliver failed: %r", e)
    return {"ok": True}


# ---------- TELEGRAM: связка кабинета с ботом @zalihvat_bot ----------
class TgSendReq(BaseModel):
    text: str = Field(default="", max_length=8000)
    images: list[str] = Field(default_factory=list, max_length=10)


class TgLinkReq(BaseModel):
    token: str = Field(max_length=64)
    chat_id: int
    secret: str = Field(max_length=200)


@app.get("/api/tg/status")
def tg_status(user: dict = Depends(get_user)):
    try:
        return {"linked": bool(tg.get_chat(user["id"]))}
    except Exception:
        return {"linked": False}


@app.post("/api/tg/connect")
def tg_connect(user: dict = Depends(get_user)):
    _, link = tg.make_link(user["id"])
    return {"deep_link": link}


@app.post("/api/tg/send")
def tg_send(req: TgSendReq, user: dict = Depends(get_user)):
    r = tg.send(user["id"], text=req.text, images=req.images)
    if r == "not_linked":
        _, link = tg.make_link(user["id"])
        return JSONResponse(status_code=409, content={"reason": "not_linked", "deep_link": link})
    if r == "ok":
        return {"ok": True}
    raise HTTPException(status_code=502, detail="не удалось отправить в телеграм")


@app.post("/api/tg/link")
def tg_link(req: TgLinkReq):
    if not os.environ.get("TG_LINK_SECRET") or req.secret != os.environ.get("TG_LINK_SECRET"):
        raise HTTPException(status_code=403, detail="bad secret")
    uid = tg.resolve_and_link(req.token, req.chat_id)
    if not uid:
        raise HTTPException(status_code=404, detail="token not found")
    return {"ok": True}
