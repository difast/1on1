import { useState, useEffect, useRef } from 'react'
import { getMemberAnalytics, getMyMoodSeries } from '../api/client'
import { useIsTelegram } from '../lib/surface'

function AnimNum({ value, suffix = '', duration = 900 }) {
  const [disp, setDisp] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const target = value ?? 0
    if (target === 0) { setDisp(0); return }
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setDisp(Number.isInteger(target) ? Math.round(e * target) : +(e * target).toFixed(1))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [value, duration])
  return <>{disp}{suffix}</>
}

function StatCard({ value, suffix, label, icon, accent, danger, warning, delay = 0 }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t) }, [delay])
  const color = danger ? 'var(--color-danger)' : warning ? '#f59e0b' : accent ? 'var(--color-accent)' : 'var(--color-text-primary)'
  return (
    <div className="stat-card" style={{
      flex: 1, minWidth: 130, opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(14px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginBottom: 12, opacity: 0.8 }} />
      <p style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.8px', lineHeight: 1 }}>
        {value !== null && value !== undefined ? <AnimNum value={value} suffix={suffix} /> : '—'}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>{label}</p>
    </div>
  )
}

function ProgressBar({ value, max = 100, color, delay = 0 }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(Math.min((value / max) * 100, 100)), delay + 200); return () => clearTimeout(t) }, [value, max, delay])
  return (
    <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 4, transition: 'width 0.7s var(--ease-spring)' }} />
    </div>
  )
}

// Личный график настроения по чек-инам (27.1): строится по собственному ряду,
// появляется с ПЕРВОЙ отметки (одна точка рисуется как маркер), пропущенные дни —
// разрыв линии, а НЕ ноль. Ось строится по непрерывному диапазону дат, точки без
// данных получают y=null (разрыв). Динамика вычисляется по краям ряда.
function CheckinMoodChart({ points }) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 250); return () => clearTimeout(t) }, [points])

  const valid = points.filter(p => p.y !== null && p.y !== undefined)
  if (valid.length === 0) return (
    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
      Пока нет отметок настроения за выбранный период
    </p>
  )

  const W = 500, H = 110
  const n = points.length
  const xs = points.map((_, i) => n > 1 ? (i / (n - 1)) * (W - 60) + 30 : W / 2)
  const toY = v => (v === null || v === undefined) ? null : H - 12 - ((v - 1) / 4) * (H - 24)
  const coords = points.map((p, i) => ({ x: xs[i], y: toY(p.y), label: p.label }))

  // Линия строится сегментами: разрыв на пропущенных днях (y === null).
  const parts = []
  let inGap = true
  coords.forEach(c => {
    if (c.y === null) { inGap = true; return }
    parts.push(inGap ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`)
    inGap = false
  })
  const d = parts.join(' ')

  const firstV = valid[0].y, lastV = valid[valid.length - 1].y
  const trendDir = valid.length < 2 ? 'flat' : lastV < firstV - 0.3 ? 'down' : lastV > firstV + 0.3 ? 'up' : 'flat'
  const lineColor = trendDir === 'down' ? '#ef4444' : trendDir === 'up' ? '#22c55e' : '#3b82f6'
  const labelStep = Math.max(1, Math.ceil(n / 7))

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ overflow: 'visible', marginBottom: 4 }}>
        <defs>
          <linearGradient id="checkinMoodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[1, 2, 3, 4, 5].map(v => (
          <line key={v} x1={30} x2={W - 30} y1={toY(v)} y2={toY(v)}
            stroke="var(--color-border)" strokeWidth="0.8" strokeDasharray="3 5" />
        ))}
        {d && (
          <path d={d} stroke={lineColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: animated ? 'none' : '900', strokeDashoffset: animated ? 0 : 900, transition: 'stroke-dashoffset 1.1s ease' }} />
        )}
        {coords.map((c, i) => c.y !== null && (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={valid.length === 1 ? 6 : 4} fill={lineColor} stroke="var(--color-surface)" strokeWidth="2"
              style={{ opacity: animated ? 1 : 0, transition: `opacity 0.3s ease ${i * 60 + 400}ms` }} />
            {(i % labelStep === 0 || i === n - 1 || valid.length === 1) && (
              <text x={c.x} y={H + 14} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>{c.label}</text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {valid.length === 1 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Первая отметка — график продолжит строиться с каждым днём</span>}
        {valid.length >= 2 && trendDir === 'down' && <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>Настроение снижается</span>}
        {valid.length >= 2 && trendDir === 'up' && <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>Настроение растёт</span>}
        {valid.length >= 2 && trendDir === 'flat' && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Настроение стабильно</span>}
      </div>
    </div>
  )
}

// Строит непрерывную ось дат [start..end] и раскладывает ряд чек-инов по дням;
// день без отметки → y=null (разрыв). Пропуски НЕ заполняются нулями.
function buildContinuousAxis(series, startISO, endISO) {
  const byDate = {}
  for (const p of series || []) byDate[p.date] = p.score
  const out = []
  const start = new Date(startISO + 'T00:00:00')
  const end = new Date(endISO + 'T00:00:00')
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    const iso = dt.toISOString().slice(0, 10)
    const label = `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`
    out.push({ label, y: iso in byDate ? byDate[iso] : null })
  }
  return out
}

function CompareRow({ label, cur, prev, unit = '', invert = false }) {
  const delta = (cur ?? 0) - (prev ?? 0)
  const up = delta > 0, down = delta < 0
  // invert: для «плохих» метрик рост = красный. Здесь метрики позитивные.
  const good = invert ? down : up
  const color = delta === 0 ? 'var(--color-text-muted)' : good ? 'var(--color-success)' : 'var(--color-danger)'
  const sign = delta > 0 ? '+' : ''
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{cur ?? 0}{unit}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>было {prev ?? 0}{unit}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>
          {delta === 0 ? 'без изм.' : `${sign}${delta}${unit}`}
        </span>
      </div>
    </div>
  )
}

export default function MemberAnalytics({ user, teamId }) {
  const isTg = useIsTelegram()  // Mini App: только сводка, без графиков
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // Личный график настроения по чек-инам: период week/month/range (27.2).
  const [moodPeriod, setMoodPeriod] = useState('month')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })
  const [moodSeries, setMoodSeries] = useState(null)   // { series, start, end }
  const [moodLoading, setMoodLoading] = useState(false)

  const loadAnalytics = () => {
    getMemberAnalytics(user.id)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const loadMoodSeries = () => {
    setMoodLoading(true)
    const params = { teamId }
    if (moodPeriod === 'range' && customRange.start && customRange.end) {
      params.start = customRange.start; params.end = customRange.end
    } else if (moodPeriod !== 'range') {
      params.period = moodPeriod
    } else {
      setMoodLoading(false); return  // диапазон ещё не задан
    }
    getMyMoodSeries(user.id, params)
      .then(r => setMoodSeries(r.data))
      .catch(() => setMoodSeries(null))
      .finally(() => setMoodLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    loadAnalytics()
  }, [user.id])

  useEffect(() => { loadMoodSeries() }, [user.id, teamId, moodPeriod, customRange.start, customRange.end])

  // Реактивное обновление после чек-ина: перезагружаем аналитику и график, не
  // требуя ручного обновления или перезахода на экран.
  useEffect(() => {
    const onMood = () => { loadAnalytics(); loadMoodSeries() }
    window.addEventListener('mood-updated', onMood)
    return () => window.removeEventListener('mood-updated', onMood)
  }, [user.id, teamId, moodPeriod, customRange.start, customRange.end])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div className="spinner" />
    </div>
  )
  if (!data) return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8l1.6-3.2A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.8 1.1L20 8"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M4 8h5l1 2h4l1-2h5"/></svg></div>
      <p className="empty-title">Нет данных для аналитики</p>
      <p className="empty-desc">Данные появятся после проведения встреч</p>
    </div>
  )

  const total = data.lead_initiated + data.member_initiated
  const leadPct = total > 0 ? Math.round(data.lead_initiated / total * 100) : 0
  const taskColor = data.task_completion_pct >= 70 ? 'var(--color-success)' : data.task_completion_pct >= 40 ? 'var(--color-accent)' : 'var(--color-danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 860, width: '100%' }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard value={data.meetings_last_90} label="Встреч за 90 дней" accent delay={0} />
        <StatCard value={data.days_since_last} suffix=" дн." label="Последняя встреча" danger={data.days_since_last >= 14} delay={100} />
        <StatCard value={data.task_completion_pct} suffix="%" label="Задач выполнено" accent={data.task_completion_pct >= 70} danger={data.task_completion_pct !== null && data.task_completion_pct < 40} delay={200} />
        <StatCard value={data.open_tasks} label="Открытых задач" warning={data.open_tasks >= 3} danger={data.open_tasks >= 5} delay={300} />
        <StatCard value={data.closed_last_30} label="Закрыто за 30 дн." delay={400} />
      </div>

      {/* Сравнение с собственным прошлым периодом (31.3) — только свои данные,
          доступно и в Mini App (числа без графиков). */}
      {data.compare && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            Динамика к прошлому периоду
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
            Последние 30 дней в сравнении с предыдущими 30
          </p>
          <CompareRow label="Закрыто задач" cur={data.compare.closed_tasks_30} prev={data.compare.closed_tasks_prev_30} />
          <CompareRow label="Встреч" cur={data.compare.meetings_30} prev={data.compare.meetings_prev_30} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Настроение (15 дн. vs пред. 15)</span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: data.compare.mood_delta_15d == null ? 'var(--color-text-muted)'
                : data.compare.mood_delta_15d > 0 ? 'var(--color-success)'
                : data.compare.mood_delta_15d < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)',
            }}>
              {data.compare.mood_delta_15d == null ? 'нет данных'
                : `${data.compare.mood_delta_15d > 0 ? '+' : ''}${data.compare.mood_delta_15d}`}
            </span>
          </div>
        </div>
      )}

      {/* Графики ниже скрыты в Mini App — показываем только сводку/числа выше */}
      {!isTg && (<>

      {/* Личный график настроения по чек-инам (27.1/27.2) — только свои данные,
          с первой отметки, с переключением периода и разрывами вместо нулей. */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>Моё настроение (чек-ины)</p>
            {data.mood_checkin_avg != null && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Средний балл: {data.mood_checkin_avg}/5</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['week', 'Неделя'], ['month', 'Месяц'], ['range', 'Период']].map(([val, lbl]) => (
              <button key={val} onClick={() => setMoodPeriod(val)}
                className={moodPeriod === val ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ fontSize: 12, padding: '5px 12px' }}>{lbl}</button>
            ))}
          </div>
        </div>
        {moodPeriod === 'range' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <input type="date" className="input" value={customRange.start}
              onChange={e => setCustomRange(r => ({ ...r, start: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }} />
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>—</span>
            <input type="date" className="input" value={customRange.end}
              onChange={e => setCustomRange(r => ({ ...r, end: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }} />
          </div>
        )}
        {moodLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><div className="spinner" /></div>
        ) : moodPeriod === 'range' && !(customRange.start && customRange.end) ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Выберите начало и конец периода</p>
        ) : moodSeries && moodSeries.series && moodSeries.series.length > 0 ? (
          <CheckinMoodChart points={buildContinuousAxis(moodSeries.series, moodSeries.start, moodSeries.end)} />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Пока нет отметок настроения. Заполните ежедневный опрос — график появится сразу после первой отметки.
          </p>
        )}
      </div>

      <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Who initiates */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Кто инициирует встречи</p>
          {total === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет данных</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Тимлид</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{data.lead_initiated} ({leadPct}%)</span>
                  </div>
                  <ProgressBar value={leadPct} color="var(--color-accent)" delay={0} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Я</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{data.member_initiated} ({100 - leadPct}%)</span>
                  </div>
                  <ProgressBar value={100 - leadPct} color="var(--blue-300)" delay={100} />
                </div>
              </div>
            )}
        </div>

        {/* Tasks breakdown */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Задачи</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Открытых', val: data.open_tasks, badge: data.open_tasks >= 5 ? 'badge-red' : 'badge-gray' },
              { label: 'Выполнено всего', val: data.completed_tasks, badge: 'badge-green' },
              { label: 'Закрыто за 30 дн.', val: data.closed_last_30, badge: 'badge-blue' },
            ].map(({ label, val, badge }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
                <span className={`badge ${badge}`}>{val}</span>
              </div>
            ))}
            {data.task_completion_pct !== null && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>% выполнения</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: taskColor }}>{data.task_completion_pct}%</span>
                </div>
                <ProgressBar value={data.task_completion_pct} color={taskColor} delay={200} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meetings per week */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
          Встречи по неделям
        </p>
        {(() => {
          const weeks = data.meetings_per_week || []
          const max = Math.max(...weeks.map(w => w.count), 1)
          return (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 70 }}>
              {weeks.map((w, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                  {w.count > 0 && <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{w.count}</span>}
                  <div style={{
                    width: '100%',
                    height: `${Math.max((w.count / max) * 50, w.count > 0 ? 4 : 2)}px`,
                    background: w.count > 0 ? 'var(--color-accent)' : 'var(--gray-200)',
                    borderRadius: '4px 4px 0 0', opacity: w.count > 0 ? 1 : 0.3,
                    transition: `height 0.5s var(--ease-spring) ${i * 30}ms`,
                  }} />
                  <span style={{ fontSize: 8, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{w.week}</span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
      </>)}
    </div>
  )
}
