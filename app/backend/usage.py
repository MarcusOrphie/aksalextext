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


def record(user_id: str, platform: str, topic: str, output) -> None:
    """Записать факт генерации (авторитетно, с user_id)."""
    body = json.dumps({"user_id": user_id, "platform": platform,
                       "topic": topic or None, "output": output}).encode()
    h = dict(_H); h["Prefer"] = "return=minimal"
    req = urllib.request.Request(REST + "/generations", data=body, headers=h, method="POST")
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except urllib.error.HTTPError as e:
        logging.error("usage.record HTTP %s: %s", e.code, e.read().decode(errors="replace")[:300])
    except Exception as e:
        logging.error("usage.record failed: %r", e)
