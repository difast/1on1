# Инвентаризация строк интерфейса (i18n)

Файл генерируется скриптом `tools/i18n-inventory.py` — не редактируйте вручную.

В словарях (`ru.json`): **1868** ключей.

Ниже — строки с кириллицей, которые ещё захардкожены в коде и не вынесены
в словари, сгруппированные по разделам продукта.

| Клиент | Осталось строк |
|---|---|
| Веб | 562 |
| Мобильное приложение | 524 |
| Бэкенд (письма, бот, уведомления) | 578 |

## Юридические документы — 521

- `smartweb/frontend/src/lib/legalDocs.js` — 263: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; <h3>1. ОБЩИЕ ПОЛОЖЕНИЯ</h3><p>1.1. Настоящее Пользовательско
- `mobile/src/lib/legalDocs.ts` — 258: Пользовательское соглашение; ООО «ОДИН НА ОДИН» Редакция от 25.07.2026; 1. ОБЩИЕ ПОЛОЖЕНИЯ

## Прочее — 388

- `smartweb/backend/app/services/ai_context.py` — 69: в работе; заблокирована; на проверке
- `smartweb/backend/app/services/plans.py` — 44: 1-на-1 встречи; Предложения встреч; Задачи
- `smartweb/frontend/src/lib/coaching.js` — 32: ,
      reason: lastMeetingDays !== null
        ? `Последня; ),
      line: `Спросить, как дела и что изменилось с прошло; ,
      reason: openOverdue.length === 1
        ? `Задача «
- `mobile/src/lib/coaching.ts` — 30: ,
      reason: lastMeetingDays !== null
        ? `Последня; ,
      reason: openOverdue.length === 1
        ? `Задача «; ).slice(0, 40)}» просрочена.`
        : `${openOverdue.lengt
- `smartweb/backend/app/routers/goal.py` — 29: Доступ только от своего имени; if ps and pe and pe > ps:
        total = (pe - ps).total_se; Некорректный статус
- `smartweb/backend/app/services/plan_change.py` — 25: :
        return int(plan.price_month or 0)
    return 0


d; Сейчас у вас команд: {len(teams)}, а новый тариф допускает {; Лишние команды нужно будет удалить или объединить.
- `smartweb/backend/app/prompts.py` — 20: Ты {role_ctx} в IT-команде.\n; Задача: \"{title}\". Статус: {status_label}.{due_ctx}\n; Составь ровно 4 конкретных последовательных шага выполнения 
- `smartweb/backend/app/routers/proposal.py` — 14: ,
        awaiting_user_id=data.to_user_id,   # ждём ответа ; Участник; Предложение встречи
- `smartweb/backend/app/services/entitlements.py` — 12: Эта функция; Функция «{label}» пока недоступна — {COMING_SOON_LABEL.lower; Функция «{label}» недоступна во время пробного периода.
- `smartweb/backend/app/routers/video.py` — 12: Спонтанный созвон может инициировать только тимлид команды; Тимлид; Быстрый созвон
- `smartweb/backend/app/main.py` — 11: Как прошёл ваш день?; Пройдите короткий опрос настроения в приложении; )
        for team in db.query(Team).all():
            try:
- `smartweb/backend/app/routers/telegram.py` — 9: Не удалось проверить Telegram initData; : create_access_token(user.id)}


class WidgetAuth(BaseModel; Не удалось проверить подлинность Telegram
- `smartweb/frontend/src/components/WelcomeTour.jsx` — 8: ]', title: 'Разделы', text: 'Команды, встречи, задачи, замет; ]', title: 'Ассистент Пит', text: 'Спросите Пита про задачи ; ]', title: 'Уведомления', text: 'Запросы встреч, приближающи
- `smartweb/backend/app/routers/analytics.py` — 6: Отлично; Хорошо; Нейтрально
- `mobile/src/components/admin/EmployeesTab.tsx` — 5: Администратор; Менеджер; Поддержка
- `smartweb/backend/app/config.py` — 5: # адрес отправителя; по умолчанию = smtp_user



    dadata_; # секрет, только env
    telegram_bot_username: str =; # напр. oneononehq_bot (без @) — публично
    telegram_webho
- `smartweb/backend/app/services/calendar_sync.py` — 5: , integ.provider, type(e).__name__)
        return access  #; 1-на-1: {other_name}; Встреча 1-на-1 в OneOnOne
- `mobile/src/components/StatusPicker.tsx` — 4: В работе; Заблокирована; На ревью
- `mobile/src/lib/featureLock.ts` — 4: ;


export interface FeatureLock {
  feature: string;
  feat; Эта функция; Эта функция
- `smartweb/backend/app/services/calendar_google.py` — 4: ,       # чтобы пришёл refresh_token; ,            # гарантируем refresh_token при повторном подкл; ),
            refresh_token=refresh_token,   # Google повто
- `smartweb/backend/app/routers/user.py` — 4: Зарегистрировались; Вступили в команду; Провели встречу
- `mobile/src/components/SpontaneousCallModal.tsx` — 3: />
                <View style={{ flex: 1 }}>
              ; size={20} color={colors.accent} />
                <View sty; /> : <Text style={styles.startText}>Начать созвон{selected.l
- `smartweb/backend/app/schemas/goal.py` — 3: # personal / team (team ставит только тимлид)
    goal_kind:; # standard / learning (учебная цель модуля «Развитие»)
    s; # comment / feedback
    rating: Optional[int] = None  # тол
- `smartweb/frontend/src/components/AvatarCropModal.jsx` — 2: const VIEW = 280   // размер области редактирования (px)
con; , saving = false }) {
  const { t } = useTranslation()
  con
- `smartweb/frontend/src/components/UserCard.jsx` — 2: export default function UserCard({ user, teamId, organizatio; }}>от {r.from_user_name //
- `smartweb/frontend/src/lib/featureLock.js` — 2: Эта функция; Эта функция
- `mobile/src/screens/SettingsScreen.tsx` — 2: )); return; }
    if (pwdNew.length < 8 // !/[A-Za-zА-Яа-я]/; )}</Text>
              <Text style={styles.rowSub}>Сейчас: 
- `mobile/src/screens/MemberOverviewScreen.tsx` — 2: />
            {joinError ? (
              <View style={sty; size={20} color={colors.textMuted} />
                      
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
- `smartweb/frontend/src/components/QuickWidget.jsx` — 1: style={{
        position: 'fixed',
        right: 24,
     
- `smartweb/frontend/src/components/ResetPasswordPage.jsx` — 1: )
    if (!/[A-Za-zА-Яа-я]/.test(p) // !/\d/.test(p)) return
- `smartweb/frontend/src/lib/Spinner.jsx` — 1: // Единый индикатор загрузки — тот самый крутящийся кружок, 
- `mobile/src/components/DateTimePickerField.tsx` — 1: Выберите дату и время
- `mobile/src/components/admin/UserDetailModal.tsx` — 1: onRequestClose={onClose}>
      <Pressable style={styles.bac
- `mobile/src/lib/api.ts` — 1: Превышено время ожидания
- `mobile/app/(auth)/auth/yandex/callback.tsx` — 1: )); return; }
    if (!code // !state) return;   // параметр
- `smartweb/backend/app/services/metrics.py` — 1: CAC/LTV/ROI требуют ввода: MARKETING_SPEND_KOPECKS, NEW_PAID
- `smartweb/backend/app/models/manager.py` — 1: )
    responsibility = Column(Text, nullable=True)  # зона о
- `smartweb/backend/app/models/user.py` — 1: )
    telegram = Column(String(100), nullable=True)  # @hand

## Развитие — 124

- `smartweb/backend/app/routers/development.py` — 63: Правило; Тимлид; База знаний
- `smartweb/frontend/src/components/Development.jsx` — 25: Новичок; Базовый; Уверенный
- `mobile/src/screens/DevelopmentScreen.tsx` — 20: Новичок; Базовый; Уверенный
- `smartweb/backend/app/models/development.py` — 14: Новичок; Базовый; Уверенный
- `smartweb/backend/app/services/development_sync.py` — 1: :
            continue  # отменённый шаг не воскрешаем
     
- `smartweb/backend/app/schemas/development.py` — 1: team_id: Optional[int] = None


class SkillOut(BaseModel):
 

## Задачи — 109

- `smartweb/backend/app/routers/task_proposal.py` — 25: Нельзя предложить задачу самому себе; Укажите название задачи; Получатель не найден
- `smartweb/backend/app/routers/task.py` — 16: тимлида; участника команды; Срок: {data.due_date}.
- `mobile/src/components/TaskProposalsModal.tsx` — 13: Ожидает ответа; Обсуждается; Принято
- `smartweb/frontend/src/components/TaskProposals.jsx` — 12: Ожидает ответа; Обсуждается; Принято
- `mobile/src/screens/MemberTasksScreen.tsx` — 11: В работе; В работе; Блокер
- `mobile/src/screens/LeadTasksScreen.tsx` — 8: В работе; Блок; Ревью
- `smartweb/frontend/src/components/TaskCollabModal.jsx` — 6: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `mobile/src/components/TaskCollabModal.tsx` — 6: создал(а) задачу; изменил(а) статус; добавил(а) исполнителя
- `smartweb/backend/app/services/task_collab.py` — 5: Участник; {_name(db, user_id)} добавлен(а) в исполнители; Вас добавили в задачу
- `smartweb/frontend/src/components/TaskAssignees.jsx` — 2: ,
}


export default function TaskAssignees({ task, currentU; }}>
          {progress.done} из {progress.total}
        </
- `smartweb/frontend/src/components/TaskAIHelper.jsx` — 1: style={{ borderColor: '#ddd6fe', borderTopColor: '#3B6EF0' }
- `smartweb/frontend/src/components/TaskStatusSelect.jsx` — 1: />
      )}
    </svg>
  )
}

const ICON_COLORS = {
  in_pro
- `smartweb/frontend/src/components/CollabTaskModal.jsx` — 1: ); return }

    const assignees = chosen.map(r => ({ user_i
- `mobile/src/components/TaskAssignees.tsx` — 1: )}</Text>
        <View style={styles.barTrack}>
          <
- `smartweb/backend/app/models/task_proposal.py` — 1: ), nullable=False)
    action = Column(String(20), nullable=

## Встречи — 62

- `mobile/src/components/MeetingProposalsModal.tsx` — 12: Ожидает ответа; Принято; Отклонено
- `smartweb/frontend/src/components/MeetingProposals.jsx` — 11: Ожидает ответа; Принято; Отклонено
- `mobile/app/meeting-detail.tsx` — 9: Ожидает; Запрос; Запланирована
- `smartweb/backend/app/routers/meeting.py` — 8: Тимлид; Прямое создание встречи доступно только тимлиду команды; Тимлид
- `smartweb/frontend/src/lib/meetingStatus.js` — 7: Запланирована; Подтверждена; Завершена
- `mobile/src/components/MeetingItem.tsx` — 6: Запланирована; Подтверждена; Завершена
- `mobile/src/screens/LeadMeetingsScreen.tsx` — 4: )}</Text>
                  <View style={styles.badge}>
    ; )}</Text>
                {upcoming.map(m => (
             ; )}</Text>
                {past.map(m => {
                 
- `mobile/src/screens/MemberMeetingsScreen.tsx` — 3: , content: `Предложи 3 варианта для переноса встречи (текуще; ], []);

  const findTeamId = useCallback(async () => {
    ; size={14} color={colors.accent} />
                        <
- `smartweb/frontend/src/components/GroupMeetingModal.jsx` — 1: checked={wholeTeam} onChange={e => setWholeTeam(e.target.che
- `smartweb/backend/app/models/meeting_proposal.py` — 1: ), nullable=False)
    topic = Column(String(500), nullable=

## Авторизация — 56

- `smartweb/backend/app/routers/auth.py` — 35: Неверный пароль администратора; Пароль должен быть не короче 8 символов; [A-Za-zА-Яа-я]
- `smartweb/backend/app/routers/auth_yandex.py` — 10: Вход через Яндекс ID ещё не настроен администратором.; Не авторизовано; Недействительный state
- `smartweb/backend/app/utils/auth.py` — 3: Не авторизовано; Аккаунт заблокирован; Только для администратора
- `mobile/src/components/YandexLoginButton.tsx` — 2: accessibilityLabel={t('auth.yandex')}
      accessibilitySta; ,
    gap: 10,                 // защитное поле у логотипа
 
- `mobile/app/(auth)/login.tsx` — 2: Произошла ошибка; );
  if (!/[A-Za-zА-Яа-я]/.test(pw) // !/\d/.test(pw)) retur
- `smartweb/backend/app/services/yandex_auth.py` — 2: Пользователь; yandex id: связываем с существующим аккаунтом id=%s
- `smartweb/frontend/src/components/YandexLoginButton.jsx` — 1: ,
        fontSize: 15,
        gap: 10,
      }}
    >
    
- `smartweb/frontend/src/components/AuthPage.jsx` — 1: >One</span>
    </span>
    <p style={{ color: 'var(--color-

## Взаимодействия — 50

- `smartweb/frontend/src/components/InteractionsPanel.jsx` — 20: Совместная работа; Предложение помощи; Консультация
- `smartweb/backend/app/routers/interaction.py` — 15: Предложение совместной работы; Предложение помощи; Запрос консультации
- `mobile/src/components/InteractionsModal.tsx` — 14: Совместная работа; Предложение помощи; Консультация
- `smartweb/backend/app/models/interaction.py` — 1: )
    outcome = Column(String(20), nullable=True)  # discuss

## Тариф и оплата — 47

- `smartweb/frontend/src/components/Billing.jsx` — 21: Без подписки: доступ к платным функциям закрыт.; Одна команда до 5 человек: встречи 1-на-1, задачи, заметки, ; Команде до 30 человек: групповые встречи, аналитика, Цели, Р
- `smartweb/backend/app/routers/billing.py` — 14: Полный доступ; # игнорируется: период задаёт сам тариф
    seats: int = 1
 ; Для оформления подписки укажите и подтвердите email в настро
- `mobile/src/screens/TariffScreen.tsx` — 12: Без подписки; Полный доступ; 1 490 ₽/мес

## Админ-панель — 40

- `smartweb/frontend/src/components/AdminDashboard.jsx` — 17: Тимлид; Участник; )

  const [subs, setSubs]             = useState([])
  cons
- `mobile/src/screens/AdminScreen.tsx` — 9: Пользователи; Сотрудники; Обращения
- `smartweb/frontend/src/components/AdminUserDetail.jsx` — 7: )
  const [blocked, setBlocked] = useState(!!user?.is_blocke; Удалить; }}><div className="spinner" /></div> : (
          <>
      
- `smartweb/frontend/src/components/AdminEmployees.jsx` — 6: Администратор; Менеджер; Поддержка
- `smartweb/backend/app/routers/admin_billing.py` — 1: : True}


class AssignManagerReq(BaseModel):
    manager_id:

## ONE AI — 37

- `smartweb/frontend/src/components/OneAI.jsx` — 16: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `mobile/src/screens/OneAiScreen.tsx` — 16: Проблемы, риски и вовлечённость команды за период.; Эффективность и динамика конкретного сотрудника.; Черновик обратной связи по задачам, встречам, целям и развит
- `smartweb/backend/app/routers/oneai.py` — 5: Доступ только от своего имени; Проанализируй данные и дай рекомендации.; \n\nЗапрос пользователя: {data.message}

## Онбординг — 31

- `smartweb/backend/app/services/survey.py` — 27: Как вы планируете использовать OneOnOne?; Можно выбрать несколько вариантов; Проводить встречи 1-на-1
- `smartweb/frontend/src/components/SurveyPage.jsx` — 2: export default function SurveyPage({ user, onDone }) {
  con; style={{ padding: '48px 20px' }}>
      <div style={{ width:
- `smartweb/backend/app/routers/survey.py` — 2: Пользователь не найден; Можно изменять только свой опросник

## Цели — 28

- `mobile/src/screens/GoalsScreen.tsx` — 16: Не начата; В работе; Под риском
- `smartweb/frontend/src/components/Goals.jsx` — 12: Не начата; В работе; Под риском

## Интеграции — 24

- `smartweb/backend/app/routers/integrations.py` — 12: Неизвестный провайдер; Интеграция ещё не настроена администратором.; Неизвестный провайдер
- `smartweb/frontend/src/components/Integrations.jsx` — 9: Встречи 1-на-1 автоматически синхронизируются с вашим Google; Яндекс Календарь; Встречи 1-на-1 автоматически синхронизируются с вашим Яндекс
- `smartweb/backend/app/models/integration.py` — 3: access_token_enc = Column(Text, nullable=True)         # заш; )
    account_email = Column(String(255), nullable=True)    ; ), nullable=True)
    url = Column(String(1000), nullable=Fa

## Пит — 23

- `smartweb/frontend/src/lib/pit.js` — 8: async function addTeam(detail) {
    if (!detail // !detail.; Задачи:; (${statusOf(t)})`).join('; ')
      } catch {  }
      try {
- `mobile/src/lib/pit.ts` — 8: );


export async function buildPitContext(user: AppUser, is; Задачи:; (${statusOf(t)})`).join('; ');
        }
      } catch {}
  
- `mobile/src/screens/AssistantScreen.tsx` — 4: Как провести эффективную 1-on-1 встречу?; Как дать конструктивную обратную связь?; Как помочь сотруднику с выгоранием?
- `smartweb/backend/app/routers/assistant.py` — 2: \n\n=== ТЕКУЩИЙ КОНТЕКСТ КОМАНДЫ ===\n{context}\n=== КОНЕЦ К; AI временно недоступен, попробуйте ещё раз
- `smartweb/frontend/src/components/PitAssistant.jsx` — 1: Привет! Я Пит — ваш AI-ассистент OneOnOne. Помогу с вопросам

## Кабинет тимлида — 19

- `smartweb/frontend/src/components/LeadDashboard.jsx` — 19: В работе; Блокер; На ревью

## Настроение — 18

- `smartweb/frontend/src/components/MoodPrompt.jsx` — 10: Как прошёл день?; Расскажите в нескольких словах...; Что давало вам энергию?
- `smartweb/backend/app/routers/mood.py` — 6: Нет ответов; Анализ недоступен; Доступ только к своим данным
- `smartweb/backend/app/services/mood_service.py` — 2: Недостаточно данных для анонимной статистики (нужно от {thre; )) - timedelta(days=(date.today() - start).days + 2)
    row

## Аналитика (тимлид) — 18

- `smartweb/frontend/src/components/LeadAnalytics.jsx` — 9: style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>
  ; >{s.name.charAt(0).toUpperCase()}</div>
          {s.name}
 ; : ${reasons.join(', ') // t('ui.risk_vygoraniya')}. `
      
- `mobile/src/screens/LeadAnalyticsScreen.tsx` — 9: , { v1: signal.member_name, v2: getFlagDesc(signal) })
     ; size={24} color={colors.textPrimary} />
        </TouchableO; />
            <Text style={styles.riskHeaderText}>{t('ui.zo

## Компания — 16

- `mobile/src/screens/CompanyScreen.tsx` — 9: Название; ИНН / БИН; КПП
- `smartweb/backend/app/routers/company.py` — 5: ОКВЭД {okveds}; ,   # БИН; ОКЭД {d.get('oked')}
- `smartweb/frontend/src/components/CompanySearch.jsx` — 1: )
  const [suggestions, setSuggestions] = useState([])
  con
- `smartweb/backend/app/models/company.py` — 1: )  # RU / KZ
    source = Column(String(20), nullable=True) 

## База знаний — 8

- `smartweb/frontend/src/components/KnowledgeBase.jsx` — 4: сегодня; вчера; >{t('ui.udalit')}</button>
            </div>
          )}
 
- `smartweb/frontend/src/components/KnowledgeBasePage.jsx` — 4: сегодня; вчера; >{t('ui.zakryt_2')}</button>
      </div>

      {}
      <d

## Поддержка — 7

- `mobile/src/screens/SupportScreen.tsx` — 5: Как начать работу с платформой?; Как пригласить участника в команду?; Как провести первую встречу?
- `smartweb/frontend/src/components/SupportPage.jsx` — 2: )}</h2>
              {unreadCount > 0 && <span className="b; style={{ fontSize: 10 }}>{t('ui.novyy_otvet')}</span>}
     

## Команда — 7

- `mobile/src/screens/LeadTeamsScreen.tsx` — 5: В порядке; Скоро; Нет встречи
- `smartweb/backend/app/routers/team.py` — 2: # только предстоящая встреча — нейтрально, не красный
      ; # действительно ни одной встречи

        members_out.append

## Аналитика (участник) — 6

- `smartweb/frontend/src/components/MemberAnalytics.jsx` — 3: style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>{c.; style={{ padding: '18px 20px' }}>
        <div style={{ disp; delay={0} />
                </div>
                <div>
  
- `mobile/src/screens/MemberAnalyticsScreen.tsx` — 3: )}</Text>
                <View style={styles.progressRow}>
; }
                  </Text>
                  <Text style={s; , gap: 10 }}>
        <Text style={styles.compareCur}>{cur ?

## Навигация и меню профиля — 5

- `smartweb/frontend/src/components/Layout.jsx` — 5: // Mini App: скрываем запрещённые таблицей разделы
  const [; )); return }
    if (pwdNew.length < 8 // !/[A-Za-zА-Яа-я]/.; /></svg></button>
            </div>
            <p style={{

## Telegram-бот — 5

- `smartweb/backend/app/services/telegram_bot.py` — 5: , lang), "callback_data": "cmd:support"}],
        [{"text":; , lang), "web_app": {"url": f"{web}/telegram"}}])
    return; }. Аккаунт создан."
    else:
        greeting = i18n.t(

## Письма — 5

- `smartweb/backend/app/services/mailer.py` — 5: SMTP не настроен (нет SMTP_HOST/SMTP_USER в окружении); Письмо отправлено: %s -> %s; Ошибка отправки письма '%s' на %s: %s

## Кабинет участника — 3

- `smartweb/frontend/src/components/MemberDashboard.jsx` — 3: )

  const [meetings, setMeetings] = useState([])
  const [s; disabled={moodFilledToday}
              style={moodFilledTo; style={{ flex: 1, display: 'inline-flex', alignItems: 'cente

## Уведомления — 3

- `smartweb/backend/app/routers/notification.py` — 2: <b>Важное объявление</b>; Важное объявление
- `mobile/src/screens/NotificationsScreen.tsx` — 1: ]}>
      <View style={styles.header}>
        <View style={

## Профиль и настройки — 3

- `mobile/src/screens/ProfileScreen.tsx` — 3: )); return; }
    if (pwdNew.length < 8 // !/[A-Za-zА-Яа-я]/; />}
            </View>
          </TouchableOpacity>
      ; />
                </View>
              ))}
              <

## Пуш-уведомления — 1

- `mobile/src/lib/push.ts` — 1: Уведомления

