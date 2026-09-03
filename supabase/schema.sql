-- Схема Supabase для контент-машины «Залихват». Вставить в Supabase → SQL Editor → Run.
-- Row Level Security: каждый пользователь видит и меняет ТОЛЬКО свои строки.

-- Профиль пользователя (данные автора, подмешиваются в генерацию)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  niche text,
  audience text,
  tone text,
  personality text,
  languages text,
  brand_notes text,
  links jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile upsert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile upsert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- История генераций
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  topic text,
  output jsonb not null,
  created_at timestamptz default now()
);
alter table public.generations enable row level security;
drop policy if exists "own gens select" on public.generations;
drop policy if exists "own gens insert" on public.generations;
create policy "own gens select" on public.generations for select using (auth.uid() = user_id);
create policy "own gens insert" on public.generations for insert with check (auth.uid() = user_id);

-- Хранилище загруженных файлов (примеры контента, брендматериалы)
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
