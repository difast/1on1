import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getBillingMe, getBillingPlans, checkoutPlan, changePlanPreview, cancelMySubscription, getAiQuota, scheduleDowngrade } from '../api/client'
import { confirmDialog } from '../lib/ui'
import useEscapeKey from '../lib/useEscapeKey'

// "Мой тариф" — sales-oriented plan screen + CloudPayments checkout.
// Сетка, цены и состав функций приходят из каталога бэкенда (plans.py) —
// здесь только оформление, никаких зашитых цен.
const CP_WIDGET = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

const DESC = {
  free: 'Без подписки: доступ к платным функциям закрыт.',
  start: 'Одна команда до 8 человек: встречи 1-на-1, задачи, заметки, базовый Пит.',
  team: 'Команде до 30 человек: групповые встречи, аналитика, Цели, Развитие, ONE AI.',
  business: 'Организации до 80 человек: несколько команд, кросс-командный ONE AI, HR-аналитика.',
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

const fmt = (t, v) => (v === null || v === undefined || v < 0) ? t('ui.bez_ogranicheniy') : v

function planBullets(t, p) {
  const l = p.limits || {}, f = l.features || {}
  const out = []
  out.push(l.users_label || (l.max_users != null ? t('ui.do_polzovateley', { v1: l.max_users }) : t('ui.polzovateley_bez_limita')))
  out.push(l.max_teams === 1 ? t('ui.1_komanda') : t('ui.komand_2', { v1: fmt(t, l.max_teams) }))
  for (const [key, label] of FEATURE_LABELS) {
    if (f[key]) out.push(label)
    if (out.length >= 7) break
  }
  return out
}

// Виджет AI-квоты (себестоимость): использовано из бюджета, прогресс, дата
// сброса, разбивка input/output и по участникам (для тимлида), уведомления
// 80/90/100, заготовка «Увеличить AI-квоту» (без оплаты — «Скоро»).
function AiQuotaWidget({ userId }) {
  const [q, setQ] = useState(null)
  const [showBuy, setShowBuy] = useState(false)
  useEffect(() => { getAiQuota(userId).then(r => setQ(r.data)).catch(() => setQ(null)) }, [userId])
  if (!q) return null
  const fmt = n => (n == null ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }))
  const pct = q.unlimited ? 0 : Math.min(100, q.percent || 0)
  const barColor = q.unlimited ? 'var(--color-accent)' : pct >= 100 ? 'var(--color-danger, #dc2626)' : pct >= 90 ? '#f59e0b' : pct >= 80 ? '#eab308' : 'var(--color-accent)'
  const box = { background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, margin: '0 0 16px' }
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontWeight: 700 }}>AI-квота</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {q.unlimited ? 'Без ограничения (индивидуальный бюджет)'
            : <>Использовано <strong>{fmt(q.used_rub)} ₽</strong> из <strong>{fmt(q.budget_rub)} ₽</strong></>}
        </div>
      </div>
      {!q.unlimited && (
        <div style={{ height: 10, borderRadius: 999, background: 'var(--color-surface-2, #eef1f6)', overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap', gap: 6 }}>
        <span>{q.unlimited ? '' : `${pct}% использовано`}</span>
        <span>Сброс лимита: {q.reset_date}</span>
      </div>
      {q.notice && (
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, fontSize: 13,
          background: q.notice.level === 'exhausted' ? 'var(--color-danger-bg, #fdecec)' : '#fff8ed',
          border: `1px solid ${q.notice.level === 'exhausted' ? 'var(--color-danger, #dc2626)55' : '#fcd9a5'}`,
          color: q.notice.level === 'exhausted' ? 'var(--color-danger, #dc2626)' : '#7c4a03' }}>
          {q.notice.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--color-text-secondary)', flexWrap: 'wrap' }}>
        <span>Input: {fmt(q.input_tokens)} ток. ({fmt(q.input_cost_rub)} ₽)</span>
        <span>Output: {fmt(q.output_tokens)} ток. ({fmt(q.output_cost_rub)} ₽)</span>
        <span>Запросов: {q.requests}</span>
      </div>
      {q.is_budget_owner && q.members && q.members.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Расход по участникам команды</div>
          {q.members.map(m => (
            <div key={m.user_id || m.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--color-border)' }}>
              <span>{m.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{fmt(m.input_tokens)} in / {fmt(m.output_tokens)} out · <strong>{fmt(m.ai_cost_rub)} ₽</strong></span>
            </div>
          ))}
        </div>
      )}
      {!q.unlimited && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowBuy(true)} className="bill-cta"
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            Увеличить AI-квоту
          </button>
          {showBuy && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
              {q.increase_quota?.message || 'Скоро будет доступно'}. AI продолжает работать в базовом режиме и после исчерпания квоты.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// readOnly — режим Mini App: тариф можно посмотреть, но оплатить и сменить
// нельзя (по таблице разделения функционала оплата только в веб-версии).
export default function Billing({ open, currentUser, initialPlan, readOnly = false, onClose }) {
  const { t } = useTranslation()
  const [me, setMe] = useState(null)
  const [plans, setPlans] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  // Период оплаты для тарифов с выбором (Team): месяц | год. У остальных тарифов
  // период фиксирован самим тарифом, переключатель на них не влияет.
  const [period, setPeriod] = useState('month')

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
  // Тариф с выбором периода (Team): заданы обе цены — помесячная и годовая.
  const offersChoice = (p) => !!(p && p.price_month && p.price_year)

  const openWidget = async (p) => {
    setBusy(p.code)
    try {
      const pd = offersChoice(p) ? period : undefined
      const { data } = await checkoutPlan({ plan_code: p.code, user_id: currentUser.id, period: pd })
      const cfg = data.checkout
      if (!cfg?.configured || !cfg.public_id) { setMsg(t('ui.platezhnaya_sistema_esche_ne_podklyuchena_admi')); setBusy(''); return }
      const cp = await loadCpWidget()
      new cp.CloudPayments().pay('charge', {
        publicId: cfg.public_id, description: cfg.description, amount: cfg.amount,
        currency: cfg.currency || 'RUB', accountId: cfg.account_id, invoiceId: cfg.invoice_id,
        // tokenize + recurrent — чтобы получить токен карты и создать подписку
        // на рекуррентные списания (Этап 6.1/6.2).
        ...(cfg.recurrent ? { data: { cloudPayments: { recurrent: { interval: cfg.recurrent.interval, period: cfg.recurrent.period } } } } : {}),
      }, {
        onSuccess: () => { setMsg(t('ui.oplata_proshla_tarif_aktiviruetsya_v_techenie')); setTimeout(refresh, 3000) },
        onFail: (reason) => setMsg(reason ? t('ui.oplata_ne_zavershena', { v1: reason }) : t('ui.oplata_ne_zavershena_poprobuyte_esche_raz')),
        onComplete: () => setBusy(''),
      })
    } catch { setMsg(t('ui.ne_udalos_otkryt_oplatu')); setBusy('') }
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
      const res = await changePlanPreview({ plan_code: p.code, user_id: currentUser.id, period: offersChoice(p) ? period : undefined })
      d = res.data
    } catch { setMsg(t('ui.ne_udalos_proverit_tarif_poprobuyte_pozzhe')); return }

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
        const extra = d.amount ? ` К оплате сейчас: ${d.amount.toLocaleString('ru-RU')} ₽${d.period === 'year' ? t('ui.za_god_edinovremenno') : t('ui.za_mesyac')}.` : ''
        if (await confirmDialog({ title: t('ui.pereyti_na_tarif', { v1: p.name }), message: d.message + extra, confirmText: t('ui.oplatit_i_pereyti') }))
          return openWidget(p)
        return
      }
      case 'downgrade_free': {
        if (await confirmDialog({ title: t('ui.otkazatsya_ot_podpiski_2'), message: d.message, confirmText: t('ui.otkazatsya_ot_podpiski'), danger: true })) {
          try { await cancelMySubscription(currentUser.id); setMsg(t('ui.avtospisaniya_otmeneny_dostup_sohranitsya_do_k')); setTimeout(refresh, 1200) }
          catch { setMsg(t('ui.ne_udalos_vypolnit_deystvie_2')) }
        }
        return
      }
      case 'downgrade': {
        const warn = (d.over_limit || []).map(v => v.message).join(' ')
        const full = d.message + (warn ? `\n\nВнимание: ${warn}` : '')
        if (await confirmDialog({ title: t('ui.ponizit_tarif_do', { v1: p.name }), message: full, confirmText: t('ui.zaplanirovat_ponizhenie') })) {
          // Отложенный переход на более дешёвый ПЛАТНЫЙ тариф: применяется со
          // следующего расчётного периода (pending_plan_code + крон на бэкенде).
          try {
            await scheduleDowngrade({ plan_code: p.code, period: offersChoice(p) ? period : undefined, user_id: currentUser.id })
            setMsg('Понижение запланировано. Оно вступит в силу с начала следующего расчётного периода; до этого текущие лимиты сохраняются.')
            setTimeout(refresh, 1200)
          } catch { setMsg(t('ui.ne_udalos_vypolnit_deystvie_2')) }
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
  const currentName = me?.full_access_override ? t('billing.fullAccess') : (me?.plan_name || currentCode)
  const inTrial = me?.subscription?.status === 'trialing'
  const trialLocked = me?.trial_restricted_features || []

  return (
    <div className="bill-overlay" data-pit-hide onClick={onClose}>
      <div className="bill-modal" onClick={e => e.stopPropagation()}>
        <div className="bill-head">
          <h2>{t('ui.moy_tarif')}</h2>
          <button className="bill-x" aria-label={t('ui.zakryt')} onClick={onClose}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>

        <div className="bill-body">
          {readOnly && (
            <p className="bill-msg" style={{ marginTop: 0 }}>{t('ui.zdes_mozhno_posmotret_tarif_i_limity')}</p>
          )}
          <p className="bill-hero">Выберите тариф под размер команды. Start — 1 990 ₽/мес, Team — 4 990 ₽/мес или 49 990 ₽/год, Business — 9 990 ₽/мес или 99 990 ₽/год. Enterprise подключается индивидуально. Повышение действует сразу.</p>
          <p style={{ margin: '-4px 0 4px', fontSize: 13 }}>
            <a href="https://oneononehq.com/pricing" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
              Полное сравнение функций тарифов на странице тарифов →
            </a>
          </p>

          {/* Current plan + usage */}
          <div className="bill-current">
            <span className="lbl">{t('ui.tekuschiy_tarif')}</span>
            <span className="bill-chip">{currentName}{inTrial ? t('ui.probnyy_period') : ''}</span>
            {meetLimit != null && meetLimit >= 0 && (
              <div className="bill-usage">
                <div className="cap">Встречи в этом месяце: {meetUsed} / {meetLimit}</div>
                <div className="track"><div className="fill" style={{ width: `${Math.min(100, (meetUsed / Math.max(meetLimit, 1)) * 100)}%` }} /></div>
              </div>
            )}
            {/* Grace-период (не прошёл платёж) — предлагаем обновить карту (5.8) */}
            {me?.subscription?.in_grace && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-danger-bg, #fdecec)', border: '1px solid var(--color-danger, #dc2626)33', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>{t('ui.posledniy_platezh_ne_proshel_obnovite_kartu')}<button className="bill-cta" style={{ marginTop: 8 }} disabled={busy || readOnly}
                  onClick={() => { const cp = plans.find(x => x.code === (me?.subscription?.plan_code || currentCode)); if (cp) openWidget(cp) }}>{t('ui.obnovit_kartu')}</button>
              </div>
            )}
            {me?.subscription?.cancel_at_period_end && !me?.subscription?.in_grace && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('ui.avtospisaniya_otmeneny_dostup_sohranitsya_do_k_2')}</div>
            )}
            {/* 14-дневный пробный период */}
            {inTrial && me?.trial_until && !me?.trial_expired && (() => {
              const end = new Date(me.trial_until)
              const daysLeft = Math.max(Math.ceil((end - new Date()) / 86400000), 0)
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Пробный период до {end.toLocaleDateString('ru-RU')} — осталось {daysLeft} дн.
                  {trialLocked.length > 0 && t('ui.na_probnom_periode_tarifa_team_nedostupny')}
                </div>
              )
            })()}
            {me?.trial_expired && !currentIsPaid && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--color-danger-bg, #fdecec)', border: '1px solid var(--color-danger, #dc2626)33', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>{t('ui.probnyy_period_14_dney_istek_vyberite')}</div>
            )}
          </div>

          {/* Персональный менеджер (если назначен админом) */}
          {me?.subscription?.manager_name && (
            <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: 'var(--blue-50)', border: '1px solid var(--blue-200)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent)', marginBottom: 4 }}>{t('ui.personalnyy_menedzher')}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{me.subscription.manager_name}</div>
              {me.subscription.manager_contact && (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>Связь: {me.subscription.manager_contact}</div>
              )}
            </div>
          )}

          {/* AI-квота (себестоимость): использовано/бюджет, прогресс, разбивка,
              уведомления по порогам, заготовка допродажи квоты. */}
          {currentUser?.id && <AiQuotaWidget userId={currentUser.id} />}

          {/* Тарифы. Для Team доступен выбор периода оплаты (месяц/год). */}
          <div className="bill-grid">
            {plans.map(p => {
              const isCurrent = currentCode === p.code
              const popular = p.code === POPULAR
              const l = p.limits || {}
              const isFreeState = p.code === 'free'
              return (
                <div key={p.code} className={`bill-card${popular ? ' popular' : ''}${isCurrent ? ' current' : ''}`}>
                  {popular && <span className="bill-ribbon">{t('ui.populyarnyy')}</span>}
                  <span className="bill-name">{p.name}</span>
                  <div className={`bill-price${p.is_enterprise ? ' ent' : ''}`}>
                    {p.is_enterprise || isFreeState
                      ? (l.price_label || t('ui.po_zaprosu'))
                      : offersChoice(p)
                        ? <>{(period === 'year' ? p.price_year : p.price_month).toLocaleString('ru-RU')}₽<small>{period === 'year' ? t('ui.god') : t('ui.mes')}</small></>
                        : <>{(p.price_month || p.price_year).toLocaleString('ru-RU')}₽<small>{l.billing_period === 'year' ? t('ui.god') : t('ui.mes')}</small></>}
                  </div>
                  {offersChoice(p) && (
                    <div className="bill-period-toggle" style={{ display: 'inline-flex', gap: 4, margin: '2px 0 8px', padding: 3, borderRadius: 999, background: 'var(--color-surface-2, #eef1f6)' }}>
                      <button type="button" onClick={() => setPeriod('month')}
                        style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, background: period === 'month' ? 'var(--color-surface, #fff)' : 'transparent', color: period === 'month' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {t('ui.mes')}
                      </button>
                      <button type="button" onClick={() => setPeriod('year')}
                        style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, background: period === 'year' ? 'var(--color-surface, #fff)' : 'transparent', color: period === 'year' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {t('ui.god')} −16,5%
                      </button>
                    </div>
                  )}
                  <div className="bill-desc">{DESC[p.code] || ''}</div>
                  <ul className="bill-feats">
                    {planBullets(t, p).map((b, i) => (<li key={i}><Check />{b}</li>))}
                    {!isFreeState && COMING_SOON.map(([k, label]) => (
                      <li key={k} style={{ opacity: .55 }}><Check />{label} — скоро</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <button className="bill-cta muted" disabled>{t('ui.tekuschiy_tarif')}</button>
                  ) : readOnly ? (
                    <button className="bill-cta muted" disabled>{t('ui.oformlenie_v_veb_versii')}</button>
                  ) : isFreeState ? (
                    currentIsPaid ? (
                      <button className="bill-cta ghost" disabled={busy === p.code} onClick={() => handleBuy(p)}>{t('ui.otkazatsya_ot_podpiski')}</button>
                    ) : (
                      <button className="bill-cta ghost" disabled>{t('ui.bez_podpiski')}</button>
                    )
                  ) : (
                    <button className="bill-cta" disabled={busy === p.code} onClick={() => handleBuy(p)}>
                      {busy === p.code ? '...' : p.is_enterprise ? t('ui.svyazatsya_s_nami') : t('ui.vybrat')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {msg && <p className="bill-msg">{msg}</p>}
          <p className="bill-foot">Start списывается раз в месяц; Team и Business — раз в месяц или раз в год полной суммой (годовой выгоднее на 16,5%). Enterprise оформляется по договору, без автоматического списания. Активация подписки подтверждается платёжной системой. Отменить или сменить тариф можно в любой момент — понижение вступит в силу с начала следующего периода.</p>
        </div>
      </div>
    </div>
  )
}
