# -*- coding: utf-8 -*-
"""Живой ресёрч трендов: свежий контекст под нишу и платформу через веб-поиск Anthropic.
Кэшируем результат в Storage ('{uid}/_trends.json') на 12ч, чтобы не искать на каждой генерации.
Всё best-effort: любая ошибка -> пустая строка, генерация не ломается."""
import os, json, time, hashlib, logging, urllib.request, urllib.parse, urllib.error

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("MODEL", "claude-sonnet-5").strip()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}

TTL = 12 * 3600      # свежесть кэша, сек
MAX_LEN = 1800       # длина дайджеста, символов

_PLAT = {
    "reels": "Instagram Reels", "shorts": "YouTube Shorts", "tiktok": "TikTok",
    "youtube_long": "YouTube", "carousel": "Instagram", "post": "Instagram",
    "stories": "Instagram Stories", "content_plan": "соцсети",
}
_PLAT_EN = {
    "reels": "Instagram Reels", "shorts": "YouTube Shorts", "tiktok": "TikTok",
    "youtube_long": "YouTube", "carousel": "Instagram", "post": "Instagram",
    "stories": "Instagram Stories", "content_plan": "social media",
}


def _key(user_id: str) -> str:
    return user_id + "/_trends.json"


def _sig(niche: str, platform: str, topic: str = "", lang: str = "ru") -> str:
    return hashlib.sha1((niche + "|" + platform + "|" + topic + "|" + lang).encode("utf-8")).hexdigest()[:16]


def _cache_get(user_id: str, sig: str) -> str | None:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(user_id))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            d = json.loads(r.read().decode())
    except Exception:
        return None
    if isinstance(d, dict) and d.get("sig") == sig and (time.time() - d.get("ts", 0)) < TTL:
        return d.get("text") or ""
    return None


def _cache_put(user_id: str, sig: str, text: str) -> None:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(user_id))
    body = json.dumps({"sig": sig, "ts": time.time(), "text": text}, ensure_ascii=False).encode("utf-8")
    h = dict(_H); h["Content-Type"] = "application/json"; h["x-upsert"] = "true"
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h, method="POST"), timeout=20).read()
    except Exception as e:
        logging.error("trends._cache_put failed: %r", e)


def _research(niche: str, platform: str, topic: str = "", lang: str = "ru") -> str:
    plat = _PLAT.get(platform, "соцсети")
    topic = (topic or "").strip()
    en = (lang == "en")
    if en:
        plat_en = _PLAT_EN.get(platform, "social media")
        if topic:
            q = (f"Topic: {topic}. Niche: {niche}. Platform: {plat_en}. "
                 "Gather VERIFIABLE concrete facts on this topic that can actually be used in content: "
                 "what is really happening/being discussed now, specific titles, dates, details, numbers, real events. "
                 "Only take what is supported by sources. If something is a rumor or unconfirmed, mark it '(unconfirmed)'. "
                 "Do not invent anything. Return 6-10 short bullet points in English, each one concrete fact, no links in the text.")
        else:
            q = (f"What is trending right now on {plat_en} for the niche: {niche}? "
                 "Find fresh current trends, formats, sounds, moves and topics blowing up in recent weeks. "
                 "Return a short digest: 5-8 points, each a concrete trend or technique in one line, "
                 "in English, no filler and no links in the text.")
    elif topic:
        q = (f"Тема запроса: {topic}. Ниша: {niche}. Платформа: {plat}. "
             "Собери ПРОВЕРЯЕМЫЕ конкретные факты по этой теме, которые реально можно использовать в контенте: "
             "что действительно происходит/обсуждается сейчас, конкретные названия, даты, детали, цифры, реальные события. "
             "Бери только подтверждаемое источниками. Если что-то слух или не подтверждено - явно помечай '(не подтверждено)'. "
             "Не выдумывай несуществующее. Верни 6-10 коротких пунктов на русском, каждый - один конкретный факт, без ссылок в тексте.")
    else:
        q = (f"Что прямо сейчас в тренде на {plat} по теме/нише: {niche}? "
             "Найди свежие актуальные тренды, форматы, звуки, ходы и темы, которые залетают в последние недели. "
             "Верни короткий дайджест: 5-8 пунктов, каждый - конкретный тренд или приём одной строкой, "
             "на русском, без воды и без ссылок в тексте.")
    payload = {
        "model": MODEL, "max_tokens": 1200,
        "messages": [{"role": "user", "content": q}],
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode("utf-8"))
    parts = []
    for b in d.get("content", []):
        if b.get("type") == "text" and b.get("text"):
            parts.append(b["text"])
    txt = "\n".join(parts).strip()
    return txt[:MAX_LEN]


def get(user_id: str, niche: str, platform: str, topic: str = "", lang: str = "ru") -> str:
    """Свежий ресёрч под тему/нишу: проверяемые факты (если есть тема) или тренды ниши. Кэш 12ч. Best-effort."""
    niche = (niche or "").strip()
    topic = (topic or "").strip()
    if not API_KEY or (not niche and not topic):
        return ""
    sig = _sig(niche, platform, topic, lang)
    if user_id and SERVICE_KEY:
        cached = _cache_get(user_id, sig)
        if cached is not None:
            return cached
    try:
        txt = _research(niche, platform, topic, lang)
    except Exception as e:
        logging.error("trends._research failed: %r", e)
        return ""
    if txt and user_id and SERVICE_KEY:
        _cache_put(user_id, sig, txt)
    return txt
