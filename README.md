# 1on1 — монорепо

```
1on1/
├── landing/      Статический лендинг (HTML/CSS + server.js)
├── legal/        Юридические документы
├── mobile/       Expo React Native (iOS / Android)
└── smartweb/
    ├── backend/  FastAPI + SQLAlchemy  →  PostgreSQL
    └── frontend/ React + Vite          →  бэкенд по HTTP
```

## Архитектура данных

| Слой | Источник данных | Доступ |
|------|-----------------|--------|
| `smartweb/backend` | **PostgreSQL** | SQLAlchemy (`DATABASE_URL`) |
| `smartweb/frontend` | бэкенд | HTTP, `VITE_API_URL` |
| `mobile` | бэкенд | HTTP, `EXPO_PUBLIC_API_URL` |

Единственная база — PostgreSQL бэкенда. Клиенты (веб, приложение, Telegram-бот)
не ходят в базу напрямую и не хранят ключей провайдеров: любой доступ к внешним
сервисам (AI, платежи, календари, DaData, почта) идёт через бэкенд.

Supabase из продукта удалён: аутентификация собственная (email/пароль + JWT).

## Секреты и конфигурация

Секретов в коде нет и быть не должно. Все ключи задаются переменными окружения
в панели хостинга (Timeweb App Platform → Переменные); значений по умолчанию у
секретов нет — при незаданной обязательной переменной приложение сообщает об
ошибке конфигурации, а не работает молча на зашитом значении.

Полные списки переменных с плейсхолдерами:

- `smartweb/backend/.env.example` — БД, JWT, SMTP, AI Gateway, платежи, OAuth,
  Telegram-бот, DaData, Яндекс Облако;
- `smartweb/frontend/.env.example` — только `VITE_API_URL`;
- `mobile/.env.example` — только `EXPO_PUBLIC_API_URL`.

Важно: переменные с префиксами `VITE_` и `EXPO_PUBLIC_` попадают в собранный
бандл (браузер, APK) и читаются кем угодно — секреты туда не кладём.

Файл `mobile/google-services.json` содержит публичную клиентскую конфигурацию
Firebase (идентификатор проекта и клиентский API-ключ). Приватного ключа в нём
нет; такой ключ по устройству вшит в каждый APK, поэтому защищается не
секретностью, а ограничениями в Google Cloud Console (привязка к package name и
SHA-256 подписи, ограничение по API).

## Запуск

### Backend
```bash
cd smartweb/backend
cp .env.example .env          # заполнить DATABASE_URL, SECRET_KEY, JWT_SECRET
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend
```bash
cd smartweb/frontend
cp .env.example .env          # прописать VITE_API_URL
npm install
npm run dev
```

### Mobile
```bash
cd mobile
cp .env.example .env          # прописать EXPO_PUBLIC_API_URL
npm install
npx expo start
```

## Git-история

Репозитории объединены с сохранением истории:
- `mobile/` ← `difast/MOBILE-1o1`
- `smartweb/` ← `difast/Smart-1on1`

История обоих доступна через `git log --all`.
