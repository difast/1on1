-- ================================================================
-- Supabase schema — данные, которые фронтенд читает напрямую
-- Выполнить в Supabase SQL Editor
-- ================================================================

-- ── 1. Лиды с лендинга ──────────────────────────────────────────
create table if not exists leads (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  company     text,
  source      text default 'landing',   -- 'landing' | 'referral' | 'ad'
  message     text,
  created_at  timestamptz default now()
);

-- Анонимный пользователь может добавить лид (форма на лендинге)
alter table leads enable row level security;

create policy "anon can insert leads"
  on leads for insert
  to anon
  with check (true);

create policy "authenticated can read leads"
  on leads for select
  to authenticated
  using (true);

-- ── 2. Шаблоны повесток 1-on-1 ──────────────────────────────────
create table if not exists meeting_templates (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text,
  items       jsonb not null default '[]',
  -- items: [{ "label": "Что сделано", "duration_min": 5 }, ...]
  category    text default 'general',   -- 'general' | 'performance' | 'onboarding'
  is_public   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- Все могут читать публичные шаблоны (кешируется браузером)
alter table meeting_templates enable row level security;

create policy "anyone can read public templates"
  on meeting_templates for select
  using (is_public = true);

-- ── 3. Примеры шаблонов ─────────────────────────────────────────
insert into meeting_templates (title, description, items, category, sort_order) values
(
  'Стандартный 1-on-1',
  'Регулярная встреча раз в 1-2 недели',
  '[
    {"label": "Как дела / что беспокоит", "duration_min": 5},
    {"label": "Прогресс по задачам", "duration_min": 10},
    {"label": "Препятствия и помощь", "duration_min": 10},
    {"label": "Планы на следующую неделю", "duration_min": 5},
    {"label": "Карьера и развитие", "duration_min": 5}
  ]'::jsonb,
  'general',
  1
),
(
  'Ретроспектива',
  'Ежемесячная встреча по итогам',
  '[
    {"label": "Что прошло хорошо", "duration_min": 10},
    {"label": "Что можно улучшить", "duration_min": 10},
    {"label": "Action items", "duration_min": 10},
    {"label": "Цели на следующий месяц", "duration_min": 10}
  ]'::jsonb,
  'performance',
  2
),
(
  'Онбординг (1-я неделя)',
  'Первая встреча с новым участником команды',
  '[
    {"label": "Знакомство", "duration_min": 10},
    {"label": "Цели на испытательный срок", "duration_min": 15},
    {"label": "Доступы и инструменты", "duration_min": 10},
    {"label": "Вопросы", "duration_min": 10}
  ]'::jsonb,
  'onboarding',
  3
);
