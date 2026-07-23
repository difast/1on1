import { useEffect, useState } from 'react'
import {
  getTeams, getMemberTeam, getMeetings, getTasks,
  updateUser, deleteUser, blockUser, unblockUser,
  getUserBilling, assignManager, getManagers,
} from '../api/client'
import useEscapeKey from '../lib/useEscapeKey'
import { confirmDialog, toast } from '../lib/ui'
import Spinner from '../lib/Spinner'

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
  const [billing, setBilling] = useState(null)
  const [managers, setManagers] = useState([])
  const [mgr, setMgr] = useState(null)   // {managerId, saving} — назначение менеджера

  const loadBilling = () => getUserBilling(user.id).then(r => setBilling(r.data)).catch(() => setBilling(null))

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
      loadBilling()
      getManagers().then(r => setManagers(r.data)).catch(() => {})
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
    if (!await confirmDialog({ title: 'Удалить пользователя?', message: `${user.name} (id ${user.id}) будет удалён безвозвратно.`, confirmText: 'Удалить', danger: true })) return
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
          <button aria-label="Закрыть" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
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

            {/* Биллинг пользователя (Task 2): тариф, Free-окно, менеджер, платежи */}
            <p style={sect}>Биллинг</p>
            {!billing ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Загрузка…</p>
            ) : (
              <>
                <div style={row}>
                  <span>Тариф</span>
                  <span style={meta}>
                    {billing.user?.billing_override ? 'полный доступ' : (billing.subscription ? `${billing.subscription.plan_code} · ${billing.subscription.status}` : 'нет подписки')}
                  </span>
                </div>
                {billing.free_window?.free_until && (
                  <div style={row}>
                    <span>Free-окно (14 дней)</span>
                    <span style={meta}>{billing.free_window.free_expired ? 'истекло' : `до ${new Date(billing.free_window.free_until).toLocaleDateString('ru-RU')}`}</span>
                  </div>
                )}
                <div style={{ ...row, alignItems: 'flex-start' }}>
                  <span>Менеджер</span>
                  <span style={{ textAlign: 'right' }}>
                    {billing.subscription?.manager_name
                      ? <span style={{ fontSize: 13 }}>{billing.subscription.manager_name}{billing.subscription.manager_contact ? ` · ${billing.subscription.manager_contact}` : ''}</span>
                      : <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>не назначен</span>}
                    <button onClick={() => setMgr({ managerId: billing.subscription?.manager_id || '', saving: false })}
                      style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-border)', cursor: 'pointer', background: 'var(--color-bg)' }}>Изменить</button>
                  </span>
                </div>
                {mgr && (
                  <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {managers.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Список менеджеров пуст. Добавьте их на вкладке «Биллинг».</p>
                    ) : (
                      <select className="input input-sm" value={mgr.managerId} onChange={e => setMgr(m => ({ ...m, managerId: e.target.value }))}>
                        <option value="">— не назначен —</option>
                        {managers.map(m => <option key={m.id} value={m.id}>{m.name}{m.contact ? ` · ${m.contact}` : ''}</option>)}
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} disabled={mgr.saving} onClick={() => setMgr(null)}>Отмена</button>
                      <button className="btn btn-sm btn-accent" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} disabled={mgr.saving}
                        onClick={async () => {
                          setMgr(m => ({ ...m, saving: true }))
                          try { await assignManager(user.id, mgr.managerId ? Number(mgr.managerId) : null); await loadBilling(); toast('Менеджер обновлён', 'success'); setMgr(null) }
                          catch { toast('Не удалось сохранить', 'error'); setMgr(m => ({ ...m, saving: false })) }
                        }}>{mgr.saving ? <><Spinner size={14} /> Сохранение…</> : 'Сохранить'}</button>
                    </div>
                  </div>
                )}
                {(billing.payments || []).length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>Платежи ({billing.payments.length})</div>
                    {billing.payments.slice(0, 5).map(p => (
                      <div key={p.id} style={row}>
                        <span>{(p.amount / 100).toLocaleString('ru-RU')} {p.currency} · {p.status}</span>
                        <span style={meta}>{p.created_at ? new Date(p.created_at).toLocaleDateString('ru-RU') : '—'}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

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
              <button disabled={busy} onClick={toggleBlock} className="btn btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: blocked ? '#f0fdf4' : '#fff7ed', color: blocked ? '#16a34a' : '#c2410c', border: '1px solid var(--color-border)' }}>
                {busy && <Spinner size={13} tone="accent" />}{blocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
              <button disabled={busy} onClick={handleDelete} className="btn btn-sm" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dc2626', color: '#fff', border: 'none' }}>{busy && <Spinner size={13} />}Удалить</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
