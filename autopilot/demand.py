# -*- coding: utf-8 -*-
"""
Сбор поискового спроса для выбора высокочастотных тем блога.

Запуск:
    python3 autopilot/demand.py "нейросети для" "как начать" ...
    python3 autopilot/demand.py --seeds autopilot/seeds.txt

Что делает:
1. Пробует Яндекс.Вордстат. Без авторизации он данные не отдаёт, поэтому
   скрипт честно пишет wordstat: unavailable и не выдумывает частотности.
2. Берёт поисковые подсказки Яндекса и Google. Подсказки ранжируются по
   реальной популярности запроса, поэтому позиция в выдаче - рабочий
   прокси частотности.
3. Считает score: чем выше позиция и чем больше движков подтвердили фразу,
   тем выше. Печатает готовый топ кандидатов.

Числа score - это внутренний рейтинг, НЕ показы в месяц. В статьи их не пишем.
"""
import sys, json, urllib.request, urllib.parse

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
TIMEOUT = 20

def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()

def _parse_suggest(raw):
    """Оба движка отдают ["запрос", ["подсказка", ...], ...]."""
    for enc in ("utf-8", "cp1251"):
        try:
            data = json.loads(raw.decode(enc))
            break
        except Exception:
            data = None
    if not isinstance(data, list) or len(data) < 2 or not isinstance(data[1], list):
        return []
    return [s for s in data[1] if isinstance(s, str)]

def yandex_suggest(q):
    url = ("https://suggest.yandex.ru/suggest-ff.cgi?part=%s&uil=ru&v=4&lr=213"
           % urllib.parse.quote(q))
    try:
        return _parse_suggest(_get(url))
    except Exception as e:
        print("  ! yandex suggest: %s" % e, file=sys.stderr)
        return []

def google_suggest(q):
    url = ("https://suggestqueries.google.com/complete/search?client=firefox&hl=ru&gl=ru&q=%s"
           % urllib.parse.quote(q))
    try:
        return _parse_suggest(_get(url))
    except Exception as e:
        print("  ! google suggest: %s" % e, file=sys.stderr)
        return []

def wordstat_available():
    """Вордстат закрыт логином. Проверяем и сообщаем честно."""
    try:
        body = _get("https://wordstat.yandex.ru/api/v1/search")
        return b'"count"' in body
    except Exception:
        return False

def collect(seeds):
    scores, hits, first_seen = {}, {}, {}
    for seed in seeds:
        for engine, fn in (("y", yandex_suggest), ("g", google_suggest)):
            for pos, phrase in enumerate(fn(seed)):
                p = phrase.strip().lower()
                if len(p) < 8 or p == seed.strip().lower():
                    continue
                scores[p] = scores.get(p, 0) + max(1, 12 - pos)
                hits.setdefault(p, set()).add(engine)
                first_seen.setdefault(p, seed)
    rows = [(p, s * (2 if len(hits[p]) > 1 else 1), "".join(sorted(hits[p])), first_seen[p])
            for p, s in scores.items()]
    rows.sort(key=lambda r: -r[1])
    return rows

def main():
    args = sys.argv[1:]
    if args[:1] == ["--seeds"]:
        with open(args[1], encoding="utf-8") as f:
            seeds = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    else:
        seeds = args
    if not seeds:
        print("usage: demand.py \"фраза\" [\"фраза\" ...] | --seeds file", file=sys.stderr)
        return 2
    print("wordstat: %s" % ("ok" if wordstat_available() else "unavailable (нужен логин Яндекса)"))
    rows = collect(seeds)
    if not rows:
        print("DEMAND: 0 кандидатов (подсказки недоступны)")
        return 1
    print("DEMAND: %d кандидатов по %d сидам\n" % (len(rows), len(seeds)))
    print("%-5s %-6s %s" % ("score", "движ.", "запрос"))
    for phrase, score, engines, seed in rows[:40]:
        print("%-5d %-6s %s" % (score, engines, phrase))
    return 0

if __name__ == "__main__":
    sys.exit(main())
