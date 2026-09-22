# -*- coding: utf-8 -*-
"""Извлечь из собранной RU-статьи (site/blog/<slug>/index.html) структуру в JSON,
совместимую с article.json (для последующего перевода и сборки EN-версии).
Использование:
    python autopilot/en_extract.py            # все статьи без EN -> autopilot/en_work/<slug>.ru.json
    python autopilot/en_extract.py <slug>     # одна статья
"""
import os, re, sys, json, glob, html

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BLOG = os.path.join(REPO, "site", "blog")
ENBLOG = os.path.join(REPO, "site", "en", "blog")
WORK = os.path.join(HERE, "en_work")


def unesc(s):
    return html.unescape(s or "").strip()


def _attr(html_s, pat):
    m = re.search(pat, html_s)
    return unesc(m.group(1)) if m else ""


def strip_tags(s):
    return unesc(re.sub(r"<[^>]+>", "", s or ""))


def parse_blocks(seg):
    """seg - HTML между <h2> секции и следующим <h2>/faq. Возвращает список блоков."""
    blocks = []
    # токенизируем по верхнеуровневым элементам
    for m in re.finditer(r'<h3>(.*?)</h3>|<blockquote>(.*?)</blockquote>|<ul>(.*?)</ul>|<div class="tablewrap">(.*?)</div>|<p>(.*?)</p>', seg, re.S):
        h3, bq, ul, tbl, p = m.groups()
        if h3 is not None:
            blocks.append({"type": "h3", "text": strip_tags(h3)})
        elif bq is not None:
            blocks.append({"type": "blockquote", "text": strip_tags(bq)})
        elif ul is not None:
            items = [strip_tags(li) for li in re.findall(r"<li>(.*?)</li>", ul, re.S)]
            blocks.append({"type": "ul", "items": items})
        elif tbl is not None:
            headers = [strip_tags(h) for h in re.findall(r"<th>(.*?)</th>", tbl, re.S)]
            rows = []
            for tr in re.findall(r"<tr>(.*?)</tr>", tbl, re.S):
                cells = re.findall(r"<td>(.*?)</td>", tr, re.S)
                if cells:
                    rows.append([strip_tags(c) for c in cells])
            blocks.append({"type": "table", "headers": headers, "rows": rows})
        elif p is not None:
            blocks.append({"type": "p", "text": strip_tags(p)})
    return blocks


def extract(slug):
    idx = os.path.join(BLOG, slug, "index.html")
    if not os.path.isfile(idx):
        return None
    h = open(idx, encoding="utf-8").read()
    title = _attr(h, r"<title>(.*?)</title>")
    meta = _attr(h, r'<meta name="description" content="(.*?)">')
    og = _attr(h, r'<meta property="og:description" content="(.*?)">')
    ameta = _attr(h, r'<div class="ameta">(.*?)</div>')
    date_ru = ""
    read_min = 4
    m = re.search(r"·\s*(.+?)\s*·\s*(\d+)\s*мин", ameta)
    if m:
        date_ru = m.group(1).strip(); read_min = int(m.group(2))
    art = re.search(r"<article>(.*?)</article>", h, re.S)
    body = art.group(1) if art else h
    # intro: первый <p> после hero <img>
    after_hero = re.split(r'<img class="hero".*?>', body, 1)
    tail = after_hero[1] if len(after_hero) > 1 else body
    # обрезаем всё начиная с faq / readnext / cta
    cut = re.split(r'<section class="faq">|<a class="readnext"|<div class="cta">', tail, 1)[0]
    intro_m = re.match(r"\s*<p>(.*?)</p>", cut, re.S)
    intro = strip_tags(intro_m.group(1)) if intro_m else ""
    if intro_m:
        cut = cut[intro_m.end():]
    # секции по <h2>
    sections = []
    parts = re.split(r"<h2>(.*?)</h2>", cut, flags=re.S)
    # parts[0] - до первого h2 (обычно пусто); далее пары (h2, содержимое)
    for i in range(1, len(parts), 2):
        h2 = strip_tags(parts[i])
        seg = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append({"h2": h2, "blocks": parse_blocks(seg)})
    # faq
    faq = []
    fm = re.search(r'<section class="faq">(.*?)</section>', body, re.S)
    if fm:
        fseg = re.sub(r"<h2>.*?</h2>", "", fm.group(1), 1, re.S)
        qs = re.findall(r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", fseg, re.S)
        faq = [{"q": strip_tags(q), "a": strip_tags(a)} for q, a in qs]
    return {"slug": slug, "title": title, "meta_description": meta, "og_description": og,
            "read_min": read_min, "date_ru": date_ru, "sections": sections, "faq": faq}


def main():
    os.makedirs(WORK, exist_ok=True)
    if len(sys.argv) > 1:
        slugs = [sys.argv[1]]
    else:
        ru = {os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(BLOG, "*", "index.html"))}
        en = {os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(ENBLOG, "*", "index.html"))}
        slugs = sorted(ru - en)
    n = 0
    for s in slugs:
        d = extract(s)
        if not d:
            print("SKIP", s); continue
        json.dump(d, open(os.path.join(WORK, s + ".ru.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        n += 1
    print(f"extracted {n} article(s) -> {WORK}")


if __name__ == "__main__":
    main()
