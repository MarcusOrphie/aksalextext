# -*- coding: utf-8 -*-
"""Собрать EN-версию статьи из переведённого JSON (autopilot/en_work/<slug>.en.json).
JSON = как article.json, но с полями slug, date_ru, read_min (из RU) и переведёнными
title/meta_description/og_description/sections/faq. Пишет site/en/blog/<slug>/index.html + cover.jpg.
Индекс/sitemap/hreflang/readnext НЕ трогает - это делает en_reindex.py.
Использование: python autopilot/en_publish.py <slug|путь_к_en.json>"""
import os, sys, re, json, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import publish as P
from cover import make_cover

REPO = os.path.dirname(HERE)
ENBLOG = os.path.join(REPO, "site", "en", "blog")
TPL = os.path.join(HERE, "template_article_en.html")
WORK = os.path.join(HERE, "en_work")
SITE_URL = "https://aksalex.com"
EN_MONTHS = ["", "January", "February", "March", "April", "May", "June",
             "July", "August", "September", "October", "November", "December"]
RU_MONTHS = {m: i for i, m in enumerate(P.MONTHS) if m}


def en_date(date_ru):
    m = re.match(r"(\d{1,2})\s+([а-яё]+)\s+(\d{4})", date_ru or "", re.I)
    if not m:
        d = datetime.date.today(); return f"{EN_MONTHS[d.month]} {d.day}, {d.year}"
    day, mon, year = int(m.group(1)), m.group(2).lower(), m.group(3)
    mi = RU_MONTHS.get(mon, 0)
    return f"{EN_MONTHS[mi] if mi else ''} {day}, {year}".strip()


def en_jsonld(d, url, today):
    faq = [{"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in d.get("faq", [])]
    blog = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": d["title"], "inLanguage": "en",
            "description": d.get("og_description", d.get("meta_description", "")), "image": url + "cover.jpg",
            "datePublished": today, "dateModified": today,
            "author": {"@type": "Person", "name": "Alex Aksenov", "url": SITE_URL + "/en/"},
            "publisher": {"@type": "Organization", "name": "Zalihvat", "logo": {"@type": "ImageObject", "url": SITE_URL + "/apple-touch-icon.png"}},
            "mainEntityOfPage": {"@type": "WebPage", "@id": url}}
    faqp = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/en/"},
        {"@type": "ListItem", "position": 2, "name": "Blog", "item": SITE_URL + "/en/blog/"},
        {"@type": "ListItem", "position": 3, "name": d["title"], "item": url}]}
    blk = lambda o: '<script type="application/ld+json">\n' + json.dumps(o, ensure_ascii=False) + '\n</script>'
    return "\n".join([blk(blog), blk(faqp), blk(crumbs)])


def build_en(d):
    slug = d["slug"]
    url = f"{SITE_URL}/en/blog/{slug}/"
    ru_url = f"{SITE_URL}/blog/{slug}/"
    today = datetime.date.today().isoformat()
    tpl = open(TPL, encoding="utf-8").read()
    repl = {
        "{{TITLE}}": P.esc(d["title"]), "{{META}}": P.esc(d.get("meta_description", "")),
        "{{OGDESC}}": P.esc(d.get("og_description", d.get("meta_description", ""))),
        "{{URL}}": url, "{{RU_URL}}": ru_url, "{{SLUG}}": slug, "{{CRUMB}}": P.esc(d["title"]),
        "{{AMETA}}": f"Alex Aksenov · {en_date(d.get('date_ru',''))} · {int(d.get('read_min', 4))} min read",
        "{{BODY}}": P.body_html(d), "{{FAQ_HTML}}": P.faq_html(d), "{{JSONLD}}": en_jsonld(d, url, today),
        "{{NEXT}}": "",  # readnext добавит en_reindex по порядку EN-ленты
    }
    for k, v in repl.items():
        tpl = tpl.replace(k, v)
    outdir = os.path.join(ENBLOG, slug)
    os.makedirs(outdir, exist_ok=True)
    make_cover(d.get("cover_title") or d["title"], d.get("cover_tag", "AI · blog"),
               os.path.join(outdir, "cover.jpg"))
    open(os.path.join(outdir, "index.html"), "w", encoding="utf-8").write(tpl)
    return url


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if not arg:
        print("usage: en_publish.py <slug|en.json>"); sys.exit(1)
    path = arg if os.path.isfile(arg) else os.path.join(WORK, arg + ".en.json")
    d = P.clean(json.load(open(path, encoding="utf-8")))
    d["slug"] = d.get("slug") or P.slugify(d["title"])
    text = P.plain_text(d)
    ntab = sum(1 for s in d.get("sections", []) for b in s.get("blocks", []) if b.get("type") == "table")
    if len(text) < 1500:
        print(f"WARN {d['slug']}: short EN text {len(text)}", flush=True)
    print("BUILT EN:", build_en(d), "| chars:", len(text), "| tables:", ntab, flush=True)


if __name__ == "__main__":
    main()
