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
    "neurobase": {
        "file": "course_content_ai.json", "file_en": "course_content_ai_en.json",
        "price_env": "COURSE_BASE_PRICE", "payurl_env": "COURSE_BASE_PAY_URL",
        "default_price": 1490, "title": "Нейросети с нуля",
    },
    "workflow": {
        "file": "course_content_workflow.json", "file_en": "course_content_workflow_en.json",
        "price_env": "COURSE_WF_PRICE", "payurl_env": "COURSE_WF_PAY_URL",
        "default_price": 4900, "title": "AI Workflow Starter",
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


def load(course_id: str = "proyavit", lang: str = "ru") -> dict:
    c = COURSES.get(course_id)
    if not c:
        return _empty()
    fn = c.get("file_en") if (lang == "en" and c.get("file_en")) else c["file"]
    key = course_id + ":" + ("en" if fn == c.get("file_en") else "ru")
    if key not in _CACHE:
        try:
            with open(os.path.join(_DIR, fn), "r", encoding="utf-8") as f:
                _CACHE[key] = json.load(f)
        except Exception as e:
            logging.error("course_content load %s (%s) failed: %r", course_id, lang, e)
            _CACHE[key] = _empty()
    return _CACHE[key]


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


def module(course_id: str, module_id: str, lang: str = "ru"):
    """Найти модуль по id - для контекста ИИ-наставника."""
    for m in load(course_id, lang).get("modules", []):
        if m.get("id") == module_id:
            return m
    return None


def teaser(course_id: str = "proyavit", lang: str = "ru") -> dict:
    """Публичная витрина без контента модулей - для незалогиненных/неоплативших."""
    c = load(course_id, lang)
    mods = [{"num": m.get("num"), "title": m.get("title"), "em": m.get("em"),
             "days": m.get("days"),
             "tasks": len(m.get("tasks", [])),
             "why": m.get("why", "")} for m in c.get("modules", [])]
    total_tasks = sum(len(m.get("tasks", [])) for m in c.get("modules", []))
    reg = COURSES.get(course_id) or {}
    return {"title": c.get("title", reg.get("title", "Курс")),
            "subtitle": c.get("subtitle", ""), "hero": c.get("hero", ""), "tag": c.get("tag", ""),
            "landing": c.get("landing"),
            "modules_count": len(mods), "tasks_count": total_tasks,
            "achievements_count": len(c.get("achievements", [])),
            "modules": mods,
            "price": price(course_id), "pay_url": pay_url(course_id)}
