# -*- coding: utf-8 -*-
"""Генерация контента через Anthropic API (tool-use под каждую платформу)."""
import os, json, re, ast, urllib.request
from prompts import build_system, build_user, build_redo, BASE, BASE_EN

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("MODEL", "claude-sonnet-5").strip()

# платформы, где при своём тексте раскладываем ДОСЛОВНО, без модели (гарантия строгости)
VERBATIM = ("carousel", "post", "stories")


_SLIDE_RE = re.compile(r"^\s*\**\s*(?:слайд|slide)\s*\d+\b.*$", re.IGNORECASE)


def _strip_md(s: str) -> str:
    """Убрать markdown-разметку автора (**жирный**, маркеры списков, #) - на слайдах она не нужна."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s or "")   # **жирный** -> жирный
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = s.replace("**", "").replace("__", "")
    s = re.sub(r"^\s*[\*\-•#]+\s*", "", s)          # маркеры списка/заголовка в начале строки
    return s.strip()


def _slide_sections(text: str):
    """Если автор сам разметил текст заголовками «Слайд N» - разложить по ним: заголовок слайда = первая
    строка секции, остальное = текст. Возвращает [] если явных заголовков «Слайд N» нет."""
    lines = (text or "").split("\n")
    if not any(_SLIDE_RE.match(ln) for ln in lines):
        return []
    sections, cur = [], None
    for ln in lines:
        if _SLIDE_RE.match(ln):
            cur = []; sections.append(cur); continue
        if cur is None:
            if not ln.strip():
                continue
            cur = []; sections.append(cur)   # текст до первого «Слайд N» - тоже отдельная секция
        cur.append(ln)
    out = []
    for sec in sections:
        ls = [x for x in (_strip_md(y) for y in sec) if x]
        if not ls:
            continue
        out.append({"title": ls[0], "text": " ".join(ls[1:]).strip()})
    return out


def _blocks(text: str):
    """Разбить текст автора на блоки: сперва по его переносам строк, иначе по предложениям."""
    text = (text or "").strip()
    if not text:
        return []
    parts = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    if len(parts) < 2:
        parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+", text) if p.strip()]
    return [_strip_md(p) for p in parts if _strip_md(p)]


def _distribute(parts, n):
    """Разложить куски текста РОВНО на n групп максимально ровно (ничего не переписывая)."""
    parts = [p for p in parts if p]
    if n <= 0 or not parts:
        return parts
    items = parts[:]
    # если кусков меньше нужного - дробим самые длинные по предложениям, пока не наберём n
    while len(items) < n:
        k = max(range(len(items)), key=lambda x: len(items[x]))
        sents = [s.strip() for s in re.split(r"(?<=[.!?…])\s+", items[k]) if s.strip()]
        if len(sents) < 2:
            break
        mid = len(sents) // 2
        items[k:k + 1] = [" ".join(sents[:mid]).strip(), " ".join(sents[mid:]).strip()]
    if len(items) <= n:
        return items
    # кусков больше - собираем в n групп подряд
    groups, per = [], len(items) / n
    for g in range(n):
        a = round(g * per)
        b = round((g + 1) * per) if g < n - 1 else len(items)
        chunk = " ".join(items[a:b]).strip()
        if chunk:
            groups.append(chunk)
    return groups


def verbatim_layout(platform: str, text: str, count: int = 0) -> dict:
    """Разложить текст автора по формату ДОСЛОВНО, ничего не меняя и не добавляя."""
    secs = _slide_sections(text)   # автор сам разметил «Слайд N»? - раскладываем ровно по его слайдам
    if secs:
        if platform == "carousel":
            return {"hook_slide": "", "slides": [{"title": s["title"], "text": s["text"]} for s in secs], "cta_slide": ""}
        if platform == "stories":
            return {"frames": [{"title": s["title"], "text": s["text"]} for s in secs]}
        if platform == "post":
            body = "\n\n".join([x for x in [secs[0]["text"]] + [s["title"] + ((" " + s["text"]) if s["text"] else "") for s in secs[1:]] if x])
            return {"hook": secs[0]["title"], "hooks_alt": [], "body": body, "cta": "", "hashtags": [], "first_comment": "", "fact_check": ""}
    b = _blocks(text)
    if platform == "carousel":
        if len(b) >= 3:
            hook, cta, mids = b[0], b[-1], b[1:-1]
        elif len(b) == 2:
            hook, cta, mids = b[0], "", [b[1]]
        else:
            hook, cta, mids = (b[0] if b else (text or "").strip()), "", []
        slides = [{"title": m, "text": ""} for m in mids]
        if not slides:
            slides = [{"title": hook, "text": ""}]
            hook = ""
        return {"hook_slide": hook, "slides": slides, "cta_slide": cta}
    if platform == "post":
        hook = b[0] if b else (text or "").strip()
        body = "\n\n".join(b[1:]) if len(b) > 1 else ""
        return {"hook": hook, "hooks_alt": [], "body": body, "cta": "", "hashtags": [],
                "first_comment": "", "fact_check": ""}
    if platform == "stories":
        parts = _distribute(b, count) if count and count > 0 else b
        # свой текст автора - дословно в text, заголовок не выдумываем (строгий режим)
        frames = [{"title": "", "text": x} for x in parts] or [{"title": "", "text": (text or "").strip()}]
        return {"frames": frames}
    return {}


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

# поля, которые ДОЛЖНЫ быть массивами (на любом уровне вложенности)
_ARRAY_KEYS = {"ideas", "sections", "slides", "frames", "rubrics", "plan", "segments", "content_map",
               "facts", "delivery", "hashtags", "hooks_alt", "shot_list", "on_screen_text", "references",
               "pains", "desires", "objections", "their_words", "hooks", "options", "captions", "alternatives"}


def _to_list(s: str):
    """Строку-массив (JSON или питоновский repr с одинарными кавычками) -> список; иначе None."""
    s = s.strip()
    if not s.startswith("["):
        return None
    try:
        r = json.loads(s)
        return r if isinstance(r, list) else None
    except Exception:
        pass
    try:
        r = ast.literal_eval(s)   # питон-стиль ['a','b'] от модели
        return r if isinstance(r, list) else None
    except Exception:
        return None


def _coerce_arrays(data):
    """Рекурсивно: если поле по имени должно быть массивом, но пришло строкой - распарсим обратно."""
    if isinstance(data, dict):
        for k, v in list(data.items()):
            if k in _ARRAY_KEYS and isinstance(v, str):
                lst = _to_list(v)
                if lst is not None:
                    data[k] = v = lst
            _coerce_arrays(v)
    elif isinstance(data, list):
        for item in data:
            _coerce_arrays(item)
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

_reels_deep = {"type": "object", "properties": {
    "analysis": {"type": "string", "description": "краткий разбор перед сценарием"},
    "hook": {"type": "string", "description": "сильный цепляющий хук"},
    "development": {"type": "string", "description": "развитие мысли, разговорно"},
    "amplification": {"type": "string", "description": "усиление: пример, разворот"},
    "finale": {"type": "string", "description": "финал + мягкий CTA"},
    "how_to_shoot": {"type": "string", "description": "как снять, без таймингов"},
    "captions": {"type": "array", "items": {"type": "string"}, "description": "2-3 подписи (простой/экспертный/цепляющий)"},
    "why_works": {"type": "string", "description": "почему работает: алгоритмы + психология"},
    "alternatives": {"type": "array", "items": {"type": "object", "properties": {
        "angle": {"type": "string"}, "hook": {"type": "string"}, "format": {"type": "string"}},
        "required": ["angle", "hook"]}, "description": "2-3 альтернативы"},
    "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
    "required": ["analysis", "hook", "development", "amplification", "finale", "how_to_shoot", "captions", "why_works", "alternatives"]}

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
            "title": {"type": "string", "description": "короткий заголовок кадра, 2-5 слов"},
            "text": {"type": "string", "description": "реплика от первого лица, 1-2 предложения"},
            "visual": {"type": "string", "description": "необязательно: что на экране"}}, "required": ["title", "text"]}},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["frames"]},
    "reels_cover": {"type": "object", "properties": {
        "title": {"type": "string", "description": "крупный текст обложки, до ~6 слов, останавливает скролл"},
        "subtitle": {"type": "string", "description": "короткий подзаголовок до ~8 слов (необязателен)"},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["title"]},
    "audience": {"type": "object", "properties": {
        "segments": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string"},
            "portrait": {"type": "string", "description": "кто это, ситуация, день из жизни в 1-2 фразы"},
            "jtbd": {"type": "string", "description": "какую задачу нанимает решить (функц/эмоц/социальную)"},
            "pains": {"type": "array", "items": {"type": "string"}, "description": "5-7 болей словами аудитории"},
            "desires": {"type": "array", "items": {"type": "string"}, "description": "3-5 желаний/мечт"},
            "objections": {"type": "array", "items": {"type": "string"}, "description": "3-5 страхов/возражений"},
            "their_words": {"type": "array", "items": {"type": "string"}, "description": "8-12 реальных фраз аудитории"}},
            "required": ["name", "portrait", "jtbd", "pains", "desires", "objections", "their_words"]}},
        "awareness": {"type": "object", "properties": {
            "unaware": {"type": "string"}, "problem": {"type": "string"}, "solution": {"type": "string"},
            "product": {"type": "string"}, "most": {"type": "string"}},
            "required": ["unaware", "problem", "solution", "product", "most"]},
        "content_map": {"type": "array", "items": {"type": "object", "properties": {
            "pain": {"type": "string"}, "angle": {"type": "string"},
            "hooks": {"type": "array", "items": {"type": "string"}, "description": "2 хука-останавливателя"},
            "format": {"type": "string", "description": "reels/карусель/пост/stories"}},
            "required": ["pain", "angle", "hooks", "format"]}}},
        "required": ["segments", "awareness", "content_map"]},
    "scriptcheck": {"type": "object", "properties": {
        "verdict": {"type": "string", "description": "честная общая оценка текста в 1-2 предложениях"},
        "facts": {"type": "array", "items": {"type": "object", "properties": {
            "claim": {"type": "string", "description": "утверждение из текста автора"},
            "status": {"type": "string", "description": "verified|doubtful|false|unverifiable"},
            "comment": {"type": "string", "description": "коротко, почему такой статус"},
            "fix": {"type": "string", "description": "как переформулировать / что перепроверить, если не verified"}},
            "required": ["claim", "status", "comment"]}},
        "hook": {"type": "object", "properties": {
            "assessment": {"type": "string", "description": "разбор текущего первого крючка"},
            "options": {"type": "array", "items": {"type": "string"}, "description": "2-3 более сильных варианта хука"}},
            "required": ["assessment", "options"]},
        "delivery": {"type": "array", "items": {"type": "string"}, "description": "3-6 корректировок по подаче"},
        "enriched": {"type": "string", "description": "обогащённая версия всего текста на ту же тему"},
        "virality": {"type": "integer"}, "virality_reason": {"type": "string"}},
        "required": ["verdict", "facts", "hook", "delivery", "enriched"]},
}
PLATFORMS = set(SCHEMAS.keys())

def generate(platform: str, topic: str, profile: dict | None = None, avoid: list | None = None,
             voice: str | None = None, liked: list | None = None, disliked: list | None = None,
             trends: str | None = None, lang: str = "ru", user_text: str | None = None,
             audience: str | None = None, count: int = 0, brief: dict | None = None) -> dict:
    if platform not in PLATFORMS:
        raise ValueError("unknown platform")
    # свой текст на визуальных текстовых форматах - раскладываем ДОСЛОВНО, без модели (строго по тексту автора)
    ut = (user_text or "").strip()
    if ut and platform in VERBATIM:
        return {"platform": platform, "data": _coerce_arrays(verbatim_layout(platform, ut, count))}
    if not API_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    tool = {"name": "publish_content", "description": "Вернуть готовый контент строго по схеме платформы.",
            "input_schema": SCHEMAS[platform]}
    max_tokens = 16000 if platform in ("reels", "shorts", "tiktok", "youtube_long", "content_plan", "audience", "scriptcheck") else 6000
    um = build_user(topic, platform, lang, user_text)
    if platform == "stories" and count and count > 0:
        um += ((" Сделай РОВНО %d кадров сторис." % count) if lang != "en" else (" Make EXACTLY %d story frames." % count))
    payload = {
        "model": MODEL, "max_tokens": max_tokens,
        "system": _cached_system(build_system(platform, profile, avoid, voice, liked, disliked, trends, lang, user_text, audience, brief), lang),
        "messages": [{"role": "user", "content": um}],
        "tools": [tool], "tool_choice": {"type": "tool", "name": "publish_content"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read().decode("utf-8"))
    for b in d.get("content", []):
        if b.get("type") == "tool_use":
            data = _coerce_arrays(_dash(b.get("input", {})))
            if not data:
                raise RuntimeError("empty tool input (stop_reason=%s)" % d.get("stop_reason"))
            # reels: модель иногда отдаёт captions строкой из нескольких строк - разложим в список
            if platform == "reels" and isinstance(data.get("captions"), str):
                data["captions"] = [c.strip() for c in re.split(r"\n+", data["captions"]) if c.strip()]
            return {"platform": platform, "data": data}
    raise RuntimeError("no tool_use in response (stop_reason=%s)" % d.get("stop_reason"))


def reels_deep(idea: str, hook: str, scenario: str = "", profile: dict | None = None,
               lang: str = "ru", brief: dict | None = None, audience: str | None = None,
               voice: str | None = None) -> dict:
    """Развернуть ОДНУ идею Reels в полный глубокий сценарий (формат _reels_deep)."""
    if not API_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    tool = {"name": "publish_content", "description": "Вернуть один глубокий сценарий Reels строго по схеме.",
            "input_schema": _reels_deep}
    system = build_system("reels_deep", profile, lang=lang, audience=audience, voice=voice, brief=brief)
    if lang == "en":
        um = ("Expand THIS Reels idea into ONE full, deep script strictly by the format.\n"
              "Idea: " + (idea or "") + "\nHook: " + (hook or "") +
              (("\nDraft scenario: " + scenario) if scenario else "") +
              "\nKeep the author's voice and the brief. Build the whole script around exactly this idea.")
    else:
        um = ("Разверни ЭТУ идею Reels в ОДИН полный глубокий сценарий строго по формату.\n"
              "Идея: " + (idea or "") + "\nХук: " + (hook or "") +
              (("\nЧерновик сценария: " + scenario) if scenario else "") +
              "\nСохрани голос автора и бриф. Весь сценарий строй строго вокруг этой идеи.")
    payload = {"model": MODEL, "max_tokens": 16000, "system": _cached_system(system, lang),
               "messages": [{"role": "user", "content": um}],
               "tools": [tool], "tool_choice": {"type": "tool", "name": "publish_content"}}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read().decode("utf-8"))
    for b in d.get("content", []):
        if b.get("type") == "tool_use":
            data = _coerce_arrays(_dash(b.get("input", {})))
            if not data:
                raise RuntimeError("empty tool input (stop_reason=%s)" % d.get("stop_reason"))
            if isinstance(data.get("captions"), str):
                data["captions"] = [c.strip() for c in re.split(r"\n+", data["captions"]) if c.strip()]
            return {"data": data}
    raise RuntimeError("no tool_use in reels_deep response (stop_reason=%s)" % d.get("stop_reason"))


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
