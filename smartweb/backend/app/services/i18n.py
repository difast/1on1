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
        "ru": "Подтвердите почту — и добро пожаловать в OneOnOne 🎉",
        "en": "Confirm your email — welcome to OneOnOne 🎉",
        "kz": "Поштаңызды растаңыз — OneOnOne-ге қош келдіңіз 🎉",
    },
    "email.confirm.intro": {
        "ru": "Рады видеть вас в OneOnOne! Остался один шаг: подтвердите свою почту, нажав на кнопку ниже, — и можно начинать.",
        "en": "Great to have you at OneOnOne! Just one step left: confirm your email with the button below and you are all set.",
        "kz": "Сізді OneOnOne-де көргенімізге қуаныштымыз! Бір ғана қадам қалды: төмендегі түймені басып, поштаңызды растаңыз — бастауға болады.",
    },
    "email.confirm.button": {
        "ru": "Подтвердить почту",
        "en": "Confirm email",
        "kz": "Поштаны растау",
    },
    "email.confirm.note": {
        "ru": "Ссылка действует 24 часа. Если вы не регистрировались в OneOnOne — просто не обращайте внимания на это письмо, ничего не произойдёт. 🙂",
        "en": "The link works for 24 hours. If you did not sign up for OneOnOne, just ignore this email — nothing will happen. 🙂",
        "kz": "Сілтеме 24 сағат жарамды. Егер OneOnOne-ге тіркелмеген болсаңыз, бұл хатты елемей қойыңыз — ешнәрсе болмайды. 🙂",
    },
    # ── Письмо: сброс пароля ──────────────────────────────────────────────────
    "email.reset.subject": {
        "ru": "Восстановление пароля OneOnOne 🔑",
        "en": "Reset your OneOnOne password 🔑",
        "kz": "OneOnOne құпиясөзін қалпына келтіру 🔑",
    },
    "email.reset.intro": {
        "ru": "Ничего страшного, такое бывает! Мы получили запрос на сброс пароля для вашего аккаунта в OneOnOne. Чтобы задать новый пароль, нажмите на кнопку ниже.",
        "en": "No worries, it happens! We received a request to reset the password for your OneOnOne account. Just tap the button below to set a new one.",
        "kz": "Мұндай жағдай бола береді, уайымдамаңыз! OneOnOne аккаунтыңыздың құпиясөзін қалпына келтіру сұрауын алдық. Жаңа құпиясөз орнату үшін төмендегі түймені басыңыз.",
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
        "ru": "Здравствуйте! 👋",
        "en": "Hello! 👋",
        "kz": "Сәлеметсіз бе! 👋",
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
    # ── Telegram-бот: ответы команд ───────────────────────────────────────────
    "bot.status.inProgress": {
        "ru": "В работе",
        "en": "In progress",
        "kz": "Орындалуда",
    },
    "bot.status.review": {
        "ru": "На ревью",
        "en": "In review",
        "kz": "Тексеруде",
    },
    "bot.status.blocked": {
        "ru": "Блокер",
        "en": "Blocked",
        "kz": "Кедергі",
    },
    "bot.status.done": {
        "ru": "Готово",
        "en": "Done",
        "kz": "Дайын",
    },
    "bot.action.backToWork": {
        "ru": "Вернуть в работу",
        "en": "Move back to in progress",
        "kz": "Қайта жұмысқа қайтару",
    },
    "bot.action.markBlocked": {
        "ru": "Отметить блокером",
        "en": "Mark as blocked",
        "kz": "Кедергі деп белгілеу",
    },
    "bot.action.markDone": {
        "ru": "Отметить выполненной",
        "en": "Mark as done",
        "kz": "Орындалды деп белгілеу",
    },
    "bot.action.openApp": {
        "ru": "Открыть приложение",
        "en": "Open the app",
        "kz": "Қосымшаны ашу",
    },
    "bot.menu.agenda": {
        "ru": "Повестка",
        "en": "Agenda",
        "kz": "Күн тәртібі",
    },
    "bot.menu.newMeeting": {
        "ru": "Создать встречу",
        "en": "Schedule a meeting",
        "kz": "Кездесу құру",
    },
    "bot.menu.tasks": {
        "ru": "Задачи",
        "en": "Tasks",
        "kz": "Тапсырмалар",
    },
    "bot.menu.mood": {
        "ru": "Настроение",
        "en": "Mood",
        "kz": "Көңіл-күй",
    },
    "bot.menu.risks": {
        "ru": "Риски",
        "en": "Risks",
        "kz": "Тәуекелдер",
    },
    "bot.menu.knowledge": {
        "ru": "База знаний",
        "en": "Knowledge base",
        "kz": "Білім қоры",
    },
    "bot.menu.askPit": {
        "ru": "Спросить Пита",
        "en": "Ask Pit",
        "kz": "Питтен сұрау",
    },
    "bot.menu.support": {
        "ru": "Поддержка",
        "en": "Support",
        "kz": "Қолдау",
    },
    "bot.start.welcomeBack": {
        "ru": "С возвращением, {name}.",
        "en": "Welcome back, {name}.",
        "kz": "Қайта келгеніңізге қуаныштымыз, {name}.",
    },
    "bot.start.chooseAction": {
        "ru": "\n\nВыберите действие ниже или откройте приложение.",
        "en": "\n\nChoose an action below or open the app.",
        "kz": "\n\nТөменнен әрекетті таңдаңыз немесе қосымшаны ашыңыз.",
    },
    "bot.menu.title": {
        "ru": "Меню OneOnOne. Выберите действие:",
        "en": "OneOnOne menu. Choose an action:",
        "kz": "OneOnOne мәзірі. Әрекетті таңдаңыз:",
    },
    "bot.link.instructions": {
        "ru": "Чтобы связать Telegram с аккаунтом по email, войдите на сайте, откройте меню профиля, пункт «Привязать Telegram», и введите код:\n\n{code}\n\nКод действует 30 минут.",
        "en": "To link Telegram with your email account, log in on the website, open the profile menu, choose Link Telegram and enter this code:\n\n{code}\n\nThe code is valid for 30 minutes.",
        "kz": "Telegram-ды email аккаунтыңызбен байланыстыру үшін сайтқа кіріп, профиль мәзірінен «Telegram байланыстыру» тармағын ашыңыз да, кодты енгізіңіз:\n\n{code}\n\nКод 30 минут жарамды.",
    },
    "bot.agenda.noMeetings": {
        "ru": "Ближайших встреч нет.",
        "en": "There are no upcoming meetings.",
        "kz": "Жақын арада кездесулер жоқ.",
    },
    "bot.agenda.added": {
        "ru": "Добавлено в повестку встречи {when}:\n- {line}",
        "en": "Added to the agenda of the meeting on {when}:\n- {line}",
        "kz": "{when} кездесуінің күн тәртібіне қосылды:\n- {line}",
    },
    "bot.agenda.empty": {
        "ru": "Повестка пуста. Добавьте пункт: /agenda текст",
        "en": "The agenda is empty. Add an item: /agenda text",
        "kz": "Күн тәртібі бос. Тармақ қосыңыз: /agenda мәтін",
    },
    "bot.agenda.list": {
        "ru": "Повестка встречи {when}:\n\n{body}",
        "en": "Agenda for the meeting on {when}:\n\n{body}",
        "kz": "{when} кездесуінің күн тәртібі:\n\n{body}",
    },
    "bot.ask.hint": {
        "ru": "Напишите вопрос после /ask, например: /ask как подготовиться к 1-on-1.",
        "en": "Write your question after /ask, for example: /ask how do I prepare for a 1-on-1.",
        "kz": "Сұрағыңызды /ask кейін жазыңыз, мысалы: /ask 1-on-1 кездесуге қалай дайындаламын.",
    },
    "bot.ask.failed": {
        "ru": "Пит не смог ответить, попробуйте позже.",
        "en": "Pit could not answer, please try again later.",
        "kz": "Пит жауап бере алмады, кейінірек қайталап көріңіз.",
    },
    "bot.ask.unavailable": {
        "ru": "Пит временно недоступен, попробуйте позже.",
        "en": "Pit is temporarily unavailable, please try again later.",
        "kz": "Пит уақытша қолжетімсіз, кейінірек қайталап көріңіз.",
    },
    "bot.knowledge.hint": {
        "ru": "Укажите запрос: /knowledge онбординг.",
        "en": "Add a query: /knowledge onboarding.",
        "kz": "Сұрауды көрсетіңіз: /knowledge онбординг.",
    },
    "bot.knowledge.nothing": {
        "ru": "По запросу ничего не найдено.",
        "en": "Nothing found for your query.",
        "kz": "Сұрау бойынша ештеңе табылмады.",
    },
    "bot.knowledge.more": {
        "ru": "\n\nЕщё найдено:",
        "en": "\n\nAlso found:",
        "kz": "\n\nТағы табылды:",
    },
    "bot.tasks.none": {
        "ru": "Открытых задач нет.",
        "en": "There are no open tasks.",
        "kz": "Ашық тапсырмалар жоқ.",
    },
    "bot.tasks.card": {
        "ru": "Задача: {title}\nТекущий статус: {label}\nВыберите новый статус:",
        "en": "Task: {title}\nCurrent status: {label}\nChoose a new status:",
        "kz": "Тапсырма: {title}\nАғымдағы күйі: {label}\nЖаңа күйді таңдаңыз:",
    },
    "bot.noTeam": {
        "ru": "Вы пока не в команде.",
        "en": "You are not on a team yet.",
        "kz": "Сіз әзірге командада емессіз.",
    },
    "bot.mood.question": {
        "ru": "Как настроение сегодня? Оцените от 1 (плохо) до 5 (отлично).",
        "en": "How are you feeling today? Rate from 1 (bad) to 5 (great).",
        "kz": "Бүгін көңіл-күйіңіз қалай? 1-ден (нашар) 5-ке (өте жақсы) дейін бағалаңыз.",
    },
    "bot.risks.noTeams": {
        "ru": "У вас пока нет команд как у тимлида. Риски появятся, когда вы создадите команду и начнёте проводить встречи.",
        "en": "You do not lead any teams yet. Risks appear once you create a team and start holding meetings.",
        "kz": "Сізде әзірге жетекші ретінде команда жоқ. Тәуекелдер команда құрып, кездесулер өткізе бастағанда пайда болады.",
    },
    "bot.risk.high": {
        "ru": "высокий",
        "en": "high",
        "kz": "жоғары",
    },
    "bot.risk.medium": {
        "ru": "средний",
        "en": "medium",
        "kz": "орташа",
    },
    "bot.action.scheduleMeeting": {
        "ru": "Назначить встречу",
        "en": "Schedule a meeting",
        "kz": "Кездесу тағайындау",
    },
    "bot.action.showContact": {
        "ru": "Показать контакт",
        "en": "Show contact",
        "kz": "Байланысты көрсету",
    },
    "bot.risk.line": {
        "ru": "Риск ({level}): {name} — давно не было встречи.",
        "en": "Risk ({level}): {name} — no meeting for a long time.",
        "kz": "Тәуекел ({level}): {name} — ұзақ уақыт кездесу болмады.",
    },
    "bot.risks.noMembers": {
        "ru": "В ваших командах пока нет участников — риски оценивать не по кому. Добавьте участников в приложении.",
        "en": "Your teams have no members yet — there is nobody to assess. Add members in the app.",
        "kz": "Командаларыңызда әзірге қатысушылар жоқ — тәуекелді бағалайтын ешкім жоқ. Қосымшада қатысушылар қосыңыз.",
    },
    "bot.risks.none": {
        "ru": "Рисков не обнаружено: встречи проходят вовремя.",
        "en": "No risks found: meetings are happening on time.",
        "kz": "Тәуекелдер табылмады: кездесулер уақытында өтіп жатыр.",
    },
    "bot.risks.failed": {
        "ru": "Не удалось получить риски, попробуйте позже.",
        "en": "Could not load risks, please try again later.",
        "kz": "Тәуекелдерді алу мүмкін болмады, кейінірек қайталап көріңіз.",
    },
    "bot.support.prompt": {
        "ru": "Опишите ваш вопрос одним сообщением — мы создадим обращение в поддержку. Ответ придёт в этот чат и в приложение. Отмена — /cancel.",
        "en": "Describe your question in one message — we will create a support request. The reply arrives in this chat and in the app. To cancel, send /cancel.",
        "kz": "Сұрағыңызды бір хабарламамен сипаттаңыз — қолдау қызметіне өтініш жасаймыз. Жауап осы чатқа және қосымшаға келеді. Болдырмау — /cancel.",
    },
    "bot.meeting.onlyLead": {
        "ru": "Создавать встречи может тимлид команды.",
        "en": "Only the team lead can create meetings.",
        "kz": "Кездесулерді команда жетекшісі ғана құра алады.",
    },
    "bot.meeting.chooseTeam": {
        "ru": "Выберите команду:",
        "en": "Choose a team:",
        "kz": "Команданы таңдаңыз:",
    },
    "bot.meeting.noMembers": {
        "ru": "В команде нет участников для встречи.",
        "en": "The team has no members for a meeting.",
        "kz": "Командада кездесуге қатысушылар жоқ.",
    },
    "bot.meeting.chooseMember": {
        "ru": "Выберите участника:",
        "en": "Choose a member:",
        "kz": "Қатысушыны таңдаңыз:",
    },
    "bot.meeting.enterDate": {
        "ru": "Введите дату и время в формате ДД.ММ ЧЧ:ММ (например 05.08 14:30). Отмена — /cancel.",
        "en": "Enter the date and time as DD.MM HH:MM (for example 05.08 14:30). To cancel, send /cancel.",
        "kz": "Күні мен уақытын КК.АА СС:ММ форматында енгізіңіз (мысалы 05.08 14:30). Болдырмау — /cancel.",
    },
    "bot.meeting.missingData": {
        "ru": "Не хватает данных, начните заново: /newmeeting",
        "en": "Some data is missing, start again: /newmeeting",
        "kz": "Дерек жеткіліксіз, қайта бастаңыз: /newmeeting",
    },
    "bot.meeting.failedDetail": {
        "ru": "Не удалось создать встречу: {detail}",
        "en": "Could not create the meeting: {detail}",
        "kz": "Кездесу құру мүмкін болмады: {detail}",
    },
    "bot.meeting.failed": {
        "ru": "Не удалось создать встречу.",
        "en": "Could not create the meeting.",
        "kz": "Кездесу құру мүмкін болмады.",
    },
    "bot.needStart": {
        "ru": "Сначала отправьте /start",
        "en": "Send /start first",
        "kz": "Алдымен /start жіберіңіз",
    },
    "bot.task.status": {
        "ru": "Статус: {label}",
        "en": "Status: {label}",
        "kz": "Күйі: {label}",
    },
    "bot.mood.saved": {
        "ru": "Спасибо, оценка {score} сохранена.",
        "en": "Thank you, your rating of {score} is saved.",
        "kz": "Рақмет, {score} бағасы сақталды.",
    },
    "bot.saved": {
        "ru": "Сохранено",
        "en": "Saved",
        "kz": "Сақталды",
    },
    "bot.startOver": {
        "ru": "Начните заново: /newmeeting",
        "en": "Start again: /newmeeting",
        "kz": "Қайта бастаңыз: /newmeeting",
    },
    "bot.notSet": {
        "ru": "не указан",
        "en": "not set",
        "kz": "көрсетілмеген",
    },
    "bot.notFound": {
        "ru": "не найден",
        "en": "not found",
        "kz": "табылмады",
    },
    "bot.knowledge.usage": {
        "ru": "Поиск по базе знаний: отправьте сообщение /knowledge и запрос, например: /knowledge онбординг.",
        "en": "Knowledge base search: send /knowledge followed by a query, for example: /knowledge onboarding.",
        "kz": "Білім қорынан іздеу: /knowledge және сұрауды жіберіңіз, мысалы: /knowledge онбординг.",
    },
    "bot.ask.usage": {
        "ru": "Вопрос ассистенту: отправьте сообщение /ask и текст, например: /ask как подготовиться к встрече.",
        "en": "Ask the assistant: send /ask followed by your question, for example: /ask how do I prepare for a meeting.",
        "kz": "Көмекшіге сұрақ: /ask және мәтінді жіберіңіз, мысалы: /ask кездесуге қалай дайындаламын.",
    },
    "bot.error": {
        "ru": "Ошибка, попробуйте позже",
        "en": "Something went wrong, please try again later",
        "kz": "Қате, кейінірек қайталап көріңіз",
    },
    "bot.needStartToLogin": {
        "ru": "Сначала отправьте /start, чтобы войти.",
        "en": "Send /start first to log in.",
        "kz": "Кіру үшін алдымен /start жіберіңіз.",
    },
    "bot.cancelled": {
        "ru": "Отменено.",
        "en": "Cancelled.",
        "kz": "Тоқтатылды.",
    },
    "bot.badDate": {
        "ru": "Не понял дату. Формат: ДД.ММ ЧЧ:ММ (например 05.08 14:30).",
        "en": "I did not understand the date. Format: DD.MM HH:MM (for example 05.08 14:30).",
        "kz": "Күнді түсінбедім. Форматы: КК.АА СС:ММ (мысалы 05.08 14:30).",
    },
    "bot.support.subject": {
        "ru": "Обращение из Telegram",
        "en": "Request from Telegram",
        "kz": "Telegram арқылы өтініш",
    },
    "bot.support.sent": {
        "ru": "Обращение отправлено в поддержку. Ответ придёт в этот чат и в приложение.",
        "en": "Your request has been sent to support. The reply arrives in this chat and in the app.",
        "kz": "Өтініш қолдау қызметіне жіберілді. Жауап осы чатқа және қосымшаға келеді.",
    },
    "bot.support.failed": {
        "ru": "Не удалось отправить обращение, попробуйте позже.",
        "en": "Could not send the request, please try again later.",
        "kz": "Өтінішті жіберу мүмкін болмады, кейінірек қайталап көріңіз.",
    },
    "bot.commands": {
        "ru": "Команды: /agenda, /newmeeting, /tasks, /mood, /risks, /ask, /knowledge, /support, /language, /menu.",
        "en": "Commands: /agenda, /newmeeting, /tasks, /mood, /risks, /ask, /knowledge, /support, /language, /menu.",
        "kz": "Командалар: /agenda, /newmeeting, /tasks, /mood, /risks, /ask, /knowledge, /support, /language, /menu.",
    },
    # ── Пуш-уведомления и напоминания ────────────────────────────────────────
    "notify.meetingScheduled.title": {
        "ru": "Встреча запланирована",
        "en": "Meeting scheduled",
        "kz": "Кездесу жоспарланды",
    },
    "notify.meetingScheduled.body": {
        "ru": "{lead} назначил встречу на {when}",
        "en": "{lead} scheduled a meeting for {when}",
        "kz": "{lead} {when} уақытына кездесу тағайындады",
    },
    "notify.meetingRequested.title": {
        "ru": "Запрос на встречу",
        "en": "Meeting request",
        "kz": "Кездесу сұрауы",
    },
    "notify.meetingRequested.body": {
        "ru": "{member} хочет провести 1-on-1",
        "en": "{member} wants to hold a 1-on-1",
        "kz": "{member} 1-on-1 кездесу өткізгісі келеді",
    },
    "notify.meetingConfirmed.title": {
        "ru": "Встреча подтверждена",
        "en": "Meeting confirmed",
        "kz": "Кездесу расталды",
    },
    "notify.meetingConfirmed.body": {
        "ru": "{lead} подтвердил встречу на {when}",
        "en": "{lead} confirmed the meeting for {when}",
        "kz": "{lead} {when} кездесуін растады",
    },
    "notify.meetingDeclined.title": {
        "ru": "Встреча отклонена",
        "en": "Meeting declined",
        "kz": "Кездесуден бас тартылды",
    },
    "notify.meetingDeclined.body": {
        "ru": "{lead} отклонил запрос на встречу",
        "en": "{lead} declined the meeting request",
        "kz": "{lead} кездесу сұрауынан бас тартты",
    },
    "notify.meetingReminder.title": {
        "ru": "Напоминание о встрече",
        "en": "Meeting reminder",
        "kz": "Кездесу туралы еске салу",
    },
    "notify.meetingReminder.body": {
        "ru": "Встреча с {name} в {when}",
        "en": "Meeting with {name} at {when}",
        "kz": "{name} қатысатын кездесу {when}",
    },
    "notify.meetingRequest.title": {
        "ru": "Запрос на встречу от {name}",
        "en": "Meeting request from {name}",
        "kz": "{name} жіберген кездесу сұрауы",
    },
    "notify.meetingRequest.body": {
        "ru": "Нажмите, чтобы подтвердить или отклонить",
        "en": "Tap to confirm or decline",
        "kz": "Растау немесе бас тарту үшін басыңыз",
    },
    "notify.callStarted.title": {
        "ru": "{name} начал созвон",
        "en": "{name} started a call",
        "kz": "{name} қоңырауды бастады",
    },
    "notify.callStarted.body": {
        "ru": "Нажмите «Присоединиться», чтобы войти",
        "en": "Tap Join to enter",
        "kz": "Кіру үшін «Қосылу» түймесін басыңыз",
    },
    "notify.taskAssigned.title": {
        "ru": "Новая задача",
        "en": "New task",
        "kz": "Жаңа тапсырма",
    },
    "notify.taskAssigned.body": {
        "ru": "{assigner}: {task}",
        "en": "{assigner}: {task}",
        "kz": "{assigner}: {task}",
    },
    "notify.burnout.title": {
        "ru": "{name} перенёс встречу {count} раз",
        "en": "{name} rescheduled the meeting {count} times",
        "kz": "{name} кездесуді {count} рет ауыстырды",
    },
    "notify.burnout.body": {
        "ru": "Рассмотрите возможность личного общения",
        "en": "Consider talking in person",
        "kz": "Жеке сөйлесуді қарастырыңыз",
    },
    "notify.meetingTomorrow.title": {
        "ru": "1-on-1 с {name} завтра",
        "en": "1-on-1 with {name} tomorrow",
        "kz": "{name} қатысатын 1-on-1 ертең",
    },
    "notify.meetingTomorrow.body": {
        "ru": "Запланировано на {time}",
        "en": "Scheduled for {time}",
        "kz": "{time} уақытына жоспарланған",
    },
    "notify.meetingInHour.title": {
        "ru": "Встреча через час",
        "en": "Meeting in an hour",
        "kz": "Бір сағаттан кейін кездесу",
    },
    "notify.meetingInHour.body": {
        "ru": "1-on-1 с {name}",
        "en": "1-on-1 with {name}",
        "kz": "{name} қатысатын 1-on-1",
    },
    "notify.noMeetingLong.title": {
        "ru": "Давно не было 1-on-1 с {name}",
        "en": "No 1-on-1 with {name} for a while",
        "kz": "{name} қатысатын 1-on-1 ұзақ болмады",
    },
    "notify.noMeetingLong.body": {
        "ru": "Прошло {days} дн., рекомендуется каждые {cadence} дн.",
        "en": "{days} days have passed, the recommended cadence is every {cadence} days",
        "kz": "{days} күн өтті, ұсынылатын жиілік — әр {cadence} күн сайын",
    },
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
    # ── Взаимодействия и развитие ────────────────────────────────────────────
    "interaction.type.collab": {
        "ru": "Предложение совместной работы",
        "en": "Collaboration proposal",
        "kz": "Бірлескен жұмыс ұсынысы",
    },
    "interaction.type.help": {
        "ru": "Предложение помощи",
        "en": "Offer of help",
        "kz": "Көмек ұсынысы",
    },
    "interaction.type.consultation": {
        "ru": "Запрос консультации",
        "en": "Consultation request",
        "kz": "Кеңес сұрауы",
    },
    "interaction.type.discussion": {
        "ru": "Обсуждение",
        "en": "Discussion",
        "kz": "Талқылау",
    },
    "interaction.type.recommendation": {
        "ru": "Рекомендация",
        "en": "Recommendation",
        "kz": "Ұсыныс",
    },
    "interaction.generic": {
        "ru": "Взаимодействие",
        "en": "Interaction",
        "kz": "Өзара әрекет",
    },
    "interaction.newDiscussion": {
        "ru": "Новое обсуждение",
        "en": "New discussion",
        "kz": "Жаңа талқылау",
    },
    "interaction.recommended": {
        "ru": "Вас рекомендовали",
        "en": "You have been recommended",
        "kz": "Сізді ұсынды",
    },
    "interaction.colleagueRec": {
        "ru": "Рекомендация коллеги",
        "en": "Colleague recommendation",
        "kz": "Әріптестің ұсынысы",
    },
    "interaction.newReply": {
        "ru": "Новый ответ",
        "en": "New reply",
        "kz": "Жаңа жауап",
    },
    "interaction.accepted.title": {
        "ru": "Предложение принято",
        "en": "Proposal accepted",
        "kz": "Ұсыныс қабылданды",
    },
    "interaction.declined.title": {
        "ru": "Предложение отклонено",
        "en": "Proposal declined",
        "kz": "Ұсыныс қабылданбады",
    },
    "interaction.body.fromTopic": {
        "ru": "{name}: {topic}",
        "en": "{name}: {topic}",
        "kz": "{name}: {topic}",
    },
    "interaction.body.recommends": {
        "ru": "{name} рекомендует {subject}",
        "en": "{name} recommends {subject}",
        "kz": "{name} {subject} ұсынады",
    },
    "interaction.body.accepted": {
        "ru": "{name} принял(а) совместную работу",
        "en": "{name} accepted the collaboration",
        "kz": "{name} бірлескен жұмысты қабылдады",
    },
    "interaction.body.declined": {
        "ru": "{name} отклонил(а)",
        "en": "{name} declined",
        "kz": "{name} қабылдамады",
    },
    "interaction.fallback.discussion": {
        "ru": "обсуждение",
        "en": "discussion",
        "kz": "талқылау",
    },
    "interaction.fallback.expert": {
        "ru": "эксперт",
        "en": "expert",
        "kz": "сарапшы",
    },
    "dev.notify.stepAssigned": {
        "ru": "Назначен шаг развития",
        "en": "Development step assigned",
        "kz": "Даму қадамы тағайындалды",
    },
    "dev.notify.planComment": {
        "ru": "Комментарий к плану развития",
        "en": "Comment on the development plan",
        "kz": "Даму жоспарына пікір",
    },
    "dev.notify.feedback": {
        "ru": "Обратная связь по развитию",
        "en": "Development feedback",
        "kz": "Даму бойынша кері байланыс",
    },
    "dev.notify.growthAssigned": {
        "ru": "Назначено направление роста",
        "en": "Growth area assigned",
        "kz": "Даму бағыты тағайындалды",
    },
    "dev.notify.growthAccepted": {
        "ru": "Направление роста принято",
        "en": "Growth area accepted",
        "kz": "Даму бағыты қабылданды",
    },
    "dev.notify.growthDeclined": {
        "ru": "Направление роста отклонено",
        "en": "Growth area declined",
        "kz": "Даму бағыты қабылданбады",
    },
    "dev.notify.targetReached": {
        "ru": "Достигнут целевой уровень",
        "en": "Target level reached",
        "kz": "Мақсатты деңгейге жетті",
    },
    "dev.rec.closeGap": {
        "ru": "Закрыть разрыв по навыку «{skill}»",
        "en": "Close the gap in the “{skill}” skill",
        "kz": "«{skill}» дағдысы бойынша алшақтықты жабу",
    },
    "dev.rec.levels": {
        "ru": "Текущий уровень — {cur}, целевой — {des}. Добавьте шаг плана, чтобы двигаться к цели.",
        "en": "Current level is {cur}, target is {des}. Add a plan step to move towards the goal.",
        "kz": "Ағымдағы деңгей — {cur}, мақсатты — {des}. Мақсатқа жылжу үшін жоспарға қадам қосыңыз.",
    },
    "dev.rec.material": {
        "ru": "Материал базы знаний: {title}",
        "en": "Knowledge base material: {title}",
        "kz": "Білім қоры материалы: {title}",
    },
    "dev.rec.studyMaterial": {
        "ru": "Изучите материал, связанный с этим навыком.",
        "en": "Study the material related to this skill.",
        "kz": "Осы дағдыға қатысты материалды оқып шығыңыз.",
    },
    "dev.pitTitle": {
        "ru": "Пит: как развивать «{skill}»",
        "en": "Pit: how to develop “{skill}”",
        "kz": "Пит: «{skill}» дағдысын қалай дамытуға болады",
    },
    "dev.skillProgress": {
        "ru": "{name}: навык «{skill}» — {level}",
        "en": "{name}: skill “{skill}” — {level}",
        "kz": "{name}: «{skill}» дағдысы — {level}",
    },
    "interaction.fallback.member": {
        "ru": "Участник",
        "en": "Team member",
        "kz": "Қатысушы",
    },

    # --- Предложения встреч ---
    "proposal.new.title": {
        "ru": "Предложение встречи",
        "en": "Meeting proposal",
        "kz": "Кездесу ұсынысы",
    },
    "proposal.new.body": {
        "ru": "{name} предлагает встречу {when}",
        "en": "{name} proposes a meeting on {when}",
        "kz": "{name} {when} кездесуді ұсынады",
    },
    "proposal.new.bodyTopic": {
        "ru": "{name} предлагает встречу {when}: {topic}",
        "en": "{name} proposes a meeting on {when}: {topic}",
        "kz": "{name} {when} кездесуді ұсынады: {topic}",
    },
    "proposal.accepted.title": {
        "ru": "Встреча подтверждена",
        "en": "Meeting confirmed",
        "kz": "Кездесу расталды",
    },
    "proposal.accepted.body": {
        "ru": "{name} принял предложение встречи на {when}",
        "en": "{name} accepted the meeting proposal for {when}",
        "kz": "{name} {when} кездесу ұсынысын қабылдады",
    },
    "proposal.declined.title": {
        "ru": "Предложение встречи отклонено",
        "en": "Meeting proposal declined",
        "kz": "Кездесу ұсынысы қабылданбады",
    },
    "proposal.declined.body": {
        "ru": "{name} отклонил предложение встречи",
        "en": "{name} declined the meeting proposal",
        "kz": "{name} кездесу ұсынысын қабылдамады",
    },
    "proposal.counter.title": {
        "ru": "Предложено другое время",
        "en": "Another time proposed",
        "kz": "Басқа уақыт ұсынылды",
    },
    "proposal.counter.body": {
        "ru": "{name} предлагает встречу {when}",
        "en": "{name} proposes a meeting on {when}",
        "kz": "{name} {when} кездесуді ұсынады",
    },

    # --- Предложения задач ---
    "taskProposal.new.title": {
        "ru": "Предложение задачи",
        "en": "Task proposal",
        "kz": "Тапсырма ұсынысы",
    },
    "taskProposal.new.body": {
        "ru": "{name} предлагает вам задачу: {title}",
        "en": "{name} proposes a task for you: {title}",
        "kz": "{name} сізге тапсырма ұсынады: {title}",
    },
    "taskProposal.accepted.title": {
        "ru": "Предложение задачи принято",
        "en": "Task proposal accepted",
        "kz": "Тапсырма ұсынысы қабылданды",
    },
    "taskProposal.accepted.body": {
        "ru": "{name} принял задачу: {title}",
        "en": "{name} accepted the task: {title}",
        "kz": "{name} тапсырманы қабылдады: {title}",
    },
    "taskProposal.declined.title": {
        "ru": "Предложение задачи отклонено",
        "en": "Task proposal declined",
        "kz": "Тапсырма ұсынысы қабылданбады",
    },
    "taskProposal.declined.body": {
        "ru": "{name} отклонил задачу: {title}",
        "en": "{name} declined the task: {title}",
        "kz": "{name} тапсырмадан бас тартты: {title}",
    },
    "taskProposal.comment.title": {
        "ru": "Обсуждение задачи",
        "en": "Task discussion",
        "kz": "Тапсырманы талқылау",
    },
    "taskProposal.comment.body": {
        "ru": "{name}: {note}",
        "en": "{name}: {note}",
        "kz": "{name}: {note}",
    },

    # --- Задачи: комментарии и активность ---
    "task.comment.title": {
        "ru": "Комментарий к задаче",
        "en": "Task comment",
        "kz": "Тапсырмаға пікір",
    },
    "task.comment.body": {
        "ru": "{name}: {title}",
        "en": "{name}: {title}",
        "kz": "{name}: {title}",
    },
    "notify.task.updated.title": {
        "ru": "Обновление задачи",
        "en": "Task update",
        "kz": "Тапсырма жаңартылды",
    },
    "notify.task.updated.body": {
        "ru": "{name}: {title}",
        "en": "{name}: {title}",
        "kz": "{name}: {title}",
    },
    "task.assignee.added.title": {
        "ru": "Вас добавили в задачу",
        "en": "You were added to a task",
        "kz": "Сіз тапсырмаға қосылдыңыз",
    },
    "task.assignee.added.body": {
        "ru": "{name}: {title}",
        "en": "{name}: {title}",
        "kz": "{name}: {title}",
    },
    "task.assignee.removed.title": {
        "ru": "Вас удалили из задачи",
        "en": "You were removed from a task",
        "kz": "Сіз тапсырмадан шығарылдыңыз",
    },
    "task.assignee.removed.body": {
        "ru": "{title}",
        "en": "{title}",
        "kz": "{title}",
    },
    "goal.comment.team.title": {
        "ru": "Комментарий к командной цели",
        "en": "Comment on a team goal",
        "kz": "Команда мақсатына пікір",
    },
    "goal.comment.title": {
        "ru": "Комментарий к цели",
        "en": "Comment on a goal",
        "kz": "Мақсатқа пікір",
    },
    "goal.feedback.title": {
        "ru": "Обратная связь по цели",
        "en": "Feedback on a goal",
        "kz": "Мақсат бойынша кері байланыс",
    },
    "goal.comment.body": {
        "ru": "{name}: {text}",
        "en": "{name}: {text}",
        "kz": "{name}: {text}",
    },
    # --- Страница подтверждения почты (переход по ссылке из письма) ---
    "email.confirm.page.title": {
        "ru": "Подтверждение почты",
        "en": "Email confirmation",
        "kz": "Поштаны растау",
    },
    "email.confirm.page.ok": {
        "ru": "Почта подтверждена. Можно вернуться в приложение.",
        "en": "Your email is confirmed. You can return to the app.",
        "kz": "Пошта расталды. Қосымшаға оралуыңызға болады.",
    },
    "email.confirm.page.fail": {
        "ru": "Ссылка недействительна или устарела.",
        "en": "The link is invalid or has expired.",
        "kz": "Сілтеме жарамсыз немесе мерзімі өткен.",
    },

    # --- Настроение: напоминание и сводка ---
    "mood.reminder.title": {
        "ru": "Как прошёл ваш день?",
        "en": "How was your day?",
        "kz": "Күніңіз қалай өтті?",
    },
    "mood.reminder.body": {
        "ru": "Пройдите короткий опрос настроения в приложении",
        "en": "Take a short mood check-in in the app",
        "kz": "Қосымшада қысқа көңіл-күй сауалнамасынан өтіңіз",
    },
    "mood.summary.title": {
        "ru": "Сводка настроения команды",
        "en": "Team mood summary",
        "kz": "Команда көңіл-күйінің қорытындысы",
    },
    "mood.summary.insufficient": {
        "ru": "Недостаточно данных для анонимной статистики за сегодня (заполнили {filled} из {size}, нужно от {threshold}).",
        "en": "Not enough data for anonymous statistics today ({filled} of {size} responded, at least {threshold} required).",
        "kz": "Бүгінгі анонимді статистика үшін деректер жеткіліксіз ({size} адамның {filled} толтырды, кемінде {threshold} қажет).",
    },
    "mood.summary.body": {
        "ru": "Средний уровень: {avg} из 5. Заполнили: {filled} из {size}{share}.{delta}",
        "en": "Average level: {avg} out of 5. Responded: {filled} of {size}{share}.{delta}",
        "kz": "Орташа деңгей: 5-тен {avg}. Толтырды: {size} адамның {filled}{share}.{delta}",
    },
    "mood.summary.delta": {
        "ru": " Динамика к вчера: {sign}{value}.",
        "en": " Change vs yesterday: {sign}{value}.",
        "kz": " Кешеге қарағанда өзгеріс: {sign}{value}.",
    },
    "task.activity.commented": {
        "ru": "{name} оставил(а) комментарий",
        "en": "{name} left a comment",
        "kz": "{name} пікір қалдырды",
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
