# -*- coding: utf-8 -*-
"""Платный доступ (подписки Продамус). Храним общий JSON в Storage service-ключом,
без отдельной таблицы. Ключ - email в нижнем регистре -> {plan, until (unix), updated}."""
import os, json, time, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
KEY = "_system/paid_access.json"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}

PLAN_DAYS = 31


def _read() -> dict:
    if not SUPABASE_URL or not SERVICE_KEY:
        return {}
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(KEY)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            d = json.loads(r.read().decode())
            return d if isinstance(d, dict) else {}
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return {}
        logging.error("access._read HTTP %s", e.code)
        return {}
    except Exception as e:
        logging.error("access._read failed: %r", e)
        return {}


def _write(d: dict) -> bool:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(KEY)
    body = json.dumps(d, ensure_ascii=False).encode("utf-8")
    h = dict(_H); h["Content-Type"] = "application/json"; h["x-upsert"] = "true"
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h, method="POST"), timeout=20).read()
        return True
    except Exception as e:
        logging.error("access._write failed: %r", e)
        return False


def grant(email: str, plan: str, days: int = PLAN_DAYS) -> bool:
    email = (email or "").strip().lower()
    if not email:
        return False
    d = _read()
    d[email] = {"plan": plan, "until": int(time.time()) + days * 86400, "updated": int(time.time())}
    return _write(d)


def active(email: str):
    """Вернуть {plan, until} если есть активный платный доступ, иначе None."""
    email = (email or "").strip().lower()
    if not email:
        return None
    node = _read().get(email)
    if isinstance(node, dict) and node.get("until", 0) > time.time():
        return node
    return None
