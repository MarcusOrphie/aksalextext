# -*- coding: utf-8 -*-
"""Голос автора из загруженных материалов.
Тянет текстовые файлы пользователя из Supabase Storage (bucket 'uploads')
service-ключом и собирает выжимку, чтобы генерация писала голосом автора."""
import os, json, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}

TEXT_EXT = (".txt", ".md", ".srt", ".vtt", ".csv", ".json", ".text")
MAX_PER_FILE = 4000      # символов из одного файла
MAX_TOTAL = 6000         # символов на всю выжимку голоса
MAX_FILES = 6


def _list(user_id: str) -> list:
    """Список объектов пользователя в bucket (папка = user_id)."""
    body = json.dumps({"prefix": user_id + "/", "limit": 100,
                       "sortBy": {"column": "created_at", "order": "desc"}}).encode()
    h = dict(_H); h["Content-Type"] = "application/json"
    req = urllib.request.Request(STORAGE + "/object/list/" + BUCKET, data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _download(path: str) -> bytes:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(path)
    with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=20) as r:
        return r.read()


def _clean_srt(t: str) -> str:
    """Из субтитров (.srt/.vtt) убираем тайминги и номера, оставляем реплики."""
    lines = []
    for ln in t.splitlines():
        s = ln.strip()
        if not s or s.isdigit() or "-->" in s or s.upper().startswith("WEBVTT"):
            continue
        lines.append(s)
    return " ".join(lines)


def sample(user_id: str) -> str:
    """Собрать выжимку голоса автора из его текстовых загрузок. Пусто - вернёт ''."""
    if not SUPABASE_URL or not SERVICE_KEY or not user_id:
        return ""
    try:
        items = _list(user_id)
    except Exception as e:
        logging.error("voice.sample list failed: %r", e)
        return ""
    chunks, used = [], 0
    for it in items:
        name = it.get("name") or ""
        if not name or name.endswith("/") or name.startswith("_"):
            continue  # служебные файлы (напр. _taste.json) - не голос
        low = name.lower()
        if not low.endswith(TEXT_EXT):
            continue
        try:
            raw = _download(user_id + "/" + name)
        except Exception as e:
            logging.error("voice.sample download %s failed: %r", name, e)
            continue
        try:
            txt = raw.decode("utf-8", errors="replace")
        except Exception:
            continue
        if low.endswith((".srt", ".vtt")):
            txt = _clean_srt(txt)
        txt = " ".join(txt.split()).strip()
        if not txt:
            continue
        txt = txt[:MAX_PER_FILE]
        chunks.append(txt)
        used += len(txt)
        if len(chunks) >= MAX_FILES or used >= MAX_TOTAL:
            break
    if not chunks:
        return ""
    return ("\n\n---\n\n".join(chunks))[:MAX_TOTAL]
