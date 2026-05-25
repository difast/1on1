import { useState, useEffect } from 'react'
import { getLeadAnalytics, getTeamMoodSummary } from '../api/client'

const SCORE_EMOJI = ['', '😢', '😕', '😐', '🙂', '😄']
const SCORE_COLOR = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']

const MOOD_EMOJI = { great: '😊', good: '🙂', neutral: '😐', bad: '😔' }
const FLAG_LABELS = {
  no_meeting_14_days: (s) => `${s.days ?? '14+'} дн. без встречи`,
  mood_declining: () => 'Настроение ухудшается',
  many_incomplete_tasks: (s) => `${s.count} невыполненных задач`,
}
const FLAG_BADGE = {
  no_meeting_14_days: 'badge badge-red',
  mood_declining: 'badge badge-amber',
  many_incomplete_tasks: 'badge badge-amber',
}

function BarChart({ data, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {d.count || ''}
          </div>
          <div
            style={{
              width: '100%',
              height: max > 0 ? `${Math.max((d.count / max) * 58, d.count > 0 ? 4 : 0)}px` : '0',
              background: d.count > 0 ? 'var(--color-accent)' : 'var(--gray-200)',
              borderRadius: '4px 4px 0 0',
              opacity: d.count > 0 ? 1 : 0.4,
              transition: 'height 0.4s var(--ease-spring)',
            }}
          />
          <div style={{ fontSize: 9, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.week}</div>
        </div>
      ))}
    </div>
  )
}

function StatCard({ value, label, accent, danger, muted }) {
  return (
    <div className="stat-card" style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</p>
      <p style={{
        fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1,
        color: danger ? 'var(--color-danger)' : accent ? 'var(--color-accent)' : muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function MemberStatRow({ s, isExpanded, onToggle }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div
        onClick={onToggle}
        style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div className="avatar avatar-sm avatar-accent">{s.name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{s.name}</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{s.role}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {s.warning_flags.map(f => (
            <span key={f} className={FLAG_BADGE[f] || 'badge badge-gray'} style={{ fontSize: 11 }}>
              {FLAG_LABELS[f]?.(s.warning_flags.includes('no_meeting_14_days') ? s : { count: s.open_tasks, days: s.days_since_last }) || f}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 18, color: 'var(--color-text-muted)', marginLeft: 6 }}>
          {isExpanded ? '∧' : '∨'}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
            <StatCard value={s.meetings_last_30} label="За 30 дней" />
            <StatCard value={s.meetings_last_90} label="За 90 дней" />
            <StatCard
              value={s.avg_interval_days ? `${s.avg_interval_days} дн.` : null}
              label="Ср. интервал"
              muted={!s.avg_interval_days}
            />
            <StatCard
              value={s.days_since_last !== null ? `${s.days_since_last} дн.` : null}
              label="Без встречи"
              danger={s.days_since_last !== null && s.days_since_last >= 14}
            />
            <StatCard
              value={s.task_completion_pct !== null ? `${s.task_completion_pct}%` : null}
              label="Задач выполнено"
              accent={s.task_completion_pct >= 70}
            />
            <StatCard value={s.open_tasks} label="Открытых задач" danger={s.open_tasks >= 5} />
          </div>

          {s.mood_trend.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Тренд настроения
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {s.mood_trend.map((m, i) => (
                  <span key={i} style={{ fontSize: 20 }} title={m.mood}>{m.emoji}</span>
                ))}
                {s.mood_trend.length >= 3 && (() => {
                  const vals = s.mood_trend.map(m => ({ great: 4, good: 3, neutral: 2, bad: 1 }[m.mood] || 0))
                  const last = vals[vals.length - 1]
                  const first = vals[0]
                  if (last < first) return <span style={{ fontSize: 12, color: 'var(--color-danger)', marginLeft: 6 }}>↓ ухудшение</span>
                  if (last > first) return <span style={{ fontSize: 12, color: 'var(--color-success)', marginLeft: 6 }}>↑ улучшение</span>
                  return null
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LeadAnalytics({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeamIdx, setSelectedTeamIdx] = useState(0)
  const [expandedMembers, setExpandedMembers] = useState(new Set())
  const [moodByTeam, setMoodByTeam] = useState({})

  useEffect(() => {
    setLoading(true)
    getLeadAnalytics(user.id)
      .then(r => {
        setData(r.data)
        r.data.teams.forEach(t => {
          getTeamMoodSummary(t.team_id)
            .then(mr => setMoodByTeam(prev => ({ ...prev, [t.team_id]: mr.data })))
            .catch(() => {})
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [user.id])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div className="spinner" />
    </div>
  )

  if (!data || !data.teams.length) return (
    <div className="empty-state">
      <div className="empty-icon">📊</div>
      <p className="empty-title">Нет данных для аналитики</p>
      <p className="empty-desc">Данные появятся после проведения встреч</p>
    </div>
  )

  const team = data.teams[selectedTeamIdx]

  const toggleMember = (uid) =>
    setExpandedMembers(prev => { const s = new Set(prev); s.has(uid) ? s.delete(uid) : s.add(uid); return s })

  const hourEntries = Object.entries(team.patterns.hour_distribution)
    .map(([h, c]) => ({ hour: `${h}:00`, count: c }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
  const maxHour = Math.max(...hourEntries.map(e => e.count), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }} className="anim-fade">
      {/* Team selector */}
      {data.teams.length > 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {data.teams.map((t, i) => (
            <button key={t.team_id} onClick={() => setSelectedTeamIdx(i)}
              className={i === selectedTeamIdx ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>
              {t.team_name}
            </button>
          ))}
        </div>
      )}

      {/* Top stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard value={team.total_meetings} label="Всего встреч" accent />
        <StatCard value={team.avg_interval_days ? `${team.avg_interval_days} дн.` : null} label="Ср. интервал" />
        <StatCard value={team.member_stats.length} label="Участников" />
        <StatCard value={team.warning_signals.length} label="Сигналов тревоги" danger={team.warning_signals.length > 0} />
      </div>

      {/* Meetings per week chart */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
          📈 Динамика встреч по неделям
        </p>
        <BarChart data={team.meetings_per_week} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Top 3 */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🏆 Больше всего встреч (90 дн.)</p>
          {team.top_members.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет данных</p>
            : team.top_members.map((m, i) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < team.top_members.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <span style={{ fontSize: 16, width: 24 }}>{'🥇🥈🥉'[i]}</span>
                <div className="avatar avatar-sm avatar-accent">{m.name.charAt(0).toUpperCase()}</div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{m.name}</span>
                <span className="badge badge-blue">{m.meetings_last_90} встр.</span>
              </div>
            ))
          }
        </div>

        {/* At risk */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>⚠️ Зона риска</p>
          {team.at_risk_members.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--color-success)' }}>✓ Все в порядке</p>
            : team.at_risk_members.map((m) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div className="avatar avatar-sm avatar-accent">{m.name.charAt(0).toUpperCase()}</div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                <span className="badge badge-red">
                  {m.days_since_last !== null ? `${m.days_since_last} дн.` : 'не было'}
                </span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Warning signals */}
      {team.warning_signals.length > 0 && (
        <div className="card" style={{ padding: '18px 20px', borderColor: 'var(--color-danger)', borderWidth: 1.5 }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🚨 Сигналы тревоги</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {team.warning_signals.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: 'var(--color-danger-bg)',
                borderRadius: 'var(--radius-md)', border: '1px solid #FCA5A5',
              }}>
                <span style={{ fontSize: 18 }}>
                  {s.type === 'no_meeting_14_days' ? '📅' : s.type === 'mood_declining' ? '📉' : '📋'}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{s.member_name}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                    {s.type === 'no_meeting_14_days' && `— не было встречи ${s.days ?? '14+'} дн.`}
                    {s.type === 'mood_declining' && '— настроение ухудшается 3 встречи подряд'}
                    {s.type === 'many_incomplete_tasks' && `— ${s.count} невыполненных задач`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hour patterns */}
      {hourEntries.length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>🕐 Время проведения встреч</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
            {hourEntries.map((e, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{e.count || ''}</div>
                <div style={{
                  width: '100%',
                  height: `${Math.max((e.count / maxHour) * 48, 3)}px`,
                  background: 'var(--blue-300)', borderRadius: '4px 4px 0 0',
                }} />
                <div style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{e.hour}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role averages */}
      {Object.keys(team.patterns.role_avg_meetings_90d).length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>👥 Средняя частота встреч по роли (90 дн.)</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(team.patterns.role_avg_meetings_90d).map(([role, avg]) => (
              <div key={role} style={{
                padding: '10px 16px', background: 'var(--blue-50)',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--blue-200)',
              }}>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>{role}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)' }}>{avg}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team mood section */}
      {(() => {
        const mood = moodByTeam[team.team_id]
        if (!mood) return null
        const activeDays = mood.days.filter(d => d.count > 0)
        if (activeDays.length === 0 && mood.total === 0) return null
        return (
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>🌙 Настроение команды (7 дней)</span>
              {mood.overall_avg && (
                <span style={{ fontSize: 20 }} title={`Средний балл: ${mood.overall_avg}`}>
                  {SCORE_EMOJI[Math.round(mood.overall_avg)]}
                </span>
              )}
              {mood.overall_avg && (
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  ср. {mood.overall_avg}/5 · {mood.total} отзывов
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
              {mood.days.map((d, i) => {
                const pct = d.avg ? (d.avg / 5) : 0
                const color = d.avg ? SCORE_COLOR[Math.round(d.avg)] : 'var(--gray-200)'
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                    {d.avg && <span style={{ fontSize: 14 }} title={`${d.avg}/5`}>{SCORE_EMOJI[Math.round(d.avg)]}</span>}
                    <div style={{
                      width: '100%',
                      height: pct > 0 ? `${Math.max(pct * 52, 4)}px` : '4px',
                      background: color,
                      borderRadius: '4px 4px 0 0',
                      opacity: d.count > 0 ? 1 : 0.25,
                      transition: 'height 0.4s var(--ease-spring)',
                    }} />
                    <div style={{ fontSize: 9, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{d.day}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Per-member details */}
      <div>
        <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 12 }}>
          По каждому участнику
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {team.member_stats.map(s => (
            <MemberStatRow
              key={s.user_id}
              s={s}
              isExpanded={expandedMembers.has(s.user_id)}
              onToggle={() => toggleMember(s.user_id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
