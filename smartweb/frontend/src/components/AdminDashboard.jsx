import { useState, useEffect, useRef } from 'react'
import {
  getAdminStats, getAdminAnalytics,
  getSupportTickets, markTicketRead, markAllTicketsRead, getSupportUnreadCount, adminReplyTicket,
  blockUser, unblockUser, deleteUser,
  getAdminArticles, createAdminArticle, updateAdminArticle, deleteAdminArticle,
  broadcastNotification, getServiceHealth, getUsers,
  setUserOverride, getAdminSubscriptions, getAdminPayments, extendSubscription, cancelSubscription,
  getAdminMetrics, assignManager, getManagers, createManager, deleteManager,
} from '../api/client'
import AdminUserDetail from './AdminUserDetail'
import { toast, confirmDialog } from '../lib/ui'
import AdminManage from './AdminManage'

const ROLE_LABEL = { team_lead: 'Тимлид', member: 'Участник' }
const ROLE_BADGE  = { team_lead: 'badge-blue', member: 'badge-gray' }

function Td({ children, muted, mono, center }) {
  return (
    <td style={{
      padding: '10px 14px', fontSize: 13, verticalAlign: 'middle',
      color: muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      textAlign: center ? 'center' : undefined,
    }}>{children}</td>
  )
}

function MiniBar({ value, max, color = 'var(--color-accent)' }) {
  const pct = max ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 24 }}>{value}</span>
    </div>
  )
}

function MessageBubble({ msg }) {
  const isAdmin = msg.sender === 'admin'
  return (
    <div style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '80%', padding: '8px 12px',
        borderRadius: isAdmin ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        background: isAdmin ? 'var(--color-accent)' : 'var(--color-bg)',
        color: isAdmin ? '#fff' : 'var(--color-text-primary)',
        fontSize: 13, lineHeight: 1.5,
        border: isAdmin ? 'none' : '1px solid var(--color-border)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {!isAdmin && <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', margin: '0 0 3px' }}>Пользователь</p>}
        {msg.body}
        <p style={{ fontSize: 10, margin: '3px 0 0', textAlign: 'right', color: isAdmin ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)' }}>
          {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

export default function AdminDashboard({ onLogout }) {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('users')
  const [search, setSearch]         = useState('')
  const [detailUser, setDetailUser] = useState(null)
  const [roleFilter, setRoleFilter] = useState('all')

  // Billing
  const [subs, setSubs]             = useState([])
  const [paymentsList, setPaymentsList] = useState([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [mgrEdit, setMgrEdit] = useState(null)  // назначение менеджера: {userId, managerId, saving}
  const [managers, setManagers] = useState([])
  const [newMgr, setNewMgr] = useState({ name: '', contact: '' })
  const loadManagers = () => getManagers().then(r => setManagers(r.data)).catch(() => {})

  // Investor metrics
  const [metrics, setMetrics]       = useState(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Tickets
  const [tickets, setTickets]           = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [unreadTickets, setUnreadTickets]   = useState(0)
  const [activeTicket, setActiveTicket]     = useState(null)
  const [replyText, setReplyText]           = useState('')
  const [replying, setReplying]             = useState(false)
  const threadEndRef = useRef(null)

  // Analytics
  const [analytics, setAnalytics]   = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // KB
  const [articles, setArticles]     = useState([])
  const [kbLoading, setKbLoading]   = useState(false)
  const [kbForm, setKbForm]         = useState({ title: '', content: '' })
  const [kbEditing, setKbEditing]   = useState(null)
  const [kbSaving, setKbSaving]     = useState(false)

  // Broadcast
  const [broadcastForm, setBroadcastForm] = useState({ title: '', body: '', target: 'all' })
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState(null)
  const [allUsers, setAllUsers] = useState([])

  // Health
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => {
    getAdminStats().then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false))
    getSupportUnreadCount().then(r => setUnreadTickets(r.data.count)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'tickets') {
      setTicketsLoading(true)
      getSupportTickets()
        .then(r => { setTickets(r.data); setUnreadTickets(r.data.filter(t => !t.read_by_admin).length) })
        .catch(() => {}).finally(() => setTicketsLoading(false))
    }
    if (tab === 'analytics' && !analytics) {
      setAnalyticsLoading(true)
      getAdminAnalytics().then(r => setAnalytics(r.data)).catch(() => {}).finally(() => setAnalyticsLoading(false))
    }
    if (tab === 'kb' && articles.length === 0) {
      setKbLoading(true)
      getAdminArticles().then(r => setArticles(r.data)).catch(() => {}).finally(() => setKbLoading(false))
    }
    if (tab === 'metrics' && !metrics) {
      setMetricsLoading(true)
      getAdminMetrics().then(r => setMetrics(r.data)).catch(() => {}).finally(() => setMetricsLoading(false))
    }
    if (tab === 'billing') {
      setBillingLoading(true)
      loadManagers()
      Promise.all([
        getAdminSubscriptions().then(r => setSubs(r.data)).catch(() => {}),
        getAdminPayments().then(r => setPaymentsList(r.data)).catch(() => {}),
      ]).finally(() => setBillingLoading(false))
    }
    if (tab === 'broadcast' && allUsers.length === 0) {
      getUsers().then(r => setAllUsers(r.data)).catch(() => {})
    }
    if (tab === 'health') {
      setHealthLoading(true)
      getServiceHealth().then(r => setHealth(r.data)).catch(() => setHealth({ error: true })).finally(() => setHealthLoading(false))
    }
  }, [tab])

  // Реестр менеджеров нужен и во вкладке «Пользователи» (кнопка «Менеджер»),
  // поэтому грузим один раз при монтировании.
  useEffect(() => { loadManagers() }, [])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [activeTicket?.messages?.length])

  const openTicket = (ticket) => {
    setActiveTicket(ticket)
    setReplyText('')
    if (!ticket.read_by_admin) {
      markTicketRead(ticket.id).catch(() => {})
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, read_by_admin: true } : t))
      setUnreadTickets(c => Math.max(0, c - 1))
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !activeTicket) return
    setReplying(true)
    try {
      const { data: updated } = await adminReplyTicket(activeTicket.id, replyText.trim())
      setActiveTicket(updated)
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t))
      setReplyText('')
    } catch {} finally { setReplying(false) }
  }

  const handleMarkAllRead = async () => {
    await markAllTicketsRead().catch(() => {})
    setTickets(prev => prev.map(t => ({ ...t, read_by_admin: true })))
    setUnreadTickets(0)
  }

  const handleBlock = async (userId, blocked) => {
    const fn = blocked ? unblockUser : blockUser
    await fn(userId).catch(() => {})
    setData(d => ({ ...d, users: d.users.map(u => u.id === userId ? { ...u, is_blocked: !blocked } : u) }))
  }

  const handleDelete = async (userId) => {
    if (!await confirmDialog({ title: 'Удалить пользователя?', message: 'Это действие необратимо.', confirmText: 'Удалить', danger: true })) return
    await deleteUser(userId).catch(() => {})
    setData(d => ({ ...d, users: d.users.filter(u => u.id !== userId) }))
  }

  const handleOverride = async (userId, current) => {
    const enabled = !current
    if (enabled && !await confirmDialog({ title: 'Выдать полный доступ?', message: 'Аккаунт получит все функции без подписки.', confirmText: 'Выдать' })) return
    await setUserOverride(userId, { enabled, note: enabled ? 'Выдано из админ-панели' : null }).catch(() => {})
    setData(d => ({ ...d, users: d.users.map(u => u.id === userId ? { ...u, billing_override: enabled } : u) }))
  }

  const handleBroadcast = async (e) => {
    e.preventDefault()
    if (!broadcastForm.title.trim()) return
    setBroadcastSending(true)
    setBroadcastResult(null)
    try {
      const { data: res } = await broadcastNotification({
        title: broadcastForm.title,
        body: broadcastForm.body || null,
        target: broadcastForm.target,
      })
      setBroadcastResult({ ok: true, sent: res.sent })
      setBroadcastForm(f => ({ ...f, title: '', body: '' }))
    } catch {
      setBroadcastResult({ ok: false })
    } finally { setBroadcastSending(false) }
  }

  const handleKbSave = async (e) => {
    e.preventDefault()
    if (!kbForm.title.trim()) return
    setKbSaving(true)
    try {
      if (kbEditing) {
        const { data: updated } = await updateAdminArticle(kbEditing, { title: kbForm.title, content: kbForm.content })
        setArticles(prev => prev.map(a => a.id === kbEditing ? updated : a))
      } else {
        const { data: created } = await createAdminArticle({ title: kbForm.title, content: kbForm.content })
        setArticles(prev => [created, ...prev])
      }
      setKbForm({ title: '', content: '' })
      setKbEditing(null)
    } catch {} finally { setKbSaving(false) }
  }

  const handleKbDelete = async (id) => {
    if (!await confirmDialog({ title: 'Удалить статью?', confirmText: 'Удалить', danger: true })) return
    await deleteAdminArticle(id).catch(() => {})
    setArticles(prev => prev.filter(a => a.id !== id))
  }

  const filteredUsers = (data?.users || []).filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const TabBtn = ({ id, label, badge }) => (
    <button onClick={() => { setTab(id); if (id !== 'tickets') setActiveTicket(null) }} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
      background: tab === id ? 'var(--color-accent)' : 'var(--color-surface)',
      color: tab === id ? '#fff' : 'var(--color-text-secondary)',
      boxShadow: tab === id ? '0 2px 8px rgba(59,110,240,0.28)' : '0 1px 3px rgba(0,0,0,0.06)',
      whiteSpace: 'nowrap',
    }}>
      {label}
      {badge > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 6px' }}>{badge}</span>}
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

      <main className="admin-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 24 }}>Личный кабинет</h1>

        {/* Tabs */}
        <div className="admin-tabs" style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          <TabBtn id="users"      label="Пользователи" />
          <TabBtn id="tickets"    label="Обращения" badge={unreadTickets} />
          <TabBtn id="broadcast"  label="Рассылка" />
          <TabBtn id="manage"     label="Управление" />
          <TabBtn id="analytics"  label="Аналитика" />
          <TabBtn id="health"     label="Здоровье сервиса" />
          <TabBtn id="kb"         label="База знаний" />
          <TabBtn id="monetize"   label="Монетизация" />
          <TabBtn id="billing"    label="Биллинг" />
          <TabBtn id="metrics"    label="Инвест-метрики" />
        </div>

        {loading && tab !== 'tickets' && tab !== 'analytics' && tab !== 'kb' ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><div className="spinner" /></div>
        ) : !data && tab === 'users' ? (
          <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки</p>
        ) : (
          <>
            {/* ── ПОЛЬЗОВАТЕЛИ ── */}
            {tab === 'users' && data && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, flex: 1, margin: 0 }}>Пользователи ({filteredUsers.length})</p>
                  <input className="input input-sm" style={{ width: 200, maxWidth: '100%' }} placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
                  <select className="input input-sm" style={{ width: 150 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">Все роли</option>
                    <option value="team_lead">Тимлиды</option>
                    <option value="member">Участники</option>
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                        {['#', 'Имя', 'Email', 'Роль', 'Встреч', 'Задач', 'Последняя встреча', 'Активность', 'Действия'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(u => {
                        const now = Date.now()
                        const lastMs = u.last_meeting ? new Date(u.last_meeting).getTime() : 0
                        const ago7  = now - 7 * 86400000
                        const ago30 = now - 30 * 86400000
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: u.is_blocked ? 0.55 : 1 }}>
                            <Td muted>{u.id}</Td>
                            <Td>
                              <div onClick={() => setDetailUser(u)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="Открыть детали">
                                <div className="avatar avatar-sm avatar-accent">{(u.name || '?').charAt(0).toUpperCase()}</div>
                                <div>
                                  <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: 'var(--color-accent)' }}>{u.name}</p>
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
                                  ? <span className="badge badge-amber" style={{ fontSize: 11 }}>Слабая</span>
                                  : <span className="badge badge-red" style={{ fontSize: 11 }}>Неактивен</span>}
                            </Td>
                            <Td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => handleBlock(u.id, u.is_blocked)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                    background: u.is_blocked ? '#f0fdf4' : '#fff7ed',
                                    color: u.is_blocked ? '#16a34a' : '#c2410c',
                                    borderColor: u.is_blocked ? '#bbf7d0' : '#fed7aa',
                                  }}>
                                  {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                                </button>
                                <button
                                  onClick={() => handleOverride(u.id, u.billing_override)}
                                  title="Полный доступ без подписки"
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                    background: u.billing_override ? '#eef2ff' : '#f8fafc',
                                    color: u.billing_override ? '#4f46e5' : '#64748b',
                                    borderColor: u.billing_override ? '#c7d2fe' : '#e2e8f0',
                                  }}>
                                  {u.billing_override ? 'Полный доступ' : 'Выдать полный доступ'}
                                </button>
                                <button
                                  onClick={() => setMgrEdit({ userId: u.id, managerId: '', saving: false })}
                                  title="Назначить выделенного менеджера"
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
                                  Менеджер
                                </button>
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fecdd3', cursor: 'pointer', fontWeight: 600, background: '#fff1f2', color: '#be123c' }}>
                                  Удалить
                                </button>
                              </div>
                            </Td>
                          </tr>
                        )
                      })}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Ничего не найдено</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── УПРАВЛЕНИЕ ── */}
            {tab === 'manage' && (
              <AdminManage />
            )}

            {/* ── ОБРАЩЕНИЯ ── */}
            {tab === 'tickets' && (
              <div className="tickets-pane" style={{ display: 'flex', gap: 16, minHeight: 520 }}>
                {/* Left: ticket list — hidden on mobile when ticket is open */}
                <div className={`tickets-list${activeTicket ? ' tickets-list-hidden' : ''}`} style={{ width: 300, flexBasis: 300, flexGrow: 0, flexShrink: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>
                      Обращения {unreadTickets > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, borderRadius: 20, padding: '1px 6px', marginLeft: 4 }}>{unreadTickets}</span>}
                    </p>
                    {unreadTickets > 0 && <button onClick={handleMarkAllRead} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>Прочитать все</button>}
                  </div>

                  {ticketsLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
                  ) : tickets.length === 0 ? (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <div className="empty-icon" style={{ width: 48, height: 48, fontSize: 22, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="var(--color-text-muted)" strokeWidth="1.4"/><path d="M2 7l8 5 8-5" stroke="var(--color-text-muted)" strokeWidth="1.4"/></svg></div>
                      <p className="empty-title" style={{ fontSize: 14 }}>Обращений нет</p>
                    </div>
                  ) : tickets.map(t => (
                    <div
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className="card"
                      style={{
                        padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s',
                        borderLeft: !t.read_by_admin ? '3px solid #ef4444' : activeTicket?.id === t.id ? '3px solid var(--color-accent)' : undefined,
                        background: activeTicket?.id === t.id ? 'var(--blue-50)' : undefined,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div className="avatar avatar-sm avatar-accent" style={{ flexShrink: 0, fontSize: 11 }}>{(t.user_name || '?').charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <p style={{ fontWeight: !t.read_by_admin ? 700 : 600, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.subject}</p>
                            {!t.read_by_admin && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                            {t.user_name} · {new Date(t.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: thread — hidden on mobile when no ticket selected */}
                <div className={`card tickets-thread${!activeTicket ? ' tickets-thread-hidden' : ''}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 400 }}>
                  {!activeTicket ? (
                    <div className="empty-state" style={{ margin: 'auto' }}>
                      <div className="empty-icon" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H7l-4 3V5z" stroke="var(--color-text-muted)" strokeWidth="1.4" strokeLinejoin="round"/></svg></div>
                      <p className="empty-title">Выберите обращение</p>
                    </div>
                  ) : (
                    <>
                      {/* Thread header */}
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                        <div className="tickets-back-btn" style={{ display: 'none', marginBottom: 10 }}>
                          <button onClick={() => setActiveTicket(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: 13, fontWeight: 600, padding: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            Назад
                          </button>
                        </div>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{activeTicket.subject}</p>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', background: 'var(--gray-100,#f1f5f9)', borderRadius: 6, padding: '2px 7px' }}>ID {activeTicket.user_id}</span>
                          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{activeTicket.user_name} · {activeTicket.user_email}</span>
                          <span className={`badge ${ROLE_BADGE[activeTicket.user_role] || 'badge-gray'}`} style={{ fontSize: 10 }}>{ROLE_LABEL[activeTicket.user_role] || activeTicket.user_role}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>обращение #{activeTicket.id} · {new Date(activeTicket.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Messages */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                        {activeTicket.messages.map(m => <MessageBubble key={m.id} msg={m} />)}
                        <div ref={threadEndRef} />
                      </div>

                      {/* Reply */}
                      <form onSubmit={handleReply} style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8, flexShrink: 0 }}>
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Ответить пользователю..."
                          rows={2}
                          style={{ flex: 1, resize: 'none', fontSize: 13, padding: '7px 11px', border: '1.5px solid var(--color-border)', borderRadius: 8, outline: 'none', fontFamily: 'var(--font-sans)', background: 'var(--color-bg)' }}
                          onFocus={e => e.target.style.borderColor = 'var(--color-accent)'}
                          onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(e) } }}
                        />
                        <button type="submit" disabled={replying || !replyText.trim()} className="btn btn-accent btn-sm" style={{ alignSelf: 'flex-end' }}>
                          {replying ? '...' : 'Ответить'}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── АНАЛИТИКА ── */}
            {tab === 'analytics' && (
              analyticsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}><div className="spinner" /></div>
              ) : !analytics ? (
                <p style={{ color: 'var(--color-danger)' }}>Ошибка загрузки</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Funnel */}
                  <div className="card" style={{ padding: '20px 24px' }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Воронка пользователей</p>
                    {analytics.funnel.map((step, i) => {
                      const maxVal = analytics.funnel[0]?.value || 1
                      const pct = Math.round((step.value / maxVal) * 100)
                      return (
                        <div key={i} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{step.label}</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{step.value} <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: `hsl(${230 - i * 30}, 80%, ${55 + i * 5}%)`, borderRadius: 4, transition: 'width 0.6s' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Weekly growth */}
                  <div className="card" style={{ padding: '20px 24px' }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Рост по неделям (последние 8 недель)</p>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {/* Users chart */}
                      <div style={{ flex: 1, minWidth: 'min(200px, 100%)' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Новые пользователи</p>
                        {analytics.weekly_growth.map((w, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 32 }}>{w.label}</span>
                            <MiniBar value={w.users} max={Math.max(...analytics.weekly_growth.map(x => x.users), 1)} color="var(--color-accent)" />
                          </div>
                        ))}
                      </div>
                      {/* Meetings chart */}
                      <div style={{ flex: 1, minWidth: 'min(200px, 100%)' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Новые встречи</p>
                        {analytics.weekly_growth.map((w, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 32 }}>{w.label}</span>
                            <MiniBar value={w.meetings} max={Math.max(...analytics.weekly_growth.map(x => x.meetings), 1)} color="#10b981" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Retention */}
                  <div className="card" style={{ padding: '20px 24px' }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Retention по когортам</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>% пользователей, проведших хотя бы одну встречу в течение 7 дней после регистрации</p>
                    {analytics.retention.length === 0 ? (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Недостаточно данных</p>
                    ) : analytics.retention.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 52 }}>{r.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 60 }}>{r.cohort} польз.</span>
                        <MiniBar value={r.pct} max={100} color={r.pct >= 50 ? '#10b981' : r.pct >= 25 ? '#f59e0b' : '#ef4444'} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', minWidth: 36 }}>{r.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* ── РАССЫЛКА ── */}
            {tab === 'broadcast' && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="card" style={{ padding: '24px 26px', width: '100%', maxWidth: 500 }}>
                  <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Массовая рассылка</p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>Уведомление отправится в колокольчик с красной плашкой «Объявление»</p>
                  <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Получатели</label>
                      <select className="input" value={broadcastForm.target} onChange={e => setBroadcastForm(f => ({ ...f, target: e.target.value }))}>
                        <option value="all">Все пользователи</option>
                        {allUsers.filter(u => !u.is_blocked).map(u => (
                          <option key={u.id} value={String(u.id)}>{u.name} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Заголовок *</label>
                      <input className="input" value={broadcastForm.title} onChange={e => setBroadcastForm(f => ({ ...f, title: e.target.value }))} placeholder="Текст заголовка уведомления" required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Текст сообщения</label>
                      <textarea className="input" value={broadcastForm.body} onChange={e => setBroadcastForm(f => ({ ...f, body: e.target.value }))} placeholder="Дополнительный текст (необязательно)..." rows={4} style={{ minHeight: 100, resize: 'vertical' }} />
                    </div>
                    <button type="submit" disabled={broadcastSending} className="btn btn-accent" style={{ fontWeight: 700 }}>
                      {broadcastSending ? 'Отправка...' : 'Отправить уведомление'}
                    </button>
                    {broadcastResult && (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: broadcastResult.ok ? '#f0fdf4' : '#fff1f2',
                        color: broadcastResult.ok ? '#15803d' : '#be123c',
                        border: `1px solid ${broadcastResult.ok ? '#bbf7d0' : '#fecdd3'}`,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: broadcastResult.ok ? '#15803d' : '#be123c',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            {broadcastResult.ok
                              ? <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                              : <><line x1="2" y1="2" x2="8" y2="8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/></>
                            }
                          </svg>
                        </span>
                        {broadcastResult.ok ? `Отправлено ${broadcastResult.sent} пользователям` : 'Ошибка отправки'}
                      </div>
                    )}
                  </form>
                </div>
                <div className="card" style={{ padding: '20px 22px', flex: 1, minWidth: 'min(240px, 100%)' }}>
                  <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Предпросмотр</p>
                  <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderLeft: '3px solid #ef4444', borderRadius: 10, padding: '12px 14px' }}>
                    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', background: '#ef4444', color: '#fff', padding: '2px 7px', borderRadius: 4, marginBottom: 6 }}>ОБЪЯВЛЕНИЕ</span>
                    <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', margin: '0 0 3px' }}>{broadcastForm.title || 'Заголовок уведомления'}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>{broadcastForm.body || 'Текст сообщения'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── ЗДОРОВЬЕ СЕРВИСА ── */}
            {tab === 'health' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Статус сервиса</p>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setHealthLoading(true); getServiceHealth().then(r => setHealth(r.data)).catch(() => setHealth({ error: true })).finally(() => setHealthLoading(false)) }}>
                    Обновить
                  </button>
                </div>
                {healthLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="spinner" /></div>
                ) : !health ? null : health.error ? (
                  <div className="card" style={{ padding: 20, color: 'var(--color-danger)' }}>Ошибка загрузки данных</div>
                ) : (
                  <>
                    {/* Status cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px,100%), 1fr))', gap: 12 }}>
                      {Object.entries(health.services || {}).map(([svc, status]) => {
                        const ok = status === 'ok'
                        const nc = status === 'not_configured'
                        const dotColor = ok ? '#10b981' : nc ? '#9ca3af' : '#ef4444'
                        return (
                          <div key={svc} className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 0 3px ${dotColor}22` }} />
                            <div>
                              <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', textTransform: 'capitalize' }}>{svc}</p>
                              <p style={{ fontSize: 12, color: dotColor, margin: 0, fontWeight: 600 }}>
                                {ok ? 'Работает' : nc ? 'Не настроено' : 'Ошибка'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Metrics */}
                    <div className="card" style={{ padding: '20px 22px' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Метрики</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px,100%), 1fr))', gap: 14 }}>
                        {[
                          { label: 'Задержка БД', value: `${health.db_latency_ms} мс`, ok: health.db_latency_ms < 100 },
                          { label: 'Время работы', value: `${Math.floor((health.uptime_seconds||0)/3600)}ч ${Math.floor(((health.uptime_seconds||0)%3600)/60)}м` },
                          { label: 'Миграция БД', value: health.migration_rev || '—' },
                          { label: 'Пользователей', value: health.stats?.users ?? '—' },
                          { label: 'Встреч', value: health.stats?.meetings ?? '—' },
                          { label: 'Открытых обращений', value: health.stats?.open_tickets ?? '—' },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--color-border)' }}>
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{m.label}</p>
                            <p style={{ fontSize: 18, fontWeight: 700, color: m.ok === false ? '#ef4444' : 'var(--color-text-primary)', margin: 0 }}>{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── МОНЕТИЗАЦИЯ ── */}
            {tab === 'monetize' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Монетизация</p>
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#f59e0b22', color: '#b45309', padding: '2px 10px', borderRadius: 20, border: '1px solid #fbbf24' }}>СКОРО</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px,100%), 1fr))', gap: 16 }}>
                  {[
                    { label: 'TP', title: 'Тарифные планы', desc: 'Управление тарифами: лимиты участников, встреч в месяц, функций. Создание и редактирование планов.' },
                    { label: 'HP', title: 'История платежей', desc: 'Журнал всех платежей по пользователям и командам, статусы транзакций, экспорт.' },
                    { label: 'PP', title: 'Пробный период', desc: 'Управление пробным доступом: продление, отзыв, просмотр истекающих триалов.' },
                  ].map(item => (
                    <div key={item.title} className="card" style={{ padding: '24px 22px', opacity: 0.72 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--color-accent)' }}>{item.label}</span>
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>{item.title}</p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                      <div style={{ marginTop: 16, padding: '7px 14px', background: 'var(--color-bg)', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', fontWeight: 600, letterSpacing: '0.04em' }}>
                        В разработке
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── БИЛЛИНГ ── */}
            {tab === 'billing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Подписки</p>
                {billingLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <>
                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            {['Пользователь', 'Тариф', 'Статус', 'Мест', 'Период', 'Действует до', 'Менеджер', 'Действия'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subs.map(s => (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <Td>
                                <div style={{ fontWeight: 600 }}>{s.user_name || `${s.subject_type}#${s.subject_id}`}</div>
                                {s.user_email && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.user_email}</div>}
                              </Td>
                              <Td>{s.plan_code}</Td>
                              <Td><span className={`badge ${s.status === 'active' ? 'badge-green' : s.status === 'trialing' ? 'badge-blue' : s.status === 'past_due' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 11 }}>{s.status}</span></Td>
                              <Td center>{s.seats}</Td>
                              <Td muted>{s.billing_period}</Td>
                              <Td muted>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('ru-RU') : '—'}</Td>
                              <Td>
                                {s.manager_name
                                  ? <div><div style={{ fontWeight: 600, fontSize: 12 }}>{s.manager_name}</div>{s.manager_contact && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.manager_contact}</div>}</div>
                                  : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                              </Td>
                              <Td>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <button onClick={() => setMgrEdit({ userId: s.subject_id, managerId: s.manager_id || '', saving: false })} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 600, background: 'var(--color-bg)' }}>Менеджер</button>
                                  <button onClick={async () => { await extendSubscription(s.id).catch(() => {}); getAdminSubscriptions().then(r => setSubs(r.data)).catch(() => {}) }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', fontWeight: 600, background: 'var(--color-bg)' }}>Продлить</button>
                                  <button onClick={async () => { if (!await confirmDialog({ title: 'Отменить подписку?', confirmText: 'Отменить', danger: true })) return; await cancelSubscription(s.id).catch(() => {}); getAdminSubscriptions().then(r => setSubs(r.data)).catch(() => {}) }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fecdd3', cursor: 'pointer', fontWeight: 600, background: '#fff1f2', color: '#be123c' }}>Отменить</button>
                                </div>
                              </Td>
                            </tr>
                          ))}
                          {subs.length === 0 && (
                            <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Подписок пока нет</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Платежи</p>
                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            {['ID', 'Пользователь', 'Сумма', 'Статус', 'Провайдер', 'Дата'].map(h => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paymentsList.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <Td mono>{p.id}</Td>
                              <Td>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{p.user_name || `${p.subject_type}#${p.subject_id}`}</div>
                                {p.user_email && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.user_email}</div>}
                              </Td>
                              <Td>{(p.amount / 100).toLocaleString('ru-RU')} {p.currency}</Td>
                              <Td><span className={`badge ${p.status === 'succeeded' ? 'badge-green' : p.status === 'failed' ? 'badge-red' : 'badge-gray'}`} style={{ fontSize: 11 }}>{p.status}</span></Td>
                              <Td muted>{p.provider || '—'}</Td>
                              <Td muted>{p.created_at ? new Date(p.created_at).toLocaleDateString('ru-RU') : '—'}</Td>
                            </tr>
                          ))}
                          {paymentsList.length === 0 && (
                            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>Платежей пока нет</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {/* Реестр менеджеров: заводятся вручную, назначаются из списка */}
                    <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Менеджеры</p>
                    <div className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: managers.length ? 14 : 0 }}>
                        <input className="input input-sm" style={{ flex: '1 1 160px' }} placeholder="Имя менеджера" value={newMgr.name}
                          onChange={e => setNewMgr(m => ({ ...m, name: e.target.value }))} />
                        <input className="input input-sm" style={{ flex: '1 1 160px' }} placeholder="Связь (Telegram / email / телефон)" value={newMgr.contact}
                          onChange={e => setNewMgr(m => ({ ...m, contact: e.target.value }))} />
                        <button className="btn btn-sm btn-accent" disabled={!newMgr.name.trim()}
                          onClick={async () => {
                            try { await createManager({ name: newMgr.name.trim(), contact: newMgr.contact.trim() || null }); setNewMgr({ name: '', contact: '' }); loadManagers(); toast('Менеджер добавлен', 'success') }
                            catch { toast('Не удалось добавить', 'error') }
                          }}>Добавить</button>
                      </div>
                      {managers.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>Менеджеров пока нет.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {managers.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                                {m.contact && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.contact}</div>}
                              </div>
                              <button onClick={async () => { if (!await confirmDialog({ title: 'Удалить менеджера?', message: 'Он будет снят со всех назначений.', confirmText: 'Удалить', danger: true })) return; await deleteManager(m.id).catch(() => {}); loadManagers(); getAdminSubscriptions().then(r => setSubs(r.data)).catch(() => {}) }}
                                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fecdd3', cursor: 'pointer', fontWeight: 600, background: '#fff1f2', color: '#be123c' }}>Удалить</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                      Полный доступ без подписки выдаётся во вкладке «Пользователи» (кнопка «Выдать полный доступ»).
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── ИНВЕСТ-МЕТРИКИ ── */}
            {tab === 'metrics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>Инвест-метрики</p>
                {metricsLoading || !metrics ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(190px,100%), 1fr))', gap: 14 }}>
                      {[
                        ['DAU', metrics.current.dau],
                        ['WAU', metrics.current.wau],
                        ['Workspaces', metrics.current.workspaces],
                        ['1-on-1 встреч', metrics.current.meetings_1on1],
                        ['MRR', `${metrics.current.mrr.toLocaleString('ru-RU')} ₽`],
                        ['ARPU', `${metrics.current.arpu.toLocaleString('ru-RU')} ₽`],
                        ['Платящих', metrics.current.paid_count],
                        ['На триале', metrics.current.trialing_count],
                        ['Free→Paid', `${metrics.current.free_to_paid_pct}%`],
                        ['Retention 30d', `${metrics.current.retention_30d_pct}%`],
                        ['LTV', `${(metrics.current.ltv || 0).toLocaleString('ru-RU')} ₽`],
                        ['LTV/CAC', metrics.current.ltv_cac_ratio ?? '—'],
                        ['CAC', metrics.current.cac != null ? `${metrics.current.cac.toLocaleString('ru-RU')} ₽` : '—'],
                        ['ROI/клиент', metrics.current.roi_per_customer_value != null ? `${metrics.current.roi_per_customer_value.toLocaleString('ru-RU')} ₽` : '—'],
                      ].map(([label, val]) => (
                        <div key={label} className="card" style={{ padding: '16px 18px' }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>{label}</p>
                          <p style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{val}</p>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
                      DAU/WAU/Workspaces/встречи/MRR/Retention/конверсия считаются из данных автоматически.
                      CAC, LTV/CAC и ROI требуют входных данных (расходы на маркетинг, отток, ставка) —
                      задаются в переменных окружения сервера: MARKETING_SPEND_KOPECKS, NEW_PAID_CUSTOMERS,
                      MONTHLY_CHURN, ROI_HOURLY_RATE_KOPECKS.
                    </p>
                    {metrics.history?.length > 1 && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                        История: {metrics.history.length} дн. снимков (для графиков динамики).
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── БАЗА ЗНАНИЙ ── */}
            {tab === 'kb' && (
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Form */}
                <div className="card" style={{ padding: '20px 22px', width: '100%', maxWidth: 420 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{kbEditing ? 'Редактировать статью' : 'Новая статья'}</p>
                  <form onSubmit={handleKbSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Заголовок</label>
                      <input className="input" value={kbForm.title} onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))} placeholder="Название статьи" required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Содержание</label>
                      <textarea className="input" value={kbForm.content} onChange={e => setKbForm(f => ({ ...f, content: e.target.value }))} placeholder="Текст статьи..." rows={8} style={{ minHeight: 160, resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {kbEditing && (
                        <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => { setKbEditing(null); setKbForm({ title: '', content: '' }) }}>Отмена</button>
                      )}
                      <button type="submit" disabled={kbSaving} className="btn btn-accent btn-sm" style={{ flex: 2 }}>
                        {kbSaving ? '...' : kbEditing ? 'Сохранить' : '+ Создать статью'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Articles list */}
                <div style={{ flex: 1, minWidth: 'min(280px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {kbLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
                  ) : articles.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="2" width="14" height="18" rx="2" stroke="var(--color-text-muted)" strokeWidth="1.4"/><line x1="7" y1="7" x2="15" y2="7" stroke="var(--color-text-muted)" strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="10.5" x2="15" y2="10.5" stroke="var(--color-text-muted)" strokeWidth="1.2" strokeLinecap="round"/><line x1="7" y1="14" x2="11" y2="14" stroke="var(--color-text-muted)" strokeWidth="1.2" strokeLinecap="round"/></svg></div>
                      <p className="empty-title">База знаний пуста</p>
                      <p className="empty-desc">Создайте первую статью</p>
                    </div>
                  ) : articles.map(a => (
                    <div key={a.id} className="card" style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>{a.title}</p>
                          {a.content && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.content.slice(0, 80)}{a.content.length > 80 ? '…' : ''}</p>}
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>{new Date(a.created_at).toLocaleDateString('ru-RU')}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => { setKbEditing(a.id); setKbForm({ title: a.title, content: a.content || '' }) }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Изменить</button>
                          <button onClick={() => handleKbDelete(a.id)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #fecdd3', cursor: 'pointer', background: '#fff1f2', color: '#be123c', fontWeight: 600 }}>Удалить</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {detailUser && (
        <AdminUserDetail
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onChanged={() => getAdminStats().then(r => setData(r.data)).catch(() => {})}
        />
      )}

      {/* Назначение менеджера пользователю — выбор из реестра */}
      {mgrEdit && (
        <div className="overlay-center" onClick={() => !mgrEdit.saving && setMgrEdit(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">Выделенный менеджер</span>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setMgrEdit(null)} disabled={mgrEdit.saving}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
              Выберите менеджера из списка. Пользователь увидит его имя и способ связи в разделе «Мой тариф».
            </p>
            {managers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
                Список менеджеров пуст. Добавьте менеджера в разделе «Менеджеры» на вкладке «Биллинг».
              </p>
            ) : (
              <div className="form-group">
                <label className="form-label">Менеджер</label>
                <select className="input" value={mgrEdit.managerId} onChange={e => setMgrEdit(m => ({ ...m, managerId: e.target.value }))}>
                  <option value="">— не назначен —</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.name}{m.contact ? ` · ${m.contact}` : ''}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-accent" style={{ width: '100%' }} disabled={mgrEdit.saving}
              onClick={async () => {
                setMgrEdit(m => ({ ...m, saving: true }))
                try {
                  await assignManager(mgrEdit.userId, mgrEdit.managerId ? Number(mgrEdit.managerId) : null)
                  const r = await getAdminSubscriptions(); setSubs(r.data)
                  toast('Менеджер обновлён', 'success')
                  setMgrEdit(null)
                } catch { toast('Не удалось сохранить', 'error'); setMgrEdit(m => ({ ...m, saving: false })) }
              }}>
              {mgrEdit.saving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
