import { useState, useEffect } from 'react'
import { getBillingMe, getBillingPlans, checkoutPlan } from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'

// "Мой тариф" — sales-oriented plan screen + CloudPayments checkout.
const CP_WIDGET = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

const DESC = {
  free: 'Для знакомства с продуктом. Без карты.',
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
  ['transcripts', 'Автотранскрипты встреч'],
  ['csv_export', 'Экспорт CSV'],
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

  const handleBuy = async (p) => {
    if (p.is_enterprise) { window.location.href = 'mailto:oneonone.io@yandex.com?subject=Enterprise OneOnOne'; return }
    setBusy(p.code); setMsg('')
    try {
      const { data } = await checkoutPlan({ plan_code: p.code, period, user_id: currentUser.id })
      const cfg = data.checkout
      if (!cfg?.configured || !cfg.public_id) { setMsg('Платёжная система ещё не подключена администратором.'); setBusy(''); return }
      const cp = await loadCpWidget()
      new cp.CloudPayments().pay('charge', {
        publicId: cfg.public_id, description: cfg.description, amount: cfg.amount,
        currency: cfg.currency || 'RUB', accountId: cfg.account_id, invoiceId: cfg.invoice_id,
        ...(cfg.recurrent ? { data: { cloudPayments: { recurrent: { interval: cfg.recurrent.interval, period: cfg.recurrent.period } } } } : {}),
      }, {
        onSuccess: () => { setMsg('Оплата прошла! Тариф активируется в течение минуты.'); setTimeout(refresh, 3000) },
        onFail: () => setMsg('Оплата не завершена.'),
        onComplete: () => setBusy(''),
      })
    } catch { setMsg('Не удалось открыть оплату.'); setBusy('') }
  }

  const limits = me?.limits || {}
  const meetLimit = limits.max_meetings_per_month
  const meetUsed = me?.usage?.meetings_this_month ?? 0
  const currentCode = me?.full_access_override ? 'unlimited' : (me?.plan_code || 'free')

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
          </div>

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
                    <button className="bill-cta ghost" disabled>Базовый</button>
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
