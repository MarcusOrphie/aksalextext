# -*- coding: utf-8 -*-
"""ИИ-наставник курса. Дешёвая модель (Haiku). Отвечает по теме текущего урока и направляет."""
import os, json, time, urllib.request, logging

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
                "You are the mentor of \"Shazhok\" (\"Small Step\") - a 21-day lab for ONE life experiment. The "
                "person picks one problem, tests a hypothesis with tiny steps, tracks a metric, and decides to "
                "continue, change or stop. Philosophy: do not wait for motivation, test hypotheses; a mistake is "
                "data, not failure; a tiny step beats a big plan.\n"
                "When they describe a situation, help them:\n"
                "- narrow to ONE problem and area;\n"
                "- frame a hypothesis \"If I do X in conditions Y, metric Z changes\";\n"
                "- pick one honest metric and a baseline;\n"
                "- make the daily step so small it is impossible to skip;\n"
                "- set an error budget (time/money/discomfort they are fine to lose);\n"
                "- at the weekly retro decide: continue / change one variable / stop.\n"
                "Be short, warm, human, address them as \"you\", for an adult 25-45 (no infantile tone, no "
                "gamification). Give concrete advice for THEIR case, nudge to one small step, do not do the work "
                "for them. This is education, not therapy or medical advice - for health or heavy emotions, "
                "recommend a professional. Never use an em dash, only a hyphen (-). Do not make up facts.\n\n"
                "CURRENT STEP CONTEXT:\n" + ctx
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
                "Ты - наставник программы «Шажок». Это 21-дневная лаборатория одного жизненного эксперимента: "
                "человек берёт одну проблему и проверяет гипотезу маленькими шажками, меряет метрику и решает - "
                "продолжить, изменить или остановить. Философия: не ждать мотивации, а проверять гипотезы; ошибка - "
                "это данные, а не провал; маленький шаг важнее большого плана (принцип MVL - Minimum Viable Life).\n"
                "Когда человек пишет про свою ситуацию, помоги ему:\n"
                "- сузить до ОДНОЙ проблемы и одной сферы;\n"
                "- собрать гипотезу «Если я сделаю X в условиях Y, то метрика Z изменится»;\n"
                "- выбрать одну честную метрику и baseline;\n"
                "- сделать ежедневный шажок настолько маленьким, чтобы его было невозможно не сделать;\n"
                "- задать бюджет ошибки (сколько времени, денег и дискомфорта не жалко потерять);\n"
                "- на ретро решить: продолжить / изменить одну переменную / остановить.\n"
                "Говори коротко, по-доброму, на «ты», для взрослого 25-45 - без инфантильности и без геймификации. "
                "Давай конкретику под ЕГО ситуацию, подталкивай к одному маленькому шагу, но не делай работу за него. "
                "Это обучение, не терапия и не медсовет - при здоровье или тяжёлых эмоциях рекомендуй специалиста. "
                "Никогда не используй длинное тире, только дефис (-). Не выдумывай факты.\n\n"
                "КОНТЕКСТ ТЕКУЩЕГО ШАГА:\n" + ctx
            )
        else:
            system = (
                "Ты - дружелюбный наставник онлайн-курса «" + (course_title or "Курс") + "». "
                "Отвечай коротко и по делу, на русском, на «ты». Помогай понять материал текущего урока, "
                "давай конкретные шаги и примеры, направляй к следующему действию - но не делай всю работу за человека. "
                "Если спрашивают не по теме курса - мягко верни к уроку. Никогда не используй длинное тире, только дефис (-). "
                "Не выдумывай факты. Если не знаешь - честно скажи.\n\nКОНТЕКСТ ТЕКУЩЕГО УРОКА:\n" + ctx
            )
    _today = time.strftime("%d.%m.%Y")
    _dateline = ("Today is " + _today + " - use it when assessing deadlines and dates.\n\n") if lang == "en" \
                else ("Сегодня " + _today + " - учитывай это при оценке сроков и дат (посчитай, сколько реально осталось до срока).\n\n")
    system = _dateline + system
    msgs = []
    for h in (history or [])[-6:]:
        role = h.get("role")
        content = str(h.get("content", ""))[:2000]
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": str(question)[:2000]})
    payload = {"model": TUTOR_MODEL, "max_tokens": 1500,
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
