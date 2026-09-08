# -*- coding: utf-8 -*-
"""Карта аудитории и болей. Сохраняем результат инструмента 'audience' JSON-файлом
в Storage ('{uid}/_audience.json') service-ключом (как feedback.py) и отдаём компактную
выжимку болей/желаний/возражений, чтобы подмешивать её во ВСЕ остальные генерации."""
import os, json, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}


def _key(uid: str) -> str:
    return uid + "/_audience.json"


def save_map(uid: str, data: dict) -> bool:
    if not SUPABASE_URL or not SERVICE_KEY or not uid or not isinstance(data, dict):
        return False
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(uid))
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    h = dict(_H); h["Content-Type"] = "application/json"; h["x-upsert"] = "true"
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h, method="POST"), timeout=20).read()
        return True
    except Exception as e:
        logging.error("audience.save_map failed: %r", e); return False


def _load(uid: str) -> dict:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(uid))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            d = json.loads(r.read().decode())
            return d if isinstance(d, dict) else {}
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return {}
        logging.error("audience._load HTTP %s", e.code); return {}
    except Exception as e:
        logging.error("audience._load failed: %r", e); return {}


def for_prompt(uid: str) -> str:
    """Компактная выжимка карты аудитории для инъекции в промпт (~1500 симв)."""
    if not SUPABASE_URL or not SERVICE_KEY or not uid:
        return ""
    d = _load(uid)
    if not d:
        return ""
    parts = []
    for seg in (d.get("segments") or [])[:3]:
        if not isinstance(seg, dict):
            continue
        line = "• " + str(seg.get("name", "сегмент"))
        if seg.get("pains"):
            line += " | боли: " + "; ".join([str(x) for x in seg.get("pains", [])][:6])
        if seg.get("desires"):
            line += " | хотят: " + "; ".join([str(x) for x in seg.get("desires", [])][:4])
        if seg.get("objections"):
            line += " | возражения: " + "; ".join([str(x) for x in seg.get("objections", [])][:3])
        parts.append(line)
    cm = d.get("content_map") or []
    if cm:
        pains = [str(x.get("pain", "")) for x in cm if isinstance(x, dict) and x.get("pain")][:8]
        if pains:
            parts.append("Ключевые боли под контент: " + "; ".join(pains))
    return "\n".join(parts)[:1800]
