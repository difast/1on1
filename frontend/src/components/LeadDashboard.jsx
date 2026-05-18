import { useState, useEffect, useCallback } from 'react'
import { createTeam, getTeams, getTeam, createMeeting, createUser, addMember, getTasks, createTask, updateTask, getMeetings, confirmMeeting, declineMeeting, getUsers } from '../api/client'
import Layout from './Layout'
import UserCard from './UserCard'

export default function LeadDashboard({ user, onLogout, onUserUpdate }) {
  const [activeView, setActiveView] = useState('teams')
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [loadingTeam, setLoadingTeam] = useState(false)

  // My meetings state
  const [myMeetings, setMyMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(false)
  const [usersMap, setUsersMap] = useState({})
  const [meetingAction, setMeetingAction] = useState({})

  // Modals
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleMember, setScheduleMember] = useState(null)

  // UserCard popup
  const [userCardMember, setUserCardMember] = useState(null)

  // Form state
  const [newTeamName, setNewTeamName] = useState('')
  const [newMember, setNewMember] = useState({ name: '', email: '', title: '', role: 'member' })
  const [scheduleDate, setScheduleDate] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Tasks per member: { [user_id]: Task[] }
  const [memberTasks, setMemberTasks] = useState({})
  // Expanded task sections: Set of user_ids
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  // New task forms: { [user_id]: { title, due_date, loading, open } }
  const [taskForms, setTaskForms] = useState({})

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
      // Sort members: no meeting first, then by last_meeting_date ascending
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

  useEffect(() => {
    loadTeams()
  }, [user.id])

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetail(selectedTeamId)
    }
  }, [selectedTeamId])

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
        // Load tasks when expanding if not yet loaded
        if (memberTasks[memberId] === undefined) {
          loadMemberTasks(memberId, selectedTeamId)
        }
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
    setTaskForms((prev) => ({
      ...prev,
      [memberId]: { title: '', due_date: '', loading: false, open: true },
    }))
  }

  const closeTaskForm = (memberId) => {
    setTaskForms((prev) => ({
      ...prev,
      [memberId]: { ...(prev[memberId] || {}), open: false },
    }))
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
      setMemberTasks((prev) => ({
        ...prev,
        [memberId]: [...(prev[memberId] || []), newTask],
      }))
      setTaskForms((prev) => ({
        ...prev,
        [memberId]: { title: '', due_date: '', loading: false, open: false },
      }))
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
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
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
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
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
      })
      setScheduleDate('')
      setShowSchedule(false)
      setScheduleMember(null)
      await loadTeamDetail(selectedTeamId)
    } catch {
      // silent
    } finally {
      setFormLoading(false)
    }
  }

  const handleCopyInvite = () => {
    if (!teamDetail?.invite_code) return
    const link = `${window.location.origin}?join=${teamDetail.invite_code}`
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusBorder = {
    green: 'border-green-400',
    yellow: 'border-yellow-400',
    red: 'border-red-400',
  }

  const statusBadge = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
  }

  const statusLabel = {
    green: 'В порядке',
    yellow: 'Скоро',
    red: 'Просрочено',
  }

  return (
    <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {activeView === 'teams' ? 'Мои команды' : 'Мои встречи'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Добро пожаловать, {user.name}</p>
          </div>
          {activeView === 'teams' && (
            <button
              onClick={() => setShowCreateTeam(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + Создать команду
            </button>
          )}
        </div>

        {/* View tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { key: 'teams', label: 'Команды' },
            { key: 'meetings', label: 'Мои встречи' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveView(tab.key)
                if (tab.key === 'meetings') loadMyMeetings()
              }}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === tab.key
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
          />
        )}

        {/* Team tabs — only when teams view is active */}
        {activeView === 'teams' && (<>
        {teams.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  selectedTeamId === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-400'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* No teams */}
        {teams.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
            <div className="text-5xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-gray-700">Нет команд</h3>
            <p className="text-sm text-gray-500 mt-1">Создайте первую команду, чтобы начать</p>
          </div>
        )}

        {/* Team detail */}
        {selectedTeamId && (
          <div>
            {loadingTeam ? (
              <div className="text-center py-12 text-gray-400">Загрузка...</div>
            ) : teamDetail ? (
              <div className="space-y-4">
                {/* Invite code bar */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Код приглашения</p>
                    <p className="font-mono text-lg font-bold text-indigo-700 mt-0.5">{teamDetail.invite_code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyInvite}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                      {copied ? '✓ Скопировано!' : 'Скопировать ссылку'}
                    </button>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="bg-white border border-indigo-300 text-indigo-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-50 transition-colors"
                    >
                      + Добавить участника
                    </button>
                  </div>
                </div>

                {/* Members grid */}
                {teamDetail.members && teamDetail.members.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamDetail.members.map((member) => {
                      const tasksExpanded = expandedTasks.has(member.user_id)
                      const tasks = memberTasks[member.user_id]
                      const taskForm = taskForms[member.user_id] || {}

                      return (
                        <div
                          key={member.user_id}
                          className={`bg-white rounded-2xl border-2 p-5 ${statusBorder[member.status_color] || 'border-gray-200'}`}
                        >
                          {/* Member header */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative flex-shrink-0">
                              <div className="w-11 h-11 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                {(member.user_name || '?').charAt(0).toUpperCase()}
                              </div>
                              {member.is_registered && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{member.user_name}</p>
                              <p className="text-xs text-gray-500 truncate">{member.role}</p>
                            </div>
                            {/* Info icon button */}
                            <button
                              onClick={() => setUserCardMember(member)}
                              title="Профиль участника"
                              className="text-gray-400 hover:text-indigo-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${statusBadge[member.status_color] || 'bg-gray-100 text-gray-600'}`}>
                              {statusLabel[member.status_color] || '—'}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 mb-3">
                            Последняя встреча:{' '}
                            <span className="font-medium text-gray-700">
                              {member.last_meeting_date
                                ? new Date(member.last_meeting_date).toLocaleDateString('ru-RU')
                                : 'Не было'}
                            </span>
                          </p>

                          <button
                            onClick={() => {
                              setScheduleMember(member)
                              setShowSchedule(true)
                            }}
                            className="w-full bg-indigo-600 text-white text-sm py-2 rounded-xl hover:bg-indigo-700 transition-colors mb-3"
                          >
                            Запланировать встречу
                          </button>

                          {/* Tasks section */}
                          <div>
                            <button
                              onClick={() => toggleTasksExpanded(member.user_id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors w-full text-left"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className={`w-3.5 h-3.5 transition-transform ${tasksExpanded ? 'rotate-90' : ''}`}
                              >
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                              </svg>
                              Задачи
                              {tasks !== undefined && (
                                <span className="ml-auto bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-xs">
                                  {tasks.length}
                                </span>
                              )}
                            </button>

                            {tasksExpanded && (
                              <div className="mt-2 space-y-1.5">
                                {tasks === undefined && (
                                  <p className="text-xs text-gray-400 py-1">Загрузка...</p>
                                )}

                                {tasks !== undefined && tasks.length === 0 && !taskForm.open && (
                                  <p className="text-xs text-gray-400 py-1">Нет задач</p>
                                )}

                                {tasks !== undefined && tasks.map((task) => (
                                  <div key={task.id} className="flex items-start gap-2 py-1">
                                    <button
                                      onClick={() => handleToggleTask(task, member.user_id)}
                                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                        task.completed
                                          ? 'bg-green-500 border-green-500 text-white'
                                          : 'border-gray-300 hover:border-indigo-500'
                                      }`}
                                    >
                                      {task.completed && (
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs leading-snug ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                        {task.title || task.description}
                                      </p>
                                      {task.due_date && (
                                        <p className={`text-xs mt-0.5 ${task.completed ? 'text-gray-300' : 'text-gray-400'}`}>
                                          до {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {/* Inline add task form */}
                                {taskForm.open ? (
                                  <form
                                    onSubmit={(e) => handleCreateTask(e, member.user_id)}
                                    className="pt-1 space-y-1.5"
                                  >
                                    <input
                                      type="text"
                                      value={taskForm.title || ''}
                                      onChange={(e) =>
                                        setTaskForms((prev) => ({
                                          ...prev,
                                          [member.user_id]: { ...prev[member.user_id], title: e.target.value },
                                        }))
                                      }
                                      placeholder="Название задачи"
                                      autoFocus
                                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <input
                                      type="date"
                                      value={taskForm.due_date || ''}
                                      onChange={(e) =>
                                        setTaskForms((prev) => ({
                                          ...prev,
                                          [member.user_id]: { ...prev[member.user_id], due_date: e.target.value },
                                        }))
                                      }
                                      className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => closeTaskForm(member.user_id)}
                                        className="flex-1 text-xs border border-gray-200 text-gray-500 py-1 rounded-lg hover:bg-gray-50"
                                      >
                                        Отмена
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={taskForm.loading}
                                        className="flex-1 text-xs bg-indigo-600 text-white py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                                      >
                                        {taskForm.loading ? '...' : 'Добавить'}
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <button
                                    onClick={() => openTaskForm(member.user_id)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1 flex items-center gap-1"
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
                  <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                    <p className="text-gray-500">В команде пока нет участников</p>
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="mt-3 text-indigo-600 text-sm font-medium hover:underline"
                    >
                      + Добавить первого участника
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
        </>)}
      </div>

      {/* UserCard popup */}
      {userCardMember && (
        <UserCard user={userCardMember} onClose={() => setUserCardMember(null)} />
      )}

      {/* Modal: Create team */}
      {showCreateTeam && (
        <Modal title="Создать команду" onClose={() => setShowCreateTeam(false)}>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название команды</label>
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Например: Backend Team"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateTeam(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {formLoading ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add member */}
      {showAddMember && (
        <Modal title="Добавить участника" onClose={() => setShowAddMember(false)}>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
              <input
                type="text"
                value={newMember.name}
                onChange={(e) => setNewMember((p) => ({ ...p, name: e.target.value }))}
                placeholder="Иван Иванов"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember((p) => ({ ...p, email: e.target.value }))}
                placeholder="ivan@company.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Должность</label>
              <input
                type="text"
                value={newMember.title}
                onChange={(e) => setNewMember((p) => ({ ...p, title: e.target.value }))}
                placeholder="Senior Engineer"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
              <select
                value={newMember.role}
                onChange={(e) => setNewMember((p) => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="member">Участник</option>
                <option value="team_lead">Тимлид</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {formLoading ? 'Добавление...' : 'Добавить'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Schedule meeting */}
      {showSchedule && scheduleMember && (
        <Modal
          title={`Встреча с ${scheduleMember.user_name}`}
          onClose={() => { setShowSchedule(false); setScheduleMember(null) }}
        >
          <form onSubmit={handleScheduleMeeting} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата и время</label>
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowSchedule(false); setScheduleMember(null) }}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {formLoading ? 'Сохранение...' : 'Запланировать'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}

function MyMeetingsView({ meetings, loading, usersMap, meetingAction, onConfirm, onDecline, onReload }) {
  const now = new Date()

  const requests = meetings.filter(m => m.status === 'requested')
  const upcoming = meetings.filter(m =>
    m.status !== 'requested' &&
    m.status !== 'cancelled' &&
    m.status !== 'declined' &&
    new Date(m.scheduled_date) >= now
  ).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  const past = meetings.filter(m =>
    (new Date(m.scheduled_date) < now && m.status !== 'requested') ||
    m.status === 'completed' ||
    m.status === 'cancelled' ||
    m.status === 'declined'
  ).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))

  const statusBadge = {
    scheduled: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    declined: 'bg-red-100 text-red-700',
    requested: 'bg-yellow-100 text-yellow-700',
  }
  const statusLabel = {
    scheduled: 'Запланирована',
    confirmed: 'Подтверждена',
    completed: 'Завершена',
    cancelled: 'Отменена',
    declined: 'Отклонена',
    requested: 'Запрошена',
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Загрузка...</div>

  const MeetingRow = ({ m, showActions }) => {
    const member = usersMap[m.member_id]
    const memberName = member?.name || `Участник #${m.member_id}`
    const loading = meetingAction[m.id]
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-center">
          <span className="text-xs font-bold text-indigo-600 leading-tight">
            {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
          </span>
          <span className="text-xs text-indigo-400">
            {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm">{memberName}</p>
          {m.agenda && <p className="text-xs text-gray-500 mt-0.5 truncate">{m.agenda}</p>}
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${statusBadge[m.status] || 'bg-gray-100 text-gray-600'}`}>
          {statusLabel[m.status] || m.status}
        </span>
        {showActions && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => onConfirm(m.id)}
              disabled={loading}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Принять
            </button>
            <button
              onClick={() => onDecline(m.id)}
              disabled={loading}
              className="text-xs border border-red-300 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Запросы на встречу
            <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">{requests.length}</span>
          </h3>
          <div className="space-y-3">
            {requests.map(m => <MeetingRow key={m.id} m={m} showActions />)}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Предстоящие</h3>
          <div className="space-y-3">
            {upcoming.map(m => <MeetingRow key={m.id} m={m} showActions={false} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Прошедшие</h3>
          <div className="space-y-3">
            {past.map(m => <MeetingRow key={m.id} m={m} showActions={false} />)}
          </div>
        </div>
      )}

      {meetings.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-gray-500">Встреч пока нет</p>
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
