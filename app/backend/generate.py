# -*- coding: utf-8 -*-
"""Генерация контента через Anthropic API (tool-use под каждую платформу)."""
import os, json, urllib.request
from prompts import build_system, build_user

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("MODEL", "claude-sonnet-5").strip()

def _dash(o):
    if isinstance(o, str): return o.replace("—", "-").replace("–", "-")
    if isinstance(o, list): return [_dash(x) for x in o]
    if isinstance(o, dict): return {k: _dash(v) for k, v in o.items()}
    return o

_idea = {"type": "object", "properties": {
    "idea": {"type": "string"}, "hook": {"type": "string"}, "scenario": {"type": "string"},
    "visual": {"type": "string"}, "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
    "required": ["idea", "hook", "scenario", "visual", "virality", "virality_reason"]}

_short = {"type": "object", "properties": {"ideas": {"type": "array", "items": _idea}},
          "required": ["ideas"]}

SCHEMAS = {
    "reels": _short, "shorts": _short, "tiktok": _short,
    "youtube_long": {"type": "object", "properties": {
        "title": {"type": "string"}, "hook": {"type": "string"},
        "sections": {"type": "array", "items": {"type": "object", "properties": {
            "h": {"type": "string"}, "points": {"type": "string"}}, "required": ["h", "points"]}},
        "outro": {"type": "string"}, "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["title", "hook", "sections", "outro", "virality", "virality_reason"]},
    "carousel": {"type": "object", "properties": {
        "hook_slide": {"type": "string"},
        "slides": {"type": "array", "items": {"type": "object", "properties": {
            "title": {"type": "string"}, "text": {"type": "string"}}, "required": ["title", "text"]}},
        "cta_slide": {"type": "string"}, "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["hook_slide", "slides", "cta_slide", "virality", "virality_reason"]},
    "post": {"type": "object", "properties": {
        "hook": {"type": "string"}, "body": {"type": "string"}, "cta": {"type": "string"},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["hook", "body", "cta", "virality", "virality_reason"]},
    "stories": {"type": "object", "properties": {
        "frames": {"type": "array", "items": {"type": "object", "properties": {
            "visual": {"type": "string"}, "text": {"type": "string"}}, "required": ["visual", "text"]}},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["frames", "virality", "virality_reason"]},
}
PLATFORMS = set(SCHEMAS.keys())

def generate(platform: str, topic: str, profile: dict | None = None) -> dict:
    if platform not in PLATFORMS:
        raise ValueError("unknown platform")
    if not API_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    tool = {"name": "publish_content", "description": "Вернуть готовый контент строго по схеме платформы.",
            "input_schema": SCHEMAS[platform]}
    payload = {
        "model": MODEL, "max_tokens": 4000,
        "system": build_system(platform, profile),
        "messages": [{"role": "user", "content": build_user(topic, platform)}],
        "tools": [tool], "tool_choice": {"type": "tool", "name": "publish_content"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode("utf-8"))
    for b in d.get("content", []):
        if b.get("type") == "tool_use":
            return {"platform": platform, "data": _dash(b.get("input", {}))}
    raise RuntimeError("no tool_use in response")
