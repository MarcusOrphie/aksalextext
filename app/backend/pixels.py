# -*- coding: utf-8 -*-
"""Тусовка брендов / Brand Party (brands.aksalex.com): хранение проданных пикселей.
Холст 2400x1000 (240x100 блоков по 10px). Цена 2 руб/пиксель. Продажа местами (блок 10x10).
Простое файловое хранилище (JSON) + логотипы на диске. Бронь до оплаты, закрепление по вебхуку Prodamus.
Публичного контента модулей тут нет - только данные биржи пикселей."""
import os, json, time, threading, uuid

BLOCK = 10
BCOLS = 240
BROWS = 100
RUB_PER_PX = 2
RES_TTL = 45 * 60  # бронь живёт 45 минут

_DIR = os.environ.get("PIXELS_DIR") or os.path.join(os.path.dirname(__file__), "..", "data", "pixels")
_DIR = os.path.abspath(_DIR)
_LOGOS = os.path.join(_DIR, "logos")
_BOARD = os.path.join(_DIR, "board.json")
_RES = os.path.join(_DIR, "reservations.json")
_LOG = os.path.join(_DIR, "orders.jsonl")
_lock = threading.Lock()


def _log(kind, data):
    """Журнал заказов: одна строка JSON на событие (reserve / paid)."""
    try:
        _ensure()
        rec = {"ts": int(time.time()), "kind": kind}
        rec.update(data)
        with open(_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass


def orders(limit=1000):
    out = []
    try:
        with open(_LOG, "r", encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if ln:
                    try:
                        out.append(json.loads(ln))
                    except Exception:
                        pass
    except Exception:
        pass
    return out[-limit:][::-1]

_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
        "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg"}


def _ensure():
    os.makedirs(_LOGOS, exist_ok=True)


def _load(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save(path, data):
    _ensure()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def ext_for(content_type):
    return _EXT.get((content_type or "").lower())


def _blocks_of(rects):
    s = set()
    for r in rects:
        bx = int(r["x"]) // BLOCK; by = int(r["y"]) // BLOCK
        bw = int(r["w"]) // BLOCK; bh = int(r["h"]) // BLOCK
        for y in range(by, by + bh):
            for x in range(bx, bx + bw):
                s.add(y * BCOLS + x)
    return s


def _occ(placements):
    s = set()
    for p in placements:
        s |= _blocks_of(p.get("rects", []))
    return s


def _active(res):
    now = time.time()
    return [r for r in res if r.get("exp", 0) > now and not r.get("done")]


def _rects_valid(rects):
    if not rects or not isinstance(rects, list) or len(rects) > 200:
        return False
    for r in rects:
        if not isinstance(r, dict):
            return False
        for k in ("x", "y", "w", "h"):
            v = r.get(k)
            if not isinstance(v, (int, float)):
                return False
        if int(r["x"]) % BLOCK or int(r["y"]) % BLOCK or int(r["w"]) % BLOCK or int(r["h"]) % BLOCK:
            return False
        if r["x"] < 0 or r["y"] < 0 or r["x"] + r["w"] > BCOLS * BLOCK or r["y"] + r["h"] > BROWS * BLOCK:
            return False
        if r["w"] <= 0 or r["h"] <= 0:
            return False
    return True


def board():
    b = _load(_BOARD)
    out = []
    for p in b:
        out.append({
            "id": p.get("id", ""),
            "rects": p["rects"],
            "name": p.get("name", ""),
            "url": p.get("url", ""),
            "desc": p.get("desc", ""),
            "px": p.get("px", 0),
            "logo": ("/api/pixels/logo/" + p["id"]) if p.get("logo_ext") else None,
        })
    return out


def stats():
    b = _load(_BOARD)
    return {"px": sum(p.get("px", 0) for p in b), "count": len(b)}


def reserve(rects, name, url, desc, email, logo_bytes, logo_ext):
    """Забронировать места. Возвращает {order_id, px, sum} или {error}."""
    if not _rects_valid(rects):
        return {"error": "bad_rects"}
    with _lock:
        board_p = _load(_BOARD)
        res = _active(_load(_RES))
        want = _blocks_of(rects)
        if not want:
            return {"error": "empty"}
        taken = _occ(board_p)
        for r in res:
            taken |= _blocks_of(r["rects"])
        if want & taken:
            return {"error": "taken"}
        px = len(want) * 100
        oid = "bp" + uuid.uuid4().hex[:16]
        rec = {"id": oid, "rects": rects, "name": (name or "")[:80], "url": (url or "")[:300],
               "desc": (desc or "")[:140], "email": (email or "")[:120], "px": px, "sum": px * RUB_PER_PX,
               "exp": time.time() + RES_TTL, "done": False}
        if logo_bytes and logo_ext:
            with open(os.path.join(_LOGOS, oid + "." + logo_ext), "wb") as f:
                f.write(logo_bytes)
            rec["logo_ext"] = logo_ext
        res.append(rec)
        _save(_RES, res)
        _log("reserve", {"order_id": oid, "email": rec["email"], "name": rec["name"],
                         "url": rec["url"], "px": px, "sum": px * RUB_PER_PX, "rects": len(rects)})
        return {"order_id": oid, "px": px, "sum": px * RUB_PER_PX}


def confirm(order_id):
    """Закрепить оплаченную бронь на холсте. Вызывается из вебхука Prodamus.
    Возвращает dict инфо о заказе при первом закреплении (для письма), {"already":True} на повтор, None/False иначе."""
    if not order_id:
        return None
    with _lock:
        res = _load(_RES)
        board_p = _load(_BOARD)
        rec = next((r for r in res if r.get("id") == order_id), None)
        if not rec:
            return None
        if any(p.get("id") == order_id for p in board_p):
            return {"already": True}  # уже закреплено (повтор вебхука)
        if _blocks_of(rec["rects"]) & _occ(board_p):
            return False  # места успели занять - возврат средств вручную
        p = {"id": order_id, "rects": rec["rects"], "name": rec.get("name", ""),
             "url": rec.get("url", ""), "desc": rec.get("desc", ""), "px": rec.get("px", 0)}
        if rec.get("logo_ext"):
            p["logo_ext"] = rec["logo_ext"]
        board_p.append(p)
        _save(_BOARD, board_p)
        rec["done"] = True
        _save(_RES, res)
        _log("paid", {"order_id": order_id, "email": rec.get("email", ""), "name": rec.get("name", ""),
                      "px": rec.get("px", 0), "sum": rec.get("px", 0) * RUB_PER_PX})
        return {"email": rec.get("email", ""), "name": rec.get("name", ""),
                "px": rec.get("px", 0), "sum": rec.get("px", 0) * RUB_PER_PX}


def logo_path(order_id):
    b = _load(_BOARD)
    p = next((x for x in b if x.get("id") == order_id), None)
    if not p or not p.get("logo_ext"):
        return None
    fp = os.path.join(_LOGOS, order_id + "." + p["logo_ext"])
    return fp if os.path.exists(fp) else None
