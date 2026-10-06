# -*- coding: utf-8 -*-
"""
Шажок - Telegram-бот: голос/текст -> один 21-дневный эксперимент.
- Оплата проверяется через access.has_course(email) (та же система, что у курса).
- Хранилище: SQLite на дроплете.
- Разбор свободной речи: Claude (Haiku). Голос: локальный faster-whisper (грузится по требованию).
Секреты берутся из окружения (systemd EnvironmentFile), в git не попадают.
"""
import os, sys, json, time, re, gc, sqlite3, logging, subprocess, tempfile
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("shazhok-bot")

TOKEN = os.environ.get("TELEGRAM_TOKEN", "").strip()
if not TOKEN:
    log.error("no TELEGRAM_TOKEN"); sys.exit(1)
API = "https://api.telegram.org/bot" + TOKEN
FILEAPI = "https://api.telegram.org/file/bot" + TOKEN

DB_PATH = os.environ.get("SHAZHOK_DB", "/opt/shazhok-bot/bot.db")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
CLAUDE_MODEL = os.environ.get("BOT_MODEL", os.environ.get("TUTOR_MODEL", "claude-haiku-4-5")).strip()
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small").strip()
CABINET = os.environ.get("CABINET_URL", "https://app.aksalex.com").rstrip("/")
COURSE_ID = "proyavit"

# переиспользуем access.py из бэкенда кабинета (проверка оплаты)
sys.path.insert(0, "/opt/zalihvat-app/backend")
try:
    import access
except Exception as e:
    log.error("access import failed: %r", e)
    access = None

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

SYS = (
 "Ты - умный Telegram-бот «Шажок». Помогаешь человеку провести ОДИН жизненный эксперимент за 21 день по методу: "
 "цель -> гипотеза -> маленький ежедневный шаг (шажок) -> метрика -> недельное ретро -> честный вывод. "
 "Говоришь коротко, по-доброму, на «ты». Никогда не используешь длинное тире, только дефис (-).\n\n"
 "На вход тебе дают текущее СОСТОЯНИЕ (JSON) и сообщение пользователя (текст или расшифрованный голос). "
 "Ты понимаешь, что хочет человек, обновляешь состояние и отвечаешь ему сообщением.\n\n"
 "Схема состояния:\n"
 "{\n"
 '  "stage": "setup" | "running" | "done",\n'
 '  "sphere": "сфера (здоровье/отношения/деньги/...)",\n'
 '  "goal": "цель простыми словами",\n'
 '  "hypothesis": "по шаблону: Я хочу [изменение]. Если я буду [маленькое действие] в течение 21 дня, то [показатель] изменится с [старт] до [цель]",\n'
 '  "metric": "что меряем, одно число",\n'
 '  "baseline": "как сейчас",\n'
 '  "target": "цель за 21 день",\n'
 '  "start": "дд.мм.гггг", "finish": "дд.мм.гггг",\n'
 '  "log": [ {"day": 1, "date": "дд.мм", "done": true, "metric": "...", "feel": "...", "note": "..."} ],\n'
 '  "retros": [ {"week": 1, "worked": "", "failed": "", "change": ""} ],\n'
 '  "decision": "продолжить|изменить|остановить|"\n'
 "}\n\n"
 "Правила:\n"
 "- Если эксперимент не настроен (нет hypothesis) - веди по шагам, ПО ОДНОМУ вопросу за раз: сфера/цель -> "
 "помоги собрать гипотезу по шаблону -> метрика и baseline (как сейчас) -> сроки (старт сегодня, финиш +21 день). "
 "Будь конкретным: предлагай формулировки, не заставляй думать с нуля.\n"
 "- Когда всё настроено - stage=\"running\". Принимай ежедневные записи: добавляй в log запись за сегодня "
 "(day по порядку, сделал/не сделал, метрика числом, самочувствие, вывод на завтра). Коротко поддержи.\n"
 "- Раз в ~7 дней предлагай ретро (что сработало/не сработало/что меняю) и записывай в retros.\n"
 "- На «статус» - кратко: цель, гипотеза, день X из 21, как идёт метрика против baseline.\n"
 "- В конце (день 21) помоги сделать вывод и decision (продолжить/изменить/остановить), stage=\"done\".\n"
 "- ВСЕГДА сохраняй уже заполненные поля, не теряй данные из log/retros. Меняй только относящееся к сообщению.\n"
 "- Напоминай при случае: ошибка - это данные, а не провал.\n"
 "- Ответ верни СТРОГО как один JSON-объект и ничего вне него: "
 '{"state": <полное обновлённое состояние>, "reply": "<текст пользователю>"}.'
)

# ---------- Telegram ----------
def tg(method, **params):
    try:
        return requests.post(API + "/" + method, json=params, timeout=60).json()
    except Exception as e:
        log.error("tg %s fail: %r", method, e); return {}

def send(chat_id, text):
    for i in range(0, len(text), 3800):
        tg("sendMessage", chat_id=chat_id, text=text[i:i+3800], disable_web_page_preview=True)

def action(chat_id, a="typing"):
    tg("sendChatAction", chat_id=chat_id, action=a)

# ---------- DB ----------
def db():
    c = sqlite3.connect(DB_PATH, timeout=30); c.row_factory = sqlite3.Row; return c

def init_db():
    c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS users(
        tg_id INTEGER PRIMARY KEY, email TEXT, verified INTEGER DEFAULT 0,
        state TEXT DEFAULT '{}', updated TEXT)""")
    c.commit(); c.close()

def get_user(tg_id):
    c = db(); r = c.execute("SELECT * FROM users WHERE tg_id=?", (tg_id,)).fetchone(); c.close(); return r

def upsert(tg_id, **f):
    f["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    c = db()
    exists = c.execute("SELECT 1 FROM users WHERE tg_id=?", (tg_id,)).fetchone()
    if exists:
        sets = ",".join(k + "=?" for k in f)
        c.execute("UPDATE users SET " + sets + " WHERE tg_id=?", (*f.values(), tg_id))
    else:
        f["tg_id"] = tg_id
        c.execute("INSERT INTO users(" + ",".join(f) + ") VALUES(" + ",".join("?" * len(f)) + ")", tuple(f.values()))
    c.commit(); c.close()

# ---------- Whisper (lazy load + unload) ----------
def transcribe(ogg_path):
    wav = ogg_path + ".wav"
    try:
        subprocess.run(["ffmpeg", "-y", "-i", ogg_path, "-ar", "16000", "-ac", "1", wav],
                       check=True, capture_output=True)
    except Exception as e:
        log.error("ffmpeg fail: %r", e); return ""
    text, model = "", None
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
        segs, _ = model.transcribe(wav, language="ru", beam_size=1, vad_filter=True)
        text = " ".join(s.text.strip() for s in segs).strip()
    except Exception as e:
        log.error("whisper fail: %r", e)
    finally:
        del model; gc.collect()
        try: os.remove(wav)
        except Exception: pass
    return text

def download_voice(file_id):
    info = tg("getFile", file_id=file_id)
    path = (info.get("result") or {}).get("file_path")
    if not path:
        return None
    fd, tmp = tempfile.mkstemp(suffix=".oga"); os.close(fd)
    try:
        with requests.get(FILEAPI + "/" + path, stream=True, timeout=120) as r:
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
        return tmp
    except Exception as e:
        log.error("download voice fail: %r", e); return None

# ---------- Claude brain ----------
def claude(state, user_msg):
    if not ANTHROPIC_KEY:
        return state, "Бот временно недоступен (нет ключа модели)."
    body = {"model": CLAUDE_MODEL, "max_tokens": 1500,
            "system": SYS,
            "messages": [{"role": "user",
                          "content": "ТЕКУЩЕЕ СОСТОЯНИЕ (JSON):\n" + json.dumps(state, ensure_ascii=False) +
                                     "\n\nСООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n" + user_msg +
                                     "\n\nВерни только JSON {\"state\":{...},\"reply\":\"...\"}."}]}
    try:
        r = requests.post("https://api.anthropic.com/v1/messages",
                          headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                                   "content-type": "application/json"},
                          data=json.dumps(body, ensure_ascii=False).encode("utf-8"), timeout=90)
        data = r.json()
        out = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    except Exception as e:
        log.error("claude fail: %r", e); return state, "Что-то пошло не так, повтори ещё раз?"
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return state, (out.strip() or "Не понял, повтори?")
    try:
        obj = json.loads(m.group(0))
        return (obj.get("state") if isinstance(obj.get("state"), dict) else state), obj.get("reply", "Ок.")
    except Exception as e:
        log.error("claude json parse: %r | raw=%s", e, out[:300])
        return state, "Немного запутался, переформулируй?"

# ---------- handler ----------
def handle(update):
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return
    chat = msg["chat"]["id"]
    tgid = msg["from"]["id"]
    text = (msg.get("text") or "").strip()
    u = get_user(tgid)

    if text.startswith("/start"):
        if not u:
            upsert(tgid, email=None, verified=0, state="{}")
        if u and u["verified"]:
            send(chat, "С возвращением! Пиши или наговаривай голосом - я веду твой эксперимент.\n"
                       "Команды: /статус - где ты сейчас, /сброс - начать новый эксперимент.")
        else:
            send(chat, "Привет! Это «Шажок» - бот для твоего 21-дневного эксперимента.\n\n"
                       "Чтобы начать, напиши почту, с которой ты оплатил курс.")
        return

    if not (u and u["verified"]):
        em = EMAIL_RE.search(text)
        if em:
            email = em.group(0).lower()
            action(chat)
            paid = bool(access and access.has_course(email, COURSE_ID))
            if paid:
                upsert(tgid, email=email, verified=1, state=(u["state"] if u else "{}"))
                send(chat, "Доступ подтверждён! \n\nДавай настроим твой эксперимент. Расскажи - текстом или голосом - "
                           "что хочешь изменить в жизни? Это может быть здоровье, сон, отношения, деньги, работа, что угодно. "
                           "Начнём с одной темы.")
            else:
                send(chat, "Не нашёл оплату по этой почте. Проверь, что пишешь ту же почту, что в кабинете, "
                           "или оформи доступ: " + CABINET + "/step-by-step")
        else:
            send(chat, "Напиши, пожалуйста, почту, с которой оплачен курс (например, name@mail.ru).")
        return

    # verified -> voice or text
    user_text = text
    v = msg.get("voice") or msg.get("audio")
    if v:
        action(chat)
        send(chat, "Слушаю голосовое, расшифровываю... это займёт несколько секунд.")
        p = download_voice(v["file_id"])
        user_text = transcribe(p) if p else ""
        if p:
            try: os.remove(p)
            except Exception: pass
        if not user_text:
            send(chat, "Не разобрал голосовое. Попробуй ещё раз, чуть ближе к микрофону, или напиши текстом.")
            return
        send(chat, "Расшифровал: «" + user_text + "»")

    if not user_text.strip():
        return

    low = user_text.lower().lstrip("/")
    if low in ("сброс", "reset"):
        upsert(tgid, state="{}")
        send(chat, "Эксперимент сброшен. Расскажи, что хочешь изменить - начнём заново.")
        return
    if low in ("статус", "status"):
        user_text = "Покажи краткий статус моего эксперимента: цель, гипотеза, какой день из 21, как идёт метрика."

    action(chat)
    state = {}
    try:
        state = json.loads(u["state"] or "{}")
    except Exception:
        state = {}
    new_state, reply = claude(state, user_text)
    upsert(tgid, state=json.dumps(new_state, ensure_ascii=False))
    send(chat, reply)

def main():
    init_db()
    tg("deleteWebhook")
    log.info("shazhok-bot started | model=%s | whisper=%s | access=%s", CLAUDE_MODEL, WHISPER_MODEL, bool(access))
    offset = None
    while True:
        try:
            r = requests.get(API + "/getUpdates", params={"timeout": 30, "offset": offset}, timeout=40).json()
            for up in r.get("result", []):
                offset = up["update_id"] + 1
                try:
                    handle(up)
                except Exception as e:
                    log.exception("handle error: %r", e)
        except Exception as e:
            log.error("poll error: %r", e); time.sleep(3)

if __name__ == "__main__":
    main()
