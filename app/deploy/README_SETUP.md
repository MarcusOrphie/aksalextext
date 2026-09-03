# Настройка продукта «Контент-машина Залихват» (кабинет)

## Что от тебя нужно (внешние сервисы)

### 1. Supabase (авторизация + база)
1. Создай проект на https://supabase.com (бесплатный тариф). Регион - ближе к аудитории.
2. SQL Editor → вставь и запусти `supabase/schema.sql` (создаст таблицы + RLS + бакет).
3. Authentication → Providers:
   - **Email** - включить (Confirm email можно оставить, вход по magic link).
   - **Google** - включить, вставить Client ID/Secret из Google Cloud Console (OAuth consent + Web client; redirect URI Supabase покажет сам, вида `https://<проект>.supabase.co/auth/v1/callback`).
4. Authentication → URL Configuration → Site URL: `https://app.aksalex.com`; добавь его в Redirect URLs.
5. Project Settings → API → пришли мне: **Project URL** и **anon public key** (для фронта). Service key НЕ нужен - бэкенд его не использует.

(Telegram и Яндекс - следующей волной: им нужен кастомный мост, нативно Supabase их не поддерживает.)

### 2. DNS (Namecheap)
Добавь A-запись: `app` → `152.42.252.122` (это app.aksalex.com → дроплет).

### 3. Дальше делаю я
Как только пришлёшь Supabase URL + anon key и добавишь DNS:
- пропишу их в `app/frontend/config.js`,
- разверну бэкенд на дроплете (venv, зависимости, systemd `zalihvat-app`, nginx reverse proxy, TLS через certbot),
- выложу фронт в `/var/www/zalihvat-app`,
- проверю вход, генерацию по всем платформам, изоляцию данных (RLS) и что ключ Anthropic не виден во фронте.

## Серверная часть (шпаргалка, выполняется один раз)
```
# бэкенд
sudo mkdir -p /opt/zalihvat-app && sudo rsync -a /opt/zalihvat-site/app/backend/ /opt/zalihvat-app/backend/
python3 -m venv /opt/zalihvat-app/venv
/opt/zalihvat-app/venv/bin/pip install -r /opt/zalihvat-app/backend/requirements.txt
sudo cp /opt/zalihvat-app/backend/.env.example /opt/zalihvat-app/.env   # заполнить реальными ключами
sudo cp /opt/zalihvat-site/app/deploy/zalihvat-app.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now zalihvat-app

# фронт
sudo mkdir -p /var/www/zalihvat-app && sudo rsync -a /opt/zalihvat-site/app/frontend/ /var/www/zalihvat-app/

# nginx + TLS
sudo cp /opt/zalihvat-site/app/deploy/nginx-app.conf /etc/nginx/sites-available/zalihvat-app
sudo ln -sf /etc/nginx/sites-available/zalihvat-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.aksalex.com
```
`.env` на сервере (никогда не в git): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `ALLOWED_ORIGIN=https://app.aksalex.com`, `MODEL`.
