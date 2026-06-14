import { useState, useEffect } from 'react'
import { getBillingMe, getBillingPlans, checkoutPlan } from '../api/client'

// "Мой тариф" — current plan, usage and self-serve purchase via CloudPayments.
const CP_WIDGET = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

function loadCpWidget() {
  return new Promise((resolve, reject) => {
    if (window.cp) return resolve(window.cp)
    const s = document.createElement('script')
    s.src = CP_WIDGET
    s.onload = () => resolve(window.cp)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function Billing({ open, currentUser, initialPlan, onClose }) {
  const [me, setMe] = useState(null)
  const [plans, setPlans] = useState([])
  const [period, setPeriod] = useState('month')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = () => {
    if (!currentUser?.id) return
    getBillingMe(currentUser.id).then(r => setMe(r.data)).catch(() => {})
  }

  useEffect(() => {
    if (!open) return
    refresh()
    getBillingPlans().then(r => setPlans(r.data)).catch(() => {})
  }, [open, currentUser?.id])

  if (!open) return null

  const handleBuy = async (plan) => {
    if (plan.is_enterprise) { window.location.href = 'mailto:oneonone.io@yandex.com?subject=Enterprise'; return }
    setBusy(true); setMsg('')
    try {
      const { data } = await checkoutPlan({ plan_code: plan.code, period, user_id: currentUser.id })
      const cfg = data.checkout
      if (!cfg?.configured || !cfg.public_id) {
        setMsg('Платёжная система ещё не подключена администратором.')
        setBusy(false); return
      }
      const cp = await loadCpWidget()
      const widget = new cp.CloudPayments()
      widget.pay('charge', {
        publicId: cfg.public_id,
        description: cfg.description,
        amount: cfg.amount,
        currency: cfg.currency || 'RUB',
        accountId: cfg.account_id,
        invoiceId: cfg.invoice_id,
        ...(cfg.recurrent ? { data: { cloudPayments: { recurrent: { interval: cfg.recurrent.interval, period: cfg.recurrent.period } } } } : {}),
      }, {
        onSuccess: () => { setMsg('Оплата прошла! Тариф активируется в течение минуты.'); setTimeout(refresh, 3000) },
        onFail: () => { setMsg('Оплата не завершена.') },
        onComplete: () => setBusy(false),
      })
    } catch {
      setMsg('Не удалось открыть оплату.'); setBusy(false)
    }
  }

  const fmt = (v) => v < 0 ? '∞' : v
  const limits = me?.limits || {}

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9600, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 920, marginTop: 24, padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid var(--color-border)' }}>
          <strong style={{ fontSize: 17 }}>Мой тариф</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          {/* Current plan */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 18, background: 'var(--color-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Текущий тариф:</span>
              <span className="badge badge-blue" style={{ fontSize: 13, textTransform: 'uppercase' }}>
                {me?.full_access_override ? 'Полный доступ' : (me?.plan_code || 'free')}
              </span>
              {me?.usage && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Встречи в этом месяце: {me.usage.meetings_this_month ?? 0}{limits.meetings_per_month >= 0 ? ` / ${limits.meetings_per_month}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Period toggle */}
          <div style={{ display: 'inline-flex', background: 'var(--color-bg)', borderRadius: 10, padding: 3, marginBottom: 16, border: '1px solid var(--color-border)' }}>
            {[['month', 'Ежемесячно'], ['year', 'Годовая −20%']].map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: period === k ? 'var(--color-accent)' : 'transparent',
                color: period === k ? '#fff' : 'var(--color-text-secondary)',
              }}>{label}</button>
            ))}
          </div>

          {/* Plans */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px,100%), 1fr))', gap: 12 }}>
            {plans.map(p => {
              const price = period === 'year' ? p.price_year : p.price_month
              const isCurrent = (me?.plan_code === p.code)
              return (
                <div key={p.code} className="card" style={{ padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 8, border: isCurrent ? '2px solid var(--color-accent)' : undefined }}>
                  <strong style={{ fontSize: 15 }}>{p.name}</strong>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    {p.is_enterprise ? 'По согласованию' : `${price}₽`}
                    {!p.is_enterprise && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>{p.per_seat ? ' /чел·мес' : ' /мес'}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {(p.limits?.max_team_members >= 0) && <div>До {fmt(p.limits.max_team_members)} участников</div>}
                    {(p.limits?.max_teams >= 0) && <div>Команд: {fmt(p.limits.max_teams)}</div>}
                    <div>Встреч/мес: {fmt(p.limits?.meetings_per_month)}</div>
                  </div>
                  <button
                    disabled={busy || isCurrent}
                    onClick={() => handleBuy(p)}
                    className={isCurrent ? 'btn btn-secondary btn-sm' : 'btn btn-accent btn-sm'}
                    style={{ marginTop: 'auto' }}
                  >
                    {isCurrent ? 'Текущий' : p.is_enterprise ? 'Связаться' : (p.code === 'free' ? 'Бесплатно' : 'Выбрать')}
                  </button>
                </div>
              )
            })}
          </div>

          {msg && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-accent)' }}>{msg}</p>}
        </div>
      </div>
    </div>
  )
}
