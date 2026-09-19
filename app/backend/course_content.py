# -*- coding: utf-8 -*-
"""Контент курсов. Реестр из нескольких курсов по id. Каждый - свой JSON того же формата,
что ждёт фронтовый движок. Контент отдаётся только авторизованным с доступом (см. main.py)."""
import os, json, logging

_DIR = os.path.dirname(__file__)
_CACHE = {}

# Реестр курсов: id -> файл контента + env для цены/ссылки Prodamus + дефолты.
COURSES = {
    "proyavit": {
        "file": "course_content.json",
        "price_env": "COURSE_PRICE", "payurl_env": "COURSE_PAY_URL",
        "default_price": 990, "title": "Проявить себя",
    },
    "neuroteacher": {
        "file": "course_content_teacher.json",
        "price_env": "COURSE_TEACHER_PRICE", "payurl_env": "COURSE_TEACHER_PAY_URL",
        "default_price": 1490, "title": "Нейросети для учителя",
    },
}

# Back-compat для старого кода (курс «Проявить себя»)
COURSE_ID = "proyavit"
COURSE_PRICE = int(os.environ.get("COURSE_PRICE", "990"))
COURSE_PAY_URL = os.environ.get("COURSE_PAY_URL", "").strip()


def valid(course_id: str) -> bool:
    return course_id in COURSES


def _empty():
    return {"modules": [], "ranks": [], "achievements": []}


def load(course_id: str = "proyavit") -> dict:
    if course_id not in _CACHE:
        c = COURSES.get(course_id)
        if not c:
            return _empty()
        try:
            with open(os.path.join(_DIR, c["file"]), "r", encoding="utf-8") as f:
                _CACHE[course_id] = json.load(f)
        except Exception as e:
            logging.error("course_content load %s failed: %r", course_id, e)
            _CACHE[course_id] = _empty()
    return _CACHE[course_id]


def price(course_id: str = "proyavit") -> int:
    c = COURSES.get(course_id) or {}
    raw = os.environ.get(c.get("price_env", ""), "")
    try:
        return int(raw) if raw else int(c.get("default_price", 990))
    except ValueError:
        return int(c.get("default_price", 990))


def pay_url(course_id: str = "proyavit") -> str:
    c = COURSES.get(course_id) or {}
    return os.environ.get(c.get("payurl_env", ""), "").strip()


def module(course_id: str, module_id: str):
    """Найти модуль по id - для контекста ИИ-наставника."""
    for m in load(course_id).get("modules", []):
        if m.get("id") == module_id:
            return m
    return None


def teaser(course_id: str = "proyavit") -> dict:
    """Публичная витрина без контента модулей - для незалогиненных/неоплативших."""
    c = load(course_id)
    mods = [{"num": m.get("num"), "title": m.get("title"), "em": m.get("em"),
             "days": m.get("days"),
             "tasks": len(m.get("tasks", [])),
             "why": m.get("why", "")} for m in c.get("modules", [])]
    total_tasks = sum(len(m.get("tasks", [])) for m in c.get("modules", []))
    reg = COURSES.get(course_id) or {}
    return {"title": c.get("title", reg.get("title", "Курс")),
            "modules_count": len(mods), "tasks_count": total_tasks,
            "achievements_count": len(c.get("achievements", [])),
            "modules": mods,
            "price": price(course_id), "pay_url": pay_url(course_id)}
