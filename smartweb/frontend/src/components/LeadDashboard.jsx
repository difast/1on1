import { useState, useEffect, useCallback } from 'react'
import { createTeam, getTeams, getTeam, createMeeting, createUser, addMember, getTasks, createTask, updateTask, getMeetings, confirmMeeting, declineMeeting, getUsers, regenerateInviteCode, updateMeeting } from '../api/client'
import Layout from './Layout'
import UserCard from './UserCard'
import LeadAnalytics from './LeadAnalytics'

export default function LeadDashboard({ user, onLogout, onUserUpdate }) {
  const [activeView, setActiveView] = useState('teams')
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [loadingTeam, setLoadingTeam] = useState(false)

  const [myMeetings, setMyMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(false)
  const [usersMap, setUsersMap] = useState({})
  const [meetingAction, setMeetingAction] = useState({})

  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleMember, setScheduleMember] = useState(null)
  const [userCardMember, setUserCardMember] = useState(null)

  const [newTeamName, setNewTeamName] = useState('')
  const [newMember, setNewMember] = useState({ name: '', email: '', title: '', role: 'member' })
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleAgenda, setScheduleAgenda] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const [memberTasks, setMemberTasks] = useState({})
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  const [taskForms, setTaskForms] = useState({})

  const [searchQuery, setSearchQuery] = useState('')

  const [meetingNotes, setMeetingNotes] = useState({})

  const loadTeams = useCallback(async () => {
    try {
      const { data } = await getTeams()
      const myTeams = data.filter((t) => t.team_lead_id === user.id)
      setTeams(myTeams)
      if (myTeams.length > 0 && !selectedTeamId) {
        setSelectedTeamId(myTeams[0].id)
      }
    } catch {
      setTeams([])
    }
  }, [user.id, selectedTeamId])

  const loadTeamDetail = useCallback(async (teamId) => {
    if (!teamId) return
    setLoadingTeam(true)
    try {
      const { data } = await getTeam(teamId)
      const sorted = [...(data.members || [])].sort((a, b) => {
        if (!a.last_meeting_date && !b.last_meeting_date) return 0
        if (!a.last_meeting_date) return -1
        if (!b.last_meeting_date) return 1
        return new Date(a.last_meeting_date) - new Date(b.last_meeting_date)
      })
      setTeamDetail({ ...data, members: sorted })
    } catch {
      setTeamDetail(null)
    } finally {
      setLoadingTeam(false)
    }
  }, [])

  const loadMyMeetings = useCallback(async () => {
    setLoadingMeetings(true)
    try {
      const [{ data: meetings }, { data: users }] = await Promise.all([
        getMeetings({ team_lead_id: user.id }),
        getUsers(),
      ])
      setMyMeetings(meetings || [])
      const map = {}
      for (const u of (users || [])) map[u.id] = u
      setUsersMap(map)
    } catch {
      setMyMeetings([])
    } finally {
      setLoadingMeetings(false)
    }
  }, [user.id])

  const handleConfirmMeeting = async (meetingId) => {
    setMeetingAction(prev => ({ ...prev, [meetingId]: true }))
    try {
      await confirmMeeting(meetingId)
      setMyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'confirmed' } : m))
    } catch {} finally {
      setMeetingAction(prev => ({ ...prev, [meetingId]: false }))
    }
  }

  const handleDeclineMeeting = async (meetingId) => {
    setMeetingAction(prev => ({ ...prev, [meetingId]: true }))
    try {
      await declineMeeting(meetingId)
      setMyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'declined' } : m))
    } catch {} finally {
      setMeetingAction(prev => ({ ...prev, [meetingId]: false }))
    }
  }

  const handleToggleMeetingNote = (meeting) => {
    const id = meeting.id
    setMeetingNotes(prev => {
      const cur = prev[id]
      if (cur?.expanded) return { ...prev, [id]: { ...cur, expanded: false } }
      return { ...prev, [id]: { expanded: true, draft: cur?.draft ?? (meeting.notes || ''), saving: false } }
    })
  }

  const handleSaveMeetingNote = async (meetingId) => {
    const note = meetingNotes[meetingId]
    if (!note) return
    setMeetingNotes(prev => ({ ...prev, [meetingId]: { ...prev[meetingId], saving: true } }))
    try {
      await updateMeeting(meetingId, { notes: note.draft })
      setMyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, notes: note.draft } : m))
      setMeetingNotes(prev => ({ ...prev, [meetingId]: { ...prev[meetingId], saving: false } }))
    } catch {
      setMeetingNotes(prev => ({ ...prev, [meetingId]: { ...prev[meetingId], saving: false } }))
    }
  }

  useEffect(() => { loadTeams() }, [user.id])
  useEffect(() => { if (selectedTeamId) loadTeamDetail(selectedTeamId) }, [selectedTeamId])

  const loadMemberTasks = useCallback(async (memberId, teamId) => {
    try {
      const { data } = await getTasks({ assigned_to: memberId, team_id: teamId })
      setMemberTasks((prev) => ({ ...prev, [memberId]: data || [] }))
    } catch {
      setMemberTasks((prev) => ({ ...prev, [memberId]: [] }))
    }
  }, [])

  const toggleTasksExpanded = (memberId) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.add(memberId)
        if (memberTasks[memberId] === undefined) loadMemberTasks(memberId, selectedTeamId)
      }
      return next
    })
  }

  const handleToggleTask = async (task, memberId) => {
    try {
      await updateTask(task.id, { completed: !task.completed })
      setMemberTasks((prev) => ({
        ...prev,
        [memberId]: (prev[memberId] || []).map((t) =>
          t.id === task.id ? { ...t, completed: !t.completed } : t
        ),
      }))
    } catch {}
  }

  const openTaskForm = (memberId) => {
    setTaskForms((prev) => ({ ...prev, [memberId]: { title: '', due_date: '', loading: false, open: true } }))
  }

  const closeTaskForm = (memberId) => {
    setTaskForms((prev) => ({ ...prev, [memberId]: { ...(prev[memberId] || {}), open: false } }))
  }

  const handleCreateTask = async (e, memberId) => {
    e.preventDefault()
    const form = taskForms[memberId] || {}
    if (!form.title?.trim()) return
    setTaskForms((prev) => ({ ...prev, [memberId]: { ...prev[memberId], loading: true } }))
    try {
      const { data: newTask } = await createTask({
        title: form.title.trim(),
        due_date: form.due_date || null,
        team_id: selectedTeamId,
        assigned_to: memberId,
        assigned_by: user.id,
        meeting_id: null,
      })
      setMemberTasks((prev) => ({ ...prev, [memberId]: [...(prev[memberId] || []), newTask] }))
      setTaskForms((prev) => ({ ...prev, [memberId]: { title: '', due_date: '', loading: false, open: false } }))
    } catch {
      setTaskForms((prev) => ({ ...prev, [memberId]: { ...prev[memberId], loading: false } }))
    }
  }

  const handleCreateTeam = async (e) => {
    e.preventDefault()
    if (!newTeamName.trim()) return
    setFormLoading(true)
    try {
      const { data } = await createTeam({ name: newTeamName.trim(), team_lead_id: user.id })
      setNewTeamName('')
      setShowCreateTeam(false)
      await loadTeams()
      setSelectedTeamId(data.id)
    } catch {} finally { setFormLoading(false) }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!newMember.name.trim() || !newMember.email.trim()) return
    setFormLoading(true)
    try {
      const { data: createdUser } = await createUser({
        name: newMember.name.trim(),
        email: newMember.email.trim(),
        title: newMember.title.trim() || undefined,
        role: newMember.role,
      })
      await addMember(selectedTeamId, createdUser.id, newMember.role)
      setNewMember({ name: '', email: '', title: '', role: 'member' })
      setShowAddMember(false)
      await loadTeamDetail(selectedTeamId)
    } catch {} finally { setFormLoading(false) }
  }

  const handleScheduleMeeting = async (e) => {
    e.preventDefault()
    if (!scheduleDate || !scheduleMember) return
    setFormLoading(true)
    try {
      await createMeeting({
        team_id: selectedTeamId,
        team_lead_id: user.id,
        member_id: scheduleMember.user_id,
        scheduled_date: scheduleDate,
        status: 'scheduled',
        agenda: scheduleAgenda.trim() || undefined,
      })
      setScheduleDate('')
      setScheduleAgenda('')
      setShowSchedule(false)
      setScheduleMember(null)
      await loadTeamDetail(selectedTeamId)
    } catch {} finally { setFormLoading(false) }
  }

  const handleCopyInvite = () => {
    if (!teamDetail?.invite_code) return
    const link = `${window.location.origin}?join=${teamDetail.invite_code}`
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerateCode = async (e) => {
    e.stopPropagation()
    if (!selectedTeamId) return
    setRegenerating(true)
    try {
      const { data } = await regenerateInviteCode(selectedTeamId)
      setTeamDetail(prev => prev ? { ...prev, invite_code: data.invite_code } : prev)
    } catch {} finally { setRegenerating(false) }
  }

  const statusBorderClass = {
    green: 'border-status-green',
    yellow: 'border-status-yellow',
    red: 'border-status-red',
  }

  const statusBadgeClass = {
    green: 'badge badge-green',
    yellow: 'badge badge-amber',
    red: 'badge badge-red',
  }

  const statusLabel = {
    green: 'В порядке',
    yellow: 'Скоро',
    red: 'Просрочено',
  }

  const filteredMembers = teamDetail?.members?.filter(m => {
    if (m.user_id === user.id) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (m.user_name || '').toLowerCase().includes(q) ||
      (m.user_email || '').toLowerCase().includes(q)
    )
  }) || []

  return (
    <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate}>
      <div style={{ maxWidth: 1100 }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {activeView === 'teams' ? 'Мои команды' : activeView === 'meetings' ? 'Мои встречи' : 'Аналитика'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Добро пожаловать, {user.name}</p>
          </div>
          {activeView === 'teams' && (
            <button onClick={() => setShowCreateTeam(true)} className="btn btn-accent btn-sm">
              + Создать команду
            </button>
          )}
        </div>

        {/* View tabs */}
        <div className="tabs" style={{ width: 'fit-content', marginBottom: 24 }}>
          {[
            { key: 'teams', label: 'Команды' },
            { key: 'meetings', label: 'Мои встречи' },
            { key: 'analytics', label: 'Аналитика' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveView(tab.key); if (tab.key === 'meetings') loadMyMeetings() }}
              className={`tab${activeView === tab.key ? ' active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Analytics view */}
        {activeView === 'analytics' && <LeadAnalytics user={user} />}

        {/* My Meetings view */}
        {activeView === 'meetings' && (
          <MyMeetingsView
            meetings={myMeetings}
            loading={loadingMeetings}
            usersMap={usersMap}
            meetingAction={meetingAction}
            onConfirm={handleConfirmMeeting}
            onDecline={handleDeclineMeeting}
            onReload={loadMyMeetings}
            meetingNotes={meetingNotes}
            onToggleNote={handleToggleMeetingNote}
            onNoteChange={(id, val) => setMeetingNotes(prev => ({ ...prev, [id]: { ...prev[id], draft: val } }))}
            onSaveNote={handleSaveMeetingNote}
          />
        )}

        {/* Teams view */}
        {activeView === 'teams' && (<>
          {teams.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {teams.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeamId(t.id)}
                  className={selectedTeamId === t.id ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {teams.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <p className="empty-title">Нет команд</p>
              <p className="empty-desc">Создайте первую команду, чтобы начать</p>
            </div>
          )}

          {selectedTeamId && (
            <div>
              {loadingTeam ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </div>
              ) : teamDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Invite banner */}
                  <div className="invite-banner" onClick={handleCopyInvite}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 'var(--radius-md)',
                      background: 'var(--color-surface)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 20, flexShrink: 0,
                      boxShadow: 'var(--shadow-sm)', border: '1px solid var(--blue-200)',
                    }}>🔗</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Код приглашения
                      </p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--blue-700)' }}>
                        {teamDetail.invite_code}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleCopyInvite() }}
                        className="btn btn-accent btn-sm"
                      >
                        {copied ? '✓ Скопировано!' : 'Скопировать ссылку'}
                      </button>
                      <button
                        onClick={handleRegenerateCode}
                        className="btn btn-secondary btn-sm"
                        disabled={regenerating}
                        title="Сгенерировать новый код"
                      >
                        {regenerating ? '...' : '🔄 Новый код'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setShowAddMember(true) }}
                        className="btn btn-accent-ghost btn-sm"
                      >
                        + Участника
                      </button>
                    </div>
                  </div>

                  {/* Search */}
                  {teamDetail.members && teamDetail.members.filter(m => m.user_id !== user.id).length > 0 && (
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Поиск участников по имени или email..."
                      className="input"
                      style={{ maxWidth: 360 }}
                    />
                  )}

                  {/* Members grid */}
                  {filteredMembers.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                      {filteredMembers.map((member) => {
                        const tasksExpanded = expandedTasks.has(member.user_id)
                        const tasks = memberTasks[member.user_id]
                        const taskForm = taskForms[member.user_id] || {}

                        return (
                          <div
                            key={member.user_id}
                            className={`member-card ${statusBorderClass[member.status_color] || ''}`}
                            style={{ borderWidth: member.status_color ? 2 : 1 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div className={`avatar avatar-md ${member.user_avatar_url ? '' : 'avatar-accent'}`}>
                                  {member.user_avatar_url
                                    ? <img src={member.user_avatar_url} alt={member.user_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                    : (member.user_name || '?').charAt(0).toUpperCase()}
                                </div>
                                {member.is_registered && (
                                  <div style={{
                                    position: 'absolute', bottom: -1, right: -1,
                                    width: 11, height: 11, borderRadius: '50%',
                                    background: 'var(--color-success)', border: '2px solid var(--color-surface)',
                                  }} />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {member.user_name}
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {member.role}
                                </p>
                              </div>
                              <button
                                onClick={() => setUserCardMember(member)}
                                className="btn-icon"
                                style={{ width: 28, height: 28, borderRadius: 7, fontSize: 14 }}
                                title="Профиль"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                </svg>
                              </button>
                              {member.status_color && (
                                <span className={statusBadgeClass[member.status_color] || 'badge badge-gray'}>
                                  {statusLabel[member.status_color] || '—'}
                                </span>
                              )}
                            </div>

                            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                              Последняя встреча:{' '}
                              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                {member.last_meeting_date
                                  ? new Date(member.last_meeting_date).toLocaleDateString('ru-RU')
                                  : 'Не было'}
                              </span>
                            </p>

                            <button
                              onClick={() => { setScheduleMember(member); setShowSchedule(true) }}
                              className="btn btn-accent btn-sm"
                              style={{ width: '100%', marginBottom: 12 }}
                            >
                              Запланировать встречу
                            </button>

                            {/* Tasks section */}
                            <div>
                              <button
                                onClick={() => toggleTasksExpanded(member.user_id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  width: '100%', textAlign: 'left', transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-accent)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                                  style={{ width: 13, height: 13, transition: 'transform 0.2s', transform: tasksExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                </svg>
                                Задачи
                                {tasks !== undefined && (
                                  <span className="badge badge-gray" style={{ marginLeft: 'auto', padding: '2px 7px', fontSize: 11 }}>
                                    {tasks.length}
                                  </span>
                                )}
                              </button>

                              {tasksExpanded && (
                                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {tasks === undefined && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Загрузка...</p>}
                                  {tasks !== undefined && tasks.length === 0 && !taskForm.open && (
                                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Нет задач</p>
                                  )}
                                  {tasks !== undefined && tasks.map(task => (
                                    <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
                                      <button
                                        onClick={() => handleToggleTask(task, member.user_id)}
                                        style={{
                                          marginTop: 1, width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                                          border: task.completed ? 'none' : '1.5px solid var(--gray-300)',
                                          background: task.completed ? 'var(--color-success)' : 'var(--color-surface)',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                      >
                                        {task.completed && (
                                          <svg style={{ width: 10, height: 10 }} fill="none" stroke="#fff" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </button>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{
                                          fontSize: 12, lineHeight: 1.4,
                                          color: task.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                                          textDecoration: task.completed ? 'line-through' : 'none',
                                        }}>
                                          {task.title || task.description}
                                        </p>
                                        {task.due_date && (
                                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                            до {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}

                                  {taskForm.open ? (
                                    <form onSubmit={e => handleCreateTask(e, member.user_id)} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                                      <input
                                        type="text"
                                        value={taskForm.title || ''}
                                        onChange={e => setTaskForms(prev => ({ ...prev, [member.user_id]: { ...prev[member.user_id], title: e.target.value } }))}
                                        placeholder="Название задачи"
                                        autoFocus
                                        className="input input-sm"
                                        style={{ fontSize: 12 }}
                                      />
                                      <input
                                        type="date"
                                        value={taskForm.due_date || ''}
                                        onChange={e => setTaskForms(prev => ({ ...prev, [member.user_id]: { ...prev[member.user_id], due_date: e.target.value } }))}
                                        className="input input-sm"
                                        style={{ fontSize: 12 }}
                                      />
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" onClick={() => closeTaskForm(member.user_id)} className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: 12 }}>
                                          Отмена
                                        </button>
                                        <button type="submit" disabled={taskForm.loading} className="btn btn-accent btn-sm" style={{ flex: 1, fontSize: 12 }}>
                                          {taskForm.loading ? '...' : 'Добавить'}
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <button
                                      onClick={() => openTaskForm(member.user_id)}
                                      style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', marginTop: 2 }}
                                    >
                                      + Добавить задачу
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">👤</div>
                      <p className="empty-title">{searchQuery ? 'Участники не найдены' : 'Нет участников'}</p>
                      <p className="empty-desc">{searchQuery ? 'Попробуйте изменить запрос' : 'Добавьте первого участника в команду'}</p>
                      {!searchQuery && (
                        <button onClick={() => setShowAddMember(true)} className="btn btn-accent btn-sm" style={{ marginTop: 16 }}>
                          + Добавить участника
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </>)}
      </div>

      {userCardMember && <UserCard user={userCardMember} onClose={() => setUserCardMember(null)} />}

      {showCreateTeam && (
        <Modal title="Создать команду" onClose={() => setShowCreateTeam(false)}>
          <form onSubmit={handleCreateTeam}>
            <div className="form-group">
              <label className="form-label">Название команды</label>
              <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Например: Backend Team" className="input" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setShowCreateTeam(false)} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1 }}>{formLoading ? 'Создание...' : 'Создать'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddMember && (
        <Modal title="Добавить участника" onClose={() => setShowAddMember(false)}>
          <form onSubmit={handleAddMember}>
            {[
              { key: 'name', label: 'Имя *', placeholder: 'Иван Иванов', type: 'text' },
              { key: 'email', label: 'Email *', placeholder: 'ivan@company.com', type: 'email' },
              { key: 'title', label: 'Должность', placeholder: 'Senior Engineer', type: 'text' },
            ].map(f => (
              <div key={f.key} className="form-group">
                <label className="form-label">{f.label}</label>
                <input type={f.type} value={newMember[f.key]} onChange={e => setNewMember(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="input" />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Роль</label>
              <select value={newMember.role} onChange={e => setNewMember(p => ({ ...p, role: e.target.value }))} className="input">
                <option value="member">Участник</option>
                <option value="team_lead">Тимлид</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setShowAddMember(false)} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1 }}>{formLoading ? 'Добавление...' : 'Добавить'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showSchedule && scheduleMember && (
        <Modal title={`Встреча с ${scheduleMember.user_name}`} onClose={() => { setShowSchedule(false); setScheduleMember(null) }}>
          <form onSubmit={handleScheduleMeeting}>
            <div className="form-group">
              <label className="form-label">Дата и время</label>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="input" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">
                Повестка <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span>
              </label>
              <textarea
                value={scheduleAgenda}
                onChange={e => setScheduleAgenda(e.target.value)}
                placeholder="Темы для обсуждения..."
                className="input"
                style={{ resize: 'none', minHeight: 80 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => { setShowSchedule(false); setScheduleMember(null) }} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1 }}>{formLoading ? 'Сохранение...' : 'Запланировать'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}

function MyMeetingsView({ meetings, loading, usersMap, meetingAction, onConfirm, onDecline, meetingNotes, onToggleNote, onNoteChange, onSaveNote }) {
  const now = new Date()

  const requests = meetings.filter(m => m.status === 'requested')
  const upcoming = meetings.filter(m =>
    m.status !== 'requested' && m.status !== 'cancelled' && m.status !== 'declined' &&
    new Date(m.scheduled_date) >= now
  ).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  const past = meetings.filter(m =>
    (new Date(m.scheduled_date) < now && m.status !== 'requested') ||
    m.status === 'completed' || m.status === 'cancelled' || m.status === 'declined'
  ).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))

  const statusBadge = {
    scheduled: 'badge badge-blue', confirmed: 'badge badge-green', completed: 'badge badge-gray',
    cancelled: 'badge badge-red', declined: 'badge badge-red', requested: 'badge badge-amber',
  }
  const statusLabel = {
    scheduled: 'Запланирована', confirmed: 'Подтверждена', completed: 'Завершена',
    cancelled: 'Отменена', declined: 'Отклонена', requested: 'Запрошена',
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
      <div className="spinner" />
    </div>
  )

  const MeetingRow = ({ m, showActions, showNotes }) => {
    const memberName = usersMap[m.member_id]?.name || `Участник #${m.member_id}`
    const busy = meetingAction[m.id]
    const noteState = meetingNotes?.[m.id]
    return (
      <div className="meeting-item" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-md)',
            background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
              {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
            </span>
            <span style={{ fontSize: 11, color: 'var(--blue-400)' }}>
              {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>{memberName}</p>
            {m.agenda && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.agenda}</p>}
          </div>
          <span className={statusBadge[m.status] || 'badge badge-gray'} style={{ flexShrink: 0 }}>
            {statusLabel[m.status] || m.status}
          </span>
          {showActions && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onConfirm(m.id)} disabled={busy} className="btn btn-success btn-sm">Принять</button>
              <button onClick={() => onDecline(m.id)} disabled={busy} className="btn btn-danger btn-sm">Отклонить</button>
            </div>
          )}
          {showNotes && (
            <button
              onClick={() => onToggleNote(m)}
              style={{
                fontSize: 12, fontWeight: 600, background: 'none', border: 'none',
                cursor: 'pointer', color: noteState?.expanded ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                flexShrink: 0, padding: '4px 6px',
              }}
            >
              {noteState?.expanded ? '▾ Заметки' : '▸ Заметки'}{m.notes ? '●' : ''}
            </button>
          )}
        </div>
        {showNotes && noteState?.expanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
            <textarea
              value={noteState.draft}
              onChange={e => onNoteChange(m.id, e.target.value)}
              placeholder="Заметки к встрече..."
              className="input"
              style={{ resize: 'vertical', minHeight: 72, fontSize: 13 }}
            />
            <button
              onClick={() => onSaveNote(m.id)}
              disabled={noteState.saving}
              className="btn btn-accent btn-sm"
              style={{ marginTop: 6 }}
            >
              {noteState.saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {requests.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <p className="label">Запросы на встречу</p>
            <span className="badge badge-amber">{requests.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map(m => <MeetingRow key={m.id} m={m} showActions showNotes={false} />)}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <p className="label" style={{ marginBottom: 12 }}>Предстоящие</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(m => <MeetingRow key={m.id} m={m} showActions={false} showNotes={false} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <p className="label" style={{ marginBottom: 12 }}>Прошедшие</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(m => <MeetingRow key={m.id} m={m} showActions={false} showNotes />)}
          </div>
        </div>
      )}
      {meetings.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <p className="empty-title">Встреч пока нет</p>
          <p className="empty-desc">Встречи появятся здесь после их планирования</p>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
