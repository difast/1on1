import { useEffect, useState } from 'react'
import {
  getTeams, getMemberTeam, getMeetings, getTasks,
  updateUser, deleteUser, blockUser, unblockUser,
} from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'

const statusOf = (t) => t.status ?? (t.completed ? 'done' : 'in_progress')

// Click a user in the admin table → full detail with every related id,
// plus role change / block / delete. Responsive (full-width on mobile).
export default function AdminUserDetail({ user, onClose, onChanged }) {
  const [loading, setLoading] = useState(false)
  useEscapeKey(onClose)  // keyboard escape hatch
  const [teams, setTeams] = useState([])
  const [meetings, setMeetings] = useState([])
  const [tasks, setTasks] = useState([])
  const [role, setRole] = useState(user?.role || 'member')
  const [blocked, setBlocked] = useState(!!user?.is_blocked)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    setRole(user.role); setBlocked(!!user.is_blocked); setLoading(true)
    ;(async () => {
      const found = []
      try {
        const { data: all } = await getTeams()
        for (const t of (all || [])) if (t.team_lead_id === user.id) found.push({ id: t.id, name: t.name, role: 'тимлид' })
      } catch { /* ignore */ }
      try {
        const { data: mt } = await getMemberTeam(user.id)
        if (mt && mt.id && !found.some(f => f.id === mt.id)) {
          const me = (mt.members || []).find(m => m.user_id === user.id)
          found.push({ id: mt.id, name: mt.name, role: me?.role ?? 'участник' })
        }
      } catch { /* ignore */ }
      setTeams(found)
      try {
        const [a, b] = await Promise.all([
          getMeetings({ member_id: user.id }), getMeetings({ team_lead_id: user.id }),
        ])
        const map = {}
        for (const m of [...(a.data || []), ...(b.data || [])]) map[m.id] = m
        setMeetings(Object.values(map))
      } catch { setMeetings([]) }
      try { const { data } = await getTasks({ assigned_to: user.id }); setTasks(data || []) } catch { setTasks([]) }
      setLoading(false)
    })()
  }, [user?.id])

  if (!user) return null

  const changeRole = async (r) => {
    if (r === role) return
    setBusy(true)
    try { await updateUser(user.id, { role: r }); setRole(r); onChanged?.() }
    finally { setBusy(false) }
  }
  const toggleBlock = async () => {
    setBusy(true)
    try { await (blocked ? unblockUser : blockUser)(user.id); setBlocked(!blocked); onChanged?.() }
    finally { setBusy(false) }
  }
  const handleDelete = async () => {
    if (!confirm(`Удалить ${user.name} (id ${user.id}) безвозвратно?`)) return
    setBusy(true)
    try { await deleteUser(user.id); onChanged?.(); onClose() }
    finally { setBusy(false) }
  }

  const chip = { fontSize: 12, fontWeight: 700, background: 'var(--gray-100, #f1f5f9)', borderRadius: 6, padding: '3px 8px' }
  const sect = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 6px' }
  const row = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: 13 }
  const meta = { fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9500, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 16, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, marginTop: 40, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{user.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>{user.email}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          <span style={chip}>ID: {user.id}</span>
          <span style={{ ...chip, background: 'var(--color-accent-light, #eef2ff)', color: 'var(--color-accent)' }}>{role === 'team_lead' ? 'Тимлид' : 'Участник'}</span>
          {blocked && <span style={{ ...chip, background: '#fee2e2', color: '#b91c1c' }}>Заблокирован</span>}
        </div>

        {loading ? <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div> : (
          <>
            <p style={sect}>Команды ({teams.length})</p>
            {teams.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет</p> :
              teams.map(t => <div key={t.id} style={row}><span>{t.name}</span><span style={meta}>team_id:{t.id} · {t.role}</span></div>)}

            <p style={sect}>Встречи ({meetings.length})</p>
            {meetings.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет</p> :
              meetings.slice(0, 25).map(m => <div key={m.id} style={row}>
                <span>{m.scheduled_date ? new Date(m.scheduled_date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                <span style={meta}>meeting_id:{m.id} · {m.status}</span>
              </div>)}

            <p style={sect}>Задачи ({tasks.length})</p>
            {tasks.length === 0 ? <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Нет</p> :
              tasks.slice(0, 25).map(t => <div key={t.id} style={row}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || t.description}</span>
                <span style={meta}>task_id:{t.id} · {statusOf(t)}</span>
              </div>)}

            <p style={sect}>Сменить роль</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['member', 'team_lead'].map(r => (
                <button key={r} disabled={busy} onClick={() => changeRole(r)} className="btn btn-sm"
                  style={{ flex: 1, background: role === r ? 'var(--color-accent)' : 'var(--color-surface)', color: role === r ? '#fff' : 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                  {r === 'member' ? 'Участник' : 'Тимлид'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button disabled={busy} onClick={toggleBlock} className="btn btn-sm" style={{ flex: 1, background: blocked ? '#f0fdf4' : '#fff7ed', color: blocked ? '#16a34a' : '#c2410c', border: '1px solid var(--color-border)' }}>
                {blocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
              <button disabled={busy} onClick={handleDelete} className="btn btn-sm" style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none' }}>Удалить</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
