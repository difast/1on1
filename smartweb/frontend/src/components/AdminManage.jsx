import { useState, useEffect } from 'react'
import { createTeam, createTask, createMeeting, getUsers, getTeams, getTeam } from '../api/client'

// Admin manual creation — pick people/teams by name (ids filled automatically). Responsive.
export default function AdminManage() {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState([])
  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  const [teamName, setTeamName] = useState('')
  const [teamLead, setTeamLead] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskTeam, setTaskTeam] = useState('')
  const [mTeam, setMTeam] = useState('')
  const [mMember, setMMember] = useState('')
  const [mDate, setMDate] = useState('')

  useEffect(() => {
    getUsers().then(r => setUsers(r.data || [])).catch(() => {})
    ;(async () => {
      try {
        const { data: all } = await getTeams()
        const det = await Promise.all((all || []).map(t => getTeam(t.id).then(r => r.data).catch(() => t)))
        setTeams(det)
      } catch { /* ignore */ }
    })()
  }, [])

  const wrap = async (fn) => { setBusy(true); try { await fn() } catch { notify('Ошибка') } finally { setBusy(false) } }
  const doTeam = () => {
    if (!teamName.trim() || !teamLead) return notify('Укажите название и тимлида')
    wrap(async () => { await createTeam({ name: teamName.trim(), team_lead_id: Number(teamLead) }); setTeamName(''); setTeamLead(''); notify('✓ Команда создана') })
  }
  const doTask = () => {
    if (!taskTitle.trim() || !taskAssignee) return notify('Укажите задачу и исполнителя')
    wrap(async () => { await createTask({ title: taskTitle.trim(), assigned_to: Number(taskAssignee), assigned_by: Number(taskAssignee), team_id: taskTeam ? Number(taskTeam) : null }); setTaskTitle(''); setTaskAssignee(''); setTaskTeam(''); notify('✓ Задача создана') })
  }
  const doMeeting = () => {
    const team = teams.find(t => t.id === Number(mTeam))
    if (!team || !mMember || !mDate) return notify('Выберите команду, участника и дату')
    wrap(async () => { await createMeeting({ team_id: team.id, team_lead_id: team.team_lead_id, member_id: Number(mMember), scheduled_date: mDate }); setMTeam(''); setMMember(''); setMDate(''); notify('✓ Встреча создана') })
  }

  const label = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }
  const field = { marginBottom: 10 }
  const sect = { fontSize: 13, fontWeight: 700, margin: '0 0 12px' }
  const meetTeam = teams.find(t => t.id === Number(mTeam))

  const UserOpts = () => users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role === 'team_lead' ? 'тимлид' : 'участник'} (ID {u.id})</option>)
  const TeamOpts = () => teams.map(t => <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать команду</p>
        <div style={field}><label style={label}>Название</label><input className="input" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Название команды" /></div>
        <div style={field}><label style={label}>Тимлид</label>
          <select className="input" value={teamLead} onChange={e => setTeamLead(e.target.value)}>
            <option value="">— выберите —</option>{UserOpts()}
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={doTeam} style={{ width: '100%' }}>Создать команду</button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать задачу</p>
        <div style={field}><label style={label}>Задача</label><input className="input" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Текст задачи" /></div>
        <div style={field}><label style={label}>Исполнитель</label>
          <select className="input" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
            <option value="">— выберите —</option>{UserOpts()}
          </select>
        </div>
        <div style={field}><label style={label}>Команда (необязательно)</label>
          <select className="input" value={taskTeam} onChange={e => setTaskTeam(e.target.value)}>
            <option value="">— без команды —</option>{TeamOpts()}
          </select>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={doTask} style={{ width: '100%' }}>Создать задачу</button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <p style={sect}>Создать встречу</p>
        <div style={field}><label style={label}>Команда</label>
          <select className="input" value={mTeam} onChange={e => { setMTeam(e.target.value); setMMember('') }}>
            <option value="">— выберите —</option>{TeamOpts()}
          </select>
        </div>
        <div style={field}><label style={label}>Участник</label>
          <select className="input" value={mMember} onChange={e => setMMember(e.target.value)} disabled={!meetTeam}>
            <option value="">{meetTeam ? '— выберите —' : 'сначала команда'}</option>
            {(meetTeam?.members || []).map(m => <option key={m.user_id} value={m.user_id}>{m.user_name} · {m.role} (ID {m.user_id})</option>)}
          </select>
        </div>
        <div style={field}><label style={label}>Дата и время</label><input className="input" type="datetime-local" value={mDate} onChange={e => setMDate(e.target.value)} /></div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>Тимлид определяется автоматически по команде.</p>
        <button className="btn btn-primary" disabled={busy} onClick={doMeeting} style={{ width: '100%' }}>Создать встречу</button>
      </div>

      {msg && (
        <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: msg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{msg}</div>
      )}
    </div>
  )
}
