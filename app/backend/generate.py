# -*- coding: utf-8 -*-
"""Генерация контента через Anthropic API (tool-use под каждую платформу)."""
import os, json, urllib.request
from prompts import build_system, build_user, build_redo, BASE, BASE_EN

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("MODEL", "claude-sonnet-5").strip()


def _cached_system(full: str, lang: str):
    """Оборачиваем статичный префикс (BASE - большие правила крафта, одинаковы для всех)
    в кэш-блок Anthropic prompt caching. Динамику (платформа, тренды, профиль) - отдельным блоком."""
    base = BASE_EN if lang == "en" else BASE
    if isinstance(full, str) and full.startswith(base) and len(base) > 400:
        rest = full[len(base):]
        blocks = [{"type": "text", "text": base, "cache_control": {"type": "ephemeral"}}]
        if rest:
            blocks.append({"type": "text", "text": rest})
        return blocks
    return full

def _dash(o):
    if isinstance(o, str): return o.replace("—", "-").replace("–", "-")
    if isinstance(o, list): return [_dash(x) for x in o]
    if isinstance(o, dict): return {k: _dash(v) for k, v in o.items()}
    return o

def _coerce_arrays(data):
    """Иногда модель отдаёт поле-массив строкой-JSON - распарсим обратно."""
    if not isinstance(data, dict):
        return data
    for key in ("ideas", "sections", "slides", "frames", "rubrics", "plan"):
        v = data.get(key)
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") or s.startswith("{"):
                try:
                    data[key] = json.loads(s)
                except Exception:
                    pass
    return data

_idea = {"type": "object", "properties": {
    "idea": {"type": "string"},
    "hook": {"type": "string"},
    "hooks_alt": {"type": "array", "items": {"type": "string"}, "description": "2 альтернативных хука для A/B"},
    "scenario": {"type": "string"},
    "shot_list": {"type": "array", "items": {"type": "string"}, "description": "4-8 кадров: что снять"},
    "on_screen_text": {"type": "array", "items": {"type": "string"}, "description": "тексты-плашки на экране"},
    "teleprompter": {"type": "string", "description": "текст под чтение на камеру, дословно"},
    "caption": {"type": "string", "description": "готовая подпись к посту"},
    "hashtags": {"type": "array", "items": {"type": "string"}, "description": "5-10 хэштегов без #"},
    "first_comment": {"type": "string", "description": "первый закреплённый комментарий"},
    "length_rec": {"type": "string", "description": "рекомендованная длина, напр. '25-35 сек'"},
    "references": {"type": "array", "items": {"type": "string"}, "description": "2-3 похожих виральных ориентира"},
    "fact_check": {"type": "string", "description": "самопроверка: факт vs гипотеза, что перепроверить"},
    "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
    "required": ["idea", "hook", "hooks_alt", "scenario", "shot_list", "teleprompter", "caption",
                 "hashtags", "first_comment", "length_rec", "references", "fact_check"]}

_short = {"type": "object", "properties": {"ideas": {"type": "array", "items": _idea}},
          "required": ["ideas"]}

SCHEMAS = {
    "reels": _short, "shorts": _short, "tiktok": _short,
    "youtube_long": {"type": "object", "properties": {
        "title": {"type": "string"}, "hook": {"type": "string"},
        "sections": {"type": "array", "items": {"type": "object", "properties": {
            "h": {"type": "string"}, "points": {"type": "string"}}, "required": ["h", "points"]}},
        "outro": {"type": "string"}, "fact_check": {"type": "string", "description": "самопроверка: факт vs гипотеза, что перепроверить"},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["title", "hook", "sections", "outro", "fact_check"]},
    "carousel": {"type": "object", "properties": {
        "hook_slide": {"type": "string"},
        "slides": {"type": "array", "items": {"type": "object", "properties": {
            "title": {"type": "string"}, "text": {"type": "string"}}, "required": ["title", "text"]}},
        "cta_slide": {"type": "string"}, "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["hook_slide", "slides", "cta_slide"]},
    "post": {"type": "object", "properties": {
        "hook": {"type": "string"}, "hooks_alt": {"type": "array", "items": {"type": "string"}},
        "body": {"type": "string"}, "cta": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "first_comment": {"type": "string"},
        "fact_check": {"type": "string", "description": "самопроверка: факт vs гипотеза, что перепроверить"},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["hook", "body", "cta", "hashtags", "fact_check"]},
    "content_plan": {"type": "object", "properties": {
        "rubrics": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string"}, "idea": {"type": "string"}}, "required": ["name", "idea"]}},
        "plan": {"type": "array", "items": {"type": "object", "properties": {
            "day": {"type": "string"}, "rubric": {"type": "string"}, "format": {"type": "string"},
            "idea": {"type": "string"}, "hook": {"type": "string"}, "goal": {"type": "string"}},
            "required": ["day", "format", "idea", "hook", "goal"]}},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["rubrics", "plan"]},
    "stories": {"type": "object", "properties": {
        "frames": {"type": "array", "items": {"type": "object", "properties": {
            "visual": {"type": "string"}, "text": {"type": "string"}}, "required": ["visual", "text"]}},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["frames"]},
}
PLATFORMS = set(SCHEMAS.keys())

def generate(platform: str, topic: str, profile: dict | None = None, avoid: list | None = None,
             voice: str | None = None, liked: list | None = None, disliked: list | None = None,
             trends: str | None = None, lang: str = "ru", user_text: str | None = None) -> dict:
    if platform not in PLATFORMS:
        raise ValueError("unknown platform")
    if not API_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    tool = {"name": "publish_content", "description": "Вернуть готовый контент строго по схеме платформы.",
            "input_schema": SCHEMAS[platform]}
    max_tokens = 6000 if platform in ("reels", "shorts", "tiktok", "youtube_long", "content_plan") else 4000
    payload = {
        "model": MODEL, "max_tokens": max_tokens,
        "system": _cached_system(build_system(platform, profile, avoid, voice, liked, disliked, trends, lang, user_text), lang),
        "messages": [{"role": "user", "content": build_user(topic, platform, lang, user_text)}],
        "tools": [tool], "tool_choice": {"type": "tool", "name": "publish_content"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode("utf-8"))
    for b in d.get("content", []):
        if b.get("type") == "tool_use":
            return {"platform": platform, "data": _coerce_arrays(_dash(b.get("input", {})))}
    raise RuntimeError("no tool_use in response")


def redo(platform: str, title: str, text: str, has_text: bool, instruction: str,
         profile: dict | None = None, lang: str = "ru") -> dict:
    """Переделать один слайд/картинку по указанию пользователя, вернуть новые title/text."""
    if not API_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    props = {"title": {"type": "string"}}
    required = ["title"]
    if has_text:
        props["text"] = {"type": "string"}; required.append("text")
    tool = {"name": "redo_slide", "description": "Новый вариант этого слайда строго по формату.",
            "input_schema": {"type": "object", "properties": props, "required": required}}
    system, userc = build_redo(platform, title, text, has_text, instruction, profile, lang)
    payload = {"model": MODEL, "max_tokens": 1500, "system": _cached_system(system, lang),
               "messages": [{"role": "user", "content": userc}],
               "tools": [tool], "tool_choice": {"type": "tool", "name": "redo_slide"}}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read().decode("utf-8"))
    for b in d.get("content", []):
        if b.get("type") == "tool_use":
            return _dash(b.get("input", {}))
    raise RuntimeError("no tool_use in redo response")
