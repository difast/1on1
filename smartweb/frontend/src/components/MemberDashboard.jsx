import { useState, useEffect, useCallback } from 'react'
import { getTeams, getTeam, joinTeam, getMeetings, requestMeeting, getTasks, updateTask, getNotes, createNote, updateNote, deleteNote } from '../api/client'
import Layout from './Layout'
import MemberAnalytics from './MemberAnalytics'

const STATUS_CYCLE = { in_progress: 'blocked', blocked: 'review', review: 'done', done: 'in_progress' }
const STATUS_LABEL = { in_progress: 'В работе', blocked: 'Блокер', review: 'Ревью', done: 'Готово' }
const STATUS_CLS   = { in_progress: 'badge-blue', blocked: 'badge-red', review: 'badge-amber', done: 'badge-green' }

export default function MemberDashboard({ user, onLogout, onUserUpdate }) {
  const [team, setTeam] = useState(null)
  const [teamId, setTeamId] = useState(() => {
    try { const s = localStorage.getItem('smart_user'); return s ? JSON.parse(s).teamId || null : null }
    catch { return null }
  })
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [joinCode, setJoinCode] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  const [meetings, setMeetings] = useState([])
  const [showRequestMeeting, setShowRequestMeeting] = useState(false)
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTopic, setMeetingTopic] = useState('')
  const [meetingLoading, setMeetingLoading] = useState(false)

  const [tasks, setTasks] = useState([])

  // Notes state
  const [notes, setNotes] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [expandedMeetingNotes, setExpandedMeetingNotes] = useState(new Set())
  const [meetingNoteDrafts, setMeetingNoteDrafts] = useState({})
  const [savingMeetingNote, setSavingMeetingNote] = useState({})

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
    try { const { data } = await getMeetings({ member_id: user.id }); setMeetings(data || []) }
    catch { setMeetings([]) }
  }, [teamId, user.id])

  const loadTasks = useCallback(async () => {
    try { const { data } = await getTasks({ assigned_to: user.id }); setTasks(data || []) }
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

  // Task status cycling
  const handleCycleTaskStatus = async (task) => {
    const nextStatus = STATUS_CYCLE[task.status || 'in_progress'] || 'in_progress'
    const completed = nextStatus === 'done'
    try {
      await updateTask(task.id, { status: nextStatus, completed })
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus, completed } : t))
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

  const freeNotes = notes.filter(n => !n.meeting_id)

  const statusBadge = {
    scheduled: 'badge badge-blue', completed: 'badge badge-green',
    cancelled: 'badge badge-red', requested: 'badge badge-amber', confirmed: 'badge badge-green',
  }
  const statusLabel = {
    scheduled: 'Запланирована', completed: 'Завершена',
    cancelled: 'Отменена', requested: 'Запрошена', confirmed: 'Подтверждена',
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
            <div className="empty-icon" style={{ margin: '0 auto 20px' }}>🔗</div>
            <h2 style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Присоединитесь к команде
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              Введите код приглашения от вашего тимлида
            </p>
            <form onSubmit={handleJoin} style={{ textAlign: 'left' }}>
              <div className="form-group">
                <label className="form-label">Код приглашения</label>
                <input
                  type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)}
                  placeholder="ABC123" className="input"
                  style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  autoFocus
                />
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
    <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate}>
      <div style={{ maxWidth: 900 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>{team.name}</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Добро пожаловать, {user.name}</p>
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
                  <div className={`avatar avatar-xl ${lead?.user_avatar_url ? '' : 'avatar-accent'}`}>
                    {lead?.user_avatar_url
                      ? <img src={lead.user_avatar_url} alt="lead" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : (team.team_lead_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p className="label" style={{ marginBottom: 4 }}>Тимлид</p>
                    <p style={{ fontWeight: 600, fontSize: 17, color: 'var(--color-text-primary)' }}>
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
                    <MeetingCard key={m.id} meeting={m} statusBadge={statusBadge} statusLabel={statusLabel} />
                  ))}
                </div>
              </div>
            )}

            {team.members && team.members.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Участники команды</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
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
                            background: 'var(--color-success)', border: '2px solid var(--color-surface)',
                          }} />
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

        {/* Tab: Meetings */}
        {activeTab === 'meetings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowRequestMeeting(true)} className="btn btn-accent btn-sm">
                + Запросить встречу
              </button>
            </div>

            {upcomingMeetings.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Предстоящие</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingMeetings.map(m => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <MeetingCard meeting={m} statusBadge={statusBadge} statusLabel={statusLabel} />
                      {m.agenda && (
                        <div style={{
                          marginTop: 6, padding: '10px 14px',
                          background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                          borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--blue-700)',
                        }}>
                          <span style={{ fontWeight: 600 }}>Повестка: </span>{m.agenda}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pastMeetings.length > 0 && (
              <div>
                <p className="label" style={{ marginBottom: 12 }}>Прошедшие</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pastMeetings.map(m => {
                    const isExpanded = expandedMeetingNotes.has(m.id)
                    const draft = meetingNoteDrafts[m.id] ?? ''
                    const hasNote = notes.some(n => n.meeting_id === m.id)
                    return (
                      <div key={m.id} className="meeting-item" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 'var(--radius-md)',
                            background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
                              {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
                              {new Date(m.scheduled_date).toLocaleString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {m.topic && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{m.topic}</p>}
                          </div>
                          <span className={statusBadge[m.status] || 'badge badge-gray'} style={{ flexShrink: 0 }}>
                            {statusLabel[m.status] || m.status}
                          </span>
                          <button
                            onClick={() => toggleMeetingNote(m.id)}
                            style={{
                              fontSize: 12, fontWeight: 600, background: 'none', border: 'none',
                              cursor: 'pointer', color: isExpanded ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                              flexShrink: 0, padding: '4px 6px',
                            }}
                          >
                            {isExpanded ? '▾ Заметки' : '▸ Заметки'}{hasNote ? '●' : ''}
                          </button>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                            <textarea
                              value={draft}
                              onChange={e => setMeetingNoteDrafts(prev => ({ ...prev, [m.id]: e.target.value }))}
                              placeholder="Личные заметки к встрече..."
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
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {meetings.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <p className="empty-title">Нет встреч</p>
                <p className="empty-desc">Запросите первую встречу с тимлидом</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Tasks */}
        {activeTab === 'tasks' && (
          <div>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✅</div>
                <p className="empty-title">Нет задач</p>
                <p className="empty-desc">Задачи появятся после встреч с тимлидом</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map(task => {
                  const status = task.status || 'in_progress'
                  return (
                    <div key={task.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontWeight: 500, fontSize: 14,
                          color: task.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                          textDecoration: task.completed ? 'line-through' : 'none',
                        }}>
                          {task.title || task.description}
                        </p>
                        {task.description && task.title && (
                          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.description}
                          </p>
                        )}
                      </div>
                      {task.due_date && (
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                          {new Date(task.due_date).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                      <button
                        onClick={() => handleCycleTaskStatus(task)}
                        className={`badge ${STATUS_CLS[status] || 'badge-blue'}`}
                        style={{ cursor: 'pointer', border: 'none', flexShrink: 0, fontFamily: 'var(--font-sans)', transition: 'opacity 0.15s' }}
                        title="Нажмите чтобы изменить статус"
                      >
                        {STATUS_LABEL[status] || status}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Notes */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Add note */}
            <div className="card" style={{ padding: 20 }}>
              <p className="label" style={{ marginBottom: 10 }}>Новая заметка</p>
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

            {/* Free-form notes list */}
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
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <p className="empty-title">Нет заметок</p>
                <p className="empty-desc">Записывайте мысли и наблюдения прямо здесь</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Analytics */}
        {activeTab === 'analytics' && <MemberAnalytics user={user} />}
      </div>

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
  )
}

function MeetingCard({ meeting, statusBadge, statusLabel }) {
  return (
    <div className="meeting-item" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--radius-md)',
        background: 'var(--blue-50)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--blue-200)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.2 }}>
          {new Date(meeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>
          {new Date(meeting.scheduled_date).toLocaleString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
        {meeting.topic && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meeting.topic}</p>}
      </div>
      <span className={statusBadge[meeting.status] || 'badge badge-gray'} style={{ flexShrink: 0 }}>
        {statusLabel[meeting.status] || meeting.status}
      </span>
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
