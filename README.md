# zalihvat-site

Сайт aksalex.com (бренд «Залихват») + облачный автопилот SEO-статей.

## Структура
- `site/` — то, что отдаётся сайтом (зеркалится на сервер `/var/www/zalihvat` кроном `server_pull.sh`).
- `autopilot/` — облачный пайплайн статей:
  - `topics.md` — очередь тем (`- [ ]` → `- [x]`).
  - `template_article.html` — шаблон статьи.
  - `cover.py` — генерация обложки (PIL, шрифты в `assets/`, без браузера).
  - `publish.py` — сборка ОДНОЙ статьи из `article.json` → `site/blog/<slug>/` + обновление индекса блога, sitemap, `pending_teasers.json`.
  - `pending_teasers.json` — тизеры новых статей, сервер вливает их в очередь канала.
  - `server_pull.sh` — крон на сервере: `git pull` → выкатить `site/` → влить тизеры.

## Как это работает
Облачный **routine** Claude Code (расписание 06:00 UTC = 09:00 МСК, 5 статей) пишет статьи как `article.json`, гоняет `publish.py`, коммитит и пушит. Сервер по крону подтягивает и публикует. Higgsfield/Chrome не нужны — обложки рисует PIL.

## Сервер (одноразовая настройка)
```
git clone https://github.com/<OWNER>/zalihvat-site.git /opt/zalihvat-site
chmod +x /opt/zalihvat-site/autopilot/server_pull.sh
( crontab -l 2>/dev/null; echo "*/15 * * * * /opt/zalihvat-site/autopilot/server_pull.sh >> /var/log/zalihvat-pull.log 2>&1" ) | crontab -
```
