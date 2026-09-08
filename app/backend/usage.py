# -*- coding: utf-8 -*-
"""Учёт генераций через Supabase REST (service-ключ, минуя RLS).
Используется для лимита бесплатных генераций и истории пользователя."""
import os, json, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
REST = SUPABASE_URL + "/rest/v1"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json"}


def count(user_id: str) -> int:
    """Сколько генераций уже сделал пользователь."""
    url = REST + "/generations?select=id&user_id=eq." + urllib.parse.quote(user_id, safe="")
    h = dict(_H); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=15) as r:
        cr = r.headers.get("Content-Range", "")  # "0-0/N" или "*/N"
    total = cr.split("/")[-1] if "/" in cr else ""
    return int(total) if total.isdigit() else 0


def count_recent(user_id: str, platform: str, days: int = 7) -> int:
    """Сколько генераций платформы за последние N дней (для недельного лимита каруселей)."""
    import datetime
    since = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    url = (REST + "/generations?select=id&user_id=eq." + urllib.parse.quote(user_id, safe="")
           + "&platform=eq." + urllib.parse.quote(platform, safe="")
           + "&created_at=gte." + urllib.parse.quote(since, safe=""))
    h = dict(_H); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=15) as r:
            cr = r.headers.get("Content-Range", "")
    except Exception as e:
        logging.error("usage.count_recent failed: %r", e)
        return 0
    total = cr.split("/")[-1] if "/" in cr else ""
    return int(total) if total.isdigit() else 0


def count_text_daily(user_id: str, days: int = 1) -> int:
    """Сколько текстовых генераций (не картинки) за последние N дней - дневной лимит тарифа."""
    import datetime
    since = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    url = (REST + "/generations?select=id&user_id=eq." + urllib.parse.quote(user_id, safe="")
           + "&platform=not.in.(carousel,post,stories)"
           + "&created_at=gte." + urllib.parse.quote(since, safe=""))
    h = dict(_H); h["Prefer"] = "count=exact"; h["Range"] = "0-0"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=15) as r:
            cr = r.headers.get("Content-Range", "")
    except Exception as e:
        logging.error("usage.count_text_daily failed: %r", e)
        return 0
    total = cr.split("/")[-1] if "/" in cr else ""
    return int(total) if total.isdigit() else 0


def recent_titles(user_id: str, platform: str, rows: int = 12) -> list:
    """Названия идей/видео, уже выданных пользователю на этой платформе, - чтобы не повторяться."""
    url = (REST + "/generations?select=output&user_id=eq." + urllib.parse.quote(user_id, safe="")
           + "&platform=eq." + urllib.parse.quote(platform, safe="")
           + "&order=created_at.desc&limit=" + str(rows))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            data = json.loads(r.read().decode())
    except Exception as e:
        logging.error("usage.recent_titles failed: %r", e)
        return []
    out = []
    for row in data:
        o = row.get("output") or {}
        if not isinstance(o, dict):
            continue
        for it in (o.get("ideas") or []):
            if isinstance(it, dict) and it.get("idea"):
                out.append(str(it["idea"]))
        if o.get("title"):
            out.append(str(o["title"]))
    seen, res = set(), []
    for x in out:
        if x not in seen:
            seen.add(x); res.append(x)
    return res[:40]


def record(user_id: str, platform: str, topic: str, output) -> str | None:
    """Записать факт генерации (авторитетно, с user_id). Вернуть id строки (для сохранения правок)."""
    body = json.dumps({"user_id": user_id, "platform": platform,
                       "topic": topic or None, "output": output}).encode()
    h = dict(_H); h["Prefer"] = "return=representation"
    req = urllib.request.Request(REST + "/generations?select=id", data=body, headers=h, method="POST")
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
        if isinstance(resp, list) and resp and isinstance(resp[0], dict):
            return str(resp[0].get("id")) if resp[0].get("id") is not None else None
    except urllib.error.HTTPError as e:
        logging.error("usage.record HTTP %s: %s", e.code, e.read().decode(errors="replace")[:300])
    except Exception as e:
        logging.error("usage.record failed: %r", e)
    return None
