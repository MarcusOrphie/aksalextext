# -*- coding: utf-8 -*-
"""Отзывы о курсе. Храним списком в Supabase Storage service-ключом (как access.py, без таблицы)."""
import time
from access import _read, _write

REVIEWS_KEY = "_system/course_reviews.json"


def add(email: str, name: str, text: str, course: str = "proyavit"):
    email = (email or "").strip().lower()
    name = (name or "").strip()[:120]
    text = (text or "").strip()[:4000]
    if not text:
        return None
    d = _read(REVIEWS_KEY)
    items = d.get("items") if isinstance(d.get("items"), list) else []
    rec = {"ts": int(time.time()), "date": time.strftime("%Y-%m-%d %H:%M"),
           "email": email, "name": name, "course": course, "text": text}
    items.append(rec)
    d["items"] = items
    return rec if _write(d, REVIEWS_KEY) else None


def all_reviews(course: str = None):
    items = _read(REVIEWS_KEY).get("items") or []
    if course:
        items = [r for r in items if r.get("course") == course]
    return list(reversed(items))  # свежие сверху
