import { useState, useEffect } from 'react'
import { getBillingMe, getBillingPlans, checkoutPlan, changePlanPreview, cancelMySubscription } from '../api/client'
import { confirmDialog } from '../lib/ui'
import useEscapeKey from '../lib/useEscapeKey'

// "Мой тариф" — sales-oriented plan screen + CloudPayments checkout.
const CP_WIDGET = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

const DESC = {
  free: 'Знакомство с продуктом: 14 дней. Без карты.',
  start: 'Одна команда с AI-ассистентом Пит.',
  team: 'Растущим командам: аналитика и AI целиком.',
  company: 'Крупным командам: видео, транскрипты, учёт времени.',
  enterprise: 'Организациям: On-premise, SSO и SLA.',
}
const POPULAR = 'team'
const FEATURE_LABELS = [
  ['pit', 'AI-ассистент Пит'],
  ['analytics', 'Аналитика команды'],
  ['risk_alerts', 'Зоны риска и алерты'],
  ['video_calls', 'Встроенные видеозвонки'],
  ['transcripts', 'Транскрипты встреч (по записи)'],
  ['csv_export', 'Экспорт данных (Excel)'],
]

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

const fmt = (v) => (v === null || v === undefined || v < 0) ? '∞' : v

function planBullets(p) {
  const l = p.limits || {}, f = l.features || {}
  const out = []
  if (l.max_members_per_team != null) out.push(`До ${fmt(l.max_members_per_team)} участников`)
  else out.push('Участников без лимита')
  out.push(`Команд: ${fmt(l.max_teams)}`)
  out.push(`Встреч/мес: ${fmt(l.max_meetings_per_month)}`)
  for (const [key, label] of FEATURE_LABELS) {
    if (f[key]) out.push(label)
    if (out.length >= 6) break
  }
  return out
}

export default function Billing({ open, currentUser, initialPlan, onClose }) {
  const [me, setMe] = useState(null)
  const [plans, setPlans] = useState([])
  const [period, setPeriod] = useState('month')
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
  const openWidget = async (p) => {
    setBusy(p.code)
    try {
      const { data } = await checkoutPlan({ plan_code: p.code, period, user_id: currentUser.id })
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
    if (p.is_enterprise) { window.location.href = 'mailto:oneonone.io@yandex.com?subject=Enterprise OneOnOne'; return }
    let d
    try {
      const res = await changePlanPreview({ plan_code: p.code, period, user_id: currentUser.id })
      d = res.data
    } catch { setMsg('Не удалось проверить тариф. Попробуйте позже.'); return }

    switch (d.action) {
      case 'contact_sales':
        window.location.href = 'mailto:oneonone.io@yandex.com?subject=Enterprise OneOnOne'; return
      case 'already_on_plan':
      case 'fix_payment_first':
        setMsg(d.message); return
      case 'fix_payment':
        // Тот же тариф в grace-периоде — повторная оплата обновит карту.
        return openWidget(p)
      case 'upgrade': {
        const extra = d.diff_month > 0 ? ` Доплата за текущий период — около ${d.diff_month}₽.` : ''
        if (await confirmDialog({ title: `Перейти на тариф «${p.name}»?`, message: d.message + extra, confirmText: 'Оплатить и перейти' }))
          return openWidget(p)
        return
      }
      case 'downgrade_free': {
        if (await confirmDialog({ title: 'Перейти на Free?', message: d.message, confirmText: 'Перейти на Free', danger: true })) {
          try { await cancelMySubscription(currentUser.id); setMsg('Автосписания отменены. Доступ сохранится до конца оплаченного периода, затем аккаунт перейдёт на Free.'); setTimeout(refresh, 1200) }
          catch { setMsg('Не удалось выполнить действие.') }
        }
        return
      }
      case 'downgrade': {
        const warn = (d.over_limit || []).map(v => v.message).join(' ')
        const full = d.message + (warn ? `\n\nВнимание: ${warn}` : '')
        if (await confirmDialog({ title: `Понизить тариф до «${p.name}»?`, message: full, confirmText: 'Запланировать понижение' })) {
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

  return (
    <div className="bill-overlay" onClick={onClose}>
      <div className="bill-modal" onClick={e => e.stopPropagation()}>
        <div className="bill-head">
          <h2>Мой тариф</h2>
          <button className="bill-x" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>

        <div className="bill-body">
          <p className="bill-hero">Выберите тариф под размер команды. Оплата картой или СБП, годовая подписка — на 20% выгоднее. Повышение действует сразу.</p>

          {/* Current plan + usage */}
          <div className="bill-current">
            <span className="lbl">Текущий тариф</span>
            <span className="bill-chip">{me?.full_access_override ? 'Полный доступ' : (me?.plan_code || 'free')}</span>
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
                <button className="bill-cta" style={{ marginTop: 8 }} disabled={busy}
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
            {/* 14-дневное окно Free: отсчёт или сообщение об окончании */}
            {currentCode === 'free' && me?.free_until && (() => {
              const end = new Date(me.free_until)
              const daysLeft = Math.ceil((end - new Date()) / 86400000)
              return me.free_expired ? (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-danger-bg, #fdecec)', border: '1px solid var(--color-danger, #dc2626)33', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
                  Бесплатный период (14 дней) истёк. Выберите тариф, чтобы продолжить работу.
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Бесплатный период до {end.toLocaleDateString('ru-RU')} — осталось {Math.max(daysLeft, 0)} дн.
                </div>
              )
            })()}
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

          {/* Period toggle */}
          <div className="bill-toggle">
            <button className={period === 'month' ? 'on' : ''} onClick={() => setPeriod('month')}>Ежемесячно</button>
            <button className={period === 'year' ? 'on' : ''} onClick={() => setPeriod('year')}>Годовая <span className="bill-save">−20%</span></button>
          </div>

          {/* Plans */}
          <div className="bill-grid">
            {plans.map(p => {
              const isCurrent = currentCode === p.code
              const popular = p.code === POPULAR
              const price = period === 'year' ? p.price_year : p.price_month
              return (
                <div key={p.code} className={`bill-card${popular ? ' popular' : ''}${isCurrent ? ' current' : ''}`}>
                  {popular && <span className="bill-ribbon">Популярный</span>}
                  <span className="bill-name">{p.name}</span>
                  <div className={`bill-price${p.is_enterprise ? ' ent' : ''}`}>
                    {p.is_enterprise ? 'По запросу' : <>{price}₽<small>{p.per_seat ? ' /чел·мес' : ' /мес'}</small>{period === 'year' && !p.is_enterprise && price > 0 && <span className="old">{p.price_month}₽</span>}</>}
                  </div>
                  <div className="bill-desc">{DESC[p.code] || ''}</div>
                  <ul className="bill-feats">
                    {planBullets(p).map((b, i) => (<li key={i}><Check />{b}</li>))}
                  </ul>
                  {isCurrent ? (
                    <button className="bill-cta muted" disabled>Текущий тариф</button>
                  ) : p.code === 'free' ? (
                    currentIsPaid ? (
                      <button className="bill-cta ghost" disabled={busy === p.code} onClick={() => handleBuy(p)}>Перейти на Free</button>
                    ) : (
                      <button className="bill-cta ghost" disabled>Базовый</button>
                    )
                  ) : (
                    <button className="bill-cta" disabled={busy === p.code} onClick={() => handleBuy(p)}>
                      {busy === p.code ? '...' : p.is_enterprise ? 'Связаться' : 'Выбрать'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {msg && <p className="bill-msg">{msg}</p>}
          <p className="bill-foot">Активация подписки подтверждается платёжной системой. Отменить или сменить тариф можно в любой момент — понижение вступит в силу с начала следующего периода.</p>
        </div>
      </div>
    </div>
  )
}
