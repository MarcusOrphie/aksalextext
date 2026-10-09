# -*- coding: utf-8 -*-
"""
Шажок - Telegram-бот: голос/текст -> один 21-дневный эксперимент.
- Оплата проверяется через access.has_course(email) (та же система, что у курса).
- Хранилище: SQLite на дроплете.
- Разбор свободной речи: Claude (Haiku). Голос: локальный faster-whisper (грузится по требованию).
Секреты берутся из окружения (systemd EnvironmentFile), в git не попадают.
"""
import os, sys, json, time, re, gc, sqlite3, logging, subprocess, tempfile, datetime
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
# Ежедневный контроль: напоминание отправляется раз в сутки в это время по МСК
MSK_OFFSET = int(os.environ.get("MSK_OFFSET", "3"))
REMIND_HOUR = int(os.environ.get("REMIND_HOUR_MSK", "20"))
REMIND_MIN = int(os.environ.get("REMIND_MIN", "0"))

# переиспользуем access.py из бэкенда кабинета (проверка оплаты)
sys.path.insert(0, "/opt/zalihvat-app/backend")
try:
    import access
except Exception as e:
    log.error("access import failed: %r", e)
    access = None

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

SYS = (
 "Ты - умный Telegram-бот «Шажок». Помогаешь человеку провести ОДИН жизненный эксперимент за 21 день маленькими "
 "шажками. Человек пишет тебе текстом или наговаривает голосом. Говоришь коротко, по-доброму, на «ты». "
 "Никогда не используешь длинное тире, только дефис (-). Не используешь слово «гипотеза» - только «шажок».\n\n"
 "На вход тебе дают текущее СОСТОЯНИЕ (JSON) и сообщение пользователя (текст или расшифрованный голос). "
 "Ты понимаешь, что хочет человек, обновляешь состояние и отвечаешь ему сообщением.\n\n"
 "Весь эксперимент ведётся по простой формуле из 4 блоков:\n"
 "ШАЖОК 1 (настройка): Я хочу (цель) · Мой шажок (маленькое ежедневное действие) · "
 "Смотрю на (что измеряем: время, число - что можно измерить) · Сейчас (как сейчас, числом) · Хочу (цель, числом).\n"
 "КАЖДЫЙ ДЕНЬ: Что сделано (как прошёл шажок сегодня/вчера) · Результат (что получилось) · "
 "Что-то важное (что выяснил по результатам шажка).\n"
 "РАЗ В НЕДЕЛЮ: Изменения (что изменилось за неделю) · Что поменять (что подкрутить в шажке, чтобы всё получилось).\n"
 "В КОНЦЕ (21 день): Было (из «Шажок 1» - поле Сейчас) · Стало (финальный результат или среднее) · "
 "Что делаем (Продолжить / Изменить / Остановить).\n\n"
 "Схема состояния (JSON):\n"
 "{\n"
 '  "stage": "setup" | "running" | "done",\n'
 '  "goal": "Я хочу: цель простыми словами",\n'
 '  "step": "Мой шажок: маленькое ежедневное действие",\n'
 '  "metric": "Смотрю на: что измеряем (одно число или время)",\n'
 '  "baseline": "Сейчас: как сейчас, числом",\n'
 '  "target": "Хочу: цель за 21 день, числом",\n'
 '  "start": "дд.мм.гггг", "finish": "дд.мм.гггг",\n'
 '  "log": [ {"day": 1, "date": "дд.мм", "done": "что сделано", "result": "результат", "insight": "что-то важное"} ],\n'
 '  "retros": [ {"week": 1, "changes": "что изменилось", "adjust": "что поменять"} ],\n'
 '  "final": {"was": "", "now": "", "decision": "продолжить|изменить|остановить|"}\n'
 "}\n\n"
 "Правила:\n"
 "- Если «Шажок 1» ещё не собран (пустые goal/step/metric) - веди по шагам, ПО ОДНОМУ вопросу за раз, строго в порядке "
 "формулы: Я хочу -> Мой шажок -> Смотрю на -> Сейчас -> Хочу -> сроки (старт сегодня, финиш +21 день). "
 "Будь конкретным: предлагай готовые формулировки, не заставляй думать с нуля. Шажок делай настолько маленьким, "
 "чтобы его было невозможно не сделать.\n"
 "- Когда «Шажок 1» собран - stage=\"running\". Принимай ежедневные записи: добавляй в log запись за сегодня "
 "(day по порядку: что сделано, результат числом, что-то важное). Коротко поддержи. Если пропустил - это не провал, "
 "попроси записать, что помешало, и предложи, что поменять.\n"
 "- Раз в ~7 дней предлагай итог недели (что изменилось / что поменять) и записывай в retros.\n"
 "- На «статус» - кратко по формуле: Я хочу, Мой шажок, день X из 21, Сейчас -> как сейчас метрика против baseline.\n"
 "- В конце (день 21) заполни final (Было из baseline, Стало - финал) и помоги выбрать decision "
 "(продолжить/изменить/остановить), stage=\"done\".\n"
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
    c.execute("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)")
    c.commit(); c.close()

def meta_get(key, default=None):
    c = db(); r = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone(); c.close()
    return r["value"] if r else default

def meta_set(key, value):
    c = db()
    c.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))
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

# ---------- ежедневный контроль (напоминания) ----------
def now_msk():
    return datetime.datetime.utcnow() + datetime.timedelta(hours=MSK_OFFSET)

def _logged_today(state, today_ddmm):
    try:
        for e in (state.get("log") or []):
            if str(e.get("date", "")).strip() == today_ddmm:
                return True
    except Exception:
        pass
    return False

def _past_finish(state, today):
    fin = str(state.get("finish") or "").strip()
    try:
        d = datetime.datetime.strptime(fin, "%d.%m.%Y").date()
        return today.date() >= d
    except Exception:
        return False

def maybe_send_reminders():
    """Раз в сутки после REMIND_HOUR по МСК: пинг активным участникам, кто сегодня ещё не отметился."""
    t = now_msk()
    today_full = t.strftime("%d.%m.%Y")
    if meta_get("last_remind_date") == today_full:
        return
    if (t.hour, t.minute) < (REMIND_HOUR, REMIND_MIN):
        return
    today_ddmm = t.strftime("%d.%m")
    c = db(); rows = c.execute("SELECT tg_id, state FROM users WHERE verified=1").fetchall(); c.close()
    sent = 0
    for r in rows:
        try:
            st = json.loads(r["state"] or "{}")
        except Exception:
            st = {}
        if st.get("stage") != "running":
            continue
        try:
            if _past_finish(st, t):
                send(r["tg_id"], "21 день позади - пора подвести итог! 🎯\n\n"
                                 "Расскажи: что в итоге со «Смотрю на» (было -> стало)? Что реально сработало, а что нет? "
                                 "Я помогу собрать честный вывод и выбрать следующий шажок.")
                sent += 1
            elif not _logged_today(st, today_ddmm):
                send(r["tg_id"], "Как прошёл твой шажок сегодня? 🌱\n\n"
                                 "Напиши или наговори голосом: что сделал, какой результат и что важного заметил. "
                                 "Пропустил - просто скажи, что помешало, это тоже данные.")
                sent += 1
        except Exception as e:
            log.error("remind to %s fail: %r", r["tg_id"], e)
    meta_set("last_remind_date", today_full)
    log.info("daily reminders sent: %d", sent)

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
            send(chat, "С возвращением! Пиши или наговаривай голосом - я веду твой шажок.")
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
                send(chat, "Доступ подтверждён!\n"
                           "Давай настроим твой шажок, расскажи по шаблону ниже или вставь сюда информацию по твоему шажку:\n\n"
                           "Шажок 1\n"
                           "Я хочу: твоя цель\n"
                           "Мой шажок: твой шажок, который прописывали ранее\n"
                           "Смотрю на: время, число - что-то, что можно измерить в изменениях\n"
                           "Сейчас: нынешняя ситуация в числовом выражении\n"
                           "Хочу: цель в числовом выражении")
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
    if low in ("sbros", "сброс", "reset"):
        upsert(tgid, state="{}")
        send(chat, "Шажок сброшен!\n"
                   "Расскажи свой новый шажок по шаблону ниже и начнём заново:\n\n"
                   "Я хочу: твоя цель\n"
                   "Мой шажок: твой шажок, который прописывали ранее\n"
                   "Смотрю на: время, число - что-то, что можно измерить в изменениях\n"
                   "Сейчас: нынешняя ситуация в числовом выражении\n"
                   "Хочу: цель в числовом выражении")
        return
    if low in ("статус", "status"):
        user_text = "Покажи краткий статус по формуле: Я хочу, Мой шажок, какой день из 21, как идёт метрика против «Сейчас»."

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
    tg("setMyCommands", commands=[
        {"command": "start", "description": "Начать"},
        {"command": "status", "description": "Как проходит твой шажок"},
        {"command": "sbros", "description": "Начать новый шажок"},
    ])
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
        try:
            maybe_send_reminders()
        except Exception as e:
            log.error("reminders error: %r", e)

if __name__ == "__main__":
    main()
