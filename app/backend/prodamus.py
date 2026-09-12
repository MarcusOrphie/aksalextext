# -*- coding: utf-8 -*-
"""Вебхук Продамуса: проверка подписи (Hmac как в SDK Продамуса) + разбор товара.
Продамус шлёт x-www-form-urlencoded с вложенными ключами products[0][name] и подписью в заголовке Sign.
Подпись: рекурсивный ksort -> все значения в строки -> json_encode(JSON_UNESCAPED_UNICODE, слэши экранированы) -> HMAC-SHA256(secret)."""
import os, re, hmac, hashlib, json, logging

SECRET = os.environ.get("PRODAMUS_SECRET", "").strip()

# ГЛАВНОЕ: роутим по НАЗВАНИЮ товара (products[0][name]) - суммы у товаров совпадают
# (Анализ Instagram и 30 форматов оба 99₽), по сумме их не различить.
GUIDE_ITEMS = {
    "audit":     {"kind": "guide", "guide": "audit",     "label": "Анализ твоего Instagram"},
    "formats":   {"kind": "guide", "guide": "formats",   "label": "30 форматов рилзов"},
    "prompts":   {"kind": "guide", "guide": "prompts",   "label": "Гайд: промпты для контента"},
    "crosspost": {"kind": "guide", "guide": "crosspost", "label": "Кросспостинг: 1 бот - 3 площадки"},
}
# правила по названию (в порядке; подстрока в lower-name). Первое совпадение выигрывает.
NAME_RULES = [
    (("кросспостинг", "кросс-пост", "кросс пост"), "crosspost"),
    (("анализ", "instagram", "инстаграм", "инста"), "audit"),
    (("формат",),                                    "formats"),
    (("промпт",),                                    "prompts"),
]
# резерв по сумме - только для того, что по сумме однозначно (подписки); guide-и по сумме НЕ различаем.
BY_SUM = {
    "999":  {"kind": "sub", "plan": "start", "label": "Старт"},
    "2499": {"kind": "sub", "plan": "pro",   "label": "Pro"},
}


def _product_name(data: dict) -> str:
    p = data.get("products")
    if isinstance(p, list) and p and isinstance(p[0], dict):
        return str(p[0].get("name") or "")
    if isinstance(p, dict):
        v = p.get("0")
        if isinstance(v, dict):
            return str(v.get("name") or "")
    return str(data.get("products[0][name]") or "")


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
    """Определить купленный товар. Сначала по НАЗВАНИЮ (надёжно, различает товары с одной ценой),
    затем резерв по сумме (для подписок). None если не распознали."""
    name = _product_name(data).lower()
    if name:
        for keys, guide in NAME_RULES:
            if any(k in name for k in keys):
                return GUIDE_ITEMS[guide]
        if "тариф" in name and "pro" in name:
            return BY_SUM["2499"]
        if "тариф" in name and "старт" in name:
            return BY_SUM["999"]
    s = str(data.get("sum") or data.get("order_sum") or "").strip()
    s = s.split(".")[0] if s else s   # '999.00' -> '999'
    hit = BY_SUM.get(s)
    if hit:
        return hit
    logging.error("prodamus.route: не распознали товар name=%r sum=%r", name, s)
    return None


def is_success(data: dict) -> bool:
    st = str(data.get("payment_status") or "").lower()
    return st in ("success", "paid", "successful")
