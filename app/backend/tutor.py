# -*- coding: utf-8 -*-
"""ИИ-наставник курса. Дешёвая модель (Haiku). Отвечает по теме текущего урока и направляет."""
import os, json, urllib.request, logging

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
TUTOR_MODEL = os.environ.get("TUTOR_MODEL", "claude-haiku-4-5").strip()


def _module_context(module: dict) -> str:
    if not module:
        return "Общий вопрос по курсу."
    parts = ["Урок: " + str(module.get("title", ""))]
    if module.get("why"):
        parts.append("Смысл: " + module["why"])
    for l in (module.get("lessons") or [])[:6]:
        h = l.get("h", "")
        body = l.get("body", "")
        # грубо снимаем html-теги для контекста
        body = body.replace("</p>", " ").replace("</li>", " ")
        import re
        body = re.sub(r"<[^>]+>", "", body)
        parts.append("- " + h + ": " + body[:400])
    prompts = module.get("prompts") or ([module["prompt"]] if module.get("prompt") else [])
    for p in prompts[:3]:
        parts.append("Промпт «" + str(p.get("title", "")) + "»: " + str(p.get("text", ""))[:300])
    return "\n".join(parts)[:3500]


def ask(course_title: str, module: dict, question: str, history=None, lang: str = "ru") -> str:
    if not API_KEY:
        return "The mentor is temporarily unavailable." if lang == "en" else "Наставник временно недоступен. Попробуй позже."
    if lang == "en":
        system = (
            "You are a friendly mentor of the online AI course \"" + (course_title or "Course") + "\". "
            "Answer briefly and to the point, in English. Help the learner understand the current lesson, "
            "give concrete steps and examples, point to the next action - but do not do all the work for them. "
            "If asked off-topic, gently steer back to the lesson. Never use an em dash, only a hyphen (-). "
            "Do not make up facts. If you do not know, say so honestly.\n\nCURRENT LESSON CONTEXT:\n" + _module_context(module)
        )
    else:
        system = (
            "Ты - дружелюбный наставник онлайн-курса по нейросетям «" + (course_title or "Курс") + "». "
            "Отвечай коротко и по делу, на русском, на «ты». Помогай понять материал текущего урока, "
            "давай конкретные шаги и примеры, направляй к следующему действию - но не делай всю работу за человека. "
            "Если спрашивают не по теме курса - мягко верни к уроку. Никогда не используй длинное тире, только дефис (-). "
            "Не выдумывай факты. Если не знаешь - честно скажи.\n\nКОНТЕКСТ ТЕКУЩЕГО УРОКА:\n" + _module_context(module)
        )
    msgs = []
    for h in (history or [])[-6:]:
        role = h.get("role")
        content = str(h.get("content", ""))[:2000]
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": str(question)[:2000]})
    payload = {"model": TUTOR_MODEL, "max_tokens": 600,
               "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
               "messages": msgs}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode())
        out = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return out or "Не смог сформулировать ответ. Переформулируй вопрос?"
    except Exception as e:
        logging.error("tutor.ask failed: %r", e)
        return "Наставник сейчас не отвечает. Попробуй ещё раз через минуту."
