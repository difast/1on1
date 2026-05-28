import { useState, useEffect } from 'react'
import { getAdminStats } from '../api/client'

const ROLE_LABEL = { team_lead: 'Тимлид', member: 'Участник' }
const ROLE_BADGE = { team_lead: 'badge-blue', member: 'badge-gray' }

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'users', label: 'Пользователи' },
  { key: 'teams', label: 'Команды' },
  { key: 'activity', label: 'Активность' },
  { key: 'mood', label: 'Настроение' },
  { key: 'system', label: 'Система' },
]

function StatCard({ icon, value, label, accent, danger, sub }) {
  const color = danger ? 'var(--color-danger)' : accent ? 'var(--color-accent)' : 'var(--color-text-primary)'
  return (
    <div className="stat-card" style={{ flex: 1, minWidth: 130, textAlign: 'center', padding: '18px 14px' }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <p style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-1px', lineHeight: 1 }}>{value ?? '—'}</p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 28, flexWrap: 'wrap' }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
          background: active === t.key ? 'var(--color-accent)' : 'var(--color-surface)',
          color: active === t.key ? '#fff' : 'var(--color-text-secondary)',
          boxShadow: active === t.key ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

function Td({ children, muted, mono, center }) {
  return (
    <td style={{
      padding: '10px 14px', fontSize: 13,
      color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      textAlign: center ? 'center' : undefined,
    }}>{children}</td>
  )
}

function MoodBar({ score }) {
  const pct = score ? ((score - 1) / 4) * 100 : 0
  const color = score >= 4 ? '#10B981' : score >= 3 ? '#6366F1' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{score?.toFixed(1) ?? '—'}</span>
    </div>
  )
}

function MiniLineChart({ points }) {
  if (!points || points.length < 2) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Нет данных</span>
  const vals = points.map(p => p.avg)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const w = 180, h = 50, pad = 6
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = vals.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={3} fill="var(--color-accent)" />
      ))}
    </svg>
  )
}

export default function AdminDashboard({ onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    getAdminStats()
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const filteredUsers = (data?.users || []).filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--color-danger)', padding: '2px 8px', borderRadius: 6, letterSpacing: '0.08em' }}>ADMIN</span>
        </div>
        <button onClick={onLogout} className="btn btn-secondary btn-sm">Выйти</button>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 28px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 24 }}>Статистика сервиса</h1>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><div className="spinner" /></div>
        ) : !data ? (
          <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки данных</p>
        ) : (
          <>
            <TabBar active={tab} onChange={setTab} />

            {/* ОБЗОР */}
            {tab === 'overview' && (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                  <StatCard icon="👥" value={data.total_users} label="Пользователей" accent />
                  <StatCard icon="👑" value={data.total_leads} label="Тимлидов" />
                  <StatCard icon="👤" value={data.total_members} label="Участников" />
                  <StatCard icon="🏢" value={data.total_teams} label="Команд" />
                  <StatCard icon="📅" value={data.total_meetings} label="Встреч всего" sub={`${data.meetings_30d} за 30 дней`} />
                  <StatCard icon="📞" value={data.total_calls} label="Звонков" />
                  <StatCard icon="✅" value={data.total_tasks} label="Задач всего" sub={`${data.tasks_done} выполнено`} />
                </div>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>🏢 Команды</p>
                  {data.teams.length === 0
                    ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Нет команд</p>
                    : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {data.teams.map(t => (
                          <span key={t.id} style={{ padding: '5px 14px', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 20, fontSize: 13, color: 'var(--color-accent)', fontWeight: 500 }}>{t.name}</span>
                        ))}
                      </div>
                  }
                </div>
              </>
            )}

            {/* ПОЛЬЗОВАТЕЛИ */}
            {tab === 'users' && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>👥 Пользователи ({filteredUsers.length})</p>
                  <input className="input" style={{ width: 200, fontSize: 13 }} placeholder="🔍 Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="input" style={{ width: 150, fontSize: 13 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">Все роли</option>
                    <option value="team_lead">Тимлиды</option>
                    <option value="member">Участники</option>
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                        {['#', 'Имя', 'Email', 'Роль', 'Встреч', 'Задач', 'Последняя встреча', 'Статус'].map(h => (
                          <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <Td muted>{u.id}</Td>
                          <Td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="avatar avatar-sm avatar-accent">{(u.name || '?').charAt(0).toUpperCase()}</div>
                              <span style={{ fontWeight: 600 }}>{u.name}</span>
                            </div>
                          </Td>
                          <Td mono>{u.email}</Td>
                          <Td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>{ROLE_LABEL[u.role] || u.role}</span></Td>
                          <Td center>{u.meetings_count}</Td>
                          <Td center>{u.tasks_count}</Td>
                          <Td muted>{u.last_meeting ? new Date(u.last_meeting).toLocaleDateString('ru-RU') : '—'}</Td>
                          <Td>
                            {u.inactive
                              ? <span className="badge badge-red" style={{ fontSize: 11 }}>Неактивен</span>
                              : <span className="badge badge-green" style={{ fontSize: 11 }}>Активен</span>}
                          </Td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Ничего не найдено</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* КОМАНДЫ */}
            {tab === 'teams' && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>🏢 Команды ({data.teams.length})</p>
                {data.teams.length === 0
                  ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Команд нет</p>
                  : <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                            {['#', 'Название', 'Тимлид', 'Участников', 'Встреч', 'Последняя встреча', 'Создана'].map(h => (
                              <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.teams.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <Td muted>{t.id}</Td>
                              <Td><span style={{ fontWeight: 600 }}>{t.name}</span></Td>
                              <Td>{t.lead_name}</Td>
                              <Td center>{t.member_count}</Td>
                              <Td center>{t.meetings_count}</Td>
                              <Td muted>{t.last_meeting ? new Date(t.last_meeting).toLocaleDateString('ru-RU') : '—'}</Td>
                              <Td muted>{t.created_at ? new Date(t.created_at).toLocaleDateString('ru-RU') : '—'}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                }
              </div>
            )}

            {/* АКТИВНОСТЬ */}
            {tab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <StatCard icon="📅" value={data.total_meetings} label="Встреч всего" accent />
                  <StatCard icon="🗓" value={data.meetings_30d} label="За 30 дней" />
                  <StatCard icon="📞" value={data.total_calls} label="Звонков" />
                  <StatCard icon="✅" value={data.total_tasks} label="Задач всего" />
                  <StatCard icon="☑️" value={data.tasks_done} label="Выполнено" accent />
                  <StatCard icon="⏳" value={data.total_tasks - data.tasks_done} label="В процессе" danger={data.total_tasks - data.tasks_done > 0} />
                </div>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Топ активных пользователей по встречам</p>
                  {data.users.slice().sort((a, b) => b.meetings_count - a.meetings_count).slice(0, 10).map((u, i) => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 20 }}>{i + 1}</span>
                      <div className="avatar avatar-sm avatar-accent">{(u.name || '?').charAt(0).toUpperCase()}</div>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{u.name}</span>
                      <div style={{ width: 120, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${data.users[0]?.meetings_count ? (u.meetings_count / Math.max(...data.users.map(x => x.meetings_count))) * 100 : 0}%`,
                          height: '100%', background: 'var(--color-accent)', borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent)', minWidth: 24 }}>{u.meetings_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* НАСТРОЕНИЕ */}
            {tab === 'mood' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <StatCard icon="😊" value={data.mood.overall_avg ?? '—'} label="Средний балл" accent />
                  <StatCard icon="📊" value={data.mood.avg_7d ?? '—'} label="Балл за 7 дней" />
                  <StatCard icon="📝" value={data.mood.total_submissions} label="Всего ответов" />
                  <StatCard icon="📆" value={data.mood.submissions_7d} label="За 7 дней" />
                </div>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Тренд настроения (7 дней)</p>
                  {data.mood.daily_trend.length === 0
                    ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Нет данных за последние 7 дней</p>
                    : <>
                        <MiniLineChart points={data.mood.daily_trend} />
                        <div style={{ marginTop: 16 }}>
                          {data.mood.daily_trend.map(d => (
                            <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 90 }}>{new Date(d.date).toLocaleDateString('ru-RU')}</span>
                              <MoodBar score={d.avg} />
                            </div>
                          ))}
                        </div>
                      </>
                  }
                </div>
              </div>
            )}

            {/* СИСТЕМА */}
            {tab === 'system' && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>🗄 Записи в базе данных</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      {['Таблица', 'Записей'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['users', 'Пользователи'],
                      ['teams', 'Команды'],
                      ['meetings', 'Встречи'],
                      ['tasks', 'Задачи'],
                      ['notes', 'Заметки'],
                      ['notifications', 'Уведомления'],
                      ['mood_entries', 'Опросы настроения'],
                      ['knowledge_articles', 'Статьи базы знаний'],
                    ].map(([key, label]) => (
                      <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{label}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 15, color: 'var(--color-accent)' }}>{data.system[key] ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
