# -*- coding: utf-8 -*-
"""Лаборатория (app.aksalex.com/trash) — экспериментальные фичи только для владельца.
Голос: ElevenLabs Instant Voice Clone + TTS. voice_id храним в Storage '{uid}/_lab.json'
service-ключом (как feedback.py). Аватар/рилз — заглушки до подключения провайдера."""
import os, json, logging, uuid, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}

OWNER = os.environ.get("LAB_OWNER", "aksenovwork@yandex.ru").strip().lower()
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
ELEVEN_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2").strip()
ELEVEN_API = "https://api.elevenlabs.io/v1"


def is_owner(email: str) -> bool:
    return (email or "").strip().lower() == OWNER


# ---------- хранилище (Storage JSON) ----------
def _key(uid: str) -> str:
    return uid + "/_lab.json"


def load(uid: str) -> dict:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(uid))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            d = json.loads(r.read().decode())
            return d if isinstance(d, dict) else {}
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return {}
        logging.error("lab.load HTTP %s", e.code); return {}
    except Exception as e:
        logging.error("lab.load failed: %r", e); return {}


def save(uid: str, data: dict) -> bool:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(_key(uid))
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    h = dict(_H); h["Content-Type"] = "application/json"; h["x-upsert"] = "true"
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h, method="POST"), timeout=20).read()
        return True
    except Exception as e:
        logging.error("lab.save failed: %r", e); return False


def get_voice(uid: str) -> dict:
    return load(uid).get("voice") or {}


# ---------- multipart (stdlib, без requests) ----------
def _multipart(fields: dict, file_field: str, filename: str, content: bytes, ctype: str):
    boundary = "----zlab" + uuid.uuid4().hex
    nl = b"\r\n"
    buf = bytearray()
    for k, v in (fields or {}).items():
        buf += b"--" + boundary.encode() + nl
        buf += ('Content-Disposition: form-data; name="%s"' % k).encode() + nl + nl
        buf += str(v).encode("utf-8") + nl
    if content is not None:
        buf += b"--" + boundary.encode() + nl
        buf += ('Content-Disposition: form-data; name="%s"; filename="%s"' % (file_field, filename)).encode("utf-8") + nl
        buf += ("Content-Type: %s" % (ctype or "application/octet-stream")).encode() + nl + nl
        buf += content + nl
    buf += b"--" + boundary.encode() + b"--" + nl
    return bytes(buf), "multipart/form-data; boundary=" + boundary


# ---------- голос ----------
def create_voice(uid: str, name: str, filename: str, content: bytes, ctype: str) -> dict:
    if not ELEVEN_KEY:
        raise RuntimeError("Голос пока не подключён: добавь ELEVENLABS_API_KEY в .env сервера.")
    body, ct = _multipart({"name": name or "Мой голос"}, "files", filename or "sample.mp3", content, ctype)
    req = urllib.request.Request(ELEVEN_API + "/voices/add", data=body,
                                 headers={"xi-api-key": ELEVEN_KEY, "Content-Type": ct}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="ignore")[:300]
        raise RuntimeError("ElevenLabs: " + msg)
    vid = j.get("voice_id")
    if not vid:
        raise RuntimeError("ElevenLabs не вернул voice_id")
    data = load(uid); data["voice"] = {"voice_id": vid, "name": name or "Мой голос"}; save(uid, data)
    return {"voice_id": vid, "name": name or "Мой голос"}


def tts(uid: str, text: str) -> bytes:
    if not ELEVEN_KEY:
        raise RuntimeError("Голос пока не подключён: добавь ELEVENLABS_API_KEY в .env сервера.")
    v = get_voice(uid); vid = v.get("voice_id")
    if not vid:
        raise RuntimeError("Сначала собери голос.")
    payload = json.dumps({"text": text[:2000], "model_id": ELEVEN_MODEL}).encode("utf-8")
    req = urllib.request.Request(ELEVEN_API + "/text-to-speech/" + vid, data=payload,
                                 headers={"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json",
                                          "Accept": "audio/mpeg"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError("ElevenLabs TTS: " + e.read().decode(errors="ignore")[:300])
