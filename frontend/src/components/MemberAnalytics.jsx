import { useState, useEffect } from 'react'
import { getMemberAnalytics } from '../api/client'

function StatCard({ value, label, accent, danger, muted }) {
  return (
    <div className="stat-card" style={{ flex: 1, minWidth: 120 }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</p>
      <p style={{
        fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1,
        color: danger ? 'var(--color-danger)' : accent ? 'var(--color-accent)' : muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>{d.count || ''}</div>
          <div style={{
            width: '100%',
            height: max > 0 ? `${Math.max((d.count / max) * 58, d.count > 0 ? 4 : 0)}px` : '0',
            background: d.count > 0 ? 'var(--color-accent)' : 'var(--gray-200)',
            borderRadius: '4px 4px 0 0',
            opacity: d.count > 0 ? 1 : 0.4,
            transition: 'height 0.4s var(--ease-spring)',
          }} />
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.week}</div>
        </div>
      ))}
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
  const memberPct = total > 0 ? Math.round(data.member_initiated / total * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }} className="anim-fade">
      {/* Top stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard value={data.meetings_last_90} label="Встреч за 90 дн." accent />
        <StatCard
          value={data.days_since_last !== null ? `${data.days_since_last} дн.` : null}
          label="Последняя встреча"
          danger={data.days_since_last !== null && data.days_since_last >= 14}
          muted={data.days_since_last === null}
        />
        <StatCard
          value={data.task_completion_pct !== null ? `${data.task_completion_pct}%` : null}
          label="Задач выполнено"
          accent={data.task_completion_pct >= 70}
          danger={data.task_completion_pct !== null && data.task_completion_pct < 40}
        />
        <StatCard value={data.open_tasks} label="Открытых задач" danger={data.open_tasks >= 5} />
      </div>

      {/* Meetings per week */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
          📈 Динамика встреч по неделям
        </p>
        <BarChart data={data.meetings_per_week} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Who initiates */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>🤝 Кто инициирует встречи</p>
          {total === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет данных</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Тимлид</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.lead_initiated} ({leadPct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${leadPct}%`, background: 'var(--color-accent)', borderRadius: 4, transition: 'width 0.5s var(--ease-spring)' }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Вы</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.member_initiated} ({memberPct}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${memberPct}%`, background: 'var(--blue-300)', borderRadius: 4, transition: 'width 0.5s var(--ease-spring)' }} />
                  </div>
                </div>
              </div>
            )
          }
        </div>

        {/* Task stats */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>✅ Задачи</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Открытых</span>
              <span className={`badge ${data.open_tasks >= 5 ? 'badge-red' : 'badge-gray'}`}>{data.open_tasks}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Выполнено всего</span>
              <span className="badge badge-green">{data.completed_tasks}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Закрыто за 30 дн.</span>
              <span className="badge badge-blue">{data.closed_last_30}</span>
            </div>
            {data.task_completion_pct !== null && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>% выполнения</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{data.task_completion_pct}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${data.task_completion_pct}%`,
                    background: data.task_completion_pct >= 70 ? 'var(--color-success)' : data.task_completion_pct >= 40 ? 'var(--color-accent)' : 'var(--color-danger)',
                    borderRadius: 3, transition: 'width 0.5s var(--ease-spring)',
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mood trend */}
      {data.mood_trend.length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>😊 Динамика настроения</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {data.mood_trend.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 28 }}>{m.emoji}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{m.date}</span>
              </div>
            ))}
            {data.mood_trend.length >= 3 && (() => {
              const vals = data.mood_trend.map(m => ({ great: 4, good: 3, neutral: 2, bad: 1 }[m.mood] || 0))
              const last = vals[vals.length - 1]
              const first = vals[0]
              const diff = last - first
              if (diff < 0) return (
                <div style={{ padding: '8px 14px', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid #FCA5A5', marginLeft: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-danger)', fontWeight: 500 }}>📉 Настроение ухудшается</p>
                </div>
              )
              if (diff > 0) return (
                <div style={{ padding: '8px 14px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', border: '1px solid #86EFAC', marginLeft: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 500 }}>📈 Настроение улучшается</p>
                </div>
              )
              return null
            })()}
          </div>
        </div>
      )}

      {data.mood_trend.length === 0 && (
        <div className="card card-flat" style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            😊 Настроение не отслеживается — тимлид пока не фиксирует его после встреч
          </p>
        </div>
      )}
    </div>
  )
}
