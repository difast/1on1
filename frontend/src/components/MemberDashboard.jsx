import { useState, useEffect, useCallback } from 'react'
import { getTeams, getTeam, joinTeam, getMeetings, requestMeeting, getTasks, updateTask } from '../api/client'
import Layout from './Layout'

export default function MemberDashboard({ user, onLogout }) {
  const [team, setTeam] = useState(null)
  const [teamId, setTeamId] = useState(() => {
    try {
      const stored = localStorage.getItem('smart_user')
      return stored ? JSON.parse(stored).teamId || null : null
    } catch {
      return null
    }
  })
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Join form
  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  // Meetings
  const [meetings, setMeetings] = useState([])
  const [showRequestMeeting, setShowRequestMeeting] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTopic, setMeetingTopic] = useState('')
  const [meetingLoading, setMeetingLoading] = useState(false)

  // Tasks
  const [tasks, setTasks] = useState([])

  const saveTeamId = (id) => {
    setTeamId(id)
    try {
      const stored = localStorage.getItem('smart_user')
      const u = stored ? JSON.parse(stored) : {}
      localStorage.setItem('smart_user', JSON.stringify({ ...u, teamId: id }))
    } catch {}
  }

  const loadTeam = useCallback(async (id) => {
    if (!id) return
    setLoadingTeam(true)
    try {
      const { data } = await getTeam(id)
      setTeam(data)
    } catch {
      setTeam(null)
    } finally {
      setLoadingTeam(false)
    }
  }, [])

  const findUserTeam = useCallback(async () => {
    setLoadingTeam(true)
    try {
      const { data: allTeams } = await getTeams()
      for (const t of allTeams) {
        // Check if user is in this team's members by fetching team detail
        try {
          const { data: detail } = await getTeam(t.id)
          const isMember = (detail.members || []).some((m) => m.user_id === user.id)
          if (isMember) {
            saveTeamId(t.id)
            setTeam(detail)
            setLoadingTeam(false)
            return
          }
        } catch {}
      }
      // Not found in any team
      setTeam(null)
      setLoadingTeam(false)
    } catch {
      setTeam(null)
      setLoadingTeam(false)
    }
  }, [user.id])

  const loadMeetings = useCallback(async () => {
    if (!teamId) return
    try {
      const { data } = await getMeetings({ member_id: user.id })
      setMeetings(data || [])
    } catch {
      setMeetings([])
    }
  }, [teamId, user.id])

  const loadTasks = useCallback(async () => {
    try {
      const { data } = await getTasks({ assigned_to: user.id })
      setTasks(data || [])
    } catch {
      setTasks([])
    }
  }, [user.id])

  useEffect(() => {
    if (teamId) {
      loadTeam(teamId)
    } else {
      findUserTeam()
    }
  }, [])

  useEffect(() => {
    if (team) {
      loadMeetings()
      loadTasks()
    }
  }, [team])

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError('')
    try {
      await joinTeam({ invite_code: joinCode.trim(), user_id: user.id })
      // Find team id by matching invite_code
      const { data: allTeams } = await getTeams()
      const found = allTeams.find((t) => t.invite_code === joinCode.trim())
      if (found) {
        saveTeamId(found.id)
        setTeam(found)
      } else {
        // reload all to find
        await findUserTeam()
      }
    } catch (err) {
      setJoinError(err?.response?.data?.detail || 'Не удалось присоединиться. Проверьте код.')
    } finally {
      setJoinLoading(false)
    }
  }

  const handleRequestMeeting = async (e) => {
    e.preventDefault()
    if (!meetingDate) return
    setMeetingLoading(true)
    try {
      await requestMeeting({
        team_id: teamId,
        member_id: user.id,
        scheduled_date: meetingDate,
        topic: meetingTopic.trim() || undefined,
      })
      setMeetingDate('')
      setMeetingTopic('')
      setShowRequestMeeting(false)
      await loadMeetings()
    } catch {
      // silent
    } finally {
      setMeetingLoading(false)
    }
  }

  const handleToggleTask = async (task) => {
    try {
      await updateTask(task.id, { completed: !task.completed })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)))
    } catch {}
  }

  const now = new Date()
  const upcomingMeetings = meetings
    .filter((m) => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  const pastMeetings = meetings
    .filter((m) => new Date(m.scheduled_date) < now || m.status === 'completed')
    .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))

  const statusBadgeClass = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    requested: 'bg-yellow-100 text-yellow-700',
  }
  const statusLabel = {
    scheduled: 'Запланирована',
    completed: 'Завершена',
    cancelled: 'Отменена',
    requested: 'Запрошена',
  }

  // Loading state
  if (loadingTeam) {
    return (
      <Layout currentUser={user} onLogout={onLogout}>
        <div className="flex items-center justify-center py-24 text-gray-400">Загрузка...</div>
      </Layout>
    )
  }

  // No team: show join form
  if (!team) {
    return (
      <Layout currentUser={user} onLogout={onLogout}>
        <div className="max-w-md mx-auto mt-12">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
            <div className="text-5xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Присоединитесь к команде</h2>
            <p className="text-sm text-gray-500 mb-6">Введите код приглашения от вашего тимлида</p>
            <form onSubmit={handleJoin} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Код приглашения</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="ABC123"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  autoFocus
                />
              </div>
              {joinError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {joinError}
                </div>
              )}
              <button
                type="submit"
                disabled={joinLoading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {joinLoading ? 'Присоединение...' : 'Присоединиться'}
              </button>
            </form>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout currentUser={user} onLogout={onLogout}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Добро пожаловать, {user.name}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { key: 'overview', label: 'Обзор' },
            { key: 'meetings', label: 'Встречи' },
            { key: 'tasks', label: 'Задачи' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Team lead card */}
            {team.team_lead_id && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5">
                <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                  {(team.team_lead_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-0.5">Тимлид</p>
                  <p className="text-lg font-semibold text-gray-900">{team.team_lead_name || 'Тимлид'}</p>
                  {team.team_lead_title && (
                    <p className="text-sm text-gray-500">{team.team_lead_title}</p>
                  )}
                </div>
                <button
                  onClick={() => { setActiveTab('meetings'); setShowRequestMeeting(true) }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex-shrink-0"
                >
                  Запросить встречу
                </button>
              </div>
            )}

            {/* Upcoming meetings (next 2) */}
            {upcomingMeetings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  Ближайшие встречи
                </h3>
                <div className="space-y-3">
                  {upcomingMeetings.slice(0, 2).map((m) => (
                    <MeetingCard key={m.id} meeting={m} statusBadgeClass={statusBadgeClass} statusLabel={statusLabel} />
                  ))}
                </div>
              </div>
            )}

            {/* Team members */}
            {team.members && team.members.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  Участники команды
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {team.members.map((m) => (
                    <div key={m.user_id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 bg-indigo-400 rounded-full flex items-center justify-center text-white font-bold">
                          {(m.user_name || '?').charAt(0).toUpperCase()}
                        </div>
                        {m.is_registered && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{m.user_name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Meetings */}
        {activeTab === 'meetings' && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button
                onClick={() => setShowRequestMeeting(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                + Запросить встречу
              </button>
            </div>

            {upcomingMeetings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Предстоящие</h3>
                <div className="space-y-3">
                  {upcomingMeetings.map((m) => (
                    <MeetingCard key={m.id} meeting={m} statusBadgeClass={statusBadgeClass} statusLabel={statusLabel} />
                  ))}
                </div>
              </div>
            )}

            {pastMeetings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Прошедшие</h3>
                <div className="space-y-3">
                  {pastMeetings.map((m) => (
                    <MeetingCard key={m.id} meeting={m} statusBadgeClass={statusBadgeClass} statusLabel={statusLabel} />
                  ))}
                </div>
              </div>
            )}

            {meetings.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-gray-500">Нет встреч</p>
                <p className="text-sm text-gray-400 mt-1">Запросите первую встречу с тимлидом</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Tasks */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-gray-500">Нет задач</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4"
                  >
                    <button
                      onClick={() => handleToggleTask(task)}
                      className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        task.completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-indigo-500'
                      }`}
                    >
                      {task.completed && (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title || task.description}
                      </p>
                      {task.description && task.title && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
                      )}
                    </div>
                    {task.due_date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(task.due_date).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Request meeting */}
      {showRequestMeeting && (
        <Modal title="Запросить встречу" onClose={() => setShowRequestMeeting(false)}>
          <form onSubmit={handleRequestMeeting} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата и время</label>
              <input
                type="datetime-local"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тема <span className="text-gray-400">(необязательно)</span></label>
              <textarea
                value={meetingTopic}
                onChange={(e) => setMeetingTopic(e.target.value)}
                placeholder="О чём хотите поговорить?"
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRequestMeeting(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={meetingLoading}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {meetingLoading ? 'Отправка...' : 'Запросить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>
  )
}

function MeetingCard({ meeting, statusBadgeClass, statusLabel }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
      <div className="w-12 h-12 bg-indigo-50 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-indigo-600">
          {new Date(meeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">
          {new Date(meeting.scheduled_date).toLocaleString('ru-RU', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {meeting.topic && <p className="text-xs text-gray-500 mt-0.5 truncate">{meeting.topic}</p>}
      </div>
      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${statusBadgeClass[meeting.status] || 'bg-gray-100 text-gray-600'}`}>
        {statusLabel[meeting.status] || meeting.status}
      </span>
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
