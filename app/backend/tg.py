# -*- coding: utf-8 -*-
"""Связка кабинета с Telegram-ботом @zalihvat_bot: пользователь подключает свой чат,
и из кабинета можно слать себе тексты и картинки. Маппинг user_id<->chat_id хранится
в Supabase Storage (service-ключ), как остальные данные кабинета. DDL не нужен."""
import os, json, base64, secrets, logging, uuid, urllib.request, urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()
BOT_USERNAME = os.environ.get("TG_BOT_USERNAME", "zalihvat_bot").strip().lstrip("@")
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}


def _put(path, raw, ctype="application/json"):
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(path)
    h = dict(_H); h["Content-Type"] = ctype; h["x-upsert"] = "true"
    urllib.request.urlopen(urllib.request.Request(url, data=raw, headers=h, method="POST"), timeout=20).read()


def _get(path):
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(path)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=20) as r:
            return r.read()
    except Exception:
        return None


def _del(path):
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(path)
    try:
        urllib.request.urlopen(urllib.request.Request(url, headers=_H, method="DELETE"), timeout=15).read()
    except Exception:
        pass


def make_link(uid: str):
    """Создать одноразовый токен привязки и вернуть deep-link на бота."""
    token = secrets.token_urlsafe(12)
    _put("_tglink/" + token + ".json", json.dumps({"uid": uid}).encode())
    return token, "https://t.me/%s?start=zh_%s" % (BOT_USERNAME, token)


def resolve_and_link(token: str, chat_id) -> str | None:
    """По токену (из deep-link) привязать chat_id к пользователю. Вызывает бот."""
    raw = _get("_tglink/" + token + ".json")
    if not raw:
        return None
    try:
        uid = json.loads(raw).get("uid")
    except Exception:
        return None
    if not uid:
        return None
    _put(str(uid) + "/_tg.json", json.dumps({"chat_id": chat_id}).encode())
    _del("_tglink/" + token + ".json")
    return uid


def get_chat(uid: str):
    raw = _get(str(uid) + "/_tg.json")
    if not raw:
        return None
    try:
        return json.loads(raw).get("chat_id")
    except Exception:
        return None


def _api(method, data, ctype):
    url = "https://api.telegram.org/bot%s/%s" % (BOT_TOKEN, method)
    req = urllib.request.Request(url, data=data, headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def _msg(chat_id, text):
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode()
    return _api("sendMessage", data, "application/x-www-form-urlencoded")


def _multipart(fields, files):
    b = "----zh" + uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += ("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (b, k, v)).encode()
    for name, fn, raw, ct in files:
        out += ("--%s\r\nContent-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n" % (b, name, fn, ct)).encode()
        out += raw + b"\r\n"
    out += ("--%s--\r\n" % b).encode()
    return out, "multipart/form-data; boundary=" + b


def _dataurl(durl):
    hdr, b64 = durl.split(",", 1)
    raw = base64.b64decode(b64)
    ct = "image/png"
    if "image/" in hdr:
        ct = "image/" + (hdr.split("image/")[1].split(";")[0] or "png")
    return raw, ct


def send(uid: str, text: str = "", images=None):
    """Отправить пользователю в его чат текст и/или картинки (dataURL). Возврат: ok|not_linked|empty|error."""
    chat = get_chat(uid)
    if not chat:
        return "not_linked"
    imgs = [i for i in (images or []) if isinstance(i, str) and i.startswith("data:")][:10]
    text = (text or "").strip()
    try:
        if imgs:
            if len(imgs) == 1:
                raw, ct = _dataurl(imgs[0])
                fields = {"chat_id": str(chat)}
                if text:
                    fields["caption"] = text[:1024]
                data, ctype = _multipart(fields, [("photo", "1.png", raw, ct)])
                _api("sendPhoto", data, ctype)
            else:
                media, files = [], []
                for i, d in enumerate(imgs):
                    raw, ct = _dataurl(d)
                    nm = "file%d" % i
                    item = {"type": "photo", "media": "attach://" + nm}
                    if i == 0 and text:
                        item["caption"] = text[:1024]
                    media.append(item); files.append((nm, "%d.png" % i, raw, ct))
                data, ctype = _multipart({"chat_id": str(chat), "media": json.dumps(media)}, files)
                _api("sendMediaGroup", data, ctype)
            if text and len(text) > 1024:
                _msg(chat, text)
            return "ok"
        if text:
            _msg(chat, text)
            return "ok"
        return "empty"
    except Exception as e:
        logging.error("tg.send failed: %r", e)
        return "error"
