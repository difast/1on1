import { useState, useEffect } from 'react'
import { getAdminStats, getSupportTickets, markTicketRead, markAllTicketsRead, getSupportUnreadCount } from '../api/client'

const ROLE_LABEL = { team_lead: 'Тимлид', member: 'Участник' }
const ROLE_BADGE = { team_lead: 'badge-blue', member: 'badge-gray' }

function Td({ children, muted, mono, center }) {
  return (
    <td style={{
      padding: '10px 14px', fontSize: 13,
      color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      textAlign: center ? 'center' : undefined,
      verticalAlign: 'middle',
    }}>{children}</td>
  )
}

// "Active in the last 7 days" — more meaningful than 14
function ActivityBadge({ lastMeeting, isOnline }) {
  const now = Date.now()
  const ago7 = now - 7 * 24 * 3600 * 1000
  const ago30 = now - 30 * 24 * 3600 * 1000
  const lastMs = lastMeeting ? new Date(lastMeeting).getTime() : 0

  if (isOnline) return <span className="badge badge-green" style={{ fontSize: 11 }}>● Онлайн</span>
  if (lastMs > ago7) return <span className="badge badge-green" style={{ fontSize: 11 }}>Активен</span>
  if (lastMs > ago30) return <span className="badge badge-amber" style={{ fontSize: 11 }}>Умеренно</span>
  return <span className="badge badge-red" style={{ fontSize: 11 }}>Неактивен</span>
}

export default function AdminDashboard({ onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [unreadTickets, setUnreadTickets] = useState(0)
  const [expandedTicket, setExpandedTicket] = useState(null)

  useEffect(() => {
    getAdminStats()
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    getSupportUnreadCount()
      .then(r => setUnreadTickets(r.data.count))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'tickets') return
    setTicketsLoading(true)
    getSupportTickets()
      .then(r => { setTickets(r.data); setUnreadTickets(r.data.filter(t => !t.read_by_admin).length) })
      .catch(() => {})
      .finally(() => setTicketsLoading(false))
  }, [tab])

  const handleMarkRead = async (id) => {
    await markTicketRead(id).catch(() => {})
    setTickets(prev => prev.map(t => t.id === id ? { ...t, read_by_admin: true } : t))
    setUnreadTickets(c => Math.max(0, c - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllTicketsRead().catch(() => {})
    setTickets(prev => prev.map(t => ({ ...t, read_by_admin: true })))
    setUnreadTickets(0)
  }

  const filteredUsers = (data?.users || []).filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const TabBtn = ({ id, label, badge }) => (
    <button onClick={() => setTab(id)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
      background: tab === id ? 'var(--color-accent)' : 'var(--color-surface)',
      color: tab === id ? '#fff' : 'var(--color-text-secondary)',
      boxShadow: tab === id ? '0 2px 8px rgba(59,110,240,0.28)' : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {label}
      {badge > 0 && (
        <span style={{
          background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700,
          borderRadius: 20, padding: '1px 6px', lineHeight: '16px',
          boxShadow: tab === id ? '0 0 0 2px var(--color-accent)' : 'none',
        }}>{badge}</span>
      )}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
      <header className="header" style={{ padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="logo">OneOn<span className="accent">One</span></span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--color-danger)', padding: '2px 8px', borderRadius: 6, letterSpacing: '0.08em' }}>ADMIN</span>
        </div>
        <button onClick={onLogout} className="btn btn-secondary btn-sm">Выйти</button>
      </header>

      <main className="admin-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 28px', width: '100%' }}>
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Личный кабинет</h1>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          <TabBtn id="users" label="Пользователи" />
          <TabBtn id="tickets" label="Обращения" badge={unreadTickets} />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><div className="spinner" /></div>
        ) : !data ? (
          <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки данных</p>
        ) : (
          <>
            {/* ПОЛЬЗОВАТЕЛИ */}
            {tab === 'users' && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, flex: 1, margin: 0 }}>Пользователи ({filteredUsers.length})</p>
                  <input className="input input-sm" style={{ width: 200, maxWidth: '100%' }} placeholder="Поиск по имени или email..." value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="input input-sm" style={{ width: 160 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">Все роли</option>
                    <option value="team_lead">Тимлиды</option>
                    <option value="member">Участники</option>
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                        {['#', 'Имя', 'Email', 'Роль', 'Встреч', 'Задач', 'Последняя встреча', 'Активность'].map(h => (
                          <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => {
                        const now = Date.now()
                        const lastMs = u.last_meeting ? new Date(u.last_meeting).getTime() : 0
                        const ago7 = now - 7 * 24 * 3600 * 1000
                        const ago30 = now - 30 * 24 * 3600 * 1000
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <Td muted>{u.id}</Td>
                            <Td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="avatar avatar-sm avatar-accent">{(u.name || '?').charAt(0).toUpperCase()}</div>
                                <div>
                                  <p style={{ fontWeight: 600, margin: 0, fontSize: 13 }}>{u.name}</p>
                                  {u.title && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>{u.title}</p>}
                                </div>
                              </div>
                            </Td>
                            <Td mono>{u.email}</Td>
                            <Td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>{ROLE_LABEL[u.role] || u.role}</span></Td>
                            <Td center>{u.meetings_count}</Td>
                            <Td center>{u.tasks_count}</Td>
                            <Td muted>{u.last_meeting ? new Date(u.last_meeting).toLocaleDateString('ru-RU') : '—'}</Td>
                            <Td>
                              {lastMs > ago7
                                ? <span className="badge badge-green" style={{ fontSize: 11 }}>Активен</span>
                                : lastMs > ago30
                                  ? <span className="badge badge-amber" style={{ fontSize: 11 }}>Слабая активность</span>
                                  : <span className="badge badge-red" style={{ fontSize: 11 }}>Неактивен</span>}
                            </Td>
                          </tr>
                        )
                      })}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Ничего не найдено</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ОБРАЩЕНИЯ */}
            {tab === 'tickets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: 'var(--color-text-primary)' }}>
                    Обращения пользователей
                    {unreadTickets > 0 && <span style={{ marginLeft: 8, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 8px' }}>{unreadTickets} новых</span>}
                  </p>
                  {unreadTickets > 0 && (
                    <button onClick={handleMarkAllRead} className="btn btn-secondary btn-sm">
                      Прочитать все
                    </button>
                  )}
                </div>

                {ticketsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><div className="spinner" /></div>
                ) : tickets.length === 0 ? (
                  <div className="card empty-state">
                    <div className="empty-icon">📭</div>
                    <p className="empty-title">Обращений пока нет</p>
                    <p className="empty-desc">Когда пользователи отправят вопрос или предложение — они появятся здесь</p>
                  </div>
                ) : (
                  tickets.map(ticket => {
                    const isExpanded = expandedTicket === ticket.id
                    const isUnread = !ticket.read_by_admin
                    return (
                      <div
                        key={ticket.id}
                        className="card"
                        style={{
                          padding: '16px 20px',
                          borderLeft: isUnread ? '3px solid #ef4444' : undefined,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onClick={() => {
                          setExpandedTicket(isExpanded ? null : ticket.id)
                          if (isUnread) handleMarkRead(ticket.id)
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                          <div className="avatar avatar-sm avatar-accent" style={{ flexShrink: 0 }}>
                            {(ticket.user_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)' }}>{ticket.subject}</span>
                              {isUnread && <span className="badge badge-red" style={{ fontSize: 10 }}>НОВОЕ</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {ticket.user_name} · {ticket.user_email}
                              </span>
                              <span className={`badge ${ticket.user_role === 'team_lead' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                                {ROLE_LABEL[ticket.user_role] || ticket.user_role}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                {new Date(ticket.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {isExpanded && (
                              <div style={{
                                marginTop: 12, padding: '12px 16px',
                                background: 'var(--color-bg)', borderRadius: 8,
                                border: '1px solid var(--color-border)',
                                fontSize: 14, color: 'var(--color-text-primary)',
                                lineHeight: 1.6, whiteSpace: 'pre-wrap',
                              }}>
                                {ticket.body}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 18, color: 'var(--color-text-muted)', flexShrink: 0, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
