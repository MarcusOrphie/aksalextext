# -*- coding: utf-8 -*-
"""Контент курса «Проявить себя». Отдаётся только авторизованным с доступом.
Единый источник правды - course_content.json (тот же формат, что ждёт фронтовый движок)."""
import os, json, logging

_PATH = os.path.join(os.path.dirname(__file__), "course_content.json")
_CACHE = None

# Идентификатор курса для access.grant_course / has_course
COURSE_ID = "proyavit"
COURSE_PRICE = int(os.environ.get("COURSE_PRICE", "990"))
COURSE_PAY_URL = os.environ.get("COURSE_PAY_URL", "").strip()  # ссылка Prodamus, задаётся в .env


def load() -> dict:
    global _CACHE
    if _CACHE is None:
        try:
            with open(_PATH, "r", encoding="utf-8") as f:
                _CACHE = json.load(f)
        except Exception as e:
            logging.error("course_content load failed: %r", e)
            _CACHE = {"modules": [], "ranks": [], "achievements": []}
    return _CACHE


def teaser() -> dict:
    """Публичная витрина без контента модулей - для незалогиненных/неоплативших."""
    c = load()
    mods = [{"num": m.get("num"), "title": m.get("title"), "em": m.get("em"),
             "days": m.get("days"),
             "tasks": len(m.get("tasks", [])),
             "why": m.get("why", "")} for m in c.get("modules", [])]
    total_tasks = sum(len(m.get("tasks", [])) for m in c.get("modules", []))
    return {"title": c.get("title", "Проявить себя"),
            "modules_count": len(mods), "tasks_count": total_tasks,
            "achievements_count": len(c.get("achievements", [])),
            "modules": mods,
            "price": COURSE_PRICE, "pay_url": COURSE_PAY_URL}
