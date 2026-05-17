# OneOnOne v2

## Быстрый старт

### 1. Установка
```bash
npm install
```

### 2. .env
```
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="xxx"
```

### 3. SQL в Supabase → SQL Editor → New query

```sql
-- Профили пользователей
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  name text,
  role text default 'teamlead', -- teamlead | member
  job_title text,
  telegram text,
  linkedin text,
  github text,
  created_at timestamptz default now()
);

-- Команды
create table teams (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

-- Участники команды
create table members (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text,
  avatar_color text default '#7F77DD',
  created_at timestamptz default now()
);

-- Встречи
create table meetings (
  id uuid default gen_random_uuid() primary key,
  member_id uuid references members(id) on delete cascade not null,
  date date default current_date,
  scheduled_at timestamptz,
  mood text default 'neutral',
  notes text,
  created_at timestamptz default now()
);

-- Задачи
create table tasks (
  id uuid default gen_random_uuid() primary key,
  member_id uuid references members(id) on delete cascade not null,
  text text not null,
  done boolean default false,
  due_date date,
  created_at timestamptz default now()
);

-- Коды приглашений
create table invite_codes (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade not null,
  code text unique not null,
  active boolean default true,
  created_at timestamptz default now()
);

-- Запросы на встречу от участников
create table meeting_requests (
  id uuid default gen_random_uuid() primary key,
  member_id uuid references members(id) on delete cascade not null,
  proposed_date timestamptz not null,
  message text,
  status text default 'pending', -- pending | approved | declined
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table teams enable row level security;
alter table members enable row level security;
alter table meetings enable row level security;
alter table tasks enable row level security;
alter table invite_codes enable row level security;
alter table meeting_requests enable row level security;

-- Policies
create policy "own profile" on profiles for all using (id = auth.uid());
create policy "own teams" on teams for all using (owner_id = auth.uid());

create policy "team members" on members for all using (
  team_id in (select id from teams where owner_id = auth.uid())
  or user_id = auth.uid()
);

create policy "team meetings" on meetings for all using (
  member_id in (
    select m.id from members m
    join teams t on t.id = m.team_id
    where t.owner_id = auth.uid() or m.user_id = auth.uid()
  )
);

create policy "team tasks" on tasks for all using (
  member_id in (
    select m.id from members m
    join teams t on t.id = m.team_id
    where t.owner_id = auth.uid() or m.user_id = auth.uid()
  )
);

create policy "invite codes public read" on invite_codes for select using (true);
create policy "invite codes owner write" on invite_codes for all using (
  team_id in (select id from teams where owner_id = auth.uid())
);

create policy "meeting requests" on meeting_requests for all using (
  member_id in (
    select m.id from members m
    join teams t on t.id = m.team_id
    where t.owner_id = auth.uid() or m.user_id = auth.uid()
  )
);
```

### 4. Запуск
```bash
npm run dev
```

## Роли
- **Тимлид** — создаёт команды, записывает встречи, добавляет задачи, видит аналитику
- **Участник** — видит свои встречи и задачи, запрашивает встречи, видит карточку тимлида

## Поток приглашения
1. Тимлид нажимает "Пригласить участника" → копирует ссылку
2. Отправляет ссылку в Telegram: `https://твой-домен.com/join/КОД`
3. Участник переходит → регистрируется → выбирает роль "Участник" → попадает в команду
