# -*- coding: utf-8 -*-
"""Вебхук Продамуса: проверка подписи (Hmac как в SDK Продамуса) + разбор товара.
Продамус шлёт x-www-form-urlencoded с вложенными ключами products[0][name] и подписью в заголовке Sign.
Подпись: рекурсивный ksort -> все значения в строки -> json_encode(JSON_UNESCAPED_UNICODE, слэши экранированы) -> HMAC-SHA256(secret)."""
import os, re, hmac, hashlib, json, logging

SECRET = os.environ.get("PRODAMUS_SECRET", "").strip()

# Роутинг по сумме заказа (руб). Продамус для всех ссылок в рублях.
BY_SUM = {
    "99":   {"kind": "guide", "guide": "formats", "label": "30 форматов рилзов"},
    "399":  {"kind": "guide", "guide": "prompts", "label": "Гайд: промпты для контента"},
    "999":  {"kind": "sub",   "plan": "start",    "label": "Старт"},
    "2499": {"kind": "sub",   "plan": "pro",      "label": "Pro"},
}


# ---------- подпись ----------
def _sort(d):
    if isinstance(d, dict):
        return {k: _sort(d[k]) for k in sorted(d.keys())}
    if isinstance(d, list):
        return [_sort(x) for x in d]
    return d


def _stringify(d):
    if isinstance(d, dict):
        return {k: _stringify(v) for k, v in d.items()}
    if isinstance(d, list):
        return [_stringify(v) for v in d]
    if isinstance(d, bool):
        return "1" if d else ""
    if d is None:
        return ""
    return str(d)


def _encoded(data: dict) -> str:
    prepared = _stringify(_sort(data))
    j = json.dumps(prepared, ensure_ascii=False, separators=(",", ":"))
    return j.replace("/", "\\/")  # PHP json_encode по умолчанию экранирует слэши


def verify(data: dict, sign: str) -> bool:
    if not SECRET or not sign:
        return False
    calc = hmac.new(SECRET.encode("utf-8"), _encoded(data).encode("utf-8"), hashlib.sha256).hexdigest()
    ok = hmac.compare_digest(calc.lower(), str(sign).strip().lower())
    if not ok:
        logging.error("prodamus.verify mismatch: calc=%s got=%s payload=%s", calc, sign, _encoded(data)[:400])
    return ok


# ---------- разбор формы Продамуса (PHP-style nested keys) ----------
def parse_form(items) -> dict:
    """items: iterable (key, value). products[0][name] -> вложенные dict, числовые ключи -> list."""
    root = {}
    for key, val in items:
        m = re.match(r"^([^\[]+)(.*)$", key)
        if not m:
            continue
        path = [m.group(1)] + re.findall(r"\[([^\]]*)\]", m.group(2))
        node = root
        for i, tok in enumerate(path):
            if i == len(path) - 1:
                node[tok] = val
            else:
                if not isinstance(node.get(tok), dict):
                    node[tok] = {}
                node = node[tok]
    return _listify(root)


def _listify(d):
    if not isinstance(d, dict):
        return d
    d = {k: _listify(v) for k, v in d.items()}
    keys = list(d.keys())
    if keys and all(k.isdigit() for k in keys):
        ints = sorted(int(k) for k in keys)
        if ints == list(range(len(ints))):
            return [d[str(i)] for i in ints]
    return d


# ---------- маршрутизация товара ----------
def route(data: dict):
    """Вернуть описание купленного из BY_SUM по сумме. None если не распознали."""
    s = str(data.get("sum") or data.get("order_sum") or "").strip()
    s = s.split(".")[0] if s else s   # '999.00' -> '999'
    return BY_SUM.get(s)


def is_success(data: dict) -> bool:
    st = str(data.get("payment_status") or "").lower()
    return st in ("success", "paid", "successful")
