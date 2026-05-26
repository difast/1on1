import { useState, useEffect } from 'react'
import { getAdminStats } from '../api/client'

const ROLE_LABEL = { team_lead: 'Тимлид', member: 'Участник' }
const ROLE_BADGE = { team_lead: 'badge-blue', member: 'badge-gray' }

function StatCard({ icon, value, label, accent, danger }) {
  const color = danger ? 'var(--color-danger)' : accent ? 'var(--color-accent)' : 'var(--color-text-primary)'
  return (
    <div className="stat-card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: '-1px', lineHeight: 1 }}>{value ?? '—'}</p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 6 }}>{label}</p>
    </div>
  )
}

export default function AdminDashboard({ onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    getAdminStats()
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const filtered = (data?.users || []).filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <header className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--color-danger)',
            padding: '2px 8px', borderRadius: 6, letterSpacing: '0.08em',
          }}>ADMIN</span>
        </div>
        <button onClick={onLogout} className="btn btn-secondary btn-sm">Выйти</button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 24 }}>
          Статистика сервиса
        </h1>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div className="spinner" />
          </div>
        ) : !data ? (
          <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки данных</p>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
              <StatCard icon="👥" value={data.total_users} label="Всего пользователей" accent />
              <StatCard icon="👑" value={data.total_leads} label="Тимлидов" />
              <StatCard icon="👤" value={data.total_members} label="Участников" />
              <StatCard icon="🏢" value={data.total_teams} label="Команд" />
            </div>

            {/* Teams list */}
            {data.teams.length > 0 && (
              <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>🏢 Команды</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {data.teams.map(t => (
                    <span key={t.id} style={{
                      padding: '5px 12px', background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                      borderRadius: 20, fontSize: 13, color: 'var(--color-accent)', fontWeight: 500,
                    }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* User table */}
            <div className="card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <p style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>👥 Пользователи ({filtered.length})</p>
                <input
                  className="input"
                  style={{ width: 220, fontSize: 13 }}
                  placeholder="🔍 Поиск..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <select
                  className="input"
                  style={{ width: 150, fontSize: 13 }}
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                >
                  <option value="all">Все роли</option>
                  <option value="team_lead">Тимлиды</option>
                  <option value="member">Участники</option>
                </select>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                      {['#', 'Имя', 'Email', 'Роль', 'Должность', 'Зарегистрирован'].map(h => (
                        <th key={h} style={{
                          padding: '8px 14px', fontSize: 11, fontWeight: 700,
                          color: 'var(--color-text-muted)', textTransform: 'uppercase',
                          letterSpacing: '0.05em', textAlign: 'left',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>{u.id}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar avatar-sm avatar-accent">{(u.name || '?').charAt(0).toUpperCase()}</div>
                            {u.name}
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{u.email}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>
                            {ROLE_LABEL[u.role] || u.role}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>{u.title || '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                          Ничего не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
              ⚠️ Пароли пользователей не хранятся в открытом виде — они зашифрованы в Supabase Auth
            </p>
          </>
        )}
      </main>
    </div>
  )
}
