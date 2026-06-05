import { useState } from 'react'
import { createTeam, createTask, createMeeting } from '../api/client'

// Admin manual creation by ID — team / task / meeting. Responsive.
export default function AdminManage() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  const [teamName, setTeamName] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskTeam, setTaskTeam] = useState('')
  const [mTeam, setMTeam] = useState('')
  const [mLead, setMLead] = useState('')
  const [mMember, setMMember] = useState('')
  const [mDate, setMDate] = useState('')

  const wrap = async (fn) => { setBusy(true); try { await fn() } catch { notify('Ошибка') } finally { setBusy(false) } }

  const doTeam = () => {
    if (!teamName.trim() || !teamLead.trim()) return notify('Укажите название и ID тимлида')
    wrap(async () => { await createTeam({ name: teamName.trim(), team_lead_id: Number(teamLead) }); setTeamName(''); setTeamLead(''); notify('✓ Команда создана') })
  }
  const doTask = () => {
    if (!taskTitle.trim() || !taskAssignee.trim()) return notify('Укажите задачу и ID исполнителя')
    wrap(async () => { await createTask({ title: taskTitle.trim(), assigned_to: Number(taskAssignee), assigned_by: Number(taskAssignee), team_id: taskTeam.trim() ? Number(taskTeam) : null }); setTaskTitle(''); setTaskAssignee(''); setTaskTeam(''); notify('✓ Задача создана') })
  }
  const doMeeting = () => {
    if (!mTeam.trim() || !mLead.trim() || !mMember.trim() || !mDate) return notify('Заполните team_id, ID тимлида, ID участника и дату')
    wrap(async () => { await createMeeting({ team_id: Number(mTeam), team_lead_id: Number(mLead), member_id: Number(mMember), scheduled_date: mDate }); setMTeam(''); setMLead(''); setMMember(''); setMDate(''); notify('✓ Встреча создана') })
  }

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }
  const field = { marginBottom: 10 }
  const sect = { fontSize: 13, fontWeight: 700, margin: '0 0 12px' }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать команду</p>
        <div style={field}><label style={label}>Название</label><input className="input" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Название команды" /></div>
        <div style={field}><label style={label}>ID тимлида</label><input className="input" value={teamLead} onChange={e => setTeamLead(e.target.value)} placeholder="напр. 12" inputMode="numeric" /></div>
        <button className="btn btn-primary" disabled={busy} onClick={doTeam} style={{ width: '100%' }}>Создать команду</button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать задачу</p>
        <div style={field}><label style={label}>Задача</label><input className="input" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Текст задачи" /></div>
        <div style={field}><label style={label}>ID исполнителя</label><input className="input" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} placeholder="напр. 7" inputMode="numeric" /></div>
        <div style={field}><label style={label}>team_id (необязательно)</label><input className="input" value={taskTeam} onChange={e => setTaskTeam(e.target.value)} placeholder="напр. 3" inputMode="numeric" /></div>
        <button className="btn btn-primary" disabled={busy} onClick={doTask} style={{ width: '100%' }}>Создать задачу</button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать встречу</p>
        <div style={field}><label style={label}>team_id</label><input className="input" value={mTeam} onChange={e => setMTeam(e.target.value)} placeholder="напр. 3" inputMode="numeric" /></div>
        <div style={field}><label style={label}>ID тимлида</label><input className="input" value={mLead} onChange={e => setMLead(e.target.value)} placeholder="напр. 12" inputMode="numeric" /></div>
        <div style={field}><label style={label}>ID участника</label><input className="input" value={mMember} onChange={e => setMMember(e.target.value)} placeholder="напр. 7" inputMode="numeric" /></div>
        <div style={field}><label style={label}>Дата и время</label><input className="input" type="datetime-local" value={mDate} onChange={e => setMDate(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={busy} onClick={doMeeting} style={{ width: '100%' }}>Создать встречу</button>
      </div>

      {msg && (
        <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{msg}</div>
      )}
    </div>
  )
}
