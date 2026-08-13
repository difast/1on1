from pydantic_settings import BaseSettings


class ConfigError(RuntimeError):
    """Обязательная переменная окружения не задана.

    Поднимается вместо работы на встроенном значении по умолчанию: секрет,
    зашитый в код, публичен по определению (репозиторий, сборка, история git),
    поэтому «тихий дефолт» для секрета равносилен его отсутствию."""


class Settings(BaseSettings):
    # Реальное значение приходит из окружения (DATABASE_URL). Значение по
    # умолчанию не используется — app/database.py читает os.environ напрямую.
    database_url: str = ""
    # Redis для Celery. На managed-Redis (Timeweb) обычно один адрес — тогда
    # достаточно задать только REDIS_URL, а broker/backend возьмут его же
    # (см. свойства celery_broker/celery_backend). Явные CELERY_* переопределяют.
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    # Корневой серверный секрет. Из него выводятся ключи шифрования токенов
    # календарей (services/crypto.py) и, если не задан JWT_SECRET, ключ подписи
    # JWT. Значения по умолчанию НЕТ: пустой SECRET_KEY — ошибка конфигурации,
    # а не тихая работа на общеизвестном ключе (раньше здесь было "change-me",
    # что делало и подпись токенов, и шифрование токенов календарей
    # предсказуемыми для любого, кто видел репозиторий).
    secret_key: str = ""

    # --- Собственная аутентификация (email/пароль + JWT). ---
    # Секрет подписи JWT: только из окружения (JWT_SECRET). Если не задан,
    # берётся SECRET_KEY. Если пусты оба — jwt_signing_key поднимает
    # ConfigError, и вход не работает вовсе (вместо подписи пустым ключом).
    jwt_secret: str = ""
    jwt_expire_days: int = 30
    # Этап 8: принудительная проверка JWT на защищённых эндпоинтах. Когда флаг
    # включён (AUTH_ENFORCE=1), любой запрос к /api/* вне публичного списка
    # (вход/регистрация/health/вебхуки) без валидного токена получает 401.
    # По умолчанию выключен: включать только после smoke-теста всех способов
    # входа на боевой инфраструктуре. Отключение — только явным AUTH_ENFORCE=0,
    # тихого обхода на отдельных запросах нет.
    auth_enforce: bool = False

    # Блок 3 безопасности: изоляция данных между организациями (командами). Когда
    # флаг включён (ORG_ISOLATION_ENFORCE=1), переиспользуемый механизм
    # app/services/tenancy.py отклоняет обращения к данным чужой организации
    # (403/404), даже если подставлен корректный id чужой сущности. По умолчанию
    # выключен: включать после проверки, что легитимные клиенты (веб и мобильное
    # приложение, общий API) обращаются только к своим данным. Аналог AUTH_ENFORCE.
    org_isolation_enforce: bool = False

    # Блок 1 безопасности: усиление входа.
    # Yandex SmartCaptcha. Ключи только из окружения. client_key публичный (уходит
    # на фронт для рендера виджета), server_key секретный (проверка токена на
    # сервере). Пустой server_key -> проверка капчи пропускается (dev/без ключа).
    captcha_client_key: str = ""
    captcha_server_key: str = ""
    # Требовать валидную капчу на входе/регистрации/сбросе. По умолчанию выключено
    # для безопасного раската (капча всё равно ПРОВЕРЯЕТСЯ, если токен пришёл; при
    # включённом флаге токен обязателен). Аналог AUTH_ENFORCE.
    captcha_enforce: bool = False
    # Проверка пароля по базе утечек (HaveIBeenPwned, k-anonymity). Включать
    # жёсткую блокировку скомпрометированных паролей — pwned_block=1; по умолчанию
    # предупреждение (в ответе), без блокировки. Сетевой сбой HIBP не блокирует.
    pwned_block: bool = False
    # Автовыход сессии по бездействию (Этап 7). Отдельно от срока жизни JWT.
    session_idle_days: int = 45
    # Жёсткая проверка сессий (ревокация/бездействие) в require_user. Токены без
    # session-id (выданные до внедрения) продолжают работать при любом значении —
    # проверяется только наличие/актуальность session-записи, если она есть.
    session_enforce: bool = True
    # Подтверждение входа с нового устройства кодом по email (Этап 4). По умолчанию
    # выключено для безопасного раската (устройства всё равно запоминаются, а при
    # новом устройстве шлётся уведомление). Включать после того, как клиенты
    # начнут передавать идентификатор устройства (заголовок X-Device-Id).
    new_device_verify: bool = False
    # Код подтверждения по email при КАЖДОМ входе по email/паролю (не только с
    # нового устройства). Включать LOGIN_EMAIL_CODE=1 в проде. По умолчанию
    # выключено, чтобы не ломать существующие тесты/клиенты до раската.
    login_email_code: bool = False

    # SMTP (Reg.ru) для писем подтверждения email и сброса пароля.
    # Пароль — только из окружения (SMTP_PASSWORD), в коде его нет.
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_encryption: str = "SSL"      # SSL | STARTTLS
    smtp_from: str = ""               # адрес отправителя; по умолчанию = smtp_user

    # DaData — поиск компаний по ИНН/БИН (Этап 2). Ключ хранится только на
    # сервере; фронт ходит через наш прокси. Без ключа поиск отдаёт пустой
    # список, а UI предлагает ручной ввод (запасной вариант).
    dadata_api_key: str = ""

    # Telegram-бот: регистрация/вход через бота и Telegram Login Widget.
    # ВСЕ значения — только из окружения, в коде секретов нет.
    telegram_bot_token: str = ""       # секрет, только env
    telegram_bot_username: str = ""    # напр. oneononehq_bot (без @) — публично
    telegram_webhook_secret: str = ""  # секрет для проверки заголовка вебхука
    app_web_url: str = ""              # базовый URL веба для ссылок из бота
    # Режим получения апдейтов от Telegram: "webhook" (по умолчанию) или
    # "polling". polling полезен, когда входящий трафик до сервера фильтруется
    # и Telegram не может достучаться до вебхука — бот сам ходит за апдейтами.
    telegram_mode: str = "webhook"     # webhook | polling
    # Deep-link возврата в приложение после входа через Telegram. Login Widget
    # работает только в браузере, поэтому мобильный вход идёт через веб-мост
    # (/auth/telegram/callback?platform=mobile), а бэкенд/страница-мост после
    # проверки подписи перебрасывает результат в приложение по этой схеме.
    telegram_mobile_redirect_uri: str = "oneonone://auth/telegram/callback"

    # Региональные цены. Отображения цены по региону в продукте НЕТ: валюта у
    # всех тарифов одна (RUB), цена одна. Определение региона по IP было заведено
    # заранее «под будущий биллинг» и работало вхолостую — при каждом первом
    # входе резолвило IP, в крайнем случае через сторонний сервис ip-api.com.
    # Пока региональных цен нет, ветка выключена заглушкой: ничего не
    # определяется и наружу не уходит. Включать вместе с самой функцией.
    region_pricing_enabled: bool = False

    # --- AI Gateway (OpenAI-совместимый шлюз, напр. Timeweb AI Gateway). ---
    # Единый провайдер и единая модель для ВСЕХ AI-функций продукта (Пит, ONE AI,
    # декомпозиция задач, подбор слотов, анализ настроения, советы по развитию).
    # Ключ — ТОЛЬКО из окружения (AI_GATEWAY_KEY); скрытого дефолтного ключа нет.
    # Без ключа AI-функции возвращают явную ошибку конфигурации, а не работают
    # молча на встроенном ключе. Ключ нигде не логируется и не отдаётся клиенту.
    ai_gateway_key: str = ""
    ai_gateway_base_url: str = "https://api.timeweb.ai/v1"
    ai_gateway_model: str = "anthropic/claude-sonnet-5"

    # --- Стоимость AI-запросов (учёт себестоимости, services/ai_billing.py). ---
    # Цена за 1 млн токенов в рублях у ИСПОЛЬЗУЕМОГО провайдера/модели. Хранится в
    # конфигурации (env AI_PRICE_INPUT_RUB_PER_MTOK / AI_PRICE_OUTPUT_RUB_PER_MTOK),
    # НЕ в логике расчёта — при смене модели/цен провайдера обновляется без релиза.
    # Значения по умолчанию соответствуют Grok (Timeweb AI Gateway):
    # input 168,75 ₽/млн, output 337,50 ₽/млн. Система учёта provider-agnostic:
    # формула одна, меняются только эти числа и ai_gateway_model.
    ai_price_input_rub_per_mtok: float = 168.75
    ai_price_output_rub_per_mtok: float = 337.50
    # Урезанный («базовый») режим AI после исчерпания бюджета себестоимости:
    # меньший потолок ответа и обрезанный контекст, чтобы снизить стоимость
    # запроса, не отключая функцию полностью.
    ai_degraded_max_tokens: int = 220

    # --- Настроение и аналитика (блок 12/13/27/31) ---
    # Порог анонимности командной статистики настроения: если за день заполнили
    # меньше этого числа человек, команда получает сообщение о недостаточности
    # данных вместо статистики (нельзя вычислить конкретного человека).
    mood_anon_threshold: int = 3
    # Часовой пояс по умолчанию для команд без явного timezone. Сводка в 10:00
    # и границы суток считаются в этом поясе, а не в поясе сервера.
    default_timezone: str = "Europe/Moscow"

    # --- Интеграции: календари (OAuth) и исходящие вебхуки. ---
    # Все секреты — только из окружения. Без ключей соответствующая интеграция
    # показывается как «недоступна» (кнопка подключения не запускает OAuth).
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    yandex_client_id: str = ""
    yandex_client_secret: str = ""
    yandex_redirect_uri: str = ""
    # Куда вернуть пользователя после OAuth-колбэка (страница «Интеграции»).
    # По умолчанию — app_web_url + /?integrations=1.
    integrations_return_url: str = ""

    # --- Вход через Yandex ID (вход/регистрация, НЕ календарь). ---
    # Поток отдельный от календарной интеграции: другой набор скоупов
    # (login:email login:info login:avatar вместо calendar.events) и другой
    # redirect URI (/auth/yandex/callback). Креды по умолчанию берутся те же,
    # что у календаря (yandex_client_*); если для входа заведено отдельное
    # приложение Yandex OAuth — задать YANDEX_LOGIN_CLIENT_ID/SECRET.
    yandex_login_client_id: str = ""
    yandex_login_client_secret: str = ""
    # Redirect URI веба. По умолчанию — app_web_url + /auth/yandex/callback.
    yandex_login_redirect_uri: str = ""
    # Redirect URI мобильного приложения: deep-link на схему приложения.
    # Обычный веб-редирект в приложении не работает — возврат идёт по схеме.
    yandex_login_mobile_redirect_uri: str = "oneonone://auth/yandex/callback"

    # --- Вход через VK ID (вход/регистрация). ---
    # Отдельный OAuth-поток (VK ID SDK, OAuth 2.1 + PKCE на клиенте, обмен кода
    # на токен — на бэкенде по client_secret). ВСЕ значения только из окружения:
    # секрет приложения (VK_CLIENT_SECRET) в код/бандл не попадает.
    vk_app_id: str = ""            # App ID (публичный, отдаётся фронту для SDK)
    vk_client_secret: str = ""     # секрет приложения, ТОЛЬКО env, только бэкенд
    # Redirect URI веба. По умолчанию — app_web_url + /auth/vk/callback. Должен
    # быть точь-в-точь зарегистрирован в настройках приложения VK ID.
    vk_login_redirect_uri: str = ""
    # Deep-link возврата в приложение. VK не принимает кастомные схемы в своём
    # redirect_uri, поэтому мобильный вход возвращается на веб-адрес, а бэкенд
    # после обмена кода перебрасывает результат в приложение по этой схеме.
    vk_login_mobile_redirect_uri: str = "oneonone://auth/vk/callback"
    # Домен VK ID. VK мигрировал с vk.com на vk.ru: официальный @vkid/sdk по
    # умолчанию работает с id.vk.ru, а серверные эндпоинты доступны и на
    # id.vk.com, и на id.vk.ru. Держим ОДИН домен и для виджета (фронт), и для
    # обмена кода (бэк), чтобы они не разъезжались. Пусто => id.vk.ru (как
    # дефолт SDK). Если приложение/сеть требуют .com — задать VK_ID_DOMAIN=id.vk.com.
    vk_id_domain: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def celery_broker(self) -> str:
        """Брокер Celery: CELERY_BROKER_URL, иначе REDIS_URL."""
        return self.celery_broker_url or self.redis_url

    @property
    def celery_backend(self) -> str:
        """Backend результатов Celery: CELERY_RESULT_BACKEND, иначе REDIS_URL."""
        return self.celery_result_backend or self.redis_url

    @property
    def jwt_signing_key(self) -> str:
        """Ключ подписи JWT: JWT_SECRET из окружения, иначе SECRET_KEY.

        Дефолта нет. Если не задан ни один — это ошибка конфигурации: подписывать
        и проверять токены пустым (или общеизвестным) ключом нельзя, иначе токен
        может подделать кто угодно."""
        key = self.jwt_secret or self.secret_key
        if not key:
            raise ConfigError("Не задан JWT_SECRET (или SECRET_KEY) — подпись токенов невозможна")
        return key

    @property
    def smtp_sender(self) -> str:
        return self.smtp_from or self.smtp_user

    # --- Yandex ID (вход): креды и redirect URI с откатом на календарные ---

    @property
    def yandex_login_id(self) -> str:
        return self.yandex_login_client_id or self.yandex_client_id

    @property
    def yandex_login_secret(self) -> str:
        return self.yandex_login_client_secret or self.yandex_client_secret

    @property
    def yandex_login_web_redirect(self) -> str:
        """Redirect URI страницы входа на вебе (/auth/yandex/callback).
        Должен быть зарегистрирован в приложении Yandex OAuth отдельно от
        redirect URI календарной интеграции."""
        if self.yandex_login_redirect_uri:
            return self.yandex_login_redirect_uri
        base = (self.app_web_url or "").rstrip("/")
        return f"{base}/auth/yandex/callback" if base else ""

    # --- VK ID (вход): redirect URI веба с откатом на app_web_url ---

    @property
    def vk_login_web_redirect(self) -> str:
        """Redirect URI страницы возврата VK ID на вебе (/auth/vk/callback).
        Должен совпадать с адресом, зарегистрированным в приложении VK ID."""
        if self.vk_login_redirect_uri:
            return self.vk_login_redirect_uri
        base = (self.app_web_url or "").rstrip("/")
        return f"{base}/auth/vk/callback" if base else ""

    @property
    def vk_id_host(self) -> str:
        """Хост VK ID для серверных эндпоинтов и виджета. По умолчанию id.vk.ru
        (совпадает с дефолтом @vkid/sdk)."""
        return (self.vk_id_domain or "").strip() or "id.vk.ru"

settings = Settings()