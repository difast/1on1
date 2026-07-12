import { useState, useEffect, useCallback, useRef } from 'react'
import EmptyState from './EmptyState'
import { getTeams, getTeam, joinTeam, getMeetings, requestMeeting, getTasks, createTask, updateTask, deleteTask, getNotes, createNote, updateNote, deleteNote, startCall, uploadRecording, getTranscript, updateMeeting, checkInArrive, checkInLeave, getTodayCheckin } from '../api/client'
import Layout from './Layout'
import MemberAnalytics from './MemberAnalytics'
import MeetingCalendar from './MeetingCalendar'
import TaskStatusSelect from './TaskStatusSelect'
import QuickWidget from './QuickWidget'
import { toast } from '../lib/ui'
import JitsiCall from './JitsiCall'
import MoodPrompt from './MoodPrompt'
import TaskAIHelper from './TaskAIHelper'
import SubtaskList from './SubtaskList'
import UserCard from './UserCard'

export default function MemberDashboard({ user, onLogout, onUserUpdate }) {
  const [team, setTeam] = useState(null)
  const [teamId, setTeamId] = useState(() => {
    try { const s = localStorage.getItem('smart_user'); return s ? JSON.parse(s).teamId || null : null }
    catch { return null }
  })
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [viewUserCard, setViewUserCard] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const [checkinLoading, setCheckinLoading] = useState(false)

  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  const [meetings, setMeetings] = useState([])
  const [showRequestMeeting, setShowRequestMeeting] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTopic, setMeetingTopic] = useState('')
  const [meetingLoading, setMeetingLoading] = useState(false)

  const [tasks, setTasks] = useState([])
  const [taskFilter, setTaskFilter] = useState('all')
  const [meetingFilter, setMeetingFilter] = useState('all')
  const [selfTaskForm, setSelfTaskForm] = useState({ title: '', due_date: '', open: false, loading: false })
  const [editingTask, setEditingTask] = useState(null)
  const [subtaskRefresh, setSubtaskRefresh] = useState({})

  // Notes state
  const [notes, setNotes] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [expandedMeetingNotes, setExpandedMeetingNotes] = useState(new Set())
  const [meetingNoteDrafts, setMeetingNoteDrafts] = useState({})
  const [savingMeetingNote, setSavingMeetingNote] = useState({})
  const [callLoading, setCallLoading] = useState({})
  const [uploadLoading, setUploadLoading] = useState({})
  const [uploadDone, setUploadDone] = useState({})
  const fileInputRefs = useRef({})
  const [activeCall, setActiveCall] = useState(null)

  useEffect(() => {
    getTodayCheckin(user.id).then(r => setCheckin(r.data)).catch(() => {})
  }, [user.id])

  const handleArrive = async () => {
    setCheckinLoading(true)
    try { const r = await checkInArrive(user.id); setCheckin(r.data) } catch {}
    finally { setCheckinLoading(false) }
  }
  const handleLeave = async () => {
    setCheckinLoading(true)
    try { const r = await checkInLeave(user.id); setCheckin(r.data) } catch {}
    finally { setCheckinLoading(false) }
  }

  const handleStartCall = async (meetingId) => {
    setCallLoading(prev => ({ ...prev, [meetingId]: true }))
    try {
      const { data } = await startCall(meetingId, user.id)
      const roomName = data.room_name || data.room_url?.split('/').pop()
      setActiveCall({ room_name: roomName, room_url: data.room_url, meeting_id: meetingId })
    } catch { toast('Не удалось начать созвон', 'error') }
    finally { setCallLoading(prev => ({ ...prev, [meetingId]: false })) }
  }

  const handleUploadRecording = async (meetingId, file) => {
    if (!file) return
    setUploadLoading(prev => ({ ...prev, [meetingId]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadRecording(meetingId, formData)
      setUploadDone(prev => ({ ...prev, [meetingId]: true }))
      const poll = async (attempts = 0) => {
        if (attempts > 15) return
        setTimeout(async () => {
          try {
            const { data } = await getTranscript(meetingId)
            if (data.ai_summary) {
              setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ai_summary: data.ai_summary, call_transcript: data.transcript } : m))
            } else { poll(attempts + 1) }
          } catch {}
        }, 12000)
      }
      poll()
    } catch { toast('Не удалось загрузить запись', 'error') }
    finally { setUploadLoading(prev => ({ ...prev, [meetingId]: false })) }
  }

  const saveTeamId = (id) => {
    setTeamId(id)
    try {
      const s = localStorage.getItem('smart_user')
      const u = s ? JSON.parse(s) : {}
      localStorage.setItem('smart_user', JSON.stringify({ ...u, teamId: id }))
    } catch {}
  }

  const loadTeam = useCallback(async (id) => {
    if (!id) return
    setLoadingTeam(true)
    try { const { data } = await getTeam(id); setTeam(data) }
    catch { setTeam(null) } finally { setLoadingTeam(false) }
  }, [])

  const findUserTeam = useCallback(async () => {
    setLoadingTeam(true)
    try {
      const { data: allTeams } = await getTeams()
      for (const t of allTeams) {
        try {
          const { data: detail } = await getTeam(t.id)
          if ((detail.members || []).some(m => m.user_id === user.id)) {
            saveTeamId(t.id); setTeam(detail); setLoadingTeam(false); return
          }
        } catch {}
      }
      setTeam(null); setLoadingTeam(false)
    } catch { setTeam(null); setLoadingTeam(false) }
  }, [user.id])

  const loadMeetings = useCallback(async () => {
    if (!teamId) return
    try { const { data } = await getMeetings({ member_id: user.id }); setMeetings((data || []).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))) }
    catch { setMeetings([]) }
  }, [teamId, user.id])

  const loadTasks = useCallback(async () => {
    try { const { data } = await getTasks({ assigned_to: user.id }); setTasks((data || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))) }
    catch { setTasks([]) }
  }, [user.id])

  const loadNotes = useCallback(async () => {
    try {
      const { data } = await getNotes(user.id)
      setNotes(data || [])
      // Populate meeting note drafts from loaded notes
      const drafts = {}
      for (const n of (data || [])) {
        if (n.meeting_id) drafts[n.meeting_id] = n.content
      }
      setMeetingNoteDrafts(drafts)
    } catch { setNotes([]) }
  }, [user.id])

  useEffect(() => { if (teamId) loadTeam(teamId); else findUserTeam() }, [])
  useEffect(() => { if (team) { loadMeetings(); loadTasks(); loadNotes() } }, [team])

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    setJoinLoading(true); setJoinError('')
    try {
      await joinTeam({ invite_code: joinCode.trim(), user_id: user.id })
      const { data: allTeams } = await getTeams()
      const found = allTeams.find(t => t.invite_code === joinCode.trim())
      if (found) { saveTeamId(found.id); setTeam(found) }
      else await findUserTeam()
    } catch (err) {
      setJoinError(err?.response?.data?.detail || 'Не удалось присоединиться. Проверьте код.')
    } finally { setJoinLoading(false) }
  }

  const handleRequestMeeting = async (e) => {
    e.preventDefault()
    if (!meetingDate) return
    setMeetingLoading(true)
    try {
      await requestMeeting({ team_id: teamId, member_id: user.id, scheduled_date: meetingDate, topic: meetingTopic.trim() || undefined })
      setMeetingDate(''); setMeetingTopic(''); setShowRequestMeeting(false)
      await loadMeetings()
    } catch {} finally { setMeetingLoading(false) }
  }

  // Task status update
  const handleUpdateTaskStatus = async (task, newStatus) => {
    try {
      await updateTask(task.id, { status: newStatus, completed: newStatus === 'done' })
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t))
    } catch {}
  }

  const handleUpdateMeetingStatus = async (meetingId, newStatus) => {
    try {
      await updateMeeting(meetingId, { status: newStatus })
      setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: newStatus } : m))
    } catch {}
  }

  const handleCreateSelfTask = async (e) => {
    e.preventDefault()
    if (!selfTaskForm.title.trim()) return
    setSelfTaskForm(f => ({ ...f, loading: true }))
    try {
      const { data } = await createTask({
        title: selfTaskForm.title.trim(),
        due_date: selfTaskForm.due_date || null,
        team_id: null,
        assigned_to: user.id,
        assigned_by: user.id,
      })
      setTasks(prev => [data, ...prev])
      setSelfTaskForm({ title: '', due_date: '', open: false, loading: false })
    } catch { setSelfTaskForm(f => ({ ...f, loading: false })) }
  }

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch {}
  }

  // Meeting notes via API
  const toggleMeetingNote = (meetingId) => {
    setExpandedMeetingNotes(prev => {
      const next = new Set(prev)
      next.has(meetingId) ? next.delete(meetingId) : next.add(meetingId)
      return next
    })
  }

  const handleSaveMeetingNote = async (meetingId) => {
    const content = meetingNoteDrafts[meetingId] || ''
    if (!content.trim()) return
    setSavingMeetingNote(prev => ({ ...prev, [meetingId]: true }))
    try {
      const existing = notes.find(n => n.meeting_id === meetingId)
      if (existing) {
        await updateNote(existing.id, { content })
        setNotes(prev => prev.map(n => n.id === existing.id ? { ...n, content } : n))
      } else {
        const { data: newNote } = await createNote({ user_id: user.id, content, meeting_id: meetingId })
        setNotes(prev => [newNote, ...prev])
      }
    } catch {} finally { setSavingMeetingNote(prev => ({ ...prev, [meetingId]: false })) }
  }

  // Free-form notes
  const handleCreateNote = async () => {
    if (!newNoteText.trim()) return
    setNoteLoading(true)
    try {
      const { data } = await createNote({ user_id: user.id, content: newNoteText.trim() })
      setNotes(prev => [data, ...prev])
      setNewNoteText('')
    } catch {} finally { setNoteLoading(false) }
  }

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch {}
  }

  const now = new Date()
  const upcomingMeetings = meetings
    .filter(m => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  const pastMeetings = meetings
    .filter(m => new Date(m.scheduled_date) < now || m.status === 'completed')
    .sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date))

  const meetingFilterCounts = {
    all: meetings.filter(m => m.status !== 'requested').length,
    scheduled: meetings.filter(m => m.status === 'scheduled').length,
    confirmed: meetings.filter(m => m.status === 'confirmed').length,
    in_progress: meetings.filter(m => m.status === 'in_progress').length,
    completed: meetings.filter(m => m.status === 'completed').length,
    rescheduled: meetings.filter(m => m.is_rescheduled && !['cancelled','declined'].includes(m.status)).length,
    cancelled: meetings.filter(m => m.status === 'cancelled').length,
    declined: meetings.filter(m => m.status === 'declined').length,
  }

  const filteredMeetings = meetingFilter === 'all'
    ? meetings.filter(m => m.status !== 'requested')
    : meetingFilter === 'rescheduled'
    ? meetings.filter(m => m.is_rescheduled && !['cancelled','declined'].includes(m.status))
    : meetings.filter(m => m.status === meetingFilter)

  const freeNotes = notes.filter(n => !n.meeting_id)

  const statusBadge = {
    scheduled: 'badge badge-blue', completed: 'badge badge-green',
    in_progress: 'badge badge-green', cancelled: 'badge badge-red',
    requested: 'badge badge-amber', confirmed: 'badge badge-green',
  }
  const statusLabel = {
    scheduled: 'Запланирована', completed: 'Завершена',
    in_progress: 'Идёт созвон', cancelled: 'Отменена',
    requested: 'Запрошена', confirmed: 'Подтверждена',
  }

  if (loadingTeam) {
    return (
      <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <div className="spinner" />
        </div>
      </Layout>
    )
  }

  if (!team) {
    return (
      <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate}>
        <div style={{ maxWidth: 420, margin: '48px auto' }}>
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <div className="empty-icon" style={{ margin: '0 auto 20px' }}>◎</div>
            <h2 style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Присоединитесь к команде
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              Введите код приглашения от вашего тимлида
            </p>
            <form onSubmit={handleJoin} style={{ textAlign: 'left' }}>
              <div className="form-group">
                {/* label tied to input (htmlFor/id) so screen readers announce it */}
                <label className="form-label" htmlFor="join-code">Код приглашения</label>
                <input
                  id="join-code"
                  type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)}
                  placeholder="ABC123" className="input"
                  style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  autoFocus
                />
                {/* Prevent the dead-end feeling for members who have no code yet */}
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  Нет кода? Попросите тимлида отправить вам приглашение.
                </p>
              </div>
              {joinError && (
                <div style={{
                  background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5',
                  color: 'var(--color-danger)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', fontSize: 13, marginBottom: 14,
                }}>
                  {joinError}
                </div>
              )}
              <button type="submit" disabled={joinLoading} className="btn btn-accent" style={{ width: '100%' }}>
                {joinLoading ? 'Присоединение...' : 'Присоединиться'}
              </button>
            </form>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <>
    <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate} onJoinCall={(info) => setActiveCall(info)}
      bannerTasks={tasks}
      bannerTeamId={team?.id}
      onNavigate={type => {
        if (type === 'new_task' || type === 'tasks') setActiveTab('tasks')
        else if (type === 'meetings' || ['meeting_scheduled','meeting_confirmed','meeting_requested','meeting_declined'].includes(type)) setActiveTab('meetings')
      }}
>
      <div style={{ maxWidth: 900, width: '100%' }}>
        <div className="page-header" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>{team.name}</h1>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Добро пожаловать, {user.name}</p>
          </div>
          <div className="page-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {checkin?.arrived_at && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Пришёл: {new Date(checkin.arrived_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                {checkin.left_at && ` · Ушёл: ${new Date(checkin.left_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            )}
            {!checkin?.arrived_at ? (
              <button onClick={handleArrive} disabled={checkinLoading} className="btn btn-accent btn-sm">
                {checkinLoading ? '...' : '✓ Пришёл'}
              </button>
            ) : !checkin?.left_at ? (
              <button onClick={handleLeave} disabled={checkinLoading} style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', cursor: 'pointer' }}>
                {checkinLoading ? '...' : 'Ушёл'}
              </button>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 12px' }}>День завершён</span>
            )}
          </div>
        </div>

        <div className="tabs" style={{ width: 'fit-content', marginBottom: 24 }}>
          {[
            { key: 'overview', label: 'Обзор' },
            { key: 'meetings', label: 'Встречи' },
            { key: 'tasks', label: 'Задачи' },
            { key: 'notes', label: 'Заметки' },
            { key: 'analytics', label: 'Аналитика' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`tab${activeTab === tab.key ? ' active' : ''}`}>
              {tab.label}
              {tab.key === 'notes' && freeNotes.length > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }}>{freeNotes.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {team.team_lead_id && (() => {
              const lead = (team.members || []).find(m => m.user_id === team.team_lead_id)
              return (
                <div className="card card-accent" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div
                    className={`avatar avatar-xl ${lead?.user_avatar_url ? '' : 'avatar-accent'}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setViewUserCard({ name: team.team_lead_name, role: 'team_lead', user_title: team.team_lead_title, user_avatar_url: lead?.user_avatar_url })}
                  >
                    {lead?.user_avatar_url
                      ? <img src={lead.user_avatar_url} alt="lead" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : (team.team_lead_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="label" style={{ marginBottom: 4 }}>Тимлид</p>
                    <p
                      style={{ fontWeight: 600, fontSize: 17, color: 'var(--color-text-primary)', cursor: 'pointer' }}
                      onClick={() => setViewUserCard({ name: team.team_lead_name, role: 'team_lead', user_title: team.team_lead_title, user_avatar_url: lead?.user_avatar_url })}
                    >
                      {team.team_lead_name || 'Тимлид'}
                    </p>
                    {team.team_lead_title && (
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{team.team_lead_title}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setActiveTab('meetings'); setShowRequestMeeting(true) }}
                    className="btn btn-accent btn-sm"
                    style={{ flexShrink: 0 }}
                  >
                    Запросить встречу
                  </button>
                </div>
              )
            })()}

            {upcomingMeetings.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Ближайшие встречи</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingMeetings.slice(0, 2).map(m => (
                    <div key={m.id} className="meeting-item" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 46, height: 46, borderRadius: 'var(--radius-md)',
                          background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
                            {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--blue-400)' }}>
                            {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
                            {new Date(m.scheduled_date).toLocaleString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {m.topic && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.topic}</p>}
                          {m.context_from_last && (
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                              {m.context_from_last}
                            </p>
                          )}
                        </div>
                        <span className={`badge ${statusBadge[m.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
                          {statusLabel[m.status] || m.status}
                        </span>
                        <button
                          onClick={() => handleStartCall(m.id)}
                          disabled={callLoading[m.id]}
                          style={{ fontSize: 12, fontWeight: 600, background: '#0061ff', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: '5px 10px', flexShrink: 0, opacity: callLoading[m.id] ? 0.6 : 1 }}
                        >
                          {callLoading[m.id] ? '...' : 'Созвон'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastMeetings.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Последняя встреча с тимлидом</p>
                {(() => {
                  const m = pastMeetings[0]
                  return (
                    <div className="meeting-item" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 'var(--radius-md)',
                        background: '#f0fdf4', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #bbf7d0',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', lineHeight: 1.2 }}>
                          {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                        </span>
                        <span style={{ fontSize: 10, color: '#86efac' }}>
                          {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
                          {new Date(m.scheduled_date).toLocaleString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                        {m.topic && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.topic}</p>}
                      </div>
                      <span className={`badge ${statusBadge[m.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
                        {statusLabel[m.status] || m.status}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}

            {team.members && team.members.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Участники команды</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 10 }}>
                  {[...team.members].filter(m => m.user_id !== user.id).sort((a, b) => {
                    if (!a.last_meeting_date) return -1
                    if (!b.last_meeting_date) return 1
                    return new Date(a.last_meeting_date) - new Date(b.last_meeting_date)
                  }).map(m => (
                    <div key={m.user_id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div className={`avatar avatar-sm ${m.user_avatar_url ? '' : 'avatar-accent'}`}>
                          {m.user_avatar_url
                            ? <img src={m.user_avatar_url} alt={m.user_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : (m.user_name || '?').charAt(0).toUpperCase()}
                        </div>
                        {m.is_registered && (
                          <div style={{
                            position: 'absolute', bottom: -1, right: -1,
                            width: 9, height: 9, borderRadius: '50%',
                            background: m.is_online ? 'var(--color-success)' : 'var(--gray-300)',
                            border: '2px solid var(--color-surface)',
                            transition: 'background 0.3s',
                          }} title={m.is_online ? 'Онлайн' : 'Не в сети'} />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 500, fontSize: 13, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.user_name}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Meetings — calendar view */}
        {activeTab === 'meetings' && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={() => setShowRequestMeeting(true)} className="btn btn-accent btn-sm">
                + Запросить встречу
              </button>
            </div>
            {/* Meeting filter bar */}
            <div className="tabs" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[
                { key: 'all', label: 'Все' },
                { key: 'scheduled', label: 'Запланировано' },
                { key: 'confirmed', label: 'Подтверждено' },
                { key: 'in_progress', label: 'Идёт' },
                { key: 'completed', label: 'Завершено' },
                { key: 'rescheduled', label: 'Перенесено' },
                { key: 'cancelled', label: 'Отменено' },
                { key: 'declined', label: 'Отклонено' },
              ].filter(f => f.key === 'all' || meetingFilterCounts[f.key] > 0).map(f => (
                <button
                  key={f.key}
                  onClick={() => setMeetingFilter(f.key)}
                  className={meetingFilter === f.key ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
                >
                  {f.label}
                  {meetingFilterCounts[f.key] > 0 && f.key !== 'all' && (
                    <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, background: meetingFilter === f.key ? 'rgba(255,255,255,0.25)' : 'var(--color-border)', borderRadius: 10, padding: '0 5px' }}>
                      {meetingFilterCounts[f.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <MeetingCalendar
              meetings={filteredMeetings}
              renderCard={(m) => {
                const isPast = new Date(m.scheduled_date) < new Date()
                const isExpanded = expandedMeetingNotes.has(m.id)
                const draft = meetingNoteDrafts[m.id] ?? ''
                const hasNote = notes.some(n => n.meeting_id === m.id)
                return (
                  <div key={m.id} className="meeting-item" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 'var(--radius-md)',
                        background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
                          {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--blue-400)' }}>
                          {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
                          {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { weekday: 'long' })}
                        </p>
                        {(m.topic || m.agenda) && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.topic || m.agenda}
                          </p>
                        )}
                      </div>
                      <span className={`badge ${statusBadge[m.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
                        {statusLabel[m.status] || m.status}
                      </span>
                      {!['completed', 'cancelled', 'declined'].includes(m.status) && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
                          <button onClick={() => handleUpdateMeetingStatus(m.id, 'completed')} style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', padding: '3px 8px' }}>Провели</button>
                          <button onClick={() => handleUpdateMeetingStatus(m.id, 'cancelled')} style={{ fontSize: 11, fontWeight: 600, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: 6, cursor: 'pointer', padding: '3px 8px' }}>Отменить</button>
                        </div>
                      )}
                      {!isPast && (
                        <button
                          onClick={() => handleStartCall(m.id)}
                          disabled={callLoading[m.id]}
                          style={{ fontSize: 12, fontWeight: 600, background: '#0061ff', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: '5px 10px', flexShrink: 0, opacity: callLoading[m.id] ? 0.6 : 1 }}
                        >
                          {callLoading[m.id] ? '...' : 'Созвон'}
                        </button>
                      )}
                      {isPast && (
                        <button
                          onClick={() => toggleMeetingNote(m.id)}
                          style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? 'var(--color-accent)' : 'var(--color-text-secondary)', flexShrink: 0, padding: '4px 6px' }}
                        >
                          {isExpanded ? '↓ Заметки' : '→ Заметки'}{hasNote ? ' ·' : ''}
                        </button>
                      )}
                      {isPast && !m.ai_summary && (
                        <>
                          <input
                            ref={el => fileInputRefs.current[m.id] = el}
                            type="file"
                            accept="audio/*,video/*"
                            style={{ display: 'none' }}
                            onChange={e => { if (e.target.files[0]) handleUploadRecording(m.id, e.target.files[0]) }}
                          />
                          <button
                            onClick={() => fileInputRefs.current[m.id]?.click()}
                            disabled={uploadLoading[m.id] || uploadDone[m.id]}
                            title="Загрузить запись созвона для AI-анализа"
                            style={{ fontSize: 12, fontWeight: 600, background: uploadDone[m.id] ? '#f0fdf4' : 'var(--color-surface)', color: uploadDone[m.id] ? 'var(--color-success)' : 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: uploadDone[m.id] ? 'default' : 'pointer', padding: '5px 9px', flexShrink: 0 }}
                          >
                            {uploadLoading[m.id] ? '...' : uploadDone[m.id] ? '✓' : 'Запись'}
                          </button>
                        </>
                      )}
                      {isPast && m.ai_summary && (
                        <span title={m.ai_summary} style={{ fontSize: 11, fontWeight: 600, background: 'var(--blue-50)', color: 'var(--color-accent)', border: '1px solid var(--blue-200)', borderRadius: 'var(--radius-md)', padding: '3px 8px', flexShrink: 0, cursor: 'default' }}>✨ AI</span>
                      )}
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                        <textarea
                          value={draft}
                          onChange={e => setMeetingNoteDrafts(prev => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder="Заметки к встрече (каждая строка — отдельный пункт)..."
                          className="input"
                          style={{ resize: 'vertical', minHeight: 72, fontSize: 13 }}
                        />
                        <button
                          onClick={() => handleSaveMeetingNote(m.id)}
                          disabled={savingMeetingNote[m.id]}
                          className="btn btn-accent btn-sm"
                          style={{ marginTop: 6 }}
                        >
                          {savingMeetingNote[m.id] ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    )}
                    {m.ai_summary && (
                      <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--blue-50)', borderRadius: 8, border: '1px solid var(--blue-200)', borderLeft: '3px solid var(--color-accent)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>✨ AI Резюме</p>
                        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.7, margin: 0 }}>{m.ai_summary}</p>
                      </div>
                    )}
                    {!isExpanded && hasNote && (() => {
                      const noteContent = notes.find(n => n.meeting_id === m.id)?.content || ''
                      const lines = noteContent.split('\n').filter(l => l.trim())
                      return lines.length > 0 ? (
                        <ul style={{ marginTop: 8, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {lines.map((line, i) => (
                            <li key={i} style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{line}</li>
                          ))}
                        </ul>
                      ) : null
                    })()}
                  </div>
                )
              }}
            />
            {meetings.length === 0 && (
              <EmptyState title="Нет встреч" desc="Запросите первую встречу с тимлидом" style={{ marginTop: 16 }} />
            )}
          </div>
        )}

        {/* Tab: Tasks */}
        {activeTab === 'tasks' && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            {/* Self-task form */}
            {selfTaskForm.open ? (
              <form onSubmit={handleCreateSelfTask} className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  type="text"
                  value={selfTaskForm.title}
                  onChange={e => setSelfTaskForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Название задачи"
                  autoFocus
                  className="input"
                />
                <input
                  type="date"
                  value={selfTaskForm.due_date}
                  onChange={e => setSelfTaskForm(f => ({ ...f, due_date: e.target.value }))}
                  className="input input-sm"
                  style={{ maxWidth: 200 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setSelfTaskForm(f => ({ ...f, open: false }))} className="btn btn-secondary btn-sm">Отмена</button>
                  <button type="submit" disabled={selfTaskForm.loading} className="btn btn-accent btn-sm">
                    {selfTaskForm.loading ? '...' : 'Добавить'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setSelfTaskForm(f => ({ ...f, open: true }))} className="btn btn-accent btn-sm">+ Добавить задачу</button>
              </div>
            )}

            {tasks.length === 0 ? (
              <EmptyState title="Нет задач" desc="Создайте задачу или дождитесь задач от тимлида" />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[['all', 'Все'], ['open', 'Открытые'], ['done', 'Выполненные']].map(([f, label]) => (
                    <button key={f} onClick={() => setTaskFilter(f)}
                      className={taskFilter === f ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>
                      {label}
                    </button>
                  ))}
                </div>
              {tasks.filter(t => taskFilter === 'all' ? true : taskFilter === 'open' ? !t.completed : t.completed).length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', padding: '12px 0' }}>
                  {taskFilter === 'open' ? 'Нет открытых задач' : 'Нет выполненных задач'}
                </p>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.filter(t => taskFilter === 'all' ? true : taskFilter === 'open' ? !t.completed : t.completed).map(task => {
                  const isSelf = task.assigned_by === user.id
                  return (
                    <div key={task.id} className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {editingTask?.id === task.id ? (
                        <form onSubmit={async e => {
                          e.preventDefault()
                          try {
                            await updateTask(task.id, { title: editingTask.title, due_date: editingTask.due_date || null })
                            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, title: editingTask.title, due_date: editingTask.due_date || null } : t))
                            setEditingTask(null)
                          } catch {}
                        }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input autoFocus value={editingTask.title} onChange={e => setEditingTask(p => ({ ...p, title: e.target.value }))} className="input input-sm" placeholder="Название задачи" />
                          <input type="date" value={editingTask.due_date} onChange={e => setEditingTask(p => ({ ...p, due_date: e.target.value }))} className="input input-sm" style={{ maxWidth: 180 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="submit" className="btn btn-accent btn-sm">Сохранить</button>
                            <button type="button" onClick={() => setEditingTask(null)} className="btn btn-secondary btn-sm">Отмена</button>
                          </div>
                        </form>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 500, fontSize: 14, color: task.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)', textDecoration: task.completed ? 'line-through' : 'none' }}>
                              {task.title || task.description}
                            </p>
                            {task.due_date && (() => {
                              const overdue = task.status !== 'done' && new Date(task.due_date) < new Date(new Date().toDateString())
                              return (
                                <p style={{ fontSize: 12, color: overdue ? 'var(--color-danger)' : 'var(--color-text-muted)', marginTop: 2, fontWeight: overdue ? 600 : 400 }}>
                                  {overdue ? 'Просрочено · ' : 'до '}{new Date(task.due_date).toLocaleDateString('ru-RU')}
                                </p>
                              )
                            })()}
                          </div>
                          <TaskStatusSelect status={task.status || 'in_progress'} onChange={(newStatus) => handleUpdateTaskStatus(task, newStatus)} canMarkDone={true} />
                          <button onClick={() => setEditingTask({ id: task.id, title: task.title || task.description || '', due_date: task.due_date?.slice(0, 10) || '' })}
                            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 4 }} title="Редактировать" aria-label="Редактировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                          {isSelf && (
                            <button onClick={() => handleDeleteTask(task.id)}
                              style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: 4, lineHeight: 1, transition: 'color 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                              title="Удалить">✕</button>
                          )}
                          {!task.completed && (
                            <TaskAIHelper
                              task={task}
                              role="member"
                              onSubtasksAdded={() => setSubtaskRefresh(p => ({ ...p, [task.id]: (p[task.id] || 0) + 1 }))}
                            />
                          )}
                        </div>
                      )}
                      <SubtaskList
                        taskId={task.id}
                        refreshKey={subtaskRefresh[task.id] || 0}
                        onAllDone={() => {
                          updateTask(task.id, { status: 'done', completed: true }).catch(() => {})
                          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', completed: true } : t))
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              )}
              </>
            )}
          </div>
        )}

        {/* Tab: Notes */}
        {activeTab === 'notes' && (
          <div style={{ maxWidth: 640, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* General notes */}
            <div>
              <p className="label" style={{ marginBottom: 12 }}>Общие заметки</p>
              <div className="card" style={{ padding: 20, marginBottom: 10 }}>
                <textarea
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="Запишите мысль, идею или наблюдение..."
                  className="input"
                  style={{ resize: 'vertical', minHeight: 88, fontSize: 14 }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreateNote() }}
                />
                <button
                  onClick={handleCreateNote}
                  disabled={noteLoading || !newNoteText.trim()}
                  className="btn btn-accent btn-sm"
                  style={{ marginTop: 10 }}
                >
                  {noteLoading ? 'Сохранение...' : '+ Добавить заметку'}
                </button>
              </div>
              {freeNotes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {freeNotes.map(note => (
                    <div key={note.id} className="card" style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note.content}</p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                          {new Date(note.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: 4, lineHeight: 1, transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                        title="Удалить"
                      >✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <p className="empty-title" style={{ fontSize: 14 }}>Нет общих заметок</p>
                  {/* Empty state should invite the first action, not read as a blank/bug */}
                  <p className="empty-desc">Запишите мысль или вопрос к встрече — заметки видите только вы.</p>
                </div>
              )}
            </div>

            {/* Meeting notes */}
            <div>
              <p className="label" style={{ marginBottom: 12 }}>Заметки по встречам</p>
              {notes.filter(n => n.meeting_id).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notes.filter(n => n.meeting_id).map(note => {
                    const meeting = meetings.find(m => m.id === note.meeting_id)
                    const noteLines = (note.content || '').split('\n').filter(l => l.trim())
                    return (
                      <div key={note.id} className="card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: noteLines.length > 0 ? 8 : 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            {meeting ? new Date(meeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' }) : 'Встреча'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            {new Date(note.created_at).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                        {noteLines.length > 0 && (
                          <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {noteLines.map((line, i) => (
                              <li key={i} style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '20px 0' }}>
                  <p className="empty-title" style={{ fontSize: 14 }}>Нет заметок по встречам</p>
                  <p className="empty-desc">Добавляйте заметки к прошедшим встречам во вкладке «Встречи»</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Analytics */}
        {activeTab === 'analytics' && <MemberAnalytics user={user} />}

      </div>

      <QuickWidget
        nextMeeting={upcomingMeetings[0] || null}
        nextTask={tasks.filter(t => t.status !== 'done').sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return new Date(a.due_date) - new Date(b.due_date)
        })[0] || null}
        onGoMeetings={() => setActiveTab('meetings')}
        onGoTasks={() => setActiveTab('tasks')}
      />

      {showRequestMeeting && (
        <Modal title="Запросить встречу" onClose={() => setShowRequestMeeting(false)}>
          <form onSubmit={handleRequestMeeting}>
            <div className="form-group">
              <label className="form-label">Дата и время</label>
              <input type="datetime-local" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="input" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">
                Тема <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span>
              </label>
              <textarea
                value={meetingTopic} onChange={e => setMeetingTopic(e.target.value)}
                placeholder="О чём хотите поговорить?"
                className="input" style={{ resize: 'none', minHeight: 80 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setShowRequestMeeting(false)} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={meetingLoading} className="btn btn-accent" style={{ flex: 1 }}>
                {meetingLoading ? 'Отправка...' : 'Запросить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Layout>

    {activeCall && (
      <JitsiCall
        roomName={activeCall.room_name}
        userName={user.name || user.email}
        meetingId={activeCall.meeting_id}
        onClose={() => setActiveCall(null)}
      />
    )}
    <MoodPrompt teamId={teamId} />
    {viewUserCard && <UserCard user={viewUserCard} onClose={() => setViewUserCard(null)} />}
    </>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={onClose} className="modal-close" aria-label="Закрыть">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
