# 1on1 — монорепо

```
1on1/
├── mobile/       Expo React Native (iOS / Android)
└── smartweb/
    ├── backend/  FastAPI + SQLAlchemy  →  Railway PostgreSQL
    └── frontend/ React + Vite          →  Supabase (REST, anon key)
```

## Архитектура баз данных

| Слой | База | Доступ |
|------|------|--------|
| `smartweb/backend` | **Railway PostgreSQL** | SQLAlchemy (`DATABASE_URL`) |
| `smartweb/frontend` | **Supabase** | браузер напрямую (anon key, RLS) |
| `mobile` | Supabase Auth | `@supabase/supabase-js` |

### Railway PostgreSQL
Основная бизнес-база. Бэкенд читает только её — никаких прямых запросов к Supabase.

Таблицы: `users`, `teams`, `team_members`, `meetings`, `tasks`, `notes`, `notifications`

### Supabase
Данные, к которым фронтенд обращается напрямую из браузера, минуя бэкенд:

| Таблица | Назначение | RLS |
|---------|-----------|-----|
| `leads` | Лиды с лендинга (имя, email, компания, источник) | INSERT anon, SELECT authenticated |
| `meeting_templates` | Шаблоны повесток для 1-on-1 | SELECT anon |

Мобильное приложение использует Supabase только для аутентификации (email/password через `supabase.auth`).

## Запуск

### Backend
```bash
cd smartweb/backend
cp .env.example .env          # прописать DATABASE_URL
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend
```bash
cd smartweb/frontend
cp .env.example .env          # прописать Supabase ключи
npm install
npm run dev
```

### Mobile
```bash
cd mobile
cp .env.example .env          # прописать Supabase + API URL
npm install
npx expo start
```

## Git-история

Репозитории объединены с сохранением истории:
- `mobile/` ← `difast/MOBILE-1o1`
- `smartweb/` ← `difast/Smart-1on1`

История обоих доступна через `git log --all`.
