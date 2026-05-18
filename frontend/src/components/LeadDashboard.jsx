import { useState, useEffect, useCallback } from 'react'
import { createTeam, getTeams, getTeam, createMeeting, createUser, addMember } from '../api/client'
import Layout from './Layout'

export default function LeadDashboard({ user, onLogout }) {
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [loadingTeam, setLoadingTeam] = useState(false)

  // Modals
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleMember, setScheduleMember] = useState(null)

  // Form state
  const [newTeamName, setNewTeamName] = useState('')
  const [newMember, setNewMember] = useState({ name: '', email: '', title: '', role: 'member' })
  const [scheduleDate, setScheduleDate] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    loadTeams()
  }, [user.id])

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetail(selectedTeamId)
    }
  }, [selectedTeamId])

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
    <Layout currentUser={user} onLogout={onLogout}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Мои команды</h1>
            <p className="text-sm text-gray-500 mt-0.5">Добро пожаловать, {user.name}</p>
          </div>
          <button
            onClick={() => setShowCreateTeam(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Создать команду
          </button>
        </div>

        {/* Team tabs */}
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
                    {teamDetail.members.map((member) => (
                      <div
                        key={member.user_id}
                        className={`bg-white rounded-2xl border-2 p-5 ${statusBorder[member.status_color] || 'border-gray-200'}`}
                      >
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
                          className="w-full bg-indigo-600 text-white text-sm py-2 rounded-xl hover:bg-indigo-700 transition-colors"
                        >
                          Запланировать встречу
                        </button>
                      </div>
                    ))}
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
      </div>

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
