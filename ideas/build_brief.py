# -*- coding: utf-8 -*-
"""
Сборка дневного брифа «Кино и Слова» из ideas/brief.json:
- рендер красивой HTML-страницы в site/ideas/<date>.html + обновление site/ideas/index.html
- дозапись в журнал ideas/journal.md (для самообучения, чтобы не повторяться)
- отправка брифа в Telegram-личку (если заданы TG_BOT_TOKEN и TG_CHAT_ID)
Запуск: python3 ideas/build_brief.py ideas/brief.json
"""
import os, sys, re, json, datetime, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SITE = os.path.join(REPO, "site")
OUT = os.path.join(SITE, "ideas")
JOURNAL = os.path.join(HERE, "journal.md")
SITE_URL = "https://aksalex.com"
TG_TOKEN = os.environ.get("TG_BOT_TOKEN", "").strip()
TG_CHAT = os.environ.get("TG_CHAT_ID", "").strip()

def dashes(s):
    return s.replace("—", "-").replace("–", "-") if isinstance(s, str) else s
def clean(o):
    if isinstance(o, str): return dashes(o)
    if isinstance(o, list): return [clean(x) for x in o]
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    return o
def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

CSS = """
:root{--paper:#faf5ec;--paper2:#fffdf8;--ink:#151210;--coral:#ff7f50;--coral-deep:#e85f2c;--coral-soft:#ffe6d8;--muted:#7b7168;--line:#e6ddcd}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:#241f1b;font-family:"Nunito",system-ui,-apple-system,sans-serif;font-weight:600;line-height:1.6;position:relative}
body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;background-image:radial-gradient(rgba(255,127,80,.14) 1.1px,transparent 1.2px);background-size:16px 16px}
.wrap{max-width:820px;margin:0 auto;padding:0 20px 60px;position:relative;z-index:1}
a{color:var(--coral-deep);text-decoration:none}
.top{text-align:center;padding:34px 0 10px;border-bottom:2px solid var(--ink);margin-bottom:24px}
.eyebrow{font-family:"Oswald";font-weight:600;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:var(--coral-deep)}
h1{font-family:"Oswald";font-weight:700;text-transform:uppercase;font-size:40px;color:var(--coral);-webkit-text-stroke:3px var(--ink);text-shadow:5px 5px 0 var(--ink);margin:8px 0 6px;line-height:1}
.date{font-size:14px;color:var(--muted);font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.trend{background:var(--coral-soft);border:2.5px solid var(--ink);border-radius:16px;box-shadow:5px 5px 0 var(--ink);padding:16px 20px;margin:0 0 8px;font-size:16px;color:#2a2015;font-weight:700}
.trend b{color:var(--coral-deep)}
.fav{font-size:14px;color:#3a2f28;font-weight:700;margin:12px 0 6px}
.fav b{color:var(--coral-deep);font-family:"Oswald";text-transform:uppercase;letter-spacing:.02em}
.sech{font-family:"Oswald";font-weight:700;text-transform:uppercase;font-size:26px;color:var(--ink);letter-spacing:.02em;margin:30px 0 14px;display:flex;align-items:center;gap:10px}
.sech span{font-size:14px;color:var(--paper);background:var(--coral);border:2px solid var(--ink);border-radius:999px;padding:2px 12px}
.card{background:var(--paper2);border:3px solid var(--ink);border-radius:20px;box-shadow:8px 8px 0 var(--ink);padding:22px 22px;margin-bottom:20px}
.card .ch{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.card .fmt{font-family:"Oswald";font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.08em;color:var(--coral-deep);border:2px solid var(--coral);border-radius:999px;padding:3px 10px;white-space:nowrap}
.card h3{font-family:"Oswald";font-weight:700;text-transform:uppercase;font-size:21px;color:var(--ink);letter-spacing:.01em;line-height:1.05;flex:1}
.viral{flex:none;width:64px;height:64px;border-radius:14px;background:var(--coral);color:var(--paper);border:2.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.viral b{font-family:"Oswald";font-weight:700;font-size:22px}
.viral small{font-size:9px;letter-spacing:.06em;text-transform:uppercase;opacity:.9}
.row{margin:10px 0}
.row .k{font-family:"Oswald";font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.06em;color:var(--muted)}
.row .v{font-size:15.5px;color:#2c2621}
.hook{background:var(--coral-soft);border-left:5px solid var(--coral);border-radius:8px;padding:8px 12px;font-weight:800;color:#2a2015}
.why{font-size:13px;color:var(--muted);font-weight:700;margin-top:4px}
footer{margin-top:30px;padding-top:18px;border-top:2px solid var(--ink);text-align:center;font-size:13px;color:var(--muted);font-weight:700}
@media(min-width:640px){h1{font-size:52px}}
"""

def card_html(it):
    v = int(it.get("virality", 0))
    return f"""    <div class="card">
      <div class="ch">
        <h3>{esc(it.get('idea',''))}</h3>
        <div class="viral"><b>{v}%</b><small>залёт</small></div>
      </div>
      <div class="row"><span class="fmt">{esc(it.get('format',''))}</span></div>
      <div class="row"><div class="k">Хук</div><div class="v hook">{esc(it.get('hook',''))}</div></div>
      <div class="row"><div class="k">Сценарий</div><div class="v">{esc(it.get('scenario',''))}</div></div>
      <div class="row"><div class="k">Визуал</div><div class="v">{esc(it.get('visual',''))}</div></div>
      <div class="row"><div class="k">Тренд-зацепка</div><div class="v">{esc(it.get('trend_hook',''))}</div></div>
      <div class="why">Почему {v}%: {esc(it.get('virality_reason',''))}</div>
    </div>"""

def render_page(d):
    date = d.get("date")
    cinema = "\n".join(card_html(x) for x in d.get("cinema", []))
    words = "\n".join(card_html(x) for x in d.get("words", []))
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Кино и Слова · идеи на {esc(date)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Nunito:wght@400;600;700;800;900&display=swap">
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="eyebrow">Контент-машина Залихват</div>
    <h1>Кино и Слова</h1>
    <div class="date">10 идей · {esc(date)}</div>
  </div>
  <div class="trend"><b>Тренд дня.</b> {esc(d.get('trend_summary',''))}</div>
  <div class="fav">🏆 Фаворит дня: <b>{esc(d.get('favorite',''))}</b></div>

  <div class="sech">Кино <span>5</span></div>
{cinema}

  <div class="sech">Слова <span>5</span></div>
{words}

  <footer>Контент-машина «Залихват» · сгенерировано {esc(date)}</footer>
</div>
</body>
</html>"""

def update_index(date):
    os.makedirs(OUT, exist_ok=True)
    idx = os.path.join(OUT, "index.html")
    row = f'      <li><a href="/ideas/{date}.html">Идеи на {date}</a></li>\n'
    if os.path.exists(idx):
        html = open(idx, encoding="utf-8").read()
        if f"/ideas/{date}.html" in html:
            return
        html = html.replace("<!--ROWS-->", "<!--ROWS-->\n" + row)
        open(idx, "w", encoding="utf-8").write(html)
    else:
        open(idx, "w", encoding="utf-8").write(
            '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>Кино и Слова · архив идей</title><meta name="robots" content="noindex">'
            '<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;background:#faf5ec;color:#151210}'
            'h1{font-size:24px}a{color:#e85f2c}</style></head><body>'
            '<h1>Кино и Слова · архив идей</h1><ul>\n<!--ROWS-->\n' + row + '</ul></body></html>')

def journal_append(d):
    lines = [f"\n## {d.get('date')}", f"_Тренд:_ {d.get('trend_summary','')[:200]}"]
    for tag, arr in (("Кино", d.get("cinema", [])), ("Слова", d.get("words", []))):
        for it in arr:
            lines.append(f"- [{tag}] {it.get('idea','')} ({it.get('virality','')}%)")
    open(JOURNAL, "a", encoding="utf-8").write("\n".join(lines) + "\n")

def tg_send(text):
    if not (TG_TOKEN and TG_CHAT):
        return "skip (no TG env)"
    def send(t):
        data = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": t, "parse_mode": "HTML",
                                       "disable_web_page_preview": "true"}).encode()
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(
                f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data), timeout=40).read())
            return r.get("ok")
        except Exception as e:
            return f"err {e}"
    # чанкуем по 3900 символов
    out = []
    for chunk in text:
        out.append(str(send(chunk)))
    return ",".join(out)

def tg_text(d):
    def block(tag, arr):
        s = [f"<b>{tag} · 5</b>"]
        for it in arr:
            s.append(f"\n<b>{esc(it.get('idea',''))}</b> — {it.get('virality','')}%\n"
                     f"Хук: {esc(it.get('hook',''))}\n{esc(it.get('scenario',''))}")
        return "\n".join(s)
    head = (f"<b>Кино и Слова · {d.get('date')}</b>\n\nТренд дня: {esc(d.get('trend_summary',''))}\n"
            f"\n🏆 Фаворит: {esc(d.get('favorite',''))}\n\n{SITE_URL}/ideas/{d.get('date')}.html")
    return [head, block("КИНО", d.get("cinema", [])), block("СЛОВА", d.get("words", []))]

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "brief.json")
    d = clean(json.load(open(src, encoding="utf-8")))
    if not d.get("date"):
        d["date"] = datetime.date.today().isoformat()
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, f"{d['date']}.html"), "w", encoding="utf-8").write(render_page(d))
    open(os.path.join(OUT, "latest.html"), "w", encoding="utf-8").write(render_page(d))
    update_index(d["date"])
    journal_append(d)
    res = tg_send(tg_text(d))
    print(f"BUILT ideas {d['date']} | cinema {len(d.get('cinema',[]))} words {len(d.get('words',[]))} | tg: {res}")
    print(f"URL: {SITE_URL}/ideas/{d['date']}.html")

if __name__ == "__main__":
    main()
