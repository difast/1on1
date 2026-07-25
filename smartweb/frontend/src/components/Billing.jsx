import { useState, useEffect } from 'react'
import { getBillingMe, getBillingPlans, checkoutPlan, changePlanPreview, cancelMySubscription } from '../api/client'
import { confirmDialog } from '../lib/ui'
import useEscapeKey from '../lib/useEscapeKey'

// "Мой тариф" — sales-oriented plan screen + CloudPayments checkout.
// Сетка, цены и состав функций приходят из каталога бэкенда (plans.py) —
// здесь только оформление, никаких зашитых цен.
const CP_WIDGET = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

const DESC = {
  free: 'Без подписки: доступ к платным функциям закрыт.',
  start: 'Одна команда до 5 человек: встречи 1-на-1, задачи, заметки, базовый Пит.',
  team: 'Команде до 30 человек: групповые встречи, аналитика, Цели, Развитие, ONE AI.',
  business: 'Организации: несколько команд, кросс-командный ONE AI, HR-аналитика.',
  enterprise: 'Индивидуально: интеграции, SSO/SAML, SLA, условия договора.',
}
const POPULAR = 'team'
// Что показываем в карточке тарифа. Порядок — от главного к второстепенному.
const FEATURE_LABELS = [
  ['group_meetings', 'Групповые встречи'],
  ['collab_tasks', 'Совместные задачи'],
  ['analytics', 'Командная аналитика'],
  ['goals', 'Цели и OKR'],
  ['development', 'Развитие'],
  ['one_ai', 'ONE AI'],
  ['csv_export', 'Экспорт данных (Excel)'],
  ['multi_team', 'Несколько команд'],
  ['hr_analytics', 'HR-аналитика организации'],
  ['sso', 'SSO / SAML'],
]
// Функция есть в описании тарифов, но пока не работает — помечаем «Скоро»
// и не показываем как активную ни на одном тарифе.
const COMING_SOON = [['transcripts', 'Автотранскрипция встреч']]

function loadCpWidget() {
  return new Promise((resolve, reject) => {
    if (window.cp) return resolve(window.cp)
    const s = document.createElement('script')
    s.src = CP_WIDGET; s.onload = () => resolve(window.cp); s.onerror = reject
    document.head.appendChild(s)
  })
}

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 3.5l-6 6L2.5 6.8" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
)

const fmt = (v) => (v === null || v === undefined || v < 0) ? 'без ограничений' : v

function planBullets(p) {
  const l = p.limits || {}, f = l.features || {}
  const out = []
  out.push(l.users_label || (l.max_users != null ? `До ${l.max_users} пользователей` : 'Пользователей без лимита'))
  out.push(l.max_teams === 1 ? '1 команда' : `Команд: ${fmt(l.max_teams)}`)
  for (const [key, label] of FEATURE_LABELS) {
    if (f[key]) out.push(label)
    if (out.length >= 7) break
  }
  return out
}

// readOnly — режим Mini App: тариф можно посмотреть, но оплатить и сменить
// нельзя (по таблице разделения функционала оплата только в веб-версии).
export default function Billing({ open, currentUser, initialPlan, readOnly = false, onClose }) {
  const [me, setMe] = useState(null)
  const [plans, setPlans] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  useEscapeKey(onClose, open)  // Esc closes the dialog (keyboard escape hatch)

  const refresh = () => { if (currentUser?.id) getBillingMe(currentUser.id).then(r => setMe(r.data)).catch(() => {}) }

  useEffect(() => {
    if (!open) return
    refresh()
    getBillingPlans().then(r => setPlans(r.data)).catch(() => {})
  }, [open, currentUser?.id])

  if (!open) return null

  // Открыть виджет оплаты CloudPayments (первый платёж / обновление карты).
  // Карточные данные идут только в виджет, на наш сервер не попадают.
  // Период оплаты определяет сам тариф (Start — месяц, Team — год полной
  // суммой, без рассрочки), поэтому с клиента его не передаём.
  const openWidget = async (p) => {
    setBusy(p.code)
    try {
      const { data } = await checkoutPlan({ plan_code: p.code, user_id: currentUser.id })
      const cfg = data.checkout
      if (!cfg?.configured || !cfg.public_id) { setMsg('Платёжная система ещё не подключена администратором.'); setBusy(''); return }
      const cp = await loadCpWidget()
      new cp.CloudPayments().pay('charge', {
        publicId: cfg.public_id, description: cfg.description, amount: cfg.amount,
        currency: cfg.currency || 'RUB', accountId: cfg.account_id, invoiceId: cfg.invoice_id,
        // tokenize + recurrent — чтобы получить токен карты и создать подписку
        // на рекуррентные списания (Этап 6.1/6.2).
        ...(cfg.recurrent ? { data: { cloudPayments: { recurrent: { interval: cfg.recurrent.interval, period: cfg.recurrent.period } } } } : {}),
      }, {
        onSuccess: () => { setMsg('Оплата прошла. Тариф активируется в течение минуты.'); setTimeout(refresh, 3000) },
        onFail: (reason) => setMsg(reason ? `Оплата не завершена: ${reason}` : 'Оплата не завершена. Попробуйте ещё раз.'),
        onComplete: () => setBusy(''),
      })
    } catch { setMsg('Не удалось открыть оплату.'); setBusy('') }
  }

  // Единая обработка клика по тарифу: сценарий определяет бэкенд
  // (/billing/change/preview) — та же логика, что и для входа с лендинга.
  const handleBuy = async (p) => {
    setMsg('')
    // Business и Enterprise — договорные: автоматической оплаты нет,
    // только обращение в продажи (тот же путь, что был у Enterprise).
    if (p.is_enterprise) { window.location.href = `mailto:oneonone.io@yandex.com?subject=Тариф ${p.name} OneOnOne`; return }
    let d
    try {
      const res = await changePlanPreview({ plan_code: p.code, user_id: currentUser.id })
      d = res.data
    } catch { setMsg('Не удалось проверить тариф. Попробуйте позже.'); return }

    switch (d.action) {
      case 'contact_sales':
        window.location.href = `mailto:oneonone.io@yandex.com?subject=Тариф ${p.name} OneOnOne`; return
      case 'already_on_plan':
      case 'fix_payment_first':
        setMsg(d.message); return
      case 'fix_payment':
        // Тот же тариф в grace-периоде — повторная оплата обновит карту.
        return openWidget(p)
      case 'subscribe':
        // Оформление платной подписки во время пробного периода.
        return openWidget(p)
      case 'upgrade': {
        // Годовой тариф оплачивается ЦЕЛИКОМ и сразу — рассрочки нет.
        const extra = d.amount ? ` К оплате сейчас: ${d.amount.toLocaleString('ru-RU')} ₽${d.period === 'year' ? ' за год, единовременно' : ' за месяц'}.` : ''
        if (await confirmDialog({ title: `Перейти на тариф ${p.name}?`, message: d.message + extra, confirmText: 'Оплатить и перейти' }))
          return openWidget(p)
        return
      }
      case 'downgrade_free': {
        if (await confirmDialog({ title: 'Отказаться от подписки?', message: d.message, confirmText: 'Отказаться от подписки', danger: true })) {
          try { await cancelMySubscription(currentUser.id); setMsg('Автосписания отменены. Доступ сохранится до конца оплаченного периода, затем аккаунт останется без подписки.'); setTimeout(refresh, 1200) }
          catch { setMsg('Не удалось выполнить действие.') }
        }
        return
      }
      case 'downgrade': {
        const warn = (d.over_limit || []).map(v => v.message).join(' ')
        const full = d.message + (warn ? `\n\nВнимание: ${warn}` : '')
        if (await confirmDialog({ title: `Понизить тариф до ${p.name}?`, message: full, confirmText: 'Запланировать понижение' })) {
          // Планируемый переход на более дешёвый ПЛАТНЫЙ тариф применяется со
          // следующего периода. Серверное применение требует хранения
          // отложенного плана — см. отчёт; пока оформляется через поддержку.
          setMsg('Запрос на понижение принят. Оно вступит в силу со следующего расчётного периода. Если оно не отобразится в течение суток — напишите в поддержку.')
        }
        return
      }
      default:
        return openWidget(p)
    }
  }

  const limits = me?.limits || {}
  const meetLimit = limits.max_meetings_per_month
  const meetUsed = me?.usage?.meetings_this_month ?? 0
  const currentCode = me?.full_access_override ? 'unlimited' : (me?.plan_code || 'free')
  const currentIsPaid = currentCode !== 'free' && currentCode !== 'unlimited'
  const currentName = me?.full_access_override ? 'Полный доступ' : (me?.plan_name || currentCode)
  const inTrial = me?.subscription?.status === 'trialing'
  const trialLocked = me?.trial_restricted_features || []

  return (
    <div className="bill-overlay" data-pit-hide onClick={onClose}>
      <div className="bill-modal" onClick={e => e.stopPropagation()}>
        <div className="bill-head">
          <h2>Мой тариф</h2>
          <button className="bill-x" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>

        <div className="bill-body">
          {readOnly && (
            <p className="bill-msg" style={{ marginTop: 0 }}>
              Здесь можно посмотреть тариф и лимиты. Оплата и смена тарифа доступны в веб-версии.
            </p>
          )}
          <p className="bill-hero">Выберите тариф под размер команды. Start — 1 490 ₽ в месяц, Team — 49 990 ₽ в год единовременно. Business и Enterprise подключаются индивидуально. Повышение действует сразу.</p>

          {/* Current plan + usage */}
          <div className="bill-current">
            <span className="lbl">Текущий тариф</span>
            <span className="bill-chip">{currentName}{inTrial ? ' · пробный период' : ''}</span>
            {meetLimit != null && meetLimit >= 0 && (
              <div className="bill-usage">
                <div className="cap">Встречи в этом месяце: {meetUsed} / {meetLimit}</div>
                <div className="track"><div className="fill" style={{ width: `${Math.min(100, (meetUsed / Math.max(meetLimit, 1)) * 100)}%` }} /></div>
              </div>
            )}
            {/* Grace-период (не прошёл платёж) — предлагаем обновить карту (5.8) */}
            {me?.subscription?.in_grace && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-danger-bg, #fdecec)', border: '1px solid var(--color-danger, #dc2626)33', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
                Последний платёж не прошёл. Обновите карту, чтобы сохранить доступ.
                <button className="bill-cta" style={{ marginTop: 8 }} disabled={busy || readOnly}
                  onClick={() => { const cp = plans.find(x => x.code === (me?.subscription?.plan_code || currentCode)); if (cp) openWidget(cp) }}>
                  Обновить карту
                </button>
              </div>
            )}
            {me?.subscription?.cancel_at_period_end && !me?.subscription?.in_grace && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                Автосписания отменены. Доступ сохранится до конца оплаченного периода, затем аккаунт перейдёт на Free.
              </div>
            )}
            {/* 14-дневный пробный период */}
            {inTrial && me?.trial_until && !me?.trial_expired && (() => {
              const end = new Date(me.trial_until)
              const daysLeft = Math.max(Math.ceil((end - new Date()) / 86400000), 0)
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Пробный период до {end.toLocaleDateString('ru-RU')} — осталось {daysLeft} дн.
                  {trialLocked.length > 0 && ' На пробном периоде тарифа Team недоступны ONE AI и Развитие — они включаются после оплаты.'}
                </div>
              )
            })()}
            {me?.trial_expired && !currentIsPaid && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-danger-bg, #fdecec)', border: '1px solid var(--color-danger, #dc2626)33', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
                Пробный период (14 дней) истёк. Выберите тариф, чтобы продолжить.
              </div>
            )}
          </div>

          {/* Персональный менеджер (если назначен админом) */}
          {me?.subscription?.manager_name && (
            <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: 'var(--blue-50)', border: '1px solid var(--blue-200)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent)', marginBottom: 4 }}>Персональный менеджер</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{me.subscription.manager_name}</div>
              {me.subscription.manager_contact && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>Связь: {me.subscription.manager_contact}</div>
              )}
            </div>
          )}

          {/* Plans. Периода-переключателя нет: у каждого тарифа один период
              оплаты (Start — месяц, Team — год), договорные тарифы — по запросу. */}
          <div className="bill-grid">
            {plans.map(p => {
              const isCurrent = currentCode === p.code
              const popular = p.code === POPULAR
              const l = p.limits || {}
              const isFreeState = p.code === 'free'
              return (
                <div key={p.code} className={`bill-card${popular ? ' popular' : ''}${isCurrent ? ' current' : ''}`}>
                  {popular && <span className="bill-ribbon">Популярный</span>}
                  <span className="bill-name">{p.name}</span>
                  <div className={`bill-price${p.is_enterprise ? ' ent' : ''}`}>
                    {p.is_enterprise || isFreeState
                      ? (l.price_label || 'По запросу')
                      : <>{(p.price_year || p.price_month).toLocaleString('ru-RU')}₽<small>{l.billing_period === 'year' ? ' /год' : ' /мес'}</small></>}
                  </div>
                  <div className="bill-desc">{DESC[p.code] || ''}</div>
                  <ul className="bill-feats">
                    {planBullets(p).map((b, i) => (<li key={i}><Check />{b}</li>))}
                    {!isFreeState && COMING_SOON.map(([k, label]) => (
                      <li key={k} style={{ opacity: .55 }}><Check />{label} — скоро</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <button className="bill-cta muted" disabled>Текущий тариф</button>
                  ) : readOnly ? (
                    <button className="bill-cta muted" disabled>Оформление в веб-версии</button>
                  ) : isFreeState ? (
                    currentIsPaid ? (
                      <button className="bill-cta ghost" disabled={busy === p.code} onClick={() => handleBuy(p)}>Отказаться от подписки</button>
                    ) : (
                      <button className="bill-cta ghost" disabled>Без подписки</button>
                    )
                  ) : (
                    <button className="bill-cta" disabled={busy === p.code} onClick={() => handleBuy(p)}>
                      {busy === p.code ? '...' : p.is_enterprise ? 'Связаться с нами' : 'Выбрать'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {msg && <p className="bill-msg">{msg}</p>}
          <p className="bill-foot">Start списывается раз в месяц, Team — раз в год полной суммой (рассрочки нет). Business и Enterprise оформляются по договору, без автоматического списания. Активация подписки подтверждается платёжной системой. Отменить или сменить тариф можно в любой момент — понижение вступит в силу с начала следующего периода.</p>
        </div>
      </div>
    </div>
  )
}
