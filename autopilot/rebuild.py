# -*- coding: utf-8 -*-
"""Пересобрать index.html СУЩЕСТВУЮЩЕЙ статьи из article.json - на месте.
Без побочных эффектов: не трогает blog/index.html, sitemap, тизеры, обложку, слаг.
Гейт: >= 3000 символов видимого текста и >= 1 таблица, иначе выход с ошибкой.
Использование: python3 autopilot/rebuild.py autopilot/article.json"""
import sys, os, re, json, datetime
import publish as P

def orig_date_ru(html):
    m = re.search(r"Аксенов\s*·\s*([0-9]{1,2}\s+[а-яё]+\s+[0-9]{4})", html)
    return m.group(1) if m else None

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(P.HERE, "article.json")
    d = P.clean(json.load(open(src, encoding="utf-8")))
    slug = P.slugify(d.get("slug") or d.get("title"))
    outdir = os.path.join(P.BLOG, slug)
    idx = os.path.join(outdir, "index.html")
    if not os.path.isfile(idx):
        print(f"NOFOLDER: {slug} (нет site/blog/{slug}/index.html)", flush=True); sys.exit(3)

    text = P.plain_text(d)
    ntab = sum(1 for s in d.get("sections", []) for b in s.get("blocks", []) if b.get("type") == "table")
    if len(text) < 3000 or ntab < 1:
        print(f"REJECTED {slug}: chars={len(text)} tables={ntab} (нужно >=3000 и >=1 таблицы)", flush=True); sys.exit(2)

    old = open(idx, encoding="utf-8").read()
    dt = datetime.date.today()
    date_ru = orig_date_ru(old) or f"{dt.day} {P.MONTHS[dt.month]} {dt.year}"  # сохраняем дату публикации
    today = dt.isoformat()
    url = f"{P.SITE_URL}/blog/{slug}/"
    open(idx, "w", encoding="utf-8").write(P.build_html(d, url, today, date_ru, P.next_for_slug(slug)))
    print(f"REBUILT {slug}: chars={len(text)} tables={ntab} date='{date_ru}'", flush=True)

if __name__ == "__main__":
    main()
