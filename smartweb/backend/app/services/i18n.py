"""Серверные переводы: письма, тексты бота, пуш-уведомления.

Интерфейсные строки живут во фронтовых словарях (smartweb/frontend/src/i18n),
но письма, ответы Telegram-бота и пуши формирует сервер — их переводы здесь.

Язык берётся из профиля пользователя (users.preferred_language). Если он не
задан, используется русский: серверные тексты уходят человеку, который язык ещё
не выбирал, и русский остаётся языком продукта по умолчанию.

Ключи и терминология те же, что во фронтовых словарях (Пит, ONE AI, 1-on-1,
чек-ин, команда жетекшісі и т.д.) — термины не должны расходиться между
интерфейсом и письмами.
"""

DEFAULT_LANG = "ru"
SUPPORTED_LANGS = ("ru", "en", "kz")

# Формат: TEXTS[ключ][язык]. Плейсхолдеры — обычный str.format ({link}, {name}).
TEXTS: dict[str, dict[str, str]] = {
    # ── Письмо: подтверждение почты ───────────────────────────────────────────
    "email.confirm.subject": {
        "ru": "Подтвердите почту для OneOnOne",
        "en": "Confirm your email for OneOnOne",
        "kz": "OneOnOne үшін поштаңызды растаңыз",
    },
    "email.confirm.intro": {
        "ru": "Чтобы завершить регистрацию в OneOnOne, подтвердите свою почту — нажмите на кнопку ниже.",
        "en": "To finish signing up for OneOnOne, confirm your email address using the button below.",
        "kz": "OneOnOne қызметінде тіркелуді аяқтау үшін поштаңызды растаңыз — төмендегі түймені басыңыз.",
    },
    "email.confirm.button": {
        "ru": "Подтвердить почту",
        "en": "Confirm email",
        "kz": "Поштаны растау",
    },
    "email.confirm.note": {
        "ru": "Ссылка действительна 24 часа. Если вы не регистрировались в OneOnOne, просто проигнорируйте это письмо.",
        "en": "The link is valid for 24 hours. If you did not sign up for OneOnOne, you can safely ignore this email.",
        "kz": "Сілтеме 24 сағат бойы жарамды. Егер сіз OneOnOne қызметінде тіркелмеген болсаңыз, бұл хатты елемей қоюыңызға болады.",
    },
    # ── Письмо: сброс пароля ──────────────────────────────────────────────────
    "email.reset.subject": {
        "ru": "Восстановление пароля OneOnOne",
        "en": "Reset your OneOnOne password",
        "kz": "OneOnOne құпиясөзін қалпына келтіру",
    },
    "email.reset.intro": {
        "ru": "Мы получили запрос на сброс пароля для вашего аккаунта в OneOnOne. Чтобы задать новый пароль, нажмите на кнопку ниже.",
        "en": "We received a request to reset the password for your OneOnOne account. Use the button below to set a new one.",
        "kz": "OneOnOne аккаунтыңыздың құпиясөзін қалпына келтіру сұрауын алдық. Жаңа құпиясөз орнату үшін төмендегі түймені басыңыз.",
    },
    "email.reset.button": {
        "ru": "Сбросить пароль",
        "en": "Reset password",
        "kz": "Құпиясөзді қалпына келтіру",
    },
    "email.reset.note": {
        "ru": "Ссылка действительна 3 часа. Если вы запрашивали сброс несколько раз, работает только ссылка из самого последнего письма. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — ваш текущий пароль останется без изменений.",
        "en": "The link is valid for 3 hours. If you requested a reset more than once, only the link from the most recent email works. If you did not request a reset, ignore this email — your current password stays unchanged.",
        "kz": "Сілтеме 3 сағат бойы жарамды. Егер қалпына келтіруді бірнеше рет сұраған болсаңыз, тек соңғы хаттағы сілтеме жұмыс істейді. Егер сұрамаған болсаңыз, бұл хатты елемеңіз — ағымдағы құпиясөзіңіз өзгеріссіз қалады.",
    },
    # ── Общие элементы письма ────────────────────────────────────────────────
    "email.greeting": {
        "ru": "Здравствуйте!",
        "en": "Hello,",
        "kz": "Сәлеметсіз бе!",
    },
    "email.fallbackLink": {
        "ru": "Если кнопка не работает, откройте ссылку: {link}",
        "en": "If the button does not work, open this link: {link}",
        "kz": "Егер түйме жұмыс істемесе, сілтемені ашыңыз: {link}",
    },
    # ── Telegram-бот ─────────────────────────────────────────────────────────
    "bot.language.title": {
        "ru": "Выберите язык ответов бота:",
        "en": "Choose the language for bot replies:",
        "kz": "Бот жауаптарының тілін таңдаңыз:",
    },
    "bot.language.changed": {
        "ru": "Язык изменён на русский. Он применится и в веб-версии, и в приложении.",
        "en": "Language switched to English. It also applies to the web version and the mobile app.",
        "kz": "Тіл қазақ тіліне ауыстырылды. Ол веб-нұсқада да, қосымшада да қолданылады.",
    },
    "bot.language.needAccount": {
        "ru": "Сначала привяжите аккаунт командой /link — тогда выбор языка сохранится в профиле.",
        "en": "Link your account first with /link — then your language choice is saved to your profile.",
        "kz": "Алдымен /link командасымен аккаунтты байланыстырыңыз — сонда тіл таңдауы профильде сақталады.",
    },
    "bot.command.language": {
        "ru": "Язык интерфейса",
        "en": "Interface language",
        "kz": "Интерфейс тілі",
    },
    "bot.notLinked": {
        "ru": "Аккаунт не привязан. Отправьте /link, чтобы связать Telegram с профилем OneOnOne.",
        "en": "Your account is not linked. Send /link to connect Telegram with your OneOnOne profile.",
        "kz": "Аккаунт байланыстырылмаған. Telegram-ды OneOnOne профиліңізбен байланыстыру үшін /link жіберіңіз.",
    },
    # ── Пуш-уведомления и напоминания ────────────────────────────────────────
    "notify.meetingSoon.title": {
        "ru": "Скоро встреча",
        "en": "Meeting starts soon",
        "kz": "Кездесу жақында басталады",
    },
    "notify.meetingSoon.body": {
        "ru": "Встреча с {name} начнётся в {time}.",
        "en": "Your meeting with {name} starts at {time}.",
        "kz": "{name} қатысатын кездесу {time} басталады.",
    },
    "notify.taskAssigned.title": {
        "ru": "Назначена задача",
        "en": "Task assigned to you",
        "kz": "Сізге тапсырма берілді",
    },
    "notify.taskOverdue.title": {
        "ru": "Задача просрочена",
        "en": "Task overdue",
        "kz": "Тапсырманың мерзімі өтті",
    },
    "notify.checkinReminder.title": {
        "ru": "Напоминание о чек-ине",
        "en": "Check-in reminder",
        "kz": "Чек-ин туралы еске салу",
    },
    "notify.checkinReminder.body": {
        "ru": "Отметьте настроение за сегодня — это займёт меньше минуты.",
        "en": "Share how your day went — it takes less than a minute.",
        "kz": "Бүгінгі көңіл-күйіңізді белгілеңіз — бір минуттан аз уақыт алады.",
    },
}


def normalize_lang(lang: str | None) -> str:
    """Привести код языка к поддерживаемому. kk (BCP-47) считаем казахским."""
    code = (lang or "").strip().lower()
    if code.startswith("kk") or code.startswith("kz"):
        return "kz"
    code = code[:2]
    return code if code in SUPPORTED_LANGS else DEFAULT_LANG


def user_lang(user) -> str:
    """Язык пользователя из профиля (users.preferred_language)."""
    return normalize_lang(getattr(user, "preferred_language", None))


def t(key: str, lang: str | None = None, **kwargs) -> str:
    """Перевод по ключу. Недостающий перевод падает на русский, как на фронте."""
    code = normalize_lang(lang)
    variants = TEXTS.get(key)
    if not variants:
        return key
    text = variants.get(code) or variants.get(DEFAULT_LANG) or key
    return text.format(**kwargs) if kwargs else text
