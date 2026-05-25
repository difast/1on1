import { useState, useEffect, useRef } from 'react'
import { getMemberAnalytics } from '../api/client'

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
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
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

function MoodLineChart({ trend }) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t) }, [])

  const SCORE = { great: 4, good: 3, neutral: 2, bad: 1 }
  const EMOJI = { great: '😊', good: '🙂', neutral: '😐', bad: '😔' }
  const points = trend.map(m => ({ y: SCORE[m.mood] || 0, label: m.date, emoji: EMOJI[m.mood] || '❓' }))
  if (points.length < 2) return (
    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нужно минимум 2 точки</p>
  )

  const W = 500, H = 100
  const xs = points.map((_, i) => (i / (points.length - 1)) * (W - 60) + 30)
  const toY = v => H - 10 - ((v - 1) / 3) * (H - 20)
  const coords = points.map((p, i) => ({ x: xs[i], y: toY(p.y) }))

  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const fillD = `M ${coords[0].x} ${H} ${coords.map(c => `L ${c.x} ${c.y}`).join(' ')} L ${coords[coords.length-1].x} ${H} Z`

  const last = points[points.length - 1].y, first = points[0].y
  const trendDir = last < first - 0.3 ? 'down' : last > first + 0.3 ? 'up' : 'flat'
  const lineColor = trendDir === 'down' ? '#ef4444' : trendDir === 'up' ? '#22c55e' : '#3b82f6'

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 20}`} style={{ overflow: 'visible', marginBottom: 4 }}>
        <defs>
          <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[1,2,3,4].map(v => (
          <line key={v} x1={30} x2={W-30} y1={toY(v)} y2={toY(v)}
            stroke="var(--color-border)" strokeWidth="0.8" strokeDasharray="3 5" />
        ))}
        <path d={fillD} fill="url(#moodGrad)" />
        <path d={d} stroke={lineColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: animated ? 'none' : '800', strokeDashoffset: animated ? 0 : 800, transition: 'stroke-dashoffset 1.2s ease' }} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="4" fill={lineColor} stroke="var(--color-surface)" strokeWidth="2"
              style={{ opacity: animated ? 1 : 0, transition: `opacity 0.3s ease ${i * 100 + 500}ms` }} />
            <text x={c.x} y={H + 18} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>{points[i].label}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trendDir === 'down' && <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>📉 Настроение ухудшается</span>}
        {trendDir === 'up' && <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>📈 Настроение улучшается</span>}
        {trendDir === 'flat' && <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>→ Настроение стабильно</span>}
      </div>
    </div>
  )
}

export default function MemberAnalytics({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getMemberAnalytics(user.id)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [user.id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div className="spinner" />
    </div>
  )
  if (!data) return (
    <div className="empty-state">
      <div className="empty-icon">📊</div>
      <p className="empty-title">Нет данных для аналитики</p>
      <p className="empty-desc">Данные появятся после проведения встреч</p>
    </div>
  )

  const total = data.lead_initiated + data.member_initiated
  const leadPct = total > 0 ? Math.round(data.lead_initiated / total * 100) : 0
  const taskColor = data.task_completion_pct >= 70 ? 'var(--color-success)' : data.task_completion_pct >= 40 ? 'var(--color-accent)' : 'var(--color-danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 860 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard icon="🤝" value={data.meetings_last_90} label="Встреч за 90 дней" accent delay={0} />
        <StatCard icon="📅" value={data.days_since_last} suffix=" дн." label="Последняя встреча" danger={data.days_since_last >= 14} delay={100} />
        <StatCard icon="✅" value={data.task_completion_pct} suffix="%" label="Задач выполнено" accent={data.task_completion_pct >= 70} danger={data.task_completion_pct !== null && data.task_completion_pct < 40} delay={200} />
        <StatCard icon="📋" value={data.open_tasks} label="Открытых задач" warning={data.open_tasks >= 3} danger={data.open_tasks >= 5} delay={300} />
        <StatCard icon="🗓" value={data.closed_last_30} label="Закрыто за 30 дн." delay={400} />
      </div>

      {/* Mood line chart */}
      {data.mood_trend.length >= 2 ? (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            😊 Моё настроение по встречам
          </p>
          <MoodLineChart trend={data.mood_trend} />
        </div>
      ) : (
        <div className="card card-flat" style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            😊 График настроения появится после нескольких встреч с записью настроения
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Who initiates */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>🤝 Кто инициирует встречи</p>
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
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>✅ Задачи</p>
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
          📈 Встречи по неделям
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
    </div>
  )
}
