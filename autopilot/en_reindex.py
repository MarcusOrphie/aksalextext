# -*- coding: utf-8 -*-
"""Пересобрать EN-блог после добавления статей:
- site/en/blog/index.html: карточки в порядке RU-ленты (только те slug, у кого есть EN),
- site/sitemap.xml: добавить /en/blog/<slug>/,
- RU-статьи: добавить hreflang-alternate (ru/en/x-default), если есть EN,
- EN-статьи: пересобрать блок 'Read next' по порядку EN-ленты (сосед снизу, петля).
Использование: python autopilot/en_reindex.py"""
import os, re, glob, html

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SITE = os.path.join(REPO, "site")
BLOG = os.path.join(SITE, "blog")
ENBLOG = os.path.join(SITE, "en", "blog")
SITE_URL = "https://aksalex.com"


def ru_order():
    h = open(os.path.join(BLOG, "index.html"), encoding="utf-8").read()
    return [m for m in re.findall(r'<a class="post" href="/blog/([^"/]+)/">', h)]


def meta_of(slug):
    """title, desc, date из собранной EN-статьи."""
    h = open(os.path.join(ENBLOG, slug, "index.html"), encoding="utf-8").read()
    title = re.search(r"<title>(.*?)</title>", h)
    desc = re.search(r'<meta property="og:description" content="(.*?)">', h) or \
           re.search(r'<meta name="description" content="(.*?)">', h)
    date = re.search(r'<div class="ameta">.*?·\s*(.+?)\s*·', h)
    return (title.group(1) if title else slug,
            desc.group(1) if desc else "",
            date.group(1).strip() if date else "")


def rebuild_index(order):
    p = os.path.join(ENBLOG, "index.html")
    h = open(p, encoding="utf-8").read()
    cards = []
    for slug in order:
        t, d, dt = meta_of(slug)
        cards.append(
            f'    <a class="post" href="/en/blog/{slug}/">\n'
            f'      <img src="/en/blog/{slug}/cover.jpg" alt="{t}">\n'
            f'      <div class="pbody">\n'
            f'        <div class="pdate">{dt}</div>\n'
            f'        <h2>{t}</h2>\n'
            f'        <p>{d}</p>\n'
            f'        <span class="pread">Read →</span>\n'
            f'      </div>\n    </a>\n\n')
    block = '<div class="posts">\n' + "".join(cards) + "  </div>\n\n  <footer>"
    h2 = re.sub(r'<div class="posts">.*?</div>\s*<footer>', lambda m: block, h, count=1, flags=re.S)
    open(p, "w", encoding="utf-8").write(h2)


def update_sitemap(order):
    p = os.path.join(SITE, "sitemap.xml")
    xml = open(p, encoding="utf-8").read()
    add = ""
    for slug in order:
        loc = f"{SITE_URL}/en/blog/{slug}/"
        if loc not in xml:
            add += f'  <url><loc>{loc}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n'
    if add:
        xml = xml.replace("</urlset>", add + "</urlset>")
        open(p, "w", encoding="utf-8").write(xml)
    return add.count("<url>")


def add_ru_hreflang(order):
    n = 0
    for slug in order:
        p = os.path.join(BLOG, slug, "index.html")
        if not os.path.isfile(p):
            continue
        h = open(p, encoding="utf-8").read()
        if "hreflang" in h:
            continue
        alt = (f'\n<link rel="alternate" hreflang="ru" href="{SITE_URL}/blog/{slug}/">'
               f'\n<link rel="alternate" hreflang="en" href="{SITE_URL}/en/blog/{slug}/">'
               f'\n<link rel="alternate" hreflang="x-default" href="{SITE_URL}/blog/{slug}/">')
        h2 = re.sub(r'(<link rel="canonical"[^>]*>)', r'\1' + alt, h, count=1)
        if h2 != h:
            open(p, "w", encoding="utf-8").write(h2); n += 1
    return n


def readnext_block(href, title, desc):
    lead = "Enjoyed this one? Here's what to read next. " + desc
    return (
'    <a class="readnext" href="' + href + '" style="display:block;margin:38px 0 6px;padding:20px 22px;background:var(--paper2);border:3px solid var(--ink);border-radius:16px;box-shadow:6px 6px 0 var(--coral);text-decoration:none;color:inherit">\n'
"      <div style=\"font-family:'Oswald',sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:var(--coral-deep);margin-bottom:6px\">Read next</div>\n"
"      <div style=\"font-family:'Oswald',sans-serif;font-weight:700;text-transform:uppercase;font-size:20px;line-height:1.06;color:var(--ink);margin-bottom:8px\">" + title + "</div>\n"
'      <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#2c2621;font-weight:600">' + lead + "</p>\n"
"      <span style=\"font-family:'Oswald',sans-serif;font-weight:700;text-transform:uppercase;font-size:14px;color:var(--coral-deep)\">Read the article →</span>\n"
'    </a>\n')


def rebuild_readnext(order):
    meta = {s: meta_of(s) for s in order}
    n = len(order)
    for i, slug in enumerate(order):
        nxt = order[i + 1] if i + 1 < n else order[0]
        t, d, _ = meta[nxt]
        blk = readnext_block(f"/en/blog/{nxt}/", t, d)
        p = os.path.join(ENBLOG, slug, "index.html")
        h = open(p, encoding="utf-8").read()
        h = re.sub(r'\s*<a class="readnext".*?</a>\n', "\n", h, flags=re.S)  # убрать старый
        if '<div class="cta">' in h:
            h = h.replace('    <div class="cta">', blk + '    <div class="cta">', 1)
        open(p, "w", encoding="utf-8").write(h)


def main():
    en = {os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(ENBLOG, "*", "index.html"))}
    order = [s for s in ru_order() if s in en]
    rebuild_index(order)
    sm = update_sitemap(order)
    hl = add_ru_hreflang(order)
    rebuild_readnext(order)
    print(f"EN reindex: {len(order)} posts | sitemap +{sm} | RU hreflang +{hl}", flush=True)


if __name__ == "__main__":
    main()
