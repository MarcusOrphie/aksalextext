#!/bin/bash
# Крон на сервере: подтянуть изменения из GitHub, обновить сайт и очередь канала.
# Ставится в cron каждые 15 минут.
cd /opt/zalihvat-site || exit 0
BEFORE=$(git rev-parse HEAD 2>/dev/null)
git pull -q origin main || exit 0
AFTER=$(git rev-parse HEAD 2>/dev/null)
[ "$BEFORE" = "$AFTER" ] && exit 0   # нет изменений

# выкатить сайт (без удаления файлов, которых нет в репо)
cp -ru /opt/zalihvat-site/site/. /var/www/zalihvat/

# влить тизеры новых статей в очередь канала (идемпотентно по id)
python3 - <<'PY'
import json
try:
    pend = json.load(open('/opt/zalihvat-site/autopilot/pending_teasers.json', encoding='utf-8'))
except Exception:
    pend = []
q = '/opt/zalihvat-bot/posts.json'
try:
    posts = json.load(open(q, encoding='utf-8'))
except Exception:
    posts = []
ids = {p.get('id') for p in posts}
added = 0
for t in pend:
    if t.get('id') and t['id'] not in ids:
        posts.append({'id': t['id'], 'posted': False, 'image': t.get('image'), 'text': t['text']})
        added += 1
if added:
    json.dump(posts, open(q, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('teasers added:', added)
PY
echo "$(date -u +%FT%TZ) pulled $AFTER"
