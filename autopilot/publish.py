# -*- coding: utf-8 -*-
"""
Облачный билд+публикация ОДНОЙ статьи из JSON (без Anthropic API и без Chrome).
Агент routine пишет статью в article.json по схеме, затем:
    python autopilot/publish.py article.json
Скрипт: text.ru (если задан TEXTRU_KEY) -> обложка (PIL) -> HTML ->
site/blog/<slug>/ + обновляет site/blog/index.html, site/sitemap.xml,
autopilot/pending_teasers.json. Коммит/пуш делает агент.
"""
import os, sys, re, json, time, datetime, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SITE = os.path.join(REPO, "site")
BLOG = os.path.join(SITE, "blog")
TPL = os.path.join(HERE, "template_article.html")
TEASERS = os.path.join(HERE, "pending_teasers.json")
SITE_URL = "https://aksalex.com"
TEXTRU_KEY = os.environ.get("TEXTRU_KEY", "").strip()

sys.path.insert(0, HERE)
from cover import make_cover

MONTHS = ["", "января", "февраля", "марта", "апреля", "мая", "июня", "июля",
          "августа", "сентября", "октября", "ноября", "декабря"]
_TR = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i',
'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u',
'ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}

def dashes(s):
    return s.replace("—", "-").replace("–", "-") if isinstance(s, str) else s

def clean(o):
    if isinstance(o, str): return dashes(o)
    if isinstance(o, list): return [clean(x) for x in o]
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    return o

def slugify(s):
    out = []
    for ch in s.lower():
        if ch in _TR: out.append(_TR[ch])
        elif ch.isalnum() and ord(ch) < 128: out.append(ch)
        elif ch in " -_": out.append('-')
    return (re.sub(r'-+', '-', ''.join(out)).strip('-')[:70]) or "statya"

def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def plain_text(d):
    parts = [d["title"], d.get("intro", "")]
    for s in d.get("sections", []):
        parts.append(s.get("h2", ""))
        for b in s.get("blocks", []):
            t = b.get("type")
            if t in ("p", "h3", "blockquote"): parts.append(b.get("text", ""))
            elif t == "ul": parts.extend(b.get("items", []))
            elif t == "table":
                parts.extend(b.get("headers", []))
                for row in b.get("rows", []): parts.extend(row)
    for f in d.get("faq", []):
        parts.append(f.get("q", "")); parts.append(f.get("a", ""))
    return "\n".join(p for p in parts if p).strip()

def body_html(d):
    out = [f"    <p>{esc(d.get('intro',''))}</p>"]
    for s in d.get("sections", []):
        out.append(f"    <h2>{esc(s.get('h2',''))}</h2>")
        for b in s.get("blocks", []):
            t = b.get("type")
            if t == "p": out.append(f"    <p>{esc(b.get('text',''))}</p>")
            elif t == "h3": out.append(f"    <h3>{esc(b.get('text',''))}</h3>")
            elif t == "blockquote": out.append(f"    <blockquote>{esc(b.get('text',''))}</blockquote>")
            elif t == "ul":
                out.append("    <ul>" + "".join(f"<li>{esc(i)}</li>" for i in b.get("items", [])) + "</ul>")
            elif t == "table":
                th = "".join(f"<th>{esc(h)}</th>" for h in b.get("headers", []))
                rows = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>" for row in b.get("rows", []))
                out.append(f'    <div class="tablewrap"><table><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table></div>')
    return "\n".join(out)

def faq_html(d):
    out = []
    for f in d.get("faq", []):
        out.append(f"      <h3>{esc(f.get('q',''))}</h3>")
        out.append(f"      <p>{esc(f.get('a',''))}</p>")
    return "\n".join(out)

def jsonld(d, url, today):
    faq = [{"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in d.get("faq", [])]
    blog = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": d["title"],
            "description": d.get("og_description", d.get("meta_description", "")), "image": url + "cover.jpg",
            "datePublished": today, "dateModified": today,
            "author": {"@type": "Person", "name": "Саша Аксенов", "url": SITE_URL + "/"},
            "publisher": {"@type": "Organization", "name": "Залихват", "logo": {"@type": "ImageObject", "url": SITE_URL + "/apple-touch-icon.png"}},
            "mainEntityOfPage": {"@type": "WebPage", "@id": url}}
    faqp = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/"},
        {"@type": "ListItem", "position": 2, "name": "Блог", "item": SITE_URL + "/blog/"},
        {"@type": "ListItem", "position": 3, "name": d["title"], "item": url}]}
    blk = lambda o: '<script type="application/ld+json">\n' + json.dumps(o, ensure_ascii=False) + '\n</script>'
    return "\n".join([blk(blog), blk(faqp), blk(crumbs)])

def build_html(d, url, today, date_ru):
    tpl = open(TPL, encoding="utf-8").read()
    repl = {
        "{{TITLE}}": esc(d["title"]), "{{META}}": esc(d.get("meta_description", "")),
        "{{OGDESC}}": esc(d.get("og_description", d.get("meta_description", ""))),
        "{{URL}}": url, "{{CRUMB}}": esc(d["title"]),
        "{{AMETA}}": f"Саша Аксенов · {date_ru} · {int(d.get('read_min', 4))} мин чтения",
        "{{BODY}}": body_html(d), "{{FAQ_HTML}}": faq_html(d), "{{JSONLD}}": jsonld(d, url, today),
    }
    for k, v in repl.items():
        tpl = tpl.replace(k, v)
    return tpl

def textru(text):
    if not TEXTRU_KEY:
        return None
    def post(p):
        data = urllib.parse.urlencode(p).encode("utf-8")
        req = urllib.request.Request("https://api.text.ru/post", data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    try:
        res = post({"text": text, "userkey": TEXTRU_KEY, "visible": "vis_on"})
    except Exception:
        return None
    uid = res.get("text_uid")
    if not uid:
        return None
    for _ in range(50):
        time.sleep(6)
        try:
            r = post({"uid": uid, "userkey": TEXTRU_KEY})
        except Exception:
            continue
        if "text_unique" in r:
            return float(r.get("text_unique", 0))
    return None

def update_blog_index(d, date_ru):
    p = os.path.join(BLOG, "index.html")
    html = open(p, encoding="utf-8").read()
    slug = d["slug"]
    card = (f'    <a class="post" href="/blog/{slug}/">\n'
            f'      <img src="/blog/{slug}/cover.jpg" alt="{esc(d["title"])}">\n'
            f'      <div class="pbody">\n'
            f'        <div class="pdate">{date_ru}</div>\n'
            f'        <h2>{esc(d["title"])}</h2>\n'
            f'        <p>{esc(d.get("og_description", d.get("meta_description","")))}</p>\n'
            f'        <span class="pread">Читать →</span>\n'
            f'      </div>\n    </a>\n\n')
    anchor = '<div class="posts">\n'
    i = html.find(anchor)
    if i == -1:
        return
    pos = i + len(anchor)
    open(p, "w", encoding="utf-8").write(html[:pos] + card + html[pos:])

def update_sitemap(d, today):
    p = os.path.join(SITE, "sitemap.xml")
    xml = open(p, encoding="utf-8").read()
    loc = f"{SITE_URL}/blog/{d['slug']}/"
    if loc in xml:
        return
    entry = f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n'
    open(p, "w", encoding="utf-8").write(xml.replace("</urlset>", entry + "</urlset>"))

def add_teaser(d):
    try:
        teasers = json.load(open(TEASERS, encoding="utf-8"))
    except Exception:
        teasers = []
    slug = d["slug"]
    tid = "art-" + slug
    if any(t.get("id") == tid for t in teasers):
        return
    teasers.append({"id": tid, "posted": False,
        "image": f"{SITE_URL}/blog/{slug}/cover.jpg",
        "text": f"{d['title']}\n\n{d.get('og_description', d.get('meta_description',''))}\n\nЧитать: {SITE_URL}/blog/{slug}/"})
    json.dump(teasers, open(TEASERS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "article.json")
    d = clean(json.load(open(src, encoding="utf-8")))
    d["slug"] = slugify(d.get("slug") or d.get("title"))
    if os.path.isdir(os.path.join(BLOG, d["slug"])):
        d["slug"] = d["slug"] + "-" + datetime.date.today().strftime("%m%d")
    today = datetime.date.today().isoformat()
    dt = datetime.date.today()
    date_ru = f"{dt.day} {MONTHS[dt.month]} {dt.year}"
    url = f"{SITE_URL}/blog/{d['slug']}/"
    outdir = os.path.join(BLOG, d["slug"])
    os.makedirs(outdir, exist_ok=True)

    text = plain_text(d)
    uniq = textru(text)
    print("uniqueness:", uniq, "| chars:", len(text), "| slug:", d["slug"], flush=True)

    make_cover(d.get("cover_title") or d["title"], d.get("cover_tag", "Нейросети · блог"),
               os.path.join(outdir, "cover.jpg"))
    open(os.path.join(outdir, "index.html"), "w", encoding="utf-8").write(build_html(d, url, today, date_ru))
    update_blog_index(d, date_ru)
    update_sitemap(d, today)
    add_teaser(d)
    print("BUILT:", url, flush=True)

if __name__ == "__main__":
    main()
