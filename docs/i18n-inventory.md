# Инвентаризация строк интерфейса (i18n)

Файл генерируется скриптом `tools/i18n-inventory.py` — не редактируйте вручную.

В словарях (`ru.json`): **1384** ключей.

Ниже — строки с кириллицей, которые ещё захардкожены в коде и не вынесены
в словари, сгруппированные по разделам продукта.

| Клиент | Осталось строк |
|---|---|
| Веб | 808 |
| Мобильное приложение | 790 |
| Бэкенд (письма, бот, уведомления) | 650 |

## Прочее — 531

- `smartweb/backend/app/services/ai_context.py` — 69: в работе; заблокирована; на проверке
- `smartweb/backend/app/services/plans.py` — 44: 1-на-1 встречи; Предложения встреч; Задачи
- `smartweb/frontend/src/lib/coaching.js` — 38: участником; Это первая встреча 1-на-1 — фундамент дальнейших отношений.; Договориться об ожиданиях, целях и комфортной частоте встреч
- `mobile/src/lib/coaching.ts` — 37: Это первая встреча 1-на-1 — фундамент дальнейших отношений.; Договориться об ожиданиях, целях и комфортной частоте встреч; ,
      reason: lastMeetingDays !== null
        ? `Последня
- `smartweb/backend/app/routers/goal.py` — 29: Доступ только от своего имени; if ps and pe and pe > ps:
        total = (pe - ps).total_se; Некорректный статус
- `smartweb/backend/app/services/plan_change.py` — 25: :
        return int(plan.price_month or 0)
    return 0


d; Сейчас у вас команд: {len(teams)}, а новый тариф допускает {; Лишние команды нужно будет удалить или объединить.
- `mobile/src/components/DateTimePickerField.tsx` — 21: Пн; Вт; Ср
- `smartweb/backend/app/prompts.py` — 20: Ты {role_ctx} в IT-команде.\n; Задача: \"{title}\". Статус: {status_label}.{due_ctx}\n; Составь ровно 4 конкретных последовательных шага выполнения 
- `mobile/src/components/WeekCalendar.tsx` — 19: Пн; Вт; Ср
- `smartweb/frontend/src/lib/mailProviders.js` — 17: Открыть Gmail; Открыть Gmail; Открыть Яндекс Почту
- `mobile/src/lib/mailProviders.ts` — 17: Открыть Gmail; Открыть Gmail; Открыть Яндекс Почту
- `smartweb/backend/app/routers/proposal.py` — 14: ,
        awaiting_user_id=data.to_user_id,   # ждём ответа ; Участник; Предложение встречи
- `mobile/src/screens/MemberOverviewScreen.tsx` — 12: Как прошёл твой день?; Что давалось тяжелее всего?; Есть что-то, что хочешь обсудить с тимлидом?
- `smartweb/backend/app/services/entitlements.py` — 12: Эта функция; Функция «{label}» пока недоступна — {COMING_SOON_LABEL.lower; Функция «{label}» недоступна во время пробного периода.
- `smartweb/backend/app/tasks/reminders.py` — 12: 1-on-1 с {with_name} завтра; Запланировано на {time_str}; 1-on-1 с {with_name} завтра
- `smartweb/backend/app/routers/video.py` — 12: Спонтанный созвон может инициировать только тимлид команды; Тимлид; Быстрый созвон
- `smartweb/backend/app/main.py` — 11: Как прошёл ваш день?; Пройдите короткий опрос настроения в приложении; )
        for team in db.query(Team).all():
            try:
- `mobile/src/screens/SettingsScreen.tsx` — 9: Неверный код; Введите текущий пароль; Пароль: минимум 8 символов, буквы и цифры
- `smartweb/backend/app/routers/telegram.py` — 9: Не удалось проверить Telegram initData; : create_access_token(user.id)}


class WidgetAuth(BaseModel; Не удалось проверить подлинность Telegram
- `smartweb/frontend/src/components/WelcomeTour.jsx` — 8: ]', title: 'Разделы', text: 'Команды, встречи, задачи, замет; ]', title: 'Ассистент Пит', text: 'Спросите Пита про задачи ; ]', title: 'Уведомления', text: 'Запросы встреч, приближающи
- `mobile/src/components/admin/EmployeesTab.tsx` — 8: Администратор; Менеджер; Поддержка
- `mobile/src/components/admin/UserDetailModal.tsx` — 7: тимлид; участник; Не удалось сменить роль
- `smartweb/backend/app/routers/analytics.py` — 6: Отлично; Хорошо; Нейтрально
- `mobile/src/components/SpontaneousCallModal.tsx` — 5: Нет команды; Не удалось создать созвон; />
                <View style={{ flex: 1 }}>
              
- `smartweb/backend/app/config.py` — 5: # адрес отправителя; по умолчанию = smtp_user



    dadata_; # секрет, только env
    telegram_bot_username: str =; # напр. oneononehq_bot (без @) — публично
    telegram_webho
- `smartweb/backend/app/services/calendar_sync.py` — 5: , integ.provider, type(e).__name__)
        return access  #; 1-на-1: {other_name}; Встреча 1-на-1 в OneOnOne
- `smartweb/frontend/src/components/UserCard.jsx` — 4: export default function UserCard({ user, teamId, organizatio; Участник; Эксперт
- `mobile/src/components/StatusPicker.tsx` — 4: В работе; Заблокирована; На ревью
- `mobile/src/lib/featureLock.ts` — 4: ;


export interface FeatureLock {
  feature: string;
  feat; Эта функция; Эта функция
- `smartweb/backend/app/services/calendar_google.py` — 4: ,       # чтобы пришёл refresh_token; ,            # гарантируем refresh_token при повторном подкл; ),
            refresh_token=refresh_token,   # Google повто
- `smartweb/backend/app/routers/user.py` — 4: Зарегистрировались; Вступили в команду; Провели встречу
- `smartweb/frontend/src/components/ResetPasswordPage.jsx` — 3: Пароль должен быть не короче 8 символов; Пароль должен содержать буквы и цифры; Ссылка недействительна или устарела
- `smartweb/frontend/src/components/ConfirmEmailModal.jsx` — 3: />
          </svg>
        </div>

        <h2 style={{ fon; Регистрация завершена. Мы отправили письмо со ссылкой для по; Перейдите по ссылке из письма, чтобы продолжить. Вход в каби
- `smartweb/backend/app/schemas/goal.py` — 3: # personal / team (team ставит только тимлид)
    goal_kind:; # standard / learning (учебная цель модуля «Развитие»)
    s; # comment / feedback
    rating: Optional[int] = None  # тол
- `smartweb/frontend/src/components/AvatarCropModal.jsx` — 2: const VIEW = 280   // размер области редактирования (px)
con; , saving = false }) {
  const { t } = useTranslation()
  con
- `smartweb/frontend/src/components/TelegramApp.jsx` — 2: style={{ width: 28, height: 28, margin: '0 auto' }} /></Cent; Эта страница — мини-приложение Telegram. Откройте его через 
- `smartweb/frontend/src/components/ConfirmEmailPage.jsx` — 2: style={{ width: '100%' }}>{t('ui.voyti')}</button>
         ; Возможно, она устарела или уже использована. Запросите новое
- `smartweb/frontend/src/components/QuickWidget.jsx` — 2: style={{
        position: 'fixed',
        right: 24,
     ; Расписание
- `smartweb/frontend/src/lib/ui.jsx` — 2: Отмена; Подтвердить
- `smartweb/frontend/src/lib/featureLock.js` — 2: Эта функция; Эта функция
- `smartweb/backend/app/services/telegram.py` — 2: _CODE_TTL_MIN = 30
_WIDGET_MAX_AGE_SEC = 86400  # данные вид; Пользователь
- `smartweb/backend/app/services/webhooks.py` — 2: ,
)

_RETRIES = 3                 # число попыток доставки
_; )


def _matches(sub: WebhookSubscription, event_type: str) 
- `smartweb/backend/app/services/ai_service.py` — 2: AI_GATEWAY_KEY не задан; AI-функция вызвана без AI_GATEWAY_KEY — ответ недоступен
- `smartweb/backend/app/models/goal.py` — 2: ), nullable=True)
    title = Column(String(500), nullable=F; )
    rating = Column(Integer, nullable=True)  # только для 
- `smartweb/frontend/src/App.jsx` — 1: , JSON.stringify(data))
          setLoading(false)
        
- `smartweb/frontend/src/components/JitsiCall.jsx` — 1: }}>
                    {formatTime(MIN_ANALYTICS_SECONDS - 
- `smartweb/frontend/src/lib/Spinner.jsx` — 1: // Единый индикатор загрузки — тот самый крутящийся кружок, 
- `mobile/src/components/ClosedTodayCard.tsx` — 1: }
                        {t.is_multi && t.progress ? ` · ${
- `mobile/src/components/CallBanner.tsx` — 1: Завершить
- `mobile/src/components/admin/EntityPicker.tsx` — 1: Ничего не найдено
- `mobile/src/lib/api.ts` — 1: Превышено время ожидания
- `mobile/app/(auth)/auth/yandex/callback.tsx` — 1: )); return; }
    if (!code // !state) return;   // параметр
- `smartweb/backend/app/services/metrics.py` — 1: CAC/LTV/ROI требуют ввода: MARKETING_SPEND_KOPECKS, NEW_PAID
- `smartweb/backend/app/models/manager.py` — 1: )
    responsibility = Column(Text, nullable=True)  # зона о
- `smartweb/backend/app/models/user.py` — 1: )
    telegram = Column(String(100), nullable=True)  # @hand

## Юридические документы — 521

- `smartweb/frontend/src/lib/legalDocs.js` — 263: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; <h3>1. ОБЩИЕ ПОЛОЖЕНИЯ</h3><p>1.1. Настоящее Пользовательско
- `mobile/src/lib/legalDocs.ts` — 258: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; 1. ОБЩИЕ ПОЛОЖЕНИЯ

## Развитие — 147

- `smartweb/backend/app/routers/development.py` — 63: Правило; Тимлид; База знаний
- `smartweb/frontend/src/components/Development.jsx` — 35: Новичок; Базовый; Уверенный
- `mobile/src/screens/DevelopmentScreen.tsx` — 33: Новичок; Базовый; Уверенный
- `smartweb/backend/app/models/development.py` — 14: Новичок; Базовый; Уверенный
- `smartweb/backend/app/services/development_sync.py` — 1: :
            continue  # отменённый шаг не воскрешаем
     
- `smartweb/backend/app/schemas/development.py` — 1: team_id: Optional[int] = None


class SkillOut(BaseModel):
 

## Задачи — 146

- `smartweb/backend/app/routers/task_proposal.py` — 25: Нельзя предложить задачу самому себе; Укажите название задачи; Получатель не найден
- `mobile/src/components/TaskProposalsModal.tsx` — 18: Ожидает ответа; Обсуждается; Принято
- `smartweb/frontend/src/components/TaskProposals.jsx` — 17: Ожидает ответа; Обсуждается; Принято
- `mobile/src/screens/MemberTasksScreen.tsx` — 16: В работе; В работе; Блокер
- `smartweb/backend/app/routers/task.py` — 16: тимлида; участника команды; Срок: {data.due_date}.
- `mobile/src/screens/LeadTasksScreen.tsx` — 14: В работе; Блок; Ревью
- `smartweb/frontend/src/components/TaskCollabModal.jsx` — 13: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `mobile/src/components/TaskCollabModal.tsx` — 11: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `smartweb/backend/app/services/task_collab.py` — 5: Участник; {_name(db, user_id)} добавлен(а) в исполнители; Вас добавили в задачу
- `smartweb/frontend/src/components/TaskAssignees.jsx` — 4: ,
}


export default function TaskAssignees({ task, currentU; }}>
          {progress.done} из {progress.total}
        </; (вы)
- `smartweb/frontend/src/components/CollabTaskModal.jsx` — 2: ); return }

    const assignees = chosen.map(r => ({ user_i; Создать задачу
- `mobile/src/components/TaskAssignees.tsx` — 2: )}</Text>
        <View style={styles.barTrack}>
          <; (вы)
- `smartweb/frontend/src/components/TaskAIHelper.jsx` — 1: style={{ borderColor: '#ddd6fe', borderTopColor: '#3B6EF0' }
- `smartweb/frontend/src/components/TaskStatusSelect.jsx` — 1: />
      )}
    </svg>
  )
}

const ICON_COLORS = {
  in_pro
- `smartweb/backend/app/models/task_proposal.py` — 1: ), nullable=False)
    action = Column(String(20), nullable=

## Встречи — 134

- `smartweb/frontend/src/components/MeetingCalendar.jsx` — 33: Пн; Вт; Ср
- `smartweb/frontend/src/components/MeetingProposals.jsx` — 18: Ожидает ответа; Принято; Отклонено
- `mobile/src/components/MeetingProposalsModal.tsx` — 18: Ожидает ответа; Принято; Отклонено
- `mobile/app/meeting-detail.tsx` — 17: Ожидает; Запрос; Запланирована
- `mobile/src/screens/LeadMeetingsScreen.tsx` — 13: Выберите дату; Нет команды; Отметьте участников или «Вся команда»
- `mobile/src/screens/MemberMeetingsScreen.tsx` — 8: , content: `Предложи 3 варианта для переноса встречи (текуще; Не удалось перенести встречу; Не удалось начать созвон
- `smartweb/backend/app/routers/meeting.py` — 8: Тимлид; Прямое создание встречи доступно только тимлиду команды; Тимлид
- `smartweb/frontend/src/lib/meetingStatus.js` — 7: Запланирована; Подтверждена; Завершена
- `mobile/src/components/MeetingItem.tsx` — 6: Запланирована; Подтверждена; Завершена
- `smartweb/frontend/src/components/GroupMeetingModal.jsx` — 4: ); return }
    setSaving(true)
    try {
      const { data; Не удалось создать встречу; checked={wholeTeam} onChange={e => setWholeTeam(e.target.che
- `smartweb/frontend/src/components/MeetingCardParts.jsx` — 1: style={{ display: 'none' }}
        onChange={e => { if (e.t
- `smartweb/backend/app/models/meeting_proposal.py` — 1: ), nullable=False)
    topic = Column(String(500), nullable=

## Админ-панель — 91

- `smartweb/frontend/src/components/AdminDashboard.jsx` — 39: Тимлид; Участник; )

  const [subs, setSubs]             = useState([])
  cons
- `mobile/src/screens/AdminScreen.tsx` — 28: Пользователи; Сотрудники; Обращения
- `smartweb/frontend/src/components/AdminEmployees.jsx` — 9: Администратор; Менеджер; Поддержка
- `smartweb/frontend/src/components/AdminManage.jsx` — 7: Ошибка; Укажите название и тимлида; ✓ Команда создана
- `smartweb/frontend/src/components/AdminUserDetail.jsx` — 7: )
  const [blocked, setBlocked] = useState(!!user?.is_blocke; участник; ), message: `${user.name} (id ${user.id}) будет удалён безво
- `smartweb/backend/app/routers/admin_billing.py` — 1: : True}


class AssignManagerReq(BaseModel):
    manager_id:

## Тариф и оплата — 63

- `smartweb/frontend/src/components/Billing.jsx` — 25: Без подписки: доступ к платным функциям закрыт.; Одна команда до 5 человек: встречи 1-на-1, задачи, заметки, ; Команде до 30 человек: групповые встречи, аналитика, Цели, Р
- `mobile/src/screens/TariffScreen.tsx` — 24: Без подписки; Полный доступ; 1 490 ₽/мес
- `smartweb/backend/app/routers/billing.py` — 14: Полный доступ; # игнорируется: период задаёт сам тариф
    seats: int = 1
 ; Для оформления подписки укажите и подтвердите email в настро

## Авторизация — 61

- `smartweb/backend/app/routers/auth.py` — 35: Неверный пароль администратора; Пароль должен быть не короче 8 символов; [A-Za-zА-Яа-я]
- `smartweb/backend/app/routers/auth_yandex.py` — 10: Вход через Яндекс ID ещё не настроен администратором.; Не авторизовано; Недействительный state
- `mobile/app/(auth)/login.tsx` — 6: Произошла ошибка; );
  if (!/[A-Za-zА-Яа-я]/.test(pw) // !/\d/.test(pw)) retur; color={colors.accent} />
      </View>
    );
  }

  const h
- `smartweb/backend/app/utils/auth.py` — 3: Не авторизовано; Аккаунт заблокирован; Только для администратора
- `mobile/src/components/YandexLoginButton.tsx` — 2: accessibilityLabel={t('auth.yandex')}
      accessibilitySta; ,
    gap: 10,                 // защитное поле у логотипа
 
- `smartweb/backend/app/services/yandex_auth.py` — 2: Пользователь; yandex id: связываем с существующим аккаунтом id=%s
- `smartweb/frontend/src/components/YandexLoginButton.jsx` — 1: ,
        fontSize: 15,
        gap: 10,
      }}
    >
    
- `smartweb/frontend/src/components/AuthPage.jsx` — 1: >One</span>
    </span>
    <p style={{ color: 'var(--color-
- `mobile/src/context/auth.tsx` — 1: Сервер временно недоступен. Попробуйте позже.

## Взаимодействия — 61

- `smartweb/frontend/src/components/InteractionsPanel.jsx` — 25: Совместная работа; Предложение помощи; Консультация
- `mobile/src/components/InteractionsModal.tsx` — 20: Совместная работа; Предложение помощи; Консультация
- `smartweb/backend/app/routers/interaction.py` — 15: Предложение совместной работы; Предложение помощи; Запрос консультации
- `smartweb/backend/app/models/interaction.py` — 1: )
    outcome = Column(String(20), nullable=True)  # discuss

## Цели — 54

- `mobile/src/screens/GoalsScreen.tsx` — 28: Не начата; В работе; Под риском
- `smartweb/frontend/src/components/Goals.jsx` — 26: Не начата; В работе; Под риском

## Telegram-бот — 48

- `smartweb/backend/app/services/telegram_bot.py` — 48: В работе; На ревью; Блокер

## Кабинет тимлида — 43

- `smartweb/frontend/src/components/LeadDashboard.jsx` — 43: В работе; Блокер; На ревью

## ONE AI — 40

- `mobile/src/screens/OneAiScreen.tsx` — 21: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `smartweb/frontend/src/components/OneAI.jsx` — 14: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `smartweb/backend/app/routers/oneai.py` — 5: Доступ только от своего имени; Проанализируй данные и дай рекомендации.; \n\nЗапрос пользователя: {data.message}

## Онбординг — 35

- `smartweb/backend/app/services/survey.py` — 27: Как вы планируете использовать OneOnOne?; Можно выбрать несколько вариантов; Проводить встречи 1-на-1
- `smartweb/frontend/src/components/Onboarding.jsx` — 3: Ошибка сервера; /></svg>) },
                ].map(opt => (
                ; disabled={loading} style={{
                  width:'100%',p
- `smartweb/frontend/src/components/SurveyPage.jsx` — 2: export default function SurveyPage({ user, onDone }) {
  con; style={{ padding: '48px 20px' }}>
      <div style={{ width:
- `smartweb/backend/app/routers/survey.py` — 2: Пользователь не найден; Можно изменять только свой опросник
- `mobile/app/onboarding.tsx` — 1: />;

  const email = session.email // user?.email // '';

  

## Пит — 32

- `smartweb/frontend/src/components/PitAssistant.jsx` — 8: Привет! Я Пит — ваш AI-ассистент OneOnOne. Помогу с вопросам; Не удалось отправить обращение; Нет ответа
- `smartweb/frontend/src/lib/pit.js` — 8: async function addTeam(detail) {
    if (!detail // !detail.; Задачи:; (${statusOf(t)})`).join('; ')
      } catch {  }
      try {
- `mobile/src/lib/pit.ts` — 8: );


export async function buildPitContext(user: AppUser, is; Задачи:; (${statusOf(t)})`).join('; ');
        }
      } catch {}
  
- `mobile/src/screens/AssistantScreen.tsx` — 6: Как провести эффективную 1-on-1 встречу?; Как дать конструктивную обратную связь?; Как помочь сотруднику с выгоранием?
- `smartweb/backend/app/routers/assistant.py` — 2: \n\n=== ТЕКУЩИЙ КОНТЕКСТ КОМАНДЫ ===\n{context}\n=== КОНЕЦ К; AI временно недоступен, попробуйте ещё раз

## Интеграции — 30

- `smartweb/frontend/src/components/Integrations.jsx` — 14: Встречи 1-на-1 автоматически синхронизируются с вашим Google; Яндекс Календарь; Встречи 1-на-1 автоматически синхронизируются с вашим Яндекс
- `smartweb/backend/app/routers/integrations.py` — 12: Неизвестный провайдер; Интеграция ещё не настроена администратором.; Неизвестный провайдер
- `smartweb/backend/app/models/integration.py` — 3: access_token_enc = Column(Text, nullable=True)         # заш; )
    account_email = Column(String(255), nullable=True)    ; ), nullable=True)
    url = Column(String(1000), nullable=Fa
- `smartweb/frontend/src/components/IntegrationCallbackPage.jsx` — 1: Не удалось завершить подключение.

## Аналитика (тимлид) — 27

- `smartweb/frontend/src/components/LeadAnalytics.jsx` — 14: style={{
      flex: 1, minWidth: 140, opacity: vis ? 1 : 0,; style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>
  ; >{s.name.charAt(0).toUpperCase()}</div>
          {s.name}
 
- `mobile/src/screens/LeadAnalyticsScreen.tsx` — 13: ); return; }
    setLoading(true);
    try {
      const pro; Не удалось получить совет.; Не удалось получить совет. Попробуйте позже.

## Профиль и настройки — 24

- `mobile/src/screens/ProfileScreen.tsx` — 24: Русский; Введите код; Telegram привязан к аккаунту

## Настроение — 23

- `smartweb/frontend/src/components/MoodPrompt.jsx` — 15: Как прошёл день?; Расскажите в нескольких словах...; Что давало вам энергию?
- `smartweb/backend/app/routers/mood.py` — 6: Нет ответов; Анализ недоступен; Доступ только к своим данным
- `smartweb/backend/app/services/mood_service.py` — 2: Недостаточно данных для анонимной статистики (нужно от {thre; )) - timedelta(days=(date.today() - start).days + 2)
    row

## Компания — 21

- `mobile/src/screens/CompanyScreen.tsx` — 14: Название; ИНН / БИН; КПП
- `smartweb/backend/app/routers/company.py` — 5: ОКВЭД {okveds}; ,   # БИН; ОКЭД {d.get('oked')}
- `smartweb/frontend/src/components/CompanySearch.jsx` — 1: )
  const [suggestions, setSuggestions] = useState([])
  con
- `smartweb/backend/app/models/company.py` — 1: )  # RU / KZ
    source = Column(String(20), nullable=True) 

## Уведомления — 21

- `smartweb/backend/app/services/notification_service.py` — 17: Встреча запланирована; {lead_name} назначил встречу на {when}; Запрос на встречу
- `mobile/src/screens/NotificationsScreen.tsx` — 2: ]}>
      <View style={styles.header}>
        <View style={; size={14} color={unreadCount === 0 ? colors.textMuted : '#ff
- `smartweb/backend/app/routers/notification.py` — 2: <b>Важное объявление</b>; Важное объявление

## Команда — 19

- `mobile/src/screens/LeadTeamsScreen.tsx` — 16: В порядке; Скоро; Нет встречи
- `smartweb/backend/app/routers/team.py` — 2: # только предстоящая встреча — нейтрально, не красный
      ; # действительно ни одной встречи

        members_out.append
- `smartweb/frontend/src/components/TeamHeaderControls.jsx` — 1: onClick={onRegenerate} disabled={regenerating} title={t('ui.

## Навигация и меню профиля — 17

- `smartweb/frontend/src/components/Layout.jsx` — 17: // Mini App: скрываем запрещённые таблицей разделы
  const [; сегодня; )
    setDeadlineBanner({
      title: upcoming.length === 1

## Кабинет участника — 17

- `smartweb/frontend/src/components/MemberDashboard.jsx` — 17: )

  const [meetings, setMeetings] = useState([])
  const [s; Не удалось присоединиться. Проверьте код.; style={{ width: '100%', display: 'inline-flex', alignItems: 

## Аналитика (участник) — 12

- `smartweb/frontend/src/components/MemberAnalytics.jsx` — 7: style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>{c.; )} accent delay={0} />
        <StatCard value={data.days_si; style={{ padding: '18px 20px' }}>
          <p style={{ font
- `mobile/src/screens/MemberAnalyticsScreen.tsx` — 5: )}</Text>
                <View style={styles.progressRow}>
; )}</Text>
                </View>
                <View styl; }
                  </Text>
                  <Text style={s

## База знаний — 12

- `smartweb/frontend/src/components/KnowledgeBase.jsx` — 7: сегодня; вчера; Удалить
- `smartweb/frontend/src/components/KnowledgeBasePage.jsx` — 5: сегодня; вчера; >One</span></span>
          <span style={{ fontSize: 13, fo

## Поддержка — 12

- `mobile/src/screens/SupportScreen.tsx` — 8: Как начать работу с платформой?; Как пригласить участника в команду?; Как провести первую встречу?
- `smartweb/frontend/src/components/SupportPage.jsx` — 4: >One</span></span>
          <span style={{ fontSize: 13, fo; )}</h2>
              {unreadCount > 0 && <span className="b; style={{ fontSize: 10 }}>{t('ui.novyy_otvet')}</span>}
     

## Письма — 5

- `smartweb/backend/app/services/mailer.py` — 5: SMTP не настроен (нет SMTP_HOST/SMTP_USER в окружении); Письмо отправлено: %s -> %s; Ошибка отправки письма '%s' на %s: %s

## Пуш-уведомления — 1

- `mobile/src/lib/push.ts` — 1: Уведомления

