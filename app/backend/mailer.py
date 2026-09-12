# -*- coding: utf-8 -*-
"""Отправка транзакционных писем через Resend (напрямую с бэкенда).
User-Agent обязателен: Cloudflare перед api.resend.com режет дефолтный python-urllib."""
import os, json, base64, logging, urllib.request, urllib.error

RESEND_KEY = os.environ.get("RESEND_API_KEY", "").strip()
MAIL_FROM = os.environ.get("MAIL_FROM", "Залихват <no-reply@aksalex.com>")
CABINET = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")
GUIDES_DIR = os.environ.get("GUIDES_DIR", "/opt/zalihvat-app/guides")


def send(to: str, subject: str, html: str, attachments=None):
    if not RESEND_KEY:
        logging.error("mailer: RESEND_API_KEY не задан")
        return
    payload = {"from": MAIL_FROM, "to": [to], "subject": subject, "html": html}
    atts = []
    for a in (attachments or []):
        path = a.get("path")
        if path and os.path.exists(path):
            with open(path, "rb") as f:
                atts.append({"filename": a.get("filename") or os.path.basename(path),
                             "content": base64.b64encode(f.read()).decode()})
        else:
            logging.error("mailer: attachment not found %s", path)
    if atts:
        payload["attachments"] = atts
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails", data=body, method="POST",
        headers={"Authorization": "Bearer " + RESEND_KEY, "Content-Type": "application/json",
                 "User-Agent": "curl/8.4.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        logging.error("mailer HTTP %s: %s", e.code, e.read().decode(errors="replace")[:300])
    except Exception as e:
        logging.error("mailer failed: %r", e)


def _welcome_html():
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Nunito:wght@600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#faf5ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ec;">
<tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
    <tr><td style="padding:6px 4px 18px;font-family:'Oswald','Arial Black',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:20px;color:#151210;">
      <img src="https://aksalex.com/apple-touch-icon.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid #151210;margin-right:9px;"> ЗАЛИХВАТ
    </td></tr>
    <tr><td style="background:#fffdf8;border:3px solid #151210;border-radius:18px;padding:34px 30px;box-shadow:8px 8px 0 #ff7f50;">
      <div style="font-family:'Oswald',Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:2px;font-size:12px;color:#e85f2c;">Контент-машина</div>
      <h1 style="margin:8px 0 12px;font-family:'Oswald','Arial Black',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:30px;line-height:1.05;color:#151210;">Добро пожаловать!</h1>
      <p style="margin:0 0 22px;font-family:'Nunito',Arial,sans-serif;font-size:16px;line-height:1.6;color:#2c2621;font-weight:600;">Ты в Залихвате. Расскажи в двух словах о своём блоге - и собери первый готовый пост за пару минут.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background:#ff7f50;border:3px solid #151210;">
        <a href="{CABINET}" style="display:inline-block;padding:14px 30px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:16px;letter-spacing:1px;color:#faf5ec;text-decoration:none;">Открыть кабинет →</a>
      </td></tr></table>
      <p style="margin:22px 0 0;font-family:'Nunito',Arial,sans-serif;font-size:14px;line-height:1.55;color:#4a443d;font-weight:600;">Внутри - посты, сторис, сценарии и карусели-картинки под твою тему и с твоим стилем. Остаётся выложить.</p>
    </td></tr>
    <tr><td style="padding:18px 6px;font-family:'Nunito',Arial,sans-serif;font-size:12px;color:#7b7168;font-weight:600;">
      Залихват · <strong style="color:#e85f2c;">Саша Аксенов</strong> · <a href="https://aksalex.com" style="color:#7b7168;text-decoration:underline;">aksalex.com</a><br>
      <span style="color:#9a8f83;">Аксенов Александр Андреевич · ИНН 773102096413</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""


def send_welcome(email: str):
    send(email, "Добро пожаловать в Залихват", _welcome_html())


GUIDES = {
    "start": {"file": "start.pdf", "title": "С чего начать блог с AI",
              "desc": "Пошаговый старт: ниша, идеи, автоматизация - и первый ролик уже на этой неделе."},
    "audit": {"file": "instagram-audit.pdf", "title": "Анализ твоего Instagram",
              "desc": "Готовый промпт: Claude открывает твой живой профиль и выдаёт беспощадный разбор - скоры, переписанное bio, хуки и план на 7 дней."},
    "formats": {"file": "formats.pdf", "title": "30 форматов рилзов",
                "desc": "6 категорий и 30 готовых форматов - выбирай, подставляй тему и снимай."},
    "prompts": {"file": "prompts.pdf", "title": "Гайд: промпты для контента",
                "desc": "6 профи-промптов для блога: идеи, хуки, сценарии и слайды на нейросети."},
    "crosspost": {"file": "crosspost.pdf", "title": "Кросспостинг: 1 бот - 3 площадки",
                  "desc": "Автопостинг с нуля: кидаешь ролик в Telegram - он сам уходит в YouTube, TikTok и ВК. 8 шагов и готовые фразы для Claude, всё делает он сам."},
}


def send_bonus_guide(email: str) -> bool:
    """Бесплатный гайд-бонус подписчику."""
    g = GUIDES["start"]
    path = os.path.join(GUIDES_DIR, g["file"])
    send(email, "Бонус к подписке: " + g["title"], _guide_html(g["title"], g["desc"]),
         attachments=[{"path": path, "filename": g["file"]}])
    return True


def _guide_html(title: str, desc: str) -> str:
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf5ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ec;"><tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
    <tr><td style="padding:6px 4px 18px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:20px;color:#151210;">
      <img src="https://aksalex.com/apple-touch-icon.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid #151210;margin-right:9px;"> ЗАЛИХВАТ</td></tr>
    <tr><td style="background:#fffdf8;border:3px solid #151210;border-radius:18px;padding:34px 30px;box-shadow:8px 8px 0 #ff7f50;">
      <div style="font-family:'Oswald',Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:2px;font-size:12px;color:#e85f2c;">Спасибо за покупку</div>
      <h1 style="margin:8px 0 12px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:26px;line-height:1.08;color:#151210;">{title}</h1>
      <p style="margin:0 0 18px;font-family:'Nunito',Arial,sans-serif;font-size:16px;line-height:1.6;color:#2c2621;font-weight:600;">{desc}</p>
      <p style="margin:0;font-family:'Nunito',Arial,sans-serif;font-size:15px;line-height:1.6;color:#2c2621;font-weight:700;">Гайд во вложении к этому письму (PDF). Приятного пользования!</p>
      <p style="margin:18px 0 0;font-family:'Nunito',Arial,sans-serif;font-size:14px;line-height:1.55;color:#4a443d;font-weight:600;">Хочешь весь поток контента на автопилоте - загляни в <a href="{CABINET}" style="color:#e85f2c;">кабинет Залихвата</a>.</p>
    </td></tr>
    <tr><td style="padding:18px 6px;font-family:'Nunito',Arial,sans-serif;font-size:12px;color:#7b7168;font-weight:600;">
      Залихват · <strong style="color:#e85f2c;">Саша Аксенов</strong> · <a href="https://aksalex.com" style="color:#7b7168;text-decoration:underline;">aksalex.com</a></td></tr>
  </table></td></tr></table></body></html>"""


def send_guide(email: str, guide: str) -> bool:
    g = GUIDES.get(guide)
    if not g:
        logging.error("mailer.send_guide unknown guide %s", guide)
        return False
    path = os.path.join(GUIDES_DIR, g["file"])
    send(email, "Твой гайд: " + g["title"], _guide_html(g["title"], g["desc"]),
         attachments=[{"path": path, "filename": g["file"]}])
    return True


def send_sub_activated(email: str, plan_label: str):
    html = f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf5ec;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding:6px 4px 18px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:20px;color:#151210;">
  <img src="https://aksalex.com/apple-touch-icon.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:50%;border:2px solid #151210;margin-right:9px;"> ЗАЛИХВАТ</td></tr>
<tr><td style="background:#fffdf8;border:3px solid #151210;border-radius:18px;padding:34px 30px;box-shadow:8px 8px 0 #ff7f50;">
  <div style="font-family:'Oswald',Arial,sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:2px;font-size:12px;color:#e85f2c;">Тариф {plan_label} активирован</div>
  <h1 style="margin:8px 0 12px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:26px;color:#151210;">Спасибо, что подключились к Залихвату!</h1>
  <p style="margin:0 0 20px;font-family:'Nunito',Arial,sans-serif;font-size:16px;line-height:1.6;color:#2c2621;font-weight:600;">Заходите в кабинет с той же почтой и желаю удачи в ведении блога!</p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background:#ff7f50;border:3px solid #151210;">
    <a href="{CABINET}" style="display:inline-block;padding:14px 30px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:16px;color:#faf5ec;text-decoration:none;">Открыть кабинет →</a></td></tr></table>
</td></tr></table></td></tr></table></body></html>"""
    send(email, "Тариф " + plan_label + " активирован - Залихват", html)
