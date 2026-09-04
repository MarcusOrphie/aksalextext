# -*- coding: utf-8 -*-
"""Отправка транзакционных писем через Resend (напрямую с бэкенда).
User-Agent обязателен: Cloudflare перед api.resend.com режет дефолтный python-urllib."""
import os, json, logging, urllib.request, urllib.error

RESEND_KEY = os.environ.get("RESEND_API_KEY", "").strip()
MAIL_FROM = os.environ.get("MAIL_FROM", "Залихват <no-reply@aksalex.com>")
CABINET = os.environ.get("ALLOWED_ORIGIN", "https://app.aksalex.com")


def send(to: str, subject: str, html: str):
    if not RESEND_KEY:
        logging.error("mailer: RESEND_API_KEY не задан")
        return
    body = json.dumps({"from": MAIL_FROM, "to": [to], "subject": subject, "html": html}).encode("utf-8")
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
      <p style="margin:0 0 22px;font-family:'Nunito',Arial,sans-serif;font-size:16px;line-height:1.6;color:#2c2621;font-weight:600;">Ты в Залихвате. Заходи в кабинет, укажи нишу и выбери платформу - первый готовый контент получишь за секунды.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background:#ff7f50;border:3px solid #151210;">
        <a href="{CABINET}" style="display:inline-block;padding:14px 30px;font-family:'Oswald',Arial,sans-serif;font-weight:700;text-transform:uppercase;font-size:16px;letter-spacing:1px;color:#faf5ec;text-decoration:none;">Открыть кабинет →</a>
      </td></tr></table>
      <p style="margin:22px 0 0;font-family:'Nunito',Arial,sans-serif;font-size:14px;line-height:1.55;color:#4a443d;font-weight:600;">Внутри - идеи, хуки, сценарии и тексты под Reels, Shorts, YouTube, TikTok, карусели, посты и Stories.</p>
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
