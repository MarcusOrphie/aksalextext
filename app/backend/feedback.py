# -*- coding: utf-8 -*-
"""Петля обратной связи: 👍/👎 по идеям.
Храним вкус пользователя JSON-файлом в Storage (bucket 'uploads', ключ '{uid}/_taste.json')
service-ключом - без отдельной таблицы. Голос (voice.py) служебные '_'-файлы игнорирует.
Понравившееся усиливаем, непонравившееся избегаем в будущих генерациях."""
import os, json, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}

CAP = 30          # сколько последних оценок держим на платформу и знак
FOR_PROMPT = 12   # сколько подаём в промпт


def _key(user_id: str) -> str:
    return user_id + "/_taste.json"


def _load(user_id: str) -> dict:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(user_id))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            d = json.loads(r.read().decode())
            return d if isinstance(d, dict) else {}
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return {}
        logging.error("feedback._load HTTP %s", e.code)
        return {}
    except Exception as e:
        logging.error("feedback._load failed: %r", e)
        return {}


def _save(user_id: str, data: dict) -> bool:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(user_id))
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    h = dict(_H); h["Content-Type"] = "application/json"; h["x-upsert"] = "true"
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        urllib.request.urlopen(req, timeout=20).read()
        return True
    except Exception as e:
        logging.error("feedback._save failed: %r", e)
        return False


def record(user_id: str, platform: str, item: str, vote: str) -> bool:
    """Записать оценку. vote: 'up' | 'down'. item - текст идеи/хука."""
    if not SUPABASE_URL or not SERVICE_KEY or not user_id:
        return False
    item = (item or "").strip()
    if not item or vote not in ("up", "down"):
        return False
    item = item[:200]
    data = _load(user_id)
    node = data.setdefault(platform, {"up": [], "down": []})
    up, down = node.get("up", []), node.get("down", [])
    # снять прошлую оценку этого же пункта, чтобы не дублить и не конфликтовать
    up = [x for x in up if x != item]
    down = [x for x in down if x != item]
    (up if vote == "up" else down).append(item)
    node["up"], node["down"] = up[-CAP:], down[-CAP:]
    data[platform] = node
    return _save(user_id, data)


def for_prompt(user_id: str, platform: str):
    """Вернуть (liked, disliked) списки для подачи в промпт."""
    if not SUPABASE_URL or not SERVICE_KEY or not user_id:
        return [], []
    data = _load(user_id)
    node = data.get(platform) or {}
    liked = list(node.get("up", []))[-FOR_PROMPT:]
    disliked = list(node.get("down", []))[-FOR_PROMPT:]
    return liked, disliked
