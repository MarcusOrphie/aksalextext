# -*- coding: utf-8 -*-
"""Сохранение правок визуала (карусель/пост/сториз): фото-стикеры и параметры слайдов.
Фото кладём в Storage service-ключом, параметры и пути - в output._edits записи генерации.
История восстанавливает карусель уже с фото и правками пользователя."""
import os, json, base64, logging, urllib.request, urllib.parse, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
REST = SUPABASE_URL + "/rest/v1"
STORAGE = SUPABASE_URL + "/storage/v1"
BUCKET = "uploads"
_H = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json"}


def _get_row(gen_id: str):
    url = REST + "/generations?id=eq." + urllib.parse.quote(gen_id, safe="") + "&select=user_id,output&limit=1"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=_H), timeout=15) as r:
            data = json.loads(r.read().decode())
            return data[0] if isinstance(data, list) and data else None
    except Exception as e:
        logging.error("edits._get_row failed: %r", e); return None


def _patch_output(gen_id: str, output: dict) -> bool:
    url = REST + "/generations?id=eq." + urllib.parse.quote(gen_id, safe="")
    h = dict(_H); h["Prefer"] = "return=minimal"
    body = json.dumps({"output": output}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body, headers=h, method="PATCH"), timeout=15).read()
        return True
    except Exception as e:
        logging.error("edits._patch_output failed: %r", e); return False


def _upload(path: str, raw: bytes, ctype: str) -> bool:
    url = STORAGE + "/object/" + BUCKET + "/" + urllib.parse.quote(path)
    h = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": ctype or "image/png", "x-upsert": "true"}
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=raw, headers=h, method="POST"), timeout=30).read()
        return True
    except Exception as e:
        logging.error("edits._upload failed: %r", e); return False


def save_edit(user_id: str, gen_id: str, index: int, edit: dict):
    """Сохранить правку одного слайда. edit: shape/rot/fontScale/alignV/alignH/photo(dataURL|None)."""
    if not (SUPABASE_URL and SERVICE_KEY and user_id and gen_id):
        return False, "no config"
    row = _get_row(gen_id)
    if not row:
        return False, "not found"
    if str(row.get("user_id")) != str(user_id):
        return False, "forbidden"
    output = row.get("output")
    if not isinstance(output, dict):
        output = {}
    edits = output.get("_edits")
    if not isinstance(edits, dict):
        edits = {}
    key = str(int(index))
    e = {"shape": edit.get("shape"), "rot": edit.get("rot"), "fontScale": edit.get("fontScale"),
         "alignV": edit.get("alignV"), "alignH": edit.get("alignH")}
    photo = edit.get("photo")
    prev = edits.get(key) or {}
    if isinstance(photo, str) and photo.startswith("data:"):
        try:
            hdr, b64 = photo.split(",", 1)
            raw = base64.b64decode(b64)
            if len(raw) > 8 * 1024 * 1024:
                return False, "photo too big"
            ctype = "image/png"
            if "image/" in hdr:
                ctype = hdr.split("image/")[1].split(";")[0]
                ctype = "image/" + (ctype or "png")
            path = user_id + "/edits/" + gen_id + "/" + key + ".png"
            if _upload(path, raw, ctype):
                e["sticker"] = path
        except Exception as ex:
            logging.error("edits.save_edit photo failed: %r", ex)
            e["sticker"] = prev.get("sticker")
    elif photo is None:
        e["sticker"] = None
    else:
        e["sticker"] = prev.get("sticker")
    edits[key] = e
    output["_edits"] = edits
    ok = _patch_output(gen_id, output)
    return (ok, "ok" if ok else "save failed")
