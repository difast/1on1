# Инвентаризация строк интерфейса (i18n)

Файл генерируется скриптом `tools/i18n-inventory.py` — не редактируйте вручную.

В словарях (`ru.json`): **352** ключей.

Ниже — строки с кириллицей, которые ещё захардкожены в коде и не вынесены
в словари, сгруппированные по разделам продукта.

| Клиент | Осталось строк |
|---|---|
| Веб | 2052 |
| Мобильное приложение | 1640 |
| Бэкенд (письма, бот, уведомления) | 650 |

## Прочее — 766

- `smartweb/backend/app/services/ai_context.py` — 69: в работе; заблокирована; на проверке
- `mobile/src/screens/MemberOverviewScreen.tsx` — 59: Как прошёл твой день?; Что давалось тяжелее всего?; Есть что-то, что хочешь обсудить с тимлидом?
- `smartweb/backend/app/services/plans.py` — 44: 1-на-1 встречи; Предложения встреч; Задачи
- `smartweb/frontend/src/lib/coaching.js` — 38: участником; Это первая встреча 1-на-1 — фундамент дальнейших отношений.; Договориться об ожиданиях, целях и комфортной частоте встреч
- `mobile/src/lib/coaching.ts` — 37: Это первая встреча 1-на-1 — фундамент дальнейших отношений.; Договориться об ожиданиях, целях и комфортной частоте встреч; ,
      reason: lastMeetingDays !== null
        ? `Последня
- `mobile/src/screens/SettingsScreen.tsx` — 37: Неверный код; Введите текущий пароль; Пароль: минимум 8 символов, буквы и цифры
- `smartweb/backend/app/routers/goal.py` — 29: Доступ только от своего имени; if ps and pe and pe > ps:
        total = (pe - ps).total_se; Некорректный статус
- `mobile/src/components/WeekCalendar.tsx` — 25: Пн; Вт; Ср
- `smartweb/backend/app/services/plan_change.py` — 25: :
        return int(plan.price_month or 0)
    return 0


d; Сейчас у вас команд: {len(teams)}, а новый тариф допускает {; Лишние команды нужно будет удалить или объединить.
- `mobile/src/components/admin/EmployeesTab.tsx` — 24: Администратор; Менеджер; Поддержка
- `mobile/src/components/DateTimePickerField.tsx` — 23: Пн; Вт; Ср
- `mobile/src/components/SpontaneousCallModal.tsx` — 21: Ошибка; Нет команды; Выберите участников
- `mobile/src/components/admin/UserDetailModal.tsx` — 20: тимлид; участник; Ошибка
- `smartweb/backend/app/prompts.py` — 20: Ты {role_ctx} в IT-команде.\n; Задача: \"{title}\". Статус: {status_label}.{due_ctx}\n; Составь ровно 4 конкретных последовательных шага выполнения 
- `smartweb/frontend/src/components/UserCard.jsx` — 18: export default function UserCard({ user, teamId, organizatio; Тимлид; Участник
- `smartweb/frontend/src/lib/mailProviders.js` — 17: Открыть Gmail; Открыть Gmail; Открыть Яндекс Почту
- `mobile/src/lib/mailProviders.ts` — 17: Открыть Gmail; Открыть Gmail; Открыть Яндекс Почту
- `smartweb/frontend/src/components/ResetPasswordPage.jsx` — 14: Пароль должен быть не короче 8 символов; Пароль должен содержать буквы и цифры; Пароли не совпадают
- `smartweb/backend/app/routers/proposal.py` — 14: ,
        awaiting_user_id=data.to_user_id,   # ждём ответа ; Участник; Предложение встречи
- `smartweb/frontend/src/components/AvatarCropModal.jsx` — 13: const VIEW = 280   // размер области редактирования (px)
con; , saving = false }) {
  const [imageSrc, setImageSrc] = useS; }}>
        <div className="modal-header">
          <span c
- `smartweb/frontend/src/components/JitsiCall.jsx` — 12: , fontSize: 14, fontWeight: 600 }}>Созвон</span>
          {; }}>✓ аналитика</span>
                : <span style={{ fontS; }}>
                    {formatTime(MIN_ANALYTICS_SECONDS - 
- `smartweb/frontend/src/components/WelcomeTour.jsx` — 12: ]', title: 'Разделы', text: 'Команды, встречи, задачи, замет; ]', title: 'Ассистент Пит', text: 'Спросите Пита про задачи ; ]', title: 'Уведомления', text: 'Запросы встреч, приближающи
- `smartweb/backend/app/services/entitlements.py` — 12: Эта функция; Функция «{label}» пока недоступна — {COMING_SOON_LABEL.lower; Функция «{label}» недоступна во время пробного периода.
- `smartweb/backend/app/tasks/reminders.py` — 12: 1-on-1 с {with_name} завтра; Запланировано на {time_str}; 1-on-1 с {with_name} завтра
- `smartweb/backend/app/routers/video.py` — 12: Спонтанный созвон может инициировать только тимлид команды; Тимлид; Быстрый созвон
- `mobile/src/components/ClosedTodayCard.tsx` — 11: ;

  return (
    <>
      <TouchableOpacity style={styles.c; мои задачи; : count}</Text>
        <Ionicons name="chevron-forward" siz
- `smartweb/backend/app/main.py` — 11: Как прошёл ваш день?; Пройдите короткий опрос настроения в приложении; )
        for team in db.query(Team).all():
            try:
- `smartweb/frontend/src/components/ConfirmEmailPage.jsx` — 9: >One</span></span>
        <div style={{ marginTop: 24 }}>
 ; style={{ width: '100%' }}>Войти</button>
            </>
   ; Проверяем ссылку...
- `mobile/app/role-select.tsx` — 9: );
  };

  return (
    <SafeAreaView style={styles.root}>
 ; Тимлид; Управление командой и 1-on-1 встречами
- `smartweb/backend/app/routers/telegram.py` — 9: Не удалось проверить Telegram initData; : create_access_token(user.id)}


class WidgetAuth(BaseModel; Не удалось проверить подлинность Telegram
- `smartweb/frontend/src/components/QuickWidget.jsx` — 8: style={{
        position: 'fixed',
        right: 24,
     ; Расписание; Следующая встреча
- `smartweb/frontend/src/components/ConfirmEmailModal.jsx` — 8: }}
        role="dialog"
        aria-modal="true"
        a; />
          </svg>
        </div>

        <h2 style={{ fon; onClick={onGoLogin}
            style={{ flex: '0 0 auto', m
- `mobile/src/components/StatusPicker.tsx` — 6: В работе; Заблокирована; На ревью
- `smartweb/backend/app/routers/analytics.py` — 6: Отлично; Хорошо; Нейтрально
- `smartweb/frontend/src/components/TelegramApp.jsx` — 5: style={{ width: 28, height: 28, margin: '0 auto' }} /></Cent; Откройте в Telegram; Эта страница — мини-приложение Telegram. Откройте его через 
- `mobile/src/components/CallBanner.tsx` — 5: }).catch(() => []),
        ]) as [any[], any[]];
        co; Завершить; Идёт созвон
- `mobile/app/+not-found.tsx` — 5: ;

export default function NotFound() {
  const { colors } =; )}>
        <Text style={styles.btnText}>На главную</Text>
 ; Страница не найдена
- `smartweb/backend/app/config.py` — 5: # адрес отправителя; по умолчанию = smtp_user



    dadata_; # секрет, только env
    telegram_bot_username: str =; # напр. oneononehq_bot (без @) — публично
    telegram_webho
- `smartweb/backend/app/services/calendar_sync.py` — 5: , integ.provider, type(e).__name__)
        return access  #; 1-на-1: {other_name}; Встреча 1-на-1 в OneOnOne
- `mobile/src/lib/featureLock.ts` — 4: ;


export interface FeatureLock {
  feature: string;
  feat; Эта функция; Эта функция
- `smartweb/backend/app/services/calendar_google.py` — 4: ,       # чтобы пришёл refresh_token; ,            # гарантируем refresh_token при повторном подкл; ),
            refresh_token=refresh_token,   # Google повто
- `smartweb/backend/app/routers/user.py` — 4: Зарегистрировались; Вступили в команду; Провели встречу
- `mobile/src/components/ErrorBoundary.tsx` — 3: });

  render() {
    if (!this.state.hasError) return this.; Что-то пошло не так; Попробовать снова
- `smartweb/backend/app/schemas/goal.py` — 3: # personal / team (team ставит только тимлид)
    goal_kind:; # standard / learning (учебная цель модуля «Развитие»)
    s; # comment / feedback
    rating: Optional[int] = None  # тол
- `smartweb/frontend/src/components/AiSummary.jsx` — 2: }}>AI Резюме</p>
      <p style={{ fontSize: 13, color:; AI Резюме
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
        
- `smartweb/frontend/src/lib/Spinner.jsx` — 1: return (
    <span
      role="status"
      aria-label="Заг
- `mobile/src/components/admin/EntityPicker.tsx` — 1: ); }} activeOpacity={0.7}>
        <Text style={[styles.fiel
- `mobile/src/lib/api.ts` — 1: Превышено время ожидания
- `mobile/app/(auth)/auth/yandex/callback.tsx` — 1: )); return; }
    if (!code // !state) return;   // параметр
- `smartweb/backend/app/services/metrics.py` — 1: CAC/LTV/ROI требуют ввода: MARKETING_SPEND_KOPECKS, NEW_PAID
- `smartweb/backend/app/models/manager.py` — 1: )
    responsibility = Column(Text, nullable=True)  # зона о
- `smartweb/backend/app/models/user.py` — 1: )
    telegram = Column(String(100), nullable=True)  # @hand

## Юридические документы — 525

- `smartweb/frontend/src/lib/legalDocs.js` — 263: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; <h3>1. ОБЩИЕ ПОЛОЖЕНИЯ</h3><p>1.1. Настоящее Пользовательско
- `mobile/src/lib/legalDocs.ts` — 258: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; 1. ОБЩИЕ ПОЛОЖЕНИЯ
- `smartweb/frontend/src/components/LegalModal.jsx` — 2: style={{ width: '100%', maxWidth: 760, marginTop: 24, paddin; Документы
- `mobile/src/components/LegalDocsModal.tsx` — 2: ) return (
      <ScrollView key={i} horizontal showsHorizon; Документы

## Админ-панель — 401

- `smartweb/frontend/src/components/AdminDashboard.jsx` — 181: Тимлид; Участник; }}>Пользователь</p>}
        {msg.body}
        <p style={{ 
- `mobile/src/screens/AdminScreen.tsx` — 105: Пользователи; Сотрудники; Обращения
- `smartweb/frontend/src/components/AdminUserDetail.jsx` — 45: )
  const [blocked, setBlocked] = useState(!!user?.is_blocke; участник; Удалить пользователя?
- `smartweb/frontend/src/components/AdminManage.jsx` — 35: Ошибка; Укажите название и тимлида; ✓ Команда создана
- `smartweb/frontend/src/components/AdminEmployees.jsx` — 34: Администратор; Менеджер; Поддержка
- `smartweb/backend/app/routers/admin_billing.py` — 1: : True}


class AssignManagerReq(BaseModel):
    manager_id:

## Встречи — 337

- `mobile/src/screens/LeadMeetingsScreen.tsx` — 56: Заполните поля; Выберите дату; Ошибка
- `smartweb/frontend/src/components/MeetingCalendar.jsx` — 52: Пн; Вт; Ср
- `mobile/src/screens/MemberMeetingsScreen.tsx` — 49: , content: `Предложи 3 варианта для переноса встречи (текуще; Ошибка; Не удалось перенести встречу
- `mobile/src/components/MeetingProposalsModal.tsx` — 48: Ожидает ответа; Принято; Отклонено
- `smartweb/frontend/src/components/MeetingProposals.jsx` — 44: Ожидает ответа; Принято; Отклонено
- `mobile/app/meeting-detail.tsx` — 40: Ожидает; Запрос; Запланирована
- `smartweb/frontend/src/components/GroupMeetingModal.jsx` — 19: Укажите дату и время; Выберите участников или «Вся команда»; ); return }
    setSaving(true)
    try {
      const { data
- `smartweb/backend/app/routers/meeting.py` — 8: Тимлид; Прямое создание встречи доступно только тимлиду команды; Тимлид
- `smartweb/frontend/src/components/MeetingCardParts.jsx` — 7: }}
        onChange={e => { if (e.target.files[0]) onFile(e.; Загрузка...; Анализирую...
- `smartweb/frontend/src/lib/meetingStatus.js` — 7: Запланирована; Подтверждена; Завершена
- `mobile/src/components/MeetingItem.tsx` — 6: Запланирована; Подтверждена; Завершена
- `smartweb/backend/app/models/meeting_proposal.py` — 1: ), nullable=False)
    topic = Column(String(500), nullable=

## Задачи — 320

- `mobile/src/components/TaskProposalsModal.tsx` — 48: Ожидает ответа; Обсуждается; Принято
- `smartweb/frontend/src/components/TaskProposals.jsx` — 46: Ожидает ответа; Обсуждается; Принято
- `mobile/src/screens/LeadTasksScreen.tsx` — 41: В работе; Блок; Ревью
- `mobile/src/screens/MemberTasksScreen.tsx` — 36: В работе; В работе; Блокер
- `smartweb/frontend/src/components/TaskCollabModal.jsx` — 28: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `smartweb/backend/app/routers/task_proposal.py` — 25: Нельзя предложить задачу самому себе; Укажите название задачи; Получатель не найден
- `mobile/src/components/TaskCollabModal.tsx` — 23: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `smartweb/frontend/src/components/CollabTaskModal.jsx` — 20: Укажите заголовок задачи; Выберите хотя бы одного участника; Участники не должны повторяться
- `smartweb/backend/app/routers/task.py` — 16: тимлида; участника команды; Срок: {data.due_date}.
- `smartweb/frontend/src/components/TaskAIHelper.jsx` — 14: ,
        status: task.status,
        due_date: task.due_da; }}
        aria-label="AI-помощник по задаче"
      >
      ; , flexShrink: 0 }}><svg width="15" height="15" viewBox="0 0 
- `smartweb/frontend/src/components/TaskAssignees.jsx` — 7: ,
}


export default function TaskAssignees({ task, currentU; }}>
          Участники
        </span>
        <div style={; }}>
          {progress.done} из {progress.total}
        </
- `mobile/src/components/TaskAssignees.tsx` — 5: ;


export function TaskAssignees({
  task, currentUserId, c; (вы); }</Text>
              {!!a.part_description && <Text style=
- `smartweb/backend/app/services/task_collab.py` — 5: Участник; {_name(db, user_id)} добавлен(а) в исполнители; Вас добавили в задачу
- `smartweb/frontend/src/components/SubtaskList.jsx` — 3: style={{ width: 14, height: 14, borderWidth: 2, borderColor:; Загрузка подзадач...; ПОДЗАДАЧИ
- `smartweb/frontend/src/components/TaskStatusSelect.jsx` — 2: />
      )}
    </svg>
  )
}

const ICON_COLORS = {
  in_pro; Сменить статус
- `smartweb/backend/app/models/task_proposal.py` — 1: ), nullable=False)
    action = Column(String(20), nullable=

## Развитие — 307

- `mobile/src/screens/DevelopmentScreen.tsx` — 115: Новичок; Базовый; Уверенный
- `smartweb/frontend/src/components/Development.jsx` — 113: Новичок; Базовый; Уверенный
- `smartweb/backend/app/routers/development.py` — 63: Правило; Тимлид; База знаний
- `smartweb/backend/app/models/development.py` — 14: Новичок; Базовый; Уверенный
- `smartweb/backend/app/services/development_sync.py` — 1: :
            continue  # отменённый шаг не воскрешаем
     
- `smartweb/backend/app/schemas/development.py` — 1: team_id: Optional[int] = None


class SkillOut(BaseModel):
 

## Кабинет тимлида — 212

- `smartweb/frontend/src/components/LeadDashboard.jsx` — 212: В работе; Блокер; На ревью

## Взаимодействия — 160

- `smartweb/frontend/src/components/InteractionsPanel.jsx` — 82: Совместная работа; Предложение помощи; Консультация
- `mobile/src/components/InteractionsModal.tsx` — 62: Совместная работа; Предложение помощи; Консультация
- `smartweb/backend/app/routers/interaction.py` — 15: Предложение совместной работы; Предложение помощи; Запрос консультации
- `smartweb/backend/app/models/interaction.py` — 1: )
    outcome = Column(String(20), nullable=True)  # discuss

## Цели — 116

- `smartweb/frontend/src/components/Goals.jsx` — 63: Не начата; В работе; Под риском
- `mobile/src/screens/GoalsScreen.tsx` — 53: Не начата; В работе; Под риском

## Навигация и меню профиля — 107

- `smartweb/frontend/src/components/Layout.jsx` — 102: // Mini App: скрываем запрещённые таблицей разделы
  const [; сегодня; завтра
- `mobile/app/(tabs)/_layout.tsx` — 5: options={{ title: isLead ? 'Команды' : 'Обзор' }} />
      <; options={{ title: 'Встречи' }} />
      <Tabs.Screen
       ; options={{
          title: 'Пит',
          tabBarIcon: () 

## Тариф и оплата — 99

- `smartweb/frontend/src/components/Billing.jsx` — 46: Без подписки: доступ к платным функциям закрыт.; Одна команда до 5 человек: встречи 1-на-1, задачи, заметки, ; Команде до 30 человек: групповые встречи, аналитика, Цели, Р
- `mobile/src/screens/TariffScreen.tsx` — 39: Без подписки; Полный доступ; 1 490 ₽/мес
- `smartweb/backend/app/routers/billing.py` — 14: Полный доступ; # игнорируется: период задаёт сам тариф
    seats: int = 1
 ; Для оформления подписки укажите и подтвердите email в настро

## Кабинет участника — 93

- `smartweb/frontend/src/components/MemberDashboard.jsx` — 93: )

  const [meetings, setMeetings] = useState([])
  const [s; Не удалось начать созвон; Не удалось загрузить запись

## Команда — 88

- `mobile/src/screens/LeadTeamsScreen.tsx` — 72: В порядке; Скоро; Нет встречи
- `smartweb/frontend/src/components/TeamHeaderControls.jsx` — 14: }`}
            onClick={toggleManage}
            aria-labe; , marginBottom: 4 }}>
                Код приглашения
      ; onClick={onCopyInvite}>
                  {copied ? 'Скопиро
- `smartweb/backend/app/routers/team.py` — 2: # только предстоящая встреча — нейтрально, не красный
      ; # действительно ни одной встречи

        members_out.append

## Аналитика (тимлид) — 86

- `smartweb/frontend/src/components/LeadAnalytics.jsx` — 55: style={{
      flex: 1, minWidth: 140, opacity: vis ? 1 : 0,; style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>
  ; >{s.name.charAt(0).toUpperCase()}</div>
          {s.name}
 
- `mobile/src/screens/LeadAnalyticsScreen.tsx` — 31: ); return; }
    setLoading(true);
    try {
      const pro; Не удалось получить совет.; Не удалось получить совет. Попробуйте позже.

## Онбординг — 78

- `smartweb/backend/app/services/survey.py` — 27: Как вы планируете использовать OneOnOne?; Можно выбрать несколько вариантов; Проводить встречи 1-на-1
- `smartweb/frontend/src/components/Onboarding.jsx` — 23: }}>Пит</div>
    </div>
  )
}

function Dots({ step, total }; Укажите имя; Ошибка сервера
- `mobile/app/onboarding.tsx` — 18: />;

  const email = session.email // user?.email // '';

  ; size={18} color={colors.textSecondary} />
          <Text st; />
              </View>
            ))}

            <View 
- `smartweb/frontend/src/components/SurveyPage.jsx` — 8: export default function SurveyPage({ user, onDone }) {
  con; Не удалось сохранить ответы. Попробуйте ещё раз или пропусти; Не удалось выполнить действие. Попробуйте ещё раз.
- `smartweb/backend/app/routers/survey.py` — 2: Пользователь не найден; Можно изменять только свой опросник

## Авторизация — 74

- `smartweb/backend/app/routers/auth.py` — 35: Неверный пароль администратора; Пароль должен быть не короче 8 символов; [A-Za-zА-Яа-я]
- `mobile/app/(auth)/login.tsx` — 18: Произошла ошибка; );
  if (!/[A-Za-zА-Яа-я]/.test(pw) // !/\d/.test(pw)) retur; color={colors.accent} />
      </View>
    );
  }

  const h
- `smartweb/backend/app/routers/auth_yandex.py` — 10: Вход через Яндекс ID ещё не настроен администратором.; Не авторизовано; Недействительный state
- `smartweb/backend/app/utils/auth.py` — 3: Не авторизовано; Аккаунт заблокирован; Только для администратора
- `smartweb/frontend/src/components/AuthPage.jsx` — 2: >One</span>
    </span>
    <p style={{ color: 'var(--color-; Подтвердите почту, чтобы войти. Мы отправили ссылку на
- `mobile/src/components/YandexLoginButton.tsx` — 2: accessibilityLabel={t('auth.yandex')}
      accessibilitySta; ,
    gap: 10,                 // защитное поле у логотипа
 
- `smartweb/backend/app/services/yandex_auth.py` — 2: Пользователь; yandex id: связываем с существующим аккаунтом id=%s
- `smartweb/frontend/src/components/YandexLoginButton.jsx` — 1: ,
        fontSize: 15,
        gap: 10,
      }}
    >
    
- `mobile/src/context/auth.tsx` — 1: Сервер временно недоступен. Попробуйте позже.

## Интеграции — 68

- `smartweb/frontend/src/components/Integrations.jsx` — 42: Встречи 1-на-1 автоматически синхронизируются с вашим Google; Яндекс Календарь; Встречи 1-на-1 автоматически синхронизируются с вашим Яндекс
- `smartweb/backend/app/routers/integrations.py` — 12: Неизвестный провайдер; Интеграция ещё не настроена администратором.; Неизвестный провайдер
- `smartweb/frontend/src/components/IntegrationCallbackPage.jsx` — 11: Подключение отменено.; Не хватает данных авторизации.; Не удалось завершить подключение.
- `smartweb/backend/app/models/integration.py` — 3: access_token_enc = Column(Text, nullable=True)         # заш; )
    account_email = Column(String(255), nullable=True)    ; ), nullable=True)
    url = Column(String(1000), nullable=Fa

## Аналитика (участник) — 64

- `smartweb/frontend/src/components/MemberAnalytics.jsx` — 46: style={{
      flex: 1, minWidth: 130, opacity: vis ? 1 : 0,; style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>{c.; >Нет данных для аналитики</p>
      <p className=
- `mobile/src/screens/MemberAnalyticsScreen.tsx` — 18: as any)}
          style={{ marginRight: 8 }}
        >
    ; } accent />
              <StatCard label="За 90 дней" value; } />
              <StatCard label="Задач выполнено" value={

## Профиль и настройки — 62

- `mobile/src/screens/ProfileScreen.tsx` — 62: Русский; Введите код; Готово

## База знаний — 60

- `smartweb/frontend/src/components/KnowledgeBase.jsx` — 37: сегодня; вчера; Удалить статью?
- `smartweb/frontend/src/components/KnowledgeBasePage.jsx` — 17: сегодня; вчера; , gap: 12, minWidth: 0 }}>
          {selected && (
        
- `mobile/src/screens/KnowledgeScreen.tsx` — 6: ]}>
      <View style={styles.header}>
        <TouchableOpa; && <View style={styles.center}><Text style={styles.muted}>Не; }]}>Статей пока нет.</Text>
            </View>
          ) 

## Пит — 58

- `smartweb/frontend/src/components/PitAssistant.jsx` — 27: Привет! Я Пит — ваш AI-ассистент OneOnOne. Помогу с вопросам; Не удалось отправить обращение; Нет ответа
- `mobile/src/screens/AssistantScreen.tsx` — 13: Как провести эффективную 1-on-1 встречу?; Как дать конструктивную обратную связь?; Как помочь сотруднику с выгоранием?
- `smartweb/frontend/src/lib/pit.js` — 8: async function addTeam(detail) {
    if (!detail // !detail.; Задачи:; (${statusOf(t)})`).join('; ')
      } catch {  }
      try {
- `mobile/src/lib/pit.ts` — 8: );


export async function buildPitContext(user: AppUser, is; Задачи:; (${statusOf(t)})`).join('; ');
        }
      } catch {}
  
- `smartweb/backend/app/routers/assistant.py` — 2: \n\n=== ТЕКУЩИЙ КОНТЕКСТ КОМАНДЫ ===\n{context}\n=== КОНЕЦ К; AI временно недоступен, попробуйте ещё раз

## Поддержка — 51

- `smartweb/frontend/src/components/SupportPage.jsx` — 31: }}>Поддержка</p>}
        {msg.body}
        <p style={{ fon; ,
      }}>
        <textarea
          value={reply}
      ; style={{ alignSelf: 'flex-end', display: 'inline-flex', alig
- `mobile/src/screens/SupportScreen.tsx` — 20: Как начать работу с платформой?; Как пригласить участника в команду?; Как провести первую встречу?

## ONE AI — 48

- `mobile/src/screens/OneAiScreen.tsx` — 23: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `smartweb/frontend/src/components/OneAI.jsx` — 20: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `smartweb/backend/app/routers/oneai.py` — 5: Доступ только от своего имени; Проанализируй данные и дай рекомендации.; \n\nЗапрос пользователя: {data.message}

## Telegram-бот — 48

- `smartweb/backend/app/services/telegram_bot.py` — 48: В работе; На ревью; Блокер

## Компания — 47

- `mobile/src/screens/CompanyScreen.tsx` — 40: Название; ИНН / БИН; КПП
- `smartweb/backend/app/routers/company.py` — 5: ОКВЭД {okveds}; ,   # БИН; ОКЭД {d.get('oked')}
- `smartweb/frontend/src/components/CompanySearch.jsx` — 1: )
  const [suggestions, setSuggestions] = useState([])
  con
- `smartweb/backend/app/models/company.py` — 1: )  # RU / KZ
    source = Column(String(20), nullable=True) 

## Настроение — 35

- `smartweb/frontend/src/components/MoodPrompt.jsx` — 27: Как прошёл день?; Расскажите в нескольких словах...; Что давало вам энергию?
- `smartweb/backend/app/routers/mood.py` — 6: Нет ответов; Анализ недоступен; Доступ только к своим данным
- `smartweb/backend/app/services/mood_service.py` — 2: Недостаточно данных для анонимной статистики (нужно от {thre; )) - timedelta(days=(date.today() - start).days + 2)
    row

## Уведомления — 26

- `smartweb/backend/app/services/notification_service.py` — 17: Встреча запланирована; {lead_name} назначил встречу на {when}; Запрос на встречу
- `mobile/src/screens/NotificationsScreen.tsx` — 7: ]}>
        <View style={styles.header}><Text style={styles.; ]}>
      <View style={styles.header}>
        <View style={; size={14} color={unreadCount === 0 ? colors.textMuted : '#ff
- `smartweb/backend/app/routers/notification.py` — 2: <b>Важное объявление</b>; Важное объявление

## Письма — 5

- `smartweb/backend/app/services/mailer.py` — 5: SMTP не настроен (нет SMTP_HOST/SMTP_USER в окружении); Письмо отправлено: %s -> %s; Ошибка отправки письма '%s' на %s: %s

## Пуш-уведомления — 1

- `mobile/src/lib/push.ts` — 1: Уведомления

