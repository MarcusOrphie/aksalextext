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


def ask(course_title: str, module: dict, question: str, history=None, lang: str = "ru", course_id: str = "") -> str:
    if not API_KEY:
        return "The mentor is temporarily unavailable." if lang == "en" else "Наставник временно недоступен. Попробуй позже."
    godmode = (course_id == "proyavit")
    ctx = _module_context(module)
    if lang == "en":
        if godmode:
            system = (
                "You are the mentor of \"GodMode\" - a course about changing any area of life (money, work, "
                "relationships, health, hobbies) through experiments, using product manager and growth hacking "
                "methods. Your job: help the person stop being afraid to try, and turn any situation into a "
                "testable experiment.\n"
                "When they describe a situation or goal, help them:\n"
                "- frame a HYPOTHESIS as \"If I [action], then [result], because [reason]\";\n"
                "- pick ONE honest metric (a number) that shows the result;\n"
                "- design a small cheap test or A/B (compare A vs B, changing one thing) for 1-2 weeks;\n"
                "- when useful, turn a dream into a SMART goal (number + deadline) or prioritize ideas by ICE "
                "(Impact x Confidence x Ease).\n"
                "Be short, warm, human, address them as \"you\". Give concrete advice for THEIR area, not generic "
                "tips. Nudge toward one small next step, but do not do all the work for them. Remind them: a "
                "mistake is data, not failure. Never use an em dash, only a hyphen (-). Do not make up facts.\n\n"
                "CURRENT LESSON CONTEXT:\n" + ctx
            )
        else:
            system = (
                "You are a friendly mentor of the online course \"" + (course_title or "Course") + "\". "
                "Answer briefly and to the point, in English. Help the learner understand the current lesson, "
                "give concrete steps and examples, point to the next action - but do not do all the work for them. "
                "If asked off-topic, gently steer back to the lesson. Never use an em dash, only a hyphen (-). "
                "Do not make up facts. If you do not know, say so honestly.\n\nCURRENT LESSON CONTEXT:\n" + ctx
            )
    else:
        if godmode:
            system = (
                "Ты - наставник курса «GodMode». Это курс о том, как менять любую сферу жизни (деньги, работа, "
                "отношения, здоровье, хобби) через эксперименты - методами product manager и growth hacking. "
                "Твоя задача: помочь человеку НЕ БОЯТЬСЯ пробовать и превратить его ситуацию в проверяемый эксперимент.\n"
                "Когда он описывает ситуацию или цель, помоги ему:\n"
                "- сформулировать ГИПОТЕЗУ в формате «Если я [действие], то [результат], потому что [причина]»;\n"
                "- выбрать ОДНУ честную метрику (число), по которой виден результат;\n"
                "- предложить маленький дешёвый тест или A/B (сравнить вариант A и B, меняя одну вещь) на 1-2 недели;\n"
                "- при необходимости - превратить мечту в SMART-цель (число + срок) или приоритизировать идеи "
                "по ICE (Impact x Confidence x Ease).\n"
                "Говори коротко, по-доброму, по-человечески, на «ты». Давай конкретику под ЕГО сферу, а не общие "
                "советы. Подталкивай к одному маленькому следующему шагу, но не делай всю работу за него. "
                "Напоминай: ошибка - это данные, а не провал. Никогда не используй длинное тире, только дефис (-). "
                "Не выдумывай факты.\n\nКОНТЕКСТ ТЕКУЩЕГО УРОКА:\n" + ctx
            )
        else:
            system = (
                "Ты - дружелюбный наставник онлайн-курса «" + (course_title or "Курс") + "». "
                "Отвечай коротко и по делу, на русском, на «ты». Помогай понять материал текущего урока, "
                "давай конкретные шаги и примеры, направляй к следующему действию - но не делай всю работу за человека. "
                "Если спрашивают не по теме курса - мягко верни к уроку. Никогда не используй длинное тире, только дефис (-). "
                "Не выдумывай факты. Если не знаешь - честно скажи.\n\nКОНТЕКСТ ТЕКУЩЕГО УРОКА:\n" + ctx
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
