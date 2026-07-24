import { useState, useEffect, useCallback } from 'react'
import Spinner from '../lib/Spinner'
import { MeetingDateBadge, MeetingNoteEditor, NotesPreview, UploadRecordingButton, AiBadge } from './MeetingCardParts'
import { fmtDate, fmtTime } from '../lib/datetime'
import AiSummary from './AiSummary'
import { meetingStatusBadge, meetingStatusLabel } from '../lib/meetingStatus'
import EmptyState from './EmptyState'
import { coachingEnabled, buildAgendaSuggestions, buildMeetingFeedback } from '../lib/coaching'
import { createTeam, getTeams, getTeam, createMeeting, createUser, addMember, getTasks, createTask, updateTask, deleteTask, getMeetings, confirmMeeting, declineMeeting, getUsers, regenerateInviteCode, updateMeeting, getNotes, createNote, deleteNote, getMyLeadTasks, startCall, uploadRecording, getTranscript, startSpontaneousCall, getMeetingAISlots, getTeamCompany, saveTeamCompany, deleteTeamCompany, updateUser } from '../api/client'
import { useTranslation } from 'react-i18next'
import { useIsTelegram } from '../lib/surface'
import CompanySearch from './CompanySearch'
import Layout from './Layout'

const STATUS_CYCLE = { in_progress: 'review', review: 'done', done: 'in_progress', blocked: 'in_progress' }
const STATUS_CLS   = { in_progress: 'badge-blue', blocked: 'badge-red', review: 'badge-amber', done: 'badge-green' }
const STATUS_LABEL = { in_progress: 'В работе', blocked: 'Блокер', review: 'На ревью', done: 'Готово' }
import UserCard from './UserCard'
import LeadAnalytics from './LeadAnalytics'
import { GoalsLead } from './Goals'
import { DevelopmentLead } from './Development'
import OneAI from './OneAI'
import MeetingCalendar from './MeetingCalendar'
import TaskStatusSelect from './TaskStatusSelect'
import TaskAssignees from './TaskAssignees'
import CollabTaskModal from './CollabTaskModal'
import GroupMeetingModal from './GroupMeetingModal'
import MeetingProposals from './MeetingProposals'
import TaskProposals from './TaskProposals'
import InteractionsPanel from './InteractionsPanel'
import QuickWidget from './QuickWidget'
import { toast } from '../lib/ui'
import { parseFeatureLock, openPricing } from '../lib/featureLock'
import JitsiCall from './JitsiCall'
import TaskAIHelper from './TaskAIHelper'
import SubtaskList from './SubtaskList'

export default function LeadDashboard({ user, onLogout, onUserUpdate }) {
  const { t } = useTranslation()
  // Mini App (Telegram): скрываем запрещённые таблицей функции (видео, транскрипты,
  // экспорт, графики, редактирование компании) через условный рендеринг.
  const isTg = useIsTelegram()
  const [activeView, setActiveView] = useState('teams')
  const [teams, setTeams] = useState([])
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [teamDetail, setTeamDetail] = useState(null)
  const [loadingTeam, setLoadingTeam] = useState(false)

  const [myMeetings, setMyMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(false)
  const [usersMap, setUsersMap] = useState({})
  const [meetingAction, setMeetingAction] = useState({})
  const [callLoading, setCallLoading] = useState({})
  const [uploadLoading, setUploadLoading] = useState({})
  const [uploadDone, setUploadDone] = useState({})

  const [activeCall, setActiveCall] = useState(null) // { room_name, room_url, meeting_id }

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
      // Poll for AI summary every 12s (background task ~1-2 min)
      const poll = async (attempts = 0) => {
        if (attempts > 15) return
        setTimeout(async () => {
          try {
            const { data } = await getTranscript(meetingId)
            if (data.ai_summary) {
              setMyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ai_summary: data.ai_summary, call_transcript: data.transcript } : m))
            } else { poll(attempts + 1) }
          } catch {}
        }, 12000)
      }
      poll()
    } catch { toast('Не удалось загрузить запись', 'error') }
    finally { setUploadLoading(prev => ({ ...prev, [meetingId]: false })) }
  }

  const [showCreateTeam, setShowCreateTeam] = useState(false)
  // Опциональный шаг «компания» сразу после создания пространства (Этап 2).
  const [companyStep, setCompanyStep] = useState(null)   // { teamId, showSearch } | null
  const [companySaving, setCompanySaving] = useState(false)
  // Раздел «Организация» в настройках пространства (Этап 4).
  const [showOrg, setShowOrg] = useState(false)
  const [orgData, setOrgData] = useState(null)           // { has_company, company }
  const [orgEditing, setOrgEditing] = useState(false)
  const [pricingHint, setPricingHint] = useState(null)   // { plan, label } | null (Этап 5)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleMember, setScheduleMember] = useState(null)
  const [userCardMember, setUserCardMember] = useState(null)

  const [newTeamName, setNewTeamName] = useState('')
  const [newMember, setNewMember] = useState({ name: '', email: '', title: '', role: 'member' })
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleAgenda, setScheduleAgenda] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  // Коучинг-подсказки к повестке: скрываются на время текущей встречи и
  // перерисовываются, когда пользователь переключает функцию в настройках.
  const [coachHidden, setCoachHidden] = useState(false)
  const [coachTick, setCoachTick] = useState(0)
  // Пост-встречные подсказки, скрытые пользователем по конкретным встречам.
  const [coachDismissed, setCoachDismissed] = useState(() => new Set())
  useEffect(() => { if (showSchedule) setCoachHidden(false) }, [showSchedule, scheduleMember])
  useEffect(() => {
    const h = () => setCoachTick(t => t + 1)
    window.addEventListener('pit-coaching-changed', h)
    return () => window.removeEventListener('pit-coaching-changed', h)
  }, [])
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const [memberTasks, setMemberTasks] = useState({})
  const [expandedTasks, setExpandedTasks] = useState(new Set())
  const [taskForms, setTaskForms] = useState({})
  const [editingTask, setEditingTask] = useState(null)
  const [subtaskRefresh, setSubtaskRefresh] = useState({})

  const [searchQuery, setSearchQuery] = useState('')

  const [meetingNotes, setMeetingNotes] = useState({})

  // Notes state
  const [notes, setNotes] = useState([])
  const [newNoteText, setNewNoteText] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)

  // Lead personal tasks
  const [myTasks, setMyTasks] = useState([])
  const [calPopup, setCalPopup] = useState(null)

  const openGcal = (m, name) => {
    const d = new Date(m.scheduled_date)
    const end = new Date(d.getTime() + 3600000)
    const fmt = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const t = encodeURIComponent(`1-on-1: ${name}`)
    const det = encodeURIComponent(m.agenda || '')
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&dates=${fmt(d)}/${fmt(end)}&details=${det}`, '_blank')
    setCalPopup(null)
  }
  const downloadICS = (m, name) => {
    const d = new Date(m.scheduled_date)
    const end = new Date(d.getTime() + 3600000)
    const fmt = dt => dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:${fmt(d)}\r\nDTEND:${fmt(end)}\r\nSUMMARY:1-on-1: ${name}\r\nDESCRIPTION:${m.agenda || ''}\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    a.download = `meeting_${m.id}.ics`; a.click()
    setCalPopup(null)
  }

  const [myTaskForm, setMyTaskForm] = useState({ title: '', due_date: '', open: false, loading: false })

  // Tasks sub-tab: 'mine' | 'members'
  const [tasksSubTab, setTasksSubTab] = useState('mine')
  const [myTaskFilter, setMyTaskFilter] = useState('all')
  const [memberTaskFilter, setMemberTaskFilter] = useState('all')
  const [meetingStatusFilter, setMeetingStatusFilter] = useState('all')

  // Reschedule AI slots modal
  const [rescheduleModal, setRescheduleModal] = useState(null) // { meetingId, memberName, cadence }
  const [aiSlots, setAiSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsLocked, setSlotsLocked] = useState(null)  // мягкое тарифное уведомление (Задача 3)
  const [collabModal, setCollabModal] = useState(false)  // модалка совместной задачи
  const [showGroupModal, setShowGroupModal] = useState(false)  // групповая встреча (Задача 4)
  const [showProposals, setShowProposals] = useState(false)    // предложения встреч (Задача 5)
  const [showTaskProposals, setShowTaskProposals] = useState(false)  // предложения задач
  const [taskProposalPreset, setTaskProposalPreset] = useState(null)
  const [showInteractions, setShowInteractions] = useState(false)  // взаимодействия (блок 39)

  // Analytics force-refresh key
  const [analyticsKey, setAnalyticsKey] = useState(0)

  // Spontaneous call modal
  const [showStartCall, setShowStartCall] = useState(false)
  const [callModalLoading, setCallModalLoading] = useState(false)
  const [callStep, setCallStep] = useState('type') // 'type' | 'members' | 'select' | 'done'
  const [callResult, setCallResult] = useState(null) // { room_url, room_name }
  const [roomUrlCopied, setRoomUrlCopied] = useState(false)
  const [memberCallLoading, setMemberCallLoading] = useState({})
  const [callSelected, setCallSelected] = useState([]) // 39.8: выбор нескольких участников

  const openCallModal = () => {
    setCallStep('type')
    setCallResult(null)
    setRoomUrlCopied(false)
    setCallSelected([])
    setShowStartCall(true)
  }

  const handleStartSpontaneousCall = async (memberIds, isGroup = false) => {
    // Fall back to the first team so a spontaneous call still works if no team
    // is explicitly selected yet.
    const teamId = selectedTeamId || teams[0]?.id
    if (!teamId || memberIds.length === 0) return
    setCallModalLoading(true)
    try {
      const { data } = await startSpontaneousCall({
        lead_id: user.id, team_id: teamId, member_ids: memberIds, is_group: isGroup,
      })
      setCallResult(data)
      setCallStep('done')
      loadMyMeetings()
    } catch { toast('Не удалось создать созвон', 'error') }
    finally { setCallModalLoading(false) }
  }

  const handleMemberCardCall = async (memberId) => {
    if (!selectedTeamId) return
    setMemberCallLoading(prev => ({ ...prev, [memberId]: true }))
    try {
      const { data } = await startSpontaneousCall({
        lead_id: user.id, team_id: selectedTeamId, member_ids: [memberId], is_group: false,
      })
      const roomName = data.room_name || data.room_url?.split('/').pop()
      setActiveCall({ room_name: roomName, room_url: data.room_url, meeting_id: data.meeting_id })
      loadMyMeetings()
    } catch { toast('Не удалось создать созвон', 'error') }
    finally { setMemberCallLoading(prev => ({ ...prev, [memberId]: false })) }
  }

  // Auto-copy invite link when call is created
  useEffect(() => {
    if (callStep === 'done' && callResult?.room_url) {
      navigator.clipboard.writeText(callResult.room_url)
        .then(() => setRoomUrlCopied(true))
        .catch(() => {})
    }
  }, [callStep, callResult])

  // Meeting notes expanded in notes tab
  const [notesMeetingExpanded, setNotesMeetingExpanded] = useState(new Set())

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
      setMyMeetings((meetings || []).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date)))
      const map = {}
      for (const u of (users || [])) map[u.id] = u
      setUsersMap(map)
    } catch {
      setMyMeetings([])
    } finally {
      setLoadingMeetings(false)
    }
  }, [user.id])

  const loadNotes = useCallback(async () => {
    try { const { data } = await getNotes(user.id); setNotes(data || []) }
    catch { setNotes([]) }
  }, [user.id])

  const loadMyTasks = useCallback(async () => {
    try { const { data } = await getMyLeadTasks(user.id); setMyTasks((data || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))) }
    catch { setMyTasks([]) }
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

  const handleUpdateMeetingStatus = async (meetingId, newStatus) => {
    try {
      await updateMeeting(meetingId, { status: newStatus })
      setMyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: newStatus } : m))
    } catch {}
  }

  const handleOpenReschedule = async (meeting) => {
    const member = teamDetail?.members?.find(m => m.user_id === meeting.member_id)
    const cadence = member?.cadence_days || 14
    setRescheduleModal({ meetingId: meeting.id, memberName: usersMap[meeting.member_id]?.name || 'Участник', cadence })
    setAiSlots([])
    setSlotsLocked(null)
    setSlotsLoading(true)
    try {
      const { data } = await getMeetingAISlots({ meeting_id: meeting.id, cadence_days: cadence })
      setAiSlots(data.slots || [])
    } catch (err) { setSlotsLocked(parseFeatureLock(err)); setAiSlots([]) }
    finally { setSlotsLoading(false) }
  }

  const handleRescheduleSelect = async (slot) => {
    if (!rescheduleModal) return
    try {
      const updated = await updateMeeting(rescheduleModal.meetingId, { scheduled_date: slot, is_rescheduled: true })
      setMyMeetings(prev => prev.map(m =>
        m.id === rescheduleModal.meetingId
          ? { ...m, scheduled_date: slot, is_rescheduled: true, status: updated.data?.status || m.status }
          : m
      ))
      setRescheduleModal(null)
    } catch {}
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
    } catch {} finally {
      setMeetingNotes(prev => ({ ...prev, [meetingId]: { ...prev[meetingId], saving: false } }))
    }
  }

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
    try { await deleteNote(noteId); setNotes(prev => prev.filter(n => n.id !== noteId)) }
    catch {}
  }

  const handleCycleTask = async (task, memberId) => {
    const nextStatus = STATUS_CYCLE[task.status || 'in_progress'] || 'in_progress'
    const completed = nextStatus === 'done'
    try {
      await updateTask(task.id, { status: nextStatus, completed })
      setMemberTasks(prev => ({
        ...prev,
        [memberId]: (prev[memberId] || []).map(t => t.id === task.id ? { ...t, status: nextStatus, completed } : t),
      }))
    } catch {}
  }

  // Lead personal tasks
  const handleCycleMyTask = async (task) => {
    const nextStatus = STATUS_CYCLE[task.status || 'in_progress'] || 'in_progress'
    const completed = nextStatus === 'done'
    try {
      await updateTask(task.id, { status: nextStatus, completed })
      setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus, completed } : t))
    } catch {}
  }

  const handleCreateMyTask = async (e) => {
    e.preventDefault()
    const title = myTaskForm.title.trim()
    if (!title) return
    const due_date = myTaskForm.due_date || null
    // Оптимистичное добавление: задача видна сразу, до ответа сервера.
    const tempId = `temp-${Date.now()}`
    const optimistic = {
      id: tempId, _optimistic: true, title, due_date,
      team_id: null, assigned_to: user.id, assigned_by: user.id,
      status: 'in_progress', completed: false, created_at: new Date().toISOString(),
    }
    setMyTasks(prev => [optimistic, ...prev])
    setMyTaskForm({ title: '', due_date: '', open: false, loading: false })
    try {
      const { data } = await createTask({
        title, due_date, team_id: null, assigned_to: user.id, assigned_by: user.id,
      })
      setMyTasks(prev => prev.map(t => t.id === tempId ? data : t))
    } catch {
      setMyTasks(prev => prev.filter(t => t.id !== tempId))
      setMyTaskForm({ title, due_date: myTaskForm.due_date || '', open: true, loading: false })
      toast('Не удалось добавить задачу. Попробуйте ещё раз.', 'error')
    }
  }

  const handleDeleteMyTask = async (taskId) => {
    try { await deleteTask(taskId); setMyTasks(prev => prev.filter(t => t.id !== taskId)) }
    catch {}
  }

  useEffect(() => { loadTeams(); loadNotes(); loadMyTasks() }, [user.id])
  useEffect(() => { if (selectedTeamId) loadTeamDetail(selectedTeamId) }, [selectedTeamId])

  const loadMemberTasks = useCallback(async (memberId, teamId) => {
    try {
      const { data } = await getTasks({ assigned_to: memberId, team_id: teamId })
      setMemberTasks((prev) => ({ ...prev, [memberId]: (data || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)) }))
    } catch {
      setMemberTasks((prev) => ({ ...prev, [memberId]: [] }))
    }
  }, [])

  // Совместная задача создана (Задача 4): добавляем её во все загруженные списки
  // участников, которых она касается (у каждого она появится сразу, без refresh).
  const handleCollabCreated = (task) => {
    const ids = (task.assignees || []).map(a => a.user_id)
    setMemberTasks(prev => {
      const next = { ...prev }
      for (const uid of ids) {
        if (next[uid] !== undefined && !next[uid].some(t => t.id === task.id)) {
          next[uid] = [task, ...next[uid]]
        }
      }
      return next
    })
    if (ids.includes(user.id)) setMyTasks(prev => prev.some(t => t.id === task.id) ? prev : [task, ...prev])
  }

  // Обновлённая задача (после смены статуса части участника) — заменяем во всех
  // загруженных списках участников и в «моих задачах».
  const patchTaskEverywhere = (task) => {
    setMemberTasks(prev => {
      const next = { ...prev }
      for (const uid of Object.keys(next)) {
        if (next[uid]?.some(t => t.id === task.id)) {
          next[uid] = next[uid].map(t => t.id === task.id ? task : t)
        }
      }
      return next
    })
    setMyTasks(prev => prev.some(t => t.id === task.id) ? prev.map(t => t.id === task.id ? task : t) : prev)
  }

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

  const openTaskForm = (memberId) => {
    setTaskForms((prev) => ({ ...prev, [memberId]: { title: '', due_date: '', loading: false, open: true } }))
  }

  const closeTaskForm = (memberId) => {
    setTaskForms((prev) => ({ ...prev, [memberId]: { ...(prev[memberId] || {}), open: false } }))
  }

  const handleCreateTask = async (e, memberId) => {
    e.preventDefault()
    const form = taskForms[memberId] || {}
    const title = form.title?.trim()
    if (!title) return
    // Оптимистичное добавление: задача появляется в списке мгновенно, ещё до
    // ответа сервера. Форму сразу закрываем и очищаем. При ошибке — откат.
    const tempId = `temp-${Date.now()}`
    const optimistic = {
      id: tempId, _optimistic: true,
      title, due_date: form.due_date || null,
      team_id: selectedTeamId, assigned_to: memberId, assigned_by: user.id,
      meeting_id: null, status: 'in_progress', completed: false,
      created_at: new Date().toISOString(),
    }
    setMemberTasks((prev) => ({ ...prev, [memberId]: [optimistic, ...(prev[memberId] || [])] }))
    setTaskForms((prev) => ({ ...prev, [memberId]: { title: '', due_date: '', loading: false, open: false } }))
    try {
      const { data: newTask } = await createTask({
        title, due_date: form.due_date || null,
        team_id: selectedTeamId, assigned_to: memberId, assigned_by: user.id,
        meeting_id: null,
      })
      // Заменяем временную задачу на реальную с сервера.
      setMemberTasks((prev) => ({ ...prev, [memberId]: (prev[memberId] || []).map(t => t.id === tempId ? newTask : t) }))
    } catch {
      // Откат: убираем временную задачу и возвращаем текст в форму.
      setMemberTasks((prev) => ({ ...prev, [memberId]: (prev[memberId] || []).filter(t => t.id !== tempId) }))
      setTaskForms((prev) => ({ ...prev, [memberId]: { title, due_date: form.due_date || '', loading: false, open: true } }))
      toast('Не удалось добавить задачу. Попробуйте ещё раз.', 'error')
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
      // Этап 2: сразу предлагаем добавить компанию (необязательно, не блокирует).
      setCompanyStep({ teamId: data.id, showSearch: false })
    } catch {} finally { setFormLoading(false) }
  }

  // Сохранить реквизиты компании (используется и в шаге создания, и в настройках).
  const handleSaveCompany = async (teamId, payload, { fromStep } = {}) => {
    setCompanySaving(true)
    try {
      await saveTeamCompany(teamId, payload)
      toast(t('company.saved'), 'success')
      await loadTeams()
      if (fromStep) setCompanyStep(null)
      else { setOrgEditing(false); await loadOrg(teamId) }
      maybeShowPricingHint(payload.size)
    } catch {
      toast(t('company.saveError'), 'error')
    } finally { setCompanySaving(false) }
  }

  // Этап 5: мягкая рекомендация тарифа один раз, по размеру компании.
  // 11-24 -> Команда, 25+ -> Компания. Меньше 11 или уже показано — ничего.
  const maybeShowPricingHint = (size) => {
    const n = Number(size)
    if (!n || user?.pricing_hint_shown) return
    if (n >= 25) setPricingHint({ plan: 'company', label: 'Компания' })
    else if (n >= 11) setPricingHint({ plan: 'team', label: 'Команда' })
  }

  const dismissPricingHint = async () => {
    setPricingHint(null)
    try {
      const { data } = await updateUser(user.id, { pricing_hint_shown: true })
      onUserUpdate?.(data)
    } catch {}
  }

  const loadOrg = async (teamId) => {
    try { const { data } = await getTeamCompany(teamId); setOrgData(data) }
    catch { setOrgData({ has_company: false, company: null }) }
  }

  const openOrg = async (teamId) => {
    setShowOrg(true); setOrgEditing(false); setOrgData(null)
    await loadOrg(teamId)
  }

  const handleRemoveCompany = async (teamId) => {
    setCompanySaving(true)
    try {
      await deleteTeamCompany(teamId)
      toast(t('company.removed'), 'success')
      await loadTeams(); await loadOrg(teamId); setOrgEditing(false)
    } catch { toast(t('company.saveError'), 'error') }
    finally { setCompanySaving(false) }
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

  const statusBorderClass = { green: 'border-status-green', yellow: 'border-status-yellow', red: 'border-status-red' }
  const statusBadgeClass = { green: 'badge badge-green', yellow: 'badge badge-amber', red: 'badge badge-red' }
  const statusLabel = { green: 'В порядке', yellow: 'Скоро', red: 'Нет встречи' }

  const filteredMembers = teamDetail?.members?.filter(m => {
    if (m.user_id === user.id) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (m.user_name || '').toLowerCase().includes(q) ||
      (m.user_email || '').toLowerCase().includes(q)
    )
  }) || []

  // Calendar meeting render for lead's meetings tab
  const renderMeetingCard = (m) => {
    const memberName = usersMap[m.member_id]?.name || `Участник #${m.member_id}`
    const busy = meetingAction[m.id]
    const noteState = meetingNotes[m.id]
    const isPast = new Date(m.scheduled_date) < new Date()
    const isRequest = m.status === 'requested'
    return (
      <div key={m.id} className="meeting-item" style={{ display: 'flex', flexDirection: 'column', borderLeft: m.is_rescheduled && !['cancelled','declined','completed'].includes(m.status) ? '3px solid #5B8EF8' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MeetingDateBadge date={m.scheduled_date} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--color-text-primary)' }}>{memberName}</p>
            {m.agenda && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.agenda}</p>}
            {!isPast && !isRequest && m.context_from_last && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                {m.context_from_last}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
            <span className={`badge ${meetingStatusBadge(m.status)}`}>
              {meetingStatusLabel(m.status)}
            </span>
            {m.group_id && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0891b2', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                Групповая
              </span>
            )}
            {m.is_rescheduled && !['cancelled','declined'].includes(m.status) && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#2554D4', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>
                ↻ Перенесена
              </span>
            )}
          </div>
          {!isRequest && !['completed', 'cancelled', 'declined'].includes(m.status) && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0, position: 'relative' }}>
              <button onClick={() => setCalPopup(calPopup === m.id ? null : m.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, background: 'linear-gradient(135deg,#2554D4,#4f46e5)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 10px' }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="white" strokeWidth="1.4"/><path d="M1.5 6h13M5 1v3M11 1v3" stroke="white" strokeWidth="1.3" strokeLinecap="round"/></svg>
                В календарь
              </button>
              {calPopup === m.id && (
                <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 170 }}>
                  <button onClick={() => openGcal(m, memberName)} style={{ textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--color-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}>Google Calendar</button>
                  <button onClick={() => downloadICS(m, memberName)} style={{ textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--color-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}>Яндекс Календарь</button>
                </div>
              )}
              <button onClick={() => handleUpdateMeetingStatus(m.id, 'completed')} style={{ fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', padding: '3px 8px' }}>Провели</button>
              <button onClick={() => handleUpdateMeetingStatus(m.id, 'cancelled')} style={{ fontSize: 11, fontWeight: 600, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: 6, cursor: 'pointer', padding: '3px 8px' }}>Отменить</button>
            </div>
          )}
          {isRequest && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              <button onClick={() => handleConfirmMeeting(m.id)} disabled={busy} className="btn btn-success btn-sm">Принять</button>
              <button onClick={() => handleDeclineMeeting(m.id)} disabled={busy} className="btn btn-danger btn-sm">Отклонить</button>
            </div>
          )}
          {isPast && !isRequest && (
            <button
              onClick={() => handleToggleMeetingNote(m)}
              style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: noteState?.expanded ? 'var(--color-accent)' : 'var(--color-text-secondary)', flexShrink: 0, padding: '4px 6px' }}
            >
              {noteState?.expanded ? '↓ Заметки' : '→ Заметки'}{m.notes ? ' ·' : ''}
            </button>
          )}
          {isPast && !isRequest && !m.ai_summary && !isTg && (
            <UploadRecordingButton uploading={uploadLoading[m.id]} done={uploadDone[m.id]} onFile={file => handleUploadRecording(m.id, file)} />
          )}
          {isPast && !isRequest && m.ai_summary && !isTg && <AiBadge summary={m.ai_summary} />}
          {/* Call must stay available for any active meeting, even if its
              scheduled time has passed (a late/in-progress 1-on-1). */}
          {!['completed', 'cancelled', 'declined'].includes(m.status) && !isRequest && (
            <>
              <button
                onClick={() => handleOpenReschedule(m)}
                style={{ fontSize: 12, fontWeight: 500, background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: '5px 9px', flexShrink: 0 }}
              >
                Перенести
              </button>
              {/* Видеозвонки недоступны в Mini App (таблица) */}
              {!isTg && (
                <button
                  onClick={() => handleStartCall(m.id)}
                  disabled={callLoading[m.id]}
                  style={{ fontSize: 12, fontWeight: 600, background: '#0061ff', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', padding: '5px 10px', flexShrink: 0, opacity: callLoading[m.id] ? 0.6 : 1 }}
                >
                  {callLoading[m.id] ? '...' : 'Созвон'}
                </button>
              )}
            </>
          )}
        </div>
        {noteState?.expanded && (
          <MeetingNoteEditor
            value={noteState.draft}
            onChange={e => setMeetingNotes(prev => ({ ...prev, [m.id]: { ...prev[m.id], draft: e.target.value } }))}
            onSave={() => handleSaveMeetingNote(m.id)}
            saving={noteState.saving}
          />
        )}
        {!noteState?.expanded && <NotesPreview text={m.notes} />}
        <AiSummary summary={m.ai_summary} />
        {/*
          Коучинг "после встречи": сверка повестки с расшифровкой. Появляется
          только на прошедшей встрече, где есть и повестка, и транскрипт/резюме,
          и только если подсказки включены. Привязан к самой встрече, скрывается
          пер-встречно. Так повестка работает дальше, а не остаётся мёртвым полем.
        */}
        {isPast && !isRequest && coachingEnabled(user.id) && !coachDismissed.has(m.id) && (() => {
          const fb = buildMeetingFeedback({ agenda: m.agenda, transcript: m.call_transcript, summary: m.ai_summary })
          if (!fb) return null
          const dismiss = () => setCoachDismissed(prev => new Set(prev).add(m.id))
          return (
            <div style={{ marginTop: 10, padding: '10px 14px', background: fb.covered ? 'var(--color-bg)' : '#fff8ed', border: `1px solid ${fb.covered ? 'var(--color-border)' : '#fcd9a5'}`, borderLeft: `3px solid ${fb.covered ? 'var(--color-success)' : '#f59e0b'}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: fb.covered ? 0 : 6 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: fb.covered ? 'var(--color-success)' : '#b45309', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>Пит: итог встречи</p>
                <button type="button" onClick={dismiss} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12 }}>Скрыть</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.6, margin: 0 }}>{fb.note}</p>
              {fb.missed.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {fb.missed.map((t, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  // Separate requests from calendar meetings
  const meetingRequests = myMeetings.filter(m => m.status === 'requested')
  const calendarMeetings = myMeetings.filter(m => {
    if (m.status === 'requested') return false
    if (meetingStatusFilter === 'all') return true
    if (meetingStatusFilter === 'rescheduled') return m.is_rescheduled && !['cancelled','declined'].includes(m.status)
    return m.status === meetingStatusFilter
  })

  const MEETING_FILTERS = [
    { key: 'all', label: 'Все' },
    { key: 'scheduled', label: 'Запланированы' },
    { key: 'confirmed', label: 'Подтверждены' },
    { key: 'in_progress', label: 'Идут сейчас' },
    { key: 'completed', label: 'Завершены' },
    { key: 'rescheduled', label: 'Перенесены' },
    { key: 'cancelled', label: 'Отменены' },
    { key: 'declined', label: 'Отклонены' },
  ]
  const meetingFilterCounts = {
    all: myMeetings.filter(m => m.status !== 'requested').length,
    scheduled: myMeetings.filter(m => m.status === 'scheduled').length,
    confirmed: myMeetings.filter(m => m.status === 'confirmed').length,
    in_progress: myMeetings.filter(m => m.status === 'in_progress').length,
    completed: myMeetings.filter(m => m.status === 'completed').length,
    rescheduled: myMeetings.filter(m => m.is_rescheduled && !['cancelled','declined'].includes(m.status)).length,
    cancelled: myMeetings.filter(m => m.status === 'cancelled').length,
    declined: myMeetings.filter(m => m.status === 'declined').length,
  }

  return (
    <>
    <Layout currentUser={user} onLogout={onLogout} onUserUpdate={onUserUpdate} onJoinCall={(info) => setActiveCall(info)}
      bannerTasks={myTasks}
      bannerTeamId={selectedTeamId}
      onNavigate={type => {
        if (type === 'new_task' || type === 'tasks') setActiveView('tasks')
        else if (type === 'task_proposal') { setTaskProposalPreset(null); setShowTaskProposals(true) }
        else if (type === 'meeting_proposal') setShowProposals(true)
        else if (type === 'meetings' || ['meeting_scheduled','meeting_confirmed','meeting_requested','meeting_declined'].includes(type)) setActiveView('meetings')
        else if (type === 'goals' || type === 'goal_comment' || type === 'goal_feedback') setActiveView('goals')
        else if (type === 'development' || ['dev_direction_assigned','dev_feedback','dev_level_reached','dev_step_due'].includes(type)) setActiveView('development')
      }}
>
      <div style={{ maxWidth: 1100, width: '100%' }}>
        {/* Page header */}
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {activeView === 'teams' ? 'Мои команды' : activeView === 'meetings' ? 'Мои встречи' : activeView === 'tasks' ? 'Мои задачи' : activeView === 'goals' ? 'Цели команды' : activeView === 'development' ? 'Развитие команды' : activeView === 'oneai' ? 'ONE AI' : activeView === 'notes' ? 'Заметки' : 'Аналитика'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>Добро пожаловать, {user.name}</p>
          </div>
          <div className="page-toolbar" style={{ display: 'flex', gap: 8 }}>
            {/* Spontaneous call — shown whenever the lead has any team, next to
                'Создать команду' (was gated on selectedTeamId, which could lag). */}
            {teams.length > 0 && !isTg && (
              <button onClick={openCallModal} className="btn btn-secondary btn-sm" style={{ fontWeight: 600 }}>
                Созвон
              </button>
            )}
            <button onClick={() => setShowCreateTeam(true)} className="btn btn-accent btn-sm">
              + Создать команду
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="tabs" data-tour="views" style={{ width: 'fit-content', marginBottom: 24 }}>
          {[
            { key: 'teams', label: 'Команды' },
            // Параллельные существительные в строке вкладок: только эта вкладка
            // несла "Мои", ломая ряд Команды/Встречи/Задачи/Заметки/Аналитика.
            { key: 'meetings', label: 'Встречи' },
            { key: 'tasks', label: 'Задачи' },
            { key: 'goals', label: 'Цели' },
            { key: 'development', label: 'Развитие' },
            { key: 'oneai', label: 'ONE AI' },
            { key: 'notes', label: 'Заметки' },
            { key: 'analytics', label: 'Аналитика' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
              setActiveView(tab.key)
              if (tab.key === 'meetings') loadMyMeetings()
              if (tab.key === 'analytics') setAnalyticsKey(k => k + 1)
            }}
              className={`tab${activeView === tab.key ? ' active' : ''}`}
            >
              {tab.label}
              {tab.key === 'notes' && notes.length > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }}>{notes.length}</span>
              )}
              {tab.key === 'tasks' && myTasks.filter(t => !t.completed).length > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }}>{myTasks.filter(t => !t.completed).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Goals view — сводный просмотр целей команды */}
        {activeView === 'goals' && (
          <GoalsLead user={user} teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />
        )}

        {/* Development view — обзор развития команды */}
        {activeView === 'development' && (
          <DevelopmentLead user={user} teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />
        )}

        {/* ONE AI — стратегический AI-центр */}
        {activeView === 'oneai' && <OneAI user={user} />}

        {/* Analytics view */}
        {activeView === 'analytics' && <LeadAnalytics key={analyticsKey} user={user} />}

        {/* Notes view */}
        {activeView === 'notes' && (
          <div style={{ maxWidth: 640, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* General notes */}
            <div>
              <p className="label" style={{ marginBottom: 12 }}>Общие заметки</p>
              <div className="card" style={{ padding: 20, marginBottom: 10 }}>
                <textarea
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="Запишите мысль, наблюдение или идею..."
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
              {notes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {notes.map(note => (
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
                  <p className="empty-desc">Запишите мысль или договорённость — заметки видите только вы.</p>
                </div>
              )}
            </div>

            {/* Meeting notes */}
            <div>
              <p className="label" style={{ marginBottom: 12 }}>Заметки по встречам</p>
              {myMeetings.filter(m => m.notes).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myMeetings.filter(m => m.notes).map(m => {
                    const memberName = usersMap[m.member_id]?.name || `Участник #${m.member_id}`
                    const isExpanded = notesMeetingExpanded.has(m.id)
                    const noteLines = (m.notes || '').split('\n').filter(l => l.trim())
                    return (
                      <div key={m.id} className="card" style={{ padding: '14px 18px' }}>
                        <button
                          onClick={() => setNotesMeetingExpanded(prev => {
                            const next = new Set(prev)
                            next.has(m.id) ? next.delete(m.id) : next.add(m.id)
                            return next
                          })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }}
                        >
                          <span style={{ fontSize: 13, color: isExpanded ? 'var(--color-accent)' : 'var(--color-text-muted)', width: 12 }}>{isExpanded ? '↓' : '→'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{memberName}</span>
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                              {fmtDate(m.scheduled_date)}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{noteLines.length} стр.</span>
                        </button>
                        {isExpanded && (
                          <ul style={{ marginTop: 10, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  <p className="empty-desc">Добавляйте заметки к прошедшим встречам во вкладке «Мои встречи»</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks view */}
        {activeView === 'tasks' && (
          <div style={{ maxWidth: 700, width: '100%' }}>
            {/* Sub-tabs */}
            <div className="tabs" style={{ width: 'fit-content', marginBottom: 20 }}>
              <button onClick={() => setTasksSubTab('mine')} className={`tab${tasksSubTab === 'mine' ? ' active' : ''}`}>
                Мои задачи
                {myTasks.filter(t => !t.completed).length > 0 && (
                  <span className="badge badge-blue" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 11 }}>{myTasks.filter(t => !t.completed).length}</span>
                )}
              </button>
              <button onClick={() => setTasksSubTab('members')} className={`tab${tasksSubTab === 'members' ? ' active' : ''}`}>
                Задачи участников
              </button>
            </div>

            {/* My tasks sub-tab */}
            {tasksSubTab === 'mine' && (<>
              {myTaskForm.open && (
                <form onSubmit={handleCreateMyTask} className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="text"
                    value={myTaskForm.title}
                    onChange={e => setMyTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Название задачи"
                    autoFocus
                    className="input"
                  />
                  <input
                    type="date"
                    value={myTaskForm.due_date}
                    onChange={e => setMyTaskForm(f => ({ ...f, due_date: e.target.value }))}
                    className="input input-sm"
                    style={{ maxWidth: 200 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setMyTaskForm(f => ({ ...f, open: false }))} className="btn btn-secondary btn-sm">Отмена</button>
                    <button type="submit" disabled={myTaskForm.loading} className="btn btn-accent btn-sm">
                      {myTaskForm.loading ? '...' : 'Добавить'}
                    </button>
                  </div>
                </form>
              )}
              {!myTaskForm.open && (
                <div style={{ marginBottom: 12 }}>
                  <button onClick={() => setMyTaskForm(f => ({ ...f, open: true }))} className="btn btn-accent btn-sm">+ Задача</button>
                </div>
              )}
              {myTasks.length === 0 ? (
                <EmptyState title="Нет задач" desc="Добавьте личные задачи, которые видите только вы" />
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {[['all', 'Все'], ['open', 'Открытые'], ['done', 'Выполненные']].map(([f, label]) => (
                      <button key={f} onClick={() => setMyTaskFilter(f)}
                        className={myTaskFilter === f ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {myTasks.filter(t => myTaskFilter === 'all' ? true : myTaskFilter === 'open' ? !t.completed : t.completed).length === 0 ? (
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted)', padding: '12px 0' }}>
                      {myTaskFilter === 'open' ? 'Нет открытых задач' : 'Нет выполненных задач'}
                    </p>
                  ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {myTasks.filter(t => myTaskFilter === 'all' ? true : myTaskFilter === 'open' ? !t.completed : t.completed).map(task => (
                    <div key={task.id} className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {editingTask?.id === task.id ? (
                        <form onSubmit={async e => {
                          e.preventDefault()
                          try {
                            await updateTask(task.id, { title: editingTask.title, due_date: editingTask.due_date || null })
                            setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, title: editingTask.title, due_date: editingTask.due_date || null } : t))
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
                          <TaskStatusSelect status={task.status || 'in_progress'} onChange={async (newStatus) => {
                            try {
                              await updateTask(task.id, { status: newStatus, completed: newStatus === 'done' })
                              setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t))
                            } catch {}
                          }} canMarkDone={true} />
                          <button onClick={() => setEditingTask({ id: task.id, title: task.title || task.description || '', due_date: task.due_date?.slice(0, 10) || '' })}
                            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 4, lineHeight: 1 }} title="Редактировать" aria-label="Редактировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                          <button onClick={() => handleDeleteMyTask(task.id)}
                            style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: 4, lineHeight: 1, transition: 'color 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                            title="Удалить">✕</button>
                          {!task.completed && (
                            <TaskAIHelper
                              task={task}
                              role="lead"
                              userId={user.id}
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
                          setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'done', completed: true } : t))
                        }}
                      />
                    </div>
                  ))}
                </div>
                  )}
                </>
              )}
            </>)}

            {/* Member tasks sub-tab */}
            {tasksSubTab === 'members' && (
              <div>
                {teams.length === 0 ? (
                  <EmptyState title="Нет команд" desc="Создайте команду, чтобы видеть задачи участников" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[['all', 'Все'], ['open', 'Открытые'], ['done', 'Выполненные']].map(([f, label]) => (
                        <button key={f} onClick={() => setMemberTaskFilter(f)}
                          className={memberTaskFilter === f ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>
                          {label}
                        </button>
                      ))}
                      {/* Совместная задача (Задача 4): одна задача на нескольких участников. */}
                      {teamDetail?.members?.filter(m => m.user_id !== user.id).length > 1 && (
                        <button onClick={() => setCollabModal(true)} className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontWeight: 600 }}>
                          + Совместная задача
                        </button>
                      )}
                    </div>
                    {teamDetail?.members?.filter(m => m.user_id !== user.id).map(member => {
                      const tasks = memberTasks[member.user_id]
                      const taskForm = taskForms[member.user_id] || {}
                      const expanded = expandedTasks.has(member.user_id)
                      const filteredTasks = tasks ? tasks.filter(t => memberTaskFilter === 'all' ? true : memberTaskFilter === 'open' ? !t.completed : t.completed) : tasks
                      return (
                        <div key={member.user_id}>
                          <button
                            onClick={() => toggleTasksExpanded(member.user_id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: '8px 0', marginBottom: 8 }}
                          >
                            <div className={`avatar avatar-sm avatar-accent`} style={{ flexShrink: 0 }}>
                              {(member.user_name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', flex: 1 }}>{member.user_name}</span>
                            {tasks !== undefined && (
                              <span className="badge badge-gray" style={{ fontSize: 11 }}>{filteredTasks.length}</span>
                            )}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                              style={{ width: 14, height: 14, color: 'var(--color-text-muted)', transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {expanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                              {tasks === undefined && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 0' }}>Загрузка...</p>}
                              {filteredTasks !== undefined && filteredTasks.map(task => (
                                <div key={task.id} className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {editingTask?.id === task.id ? (
                                    <form onSubmit={async e => {
                                      e.preventDefault()
                                      try {
                                        await updateTask(task.id, { title: editingTask.title, due_date: editingTask.due_date || null })
                                        setMemberTasks(prev => ({ ...prev, [member.user_id]: (prev[member.user_id] || []).map(t => t.id === task.id ? { ...t, title: editingTask.title, due_date: editingTask.due_date || null } : t) }))
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontWeight: 500, fontSize: 13, color: task.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)', textDecoration: task.completed ? 'line-through' : 'none' }}>
                                          {task.title || task.description}
                                        </p>
                                        {task.due_date && (() => {
                                          const overdue = task.status !== 'done' && new Date(task.due_date) < new Date(new Date().toDateString())
                                          return (
                                            <p style={{ fontSize: 11, color: overdue ? 'var(--color-danger)' : 'var(--color-text-muted)', marginTop: 2, fontWeight: overdue ? 600 : 400 }}>
                                              {overdue ? 'Просрочено · ' : 'до '}{new Date(task.due_date).toLocaleDateString('ru-RU')}
                                            </p>
                                          )
                                        })()}
                                      </div>
                                      {/* Совместная задача (Задача 4): статус на уровне задачи не редактируется —
                                          он сводится из статусов участников ниже (TaskAssignees). */}
                                      {task.is_multi ? (
                                        <span style={{ fontSize: 12, fontWeight: 700, color: task.completed ? '#15803d' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                          {task.progress ? `${task.progress.done}/${task.progress.total}` : ''}
                                        </span>
                                      ) : (
                                        <TaskStatusSelect status={task.status || 'in_progress'} onChange={async (newStatus) => {
                                          try {
                                            await updateTask(task.id, { status: newStatus, completed: newStatus === 'done' })
                                            setMemberTasks(prev => ({ ...prev, [member.user_id]: (prev[member.user_id] || []).map(t => t.id === task.id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t) }))
                                          } catch {}
                                        }} canMarkDone={true} />
                                      )}
                                      <button onClick={() => setEditingTask({ id: task.id, title: task.title || task.description || '', due_date: task.due_date?.slice(0, 10) || '' })}
                                        style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 4 }} title="Редактировать" aria-label="Редактировать"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                                      {!task.completed && !task.is_multi && (
                                        <TaskAIHelper
                                          task={task}
                                          role="lead"
                                          userId={user.id}
                                          onSubtasksAdded={() => setSubtaskRefresh(p => ({ ...p, [task.id]: (p[task.id] || 0) + 1 }))}
                                        />
                                      )}
                                    </div>
                                  )}
                                  {task.is_multi && (
                                    <TaskAssignees task={task} currentUserId={user.id} canManageAll={true} onChanged={patchTaskEverywhere} contacts={(teamDetail?.members || []).filter(mm => mm.user_id !== user.id).map(mm => ({ user_id: mm.user_id, name: usersMap[mm.user_id]?.name || `Участник #${mm.user_id}` }))} />
                                  )}
                                  <SubtaskList
                                    taskId={task.id}
                                    refreshKey={subtaskRefresh[task.id] || 0}
                                    onAllDone={() => {
                                      updateTask(task.id, { status: 'done', completed: true }).catch(() => {})
                                      setMemberTasks(prev => ({ ...prev, [member.user_id]: (prev[member.user_id] || []).map(t => t.id === task.id ? { ...t, status: 'done', completed: true } : t) }))
                                    }}
                                  />
                                </div>
                              ))}
                              {filteredTasks !== undefined && filteredTasks.length === 0 && !taskForm.open && (
                                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '4px 0' }}>
                                  {memberTaskFilter === 'open' ? 'Нет открытых задач' : memberTaskFilter === 'done' ? 'Нет выполненных задач' : 'Нет задач'}
                                </p>
                              )}
                              {taskForm.open ? (
                                <form onSubmit={e => handleCreateTask(e, member.user_id)} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                                  <input
                                    type="text"
                                    value={taskForm.title || ''}
                                    onChange={e => setTaskForms(prev => ({ ...prev, [member.user_id]: { ...prev[member.user_id], title: e.target.value } }))}
                                    placeholder="Название задачи"
                                    autoFocus
                                    className="input input-sm"
                                  />
                                  <input
                                    type="date"
                                    value={taskForm.due_date || ''}
                                    onChange={e => setTaskForms(prev => ({ ...prev, [member.user_id]: { ...prev[member.user_id], due_date: e.target.value } }))}
                                    className="input input-sm"
                                    style={{ maxWidth: 180 }}
                                  />
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => closeTaskForm(member.user_id)} className="btn btn-secondary btn-sm">Отмена</button>
                                    <button type="submit" disabled={taskForm.loading} className="btn btn-accent btn-sm">{taskForm.loading ? '...' : 'Добавить'}</button>
                                  </div>
                                </form>
                              ) : (
                                <button
                                  onClick={() => openTaskForm(member.user_id)}
                                  style={{ fontSize: 13, color: 'var(--color-accent)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
                                >
                                  + Добавить задачу
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {(!teamDetail?.members || teamDetail.members.filter(m => m.user_id !== user.id).length === 0) && (
                      <EmptyState title="Нет участников" desc="Добавьте участников в команду" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* My Meetings — calendar view */}
        {activeView === 'meetings' && (
          loadingMeetings ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <div className="spinner" />
            </div>
          ) : (
            <div style={{ maxWidth: 720, width: '100%' }}>
              {/* Групповая встреча (Задача 4) + Предложения встреч (Задача 5) */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={() => setShowGroupModal(true)} className="btn btn-accent btn-sm">+ Групповая встреча</button>
                <button onClick={() => setShowProposals(true)} className="btn btn-secondary btn-sm">Предложения встреч</button>
                <button onClick={() => { setTaskProposalPreset(null); setShowTaskProposals(true) }} className="btn btn-secondary btn-sm">Предложения задач</button>
                <button onClick={() => setShowInteractions(true)} className="btn btn-secondary btn-sm">Взаимодействия</button>
              </div>
              {/* Status filter chips */}
              <div className="tabs" style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {MEETING_FILTERS.filter(f => f.key === 'all' || meetingFilterCounts[f.key] > 0).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setMeetingStatusFilter(f.key)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s', border: '1px solid',
                      background: meetingStatusFilter === f.key ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: meetingStatusFilter === f.key ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: meetingStatusFilter === f.key ? 'var(--color-accent)' : 'var(--color-border)',
                    }}
                  >
                    {f.label}
                    {meetingFilterCounts[f.key] > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: meetingStatusFilter === f.key ? 'rgba(255,255,255,0.25)' : 'var(--color-bg)',
                        color: meetingStatusFilter === f.key ? '#fff' : 'var(--color-text-muted)',
                        padding: '1px 5px', borderRadius: 20, minWidth: 18, textAlign: 'center',
                      }}>{meetingFilterCounts[f.key]}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Meeting requests stay as a list at the top */}
              {meetingRequests.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p className="label">Запросы на встречу</p>
                    <span className="badge badge-amber">{meetingRequests.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {meetingRequests.map(m => renderMeetingCard(m))}
                  </div>
                </div>
              )}
              <MeetingCalendar
                meetings={calendarMeetings}
                renderCard={renderMeetingCard}
              />
            </div>
          )
        )}

        {/* Teams view */}
        <QuickWidget
          nextMeeting={myMeetings
            .filter(m => new Date(m.scheduled_date) >= new Date() && m.status !== 'cancelled')
            .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0] || null}
          nextTask={myTasks.filter(t => t.status !== 'done').sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0
            if (!a.due_date) return 1
            if (!b.due_date) return -1
            return new Date(a.due_date) - new Date(b.due_date)
          })[0] || null}
          onGoMeetings={() => { setActiveView('meetings'); loadMyMeetings() }}
          onGoTasks={() => setActiveView('tasks')}
        />

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
            /* First-run guide instead of a bare empty state: a new lead lands here
               with nothing, so we show the 3 steps to the first value moment and a
               single primary CTA. Progressive disclosure — no overlay tour needed. */
            <div className="card" style={{ maxWidth: 520, margin: '8px auto', padding: '28px 26px', textAlign: 'left' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Начните за 3 шага</h2>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
                Соберите команду и проведите первую встречу один-на-один.
              </p>
              <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['Создайте команду', 'Дайте ей название — это ваше рабочее пространство.'],
                  ['Пригласите участников', 'Отправьте код приглашения коллегам.'],
                  ['Запланируйте встречу', 'Назначьте первую 1-на-1 с участником.'],
                ].map(([t, d], i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span aria-hidden="true" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <button onClick={() => setShowCreateTeam(true)} className="btn btn-accent" style={{ fontWeight: 700 }}>
                Создать команду
              </button>
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
                    }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M7.5 10.5a3.75 3.75 0 0 0 5.304.046l2.25-2.25a3.75 3.75 0 0 0-5.304-5.304L8.5 4.24" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M10.5 7.5a3.75 3.75 0 0 0-5.304-.046L2.946 9.704a3.75 3.75 0 0 0 5.304 5.304l1.246-1.247" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-600)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Код приглашения
                      </p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--blue-700)' }}>
                        {teamDetail.invite_code}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
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
                        {regenerating ? '...' : 'Новый код'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setShowAddMember(true) }}
                        className="btn btn-accent-ghost btn-sm"
                      >
                        + Участника
                      </button>
                      {/* Этап 4: доступ к реквизитам компании пространства. */}
                      <button
                        onClick={e => { e.stopPropagation(); openOrg(selectedTeamId) }}
                        className="btn btn-secondary btn-sm"
                        title={t('company.sectionTitle')}
                      >
                        {t('company.sectionTitle')}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
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
                                    background: member.is_online ? 'var(--color-success)' : 'var(--gray-300)',
                                    border: '2px solid var(--color-surface)',
                                    transition: 'background 0.3s',
                                  }} title={member.is_online ? 'Онлайн' : 'Не в сети'} />
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
                              {/* Задача 2: будущая назначенная встреча — «Ближайшая», прошедшая — «Последняя». */}
                              {member.last_meeting_date && new Date(member.last_meeting_date) >= new Date()
                                ? 'Ближайшая встреча: '
                                : 'Последняя встреча: '}
                              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                {member.last_meeting_date
                                  ? new Date(member.last_meeting_date).toLocaleDateString('ru-RU')
                                  : 'Не было'}
                              </span>
                            </p>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                              <button
                                onClick={() => { setScheduleMember(member); setShowSchedule(true) }}
                                className="btn btn-accent btn-sm"
                                style={{ flex: 1 }}
                              >
                                Запланировать
                              </button>
                              <button
                                onClick={() => handleMemberCardCall(member.user_id)}
                                disabled={memberCallLoading[member.user_id]}
                                className="btn btn-secondary btn-sm"
                                style={{ flexShrink: 0, fontWeight: 600 }}
                                title={`Созвон с ${member.user_name}`}
                              >
                                {memberCallLoading[member.user_id] ? '...' : 'Созвон'}
                              </button>
                            </div>

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
                                  {tasks !== undefined && tasks.map(task => {
                                    const st = task.status || 'in_progress'
                                    return (
                                      <div key={task.id} style={{ padding: '4px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{
                                              fontSize: 12, lineHeight: 1.4,
                                              color: task.completed ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                                              textDecoration: task.completed ? 'line-through' : 'none',
                                            }}>
                                              {task.title || task.description}
                                            </p>
                                            {task.due_date && (() => {
                                              const overdue = task.status !== 'done' && new Date(task.due_date) < new Date(new Date().toDateString())
                                              return (
                                                <p style={{ fontSize: 11, color: overdue ? 'var(--color-danger)' : 'var(--color-text-muted)', marginTop: 2, fontWeight: overdue ? 600 : 400 }}>
                                                  {overdue ? 'Просрочено · ' : 'до '}
                                                  {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                                </p>
                                              )
                                            })()}
                                          </div>
                                          {task.is_multi ? (
                                            <span style={{ fontSize: 12, fontWeight: 700, color: task.completed ? '#15803d' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                              {task.progress ? `${task.progress.done}/${task.progress.total}` : ''}
                                            </span>
                                          ) : (
                                            <TaskStatusSelect
                                              status={st}
                                              onChange={async (newStatus) => {
                                                try {
                                                  await updateTask(task.id, { status: newStatus, completed: newStatus === 'done' })
                                                  setMemberTasks(prev => ({
                                                    ...prev,
                                                    [member.user_id]: (prev[member.user_id] || []).map(t =>
                                                      t.id === task.id ? { ...t, status: newStatus, completed: newStatus === 'done' } : t
                                                    ),
                                                  }))
                                                } catch {}
                                              }}
                                              canMarkDone={true}
                                            />
                                          )}
                                        </div>
                                        {task.is_multi && (
                                          <TaskAssignees task={task} currentUserId={user.id} canManageAll={true} onChanged={patchTaskEverywhere} contacts={(teamDetail?.members || []).filter(mm => mm.user_id !== user.id).map(mm => ({ user_id: mm.user_id, name: usersMap[mm.user_id]?.name || `Участник #${mm.user_id}` }))} />
                                        )}
                                        <SubtaskList
                                          taskId={task.id}
                                          refreshKey={subtaskRefresh[task.id] || 0}
                                          onAllDone={() => {
                                            updateTask(task.id, { status: 'done', completed: true }).catch(() => {})
                                            setMemberTasks(prev => ({
                                              ...prev,
                                              [member.user_id]: (prev[member.user_id] || []).map(t =>
                                                t.id === task.id ? { ...t, status: 'done', completed: true } : t
                                              ),
                                            }))
                                          }}
                                        />
                                      </div>
                                    )
                                  })}

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
                      <div className="empty-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8l1.6-3.2A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.8 1.1L20 8"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M4 8h5l1 2h4l1-2h5"/></svg></div>
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

      {userCardMember && <UserCard user={userCardMember} teamId={selectedTeamId} organization={teamDetail?.organization}
        onClose={() => setUserCardMember(null)}
        /* Тимлид: все три быстрых действия. Встреча — прямое назначение;
           звонок — спонтанный созвон; задача — предложение (с согласием). */
        onCreateMeeting={(u) => { setScheduleMember({ user_id: u.id, user_name: u.name }); setShowSchedule(true) }}
        onStartCall={(u) => handleStartSpontaneousCall([u.id], false)}
        onProposeTask={(u) => { setTaskProposalPreset(u.id); setShowTaskProposals(true) }}
      />}

      {showTaskProposals && (
        <TaskProposals
          currentUser={user}
          contacts={(teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => ({ user_id: m.user_id, name: m.user_name || `Участник #${m.user_id}` }))}
          teamId={selectedTeamId}
          presetToUserId={taskProposalPreset}
          onClose={() => { setShowTaskProposals(false); setTaskProposalPreset(null) }}
          onChanged={() => { if (selectedTeamId) loadTeamDetail(selectedTeamId) }}
        />
      )}

      {showStartCall && (
        <Modal
          title={callStep === 'done' ? 'Созвон начат' : 'Начать созвон'}
          onClose={() => { setShowStartCall(false); setCallStep('type'); setCallResult(null); setRoomUrlCopied(false) }}
        >
          {/* Step 1: choose type */}
          {callStep === 'type' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>
                Выберите тип созвона:
              </p>
              <button
                onClick={() => {
                  const all = (teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => m.user_id)
                  if (all.length === 0) return toast('Нет участников в команде', 'error')
                  handleStartSpontaneousCall(all, true)
                }}
                disabled={callModalLoading}
                className="btn btn-accent"
                style={{ justifyContent: 'flex-start', gap: 12, padding: '14px 16px' }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="3.5" stroke="white" strokeWidth="1.5"/>
                    <circle cx="15" cy="8" r="3.5" stroke="white" strokeWidth="1.5" opacity="0.7"/>
                    <path d="M1 18c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Общий созвон</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Вся команда получит приглашение</div>
                </div>
              </button>
              <button
                onClick={() => { setCallSelected([]); setCallStep('select') }}
                disabled={callModalLoading}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', gap: 12, padding: '14px 16px' }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="7" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="15" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" opacity="0.7"/>
                    <path d="M2 19c0-2.8 2.24-5 5-5s5 2.2 5 5M11 19c0-2.8 2.24-5 5-5s4 1.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Несколько участников</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Выбрать нескольких из команды</div>
                </div>
              </button>
              <button
                onClick={() => setCallStep('members')}
                disabled={callModalLoading}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', gap: 12, padding: '14px 16px' }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="11" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M3 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Индивидуальный</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Выбрать конкретного участника</div>
                </div>
              </button>
              {callModalLoading && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  Создаём комнату и отправляем уведомления...
                </p>
              )}
            </div>
          )}

          {/* Step 2b: pick several members (39.8) */}
          {callStep === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setCallStep('type')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'left', padding: 0, marginBottom: 4 }}
              >
                ← Назад
              </button>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
                Отметьте участников созвона:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {teamDetail?.members?.filter(m => m.user_id !== user.id).map(member => {
                  const on = callSelected.includes(member.user_id)
                  return (
                    <label key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--color-border)', background: on ? 'var(--blue-50)' : 'var(--color-bg)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => setCallSelected(s => on ? s.filter(x => x !== member.user_id) : [...s, member.user_id])} />
                      <div className="avatar avatar-sm avatar-accent" style={{ flexShrink: 0, width: 26, height: 26, fontSize: 12 }}>
                        {(member.user_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{member.user_name}</span>
                    </label>
                  )
                })}
                {(!teamDetail?.members || teamDetail.members.filter(m => m.user_id !== user.id).length === 0) && (
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>Нет участников в команде</p>
                )}
              </div>
              <button
                onClick={() => { if (callSelected.length === 0) return toast('Выберите участников', 'error'); handleStartSpontaneousCall(callSelected, callSelected.length > 1) }}
                disabled={callModalLoading || callSelected.length === 0}
                className="btn btn-accent"
                style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {callModalLoading ? <><Spinner size={15} /> Создаём...</> : `Начать созвон${callSelected.length ? ` (${callSelected.length})` : ''}`}
              </button>
            </div>
          )}

          {/* Step 2: pick member */}
          {callStep === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => setCallStep('type')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'left', padding: 0, marginBottom: 4 }}
              >
                ← Назад
              </button>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>
                Выберите участника:
              </p>
              {teamDetail?.members?.filter(m => m.user_id !== user.id).map(member => (
                <button
                  key={member.user_id}
                  onClick={() => handleStartSpontaneousCall([member.user_id], false)}
                  disabled={callModalLoading}
                  className="btn btn-secondary btn-sm"
                  style={{ justifyContent: 'flex-start', gap: 10 }}
                >
                  <div className="avatar avatar-sm avatar-accent" style={{ flexShrink: 0, width: 28, height: 28, fontSize: 12 }}>
                    {(member.user_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{member.user_name}</div>
                    {member.user_title && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{member.user_title}</div>}
                  </div>
                </button>
              ))}
              {(!teamDetail?.members || teamDetail.members.filter(m => m.user_id !== user.id).length === 0) && (
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  Нет участников в команде
                </p>
              )}
              {callModalLoading && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 4 }}>
                  Создаём комнату и отправляем уведомления...
                </p>
              )}
            </div>
          )}

          {/* Step 3: done — show invite link */}
          {callStep === 'done' && callResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ display: 'inline-block' }}>
                  <circle cx="20" cy="20" r="18" stroke="#4f46e5" strokeWidth="2"/>
                  <path d="M12 20l6 6 10-12" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
                Комната создана! Участники получили уведомления.
              </p>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 8, padding: '10px 14px',
                border: '1px solid var(--color-border)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Ссылка-приглашение:</div>
                <div style={{
                  fontSize: 13, color: 'var(--color-accent)', wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}>
                  {callResult.room_url}
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(callResult.room_url).then(() => setRoomUrlCopied(true))
                }}
                className={roomUrlCopied ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ gap: 8 }}
              >
                {roomUrlCopied ? '✓ Скопировано!' : 'Копировать ссылку'}
              </button>
              <button
                onClick={() => {
                  const roomName = callResult.room_name || callResult.room_url?.split('/').pop()
                  setActiveCall({ room_name: roomName, room_url: callResult.room_url, meeting_id: callResult.meeting_id })
                  setShowStartCall(false)
                }}
                className="btn btn-accent"
                style={{ gap: 8, fontWeight: 700 }}
              >
                Начать созвон
              </button>
            </div>
          )}
        </Modal>
      )}

      {showCreateTeam && (
        <Modal title="Создать команду" onClose={() => setShowCreateTeam(false)}>
          <form onSubmit={handleCreateTeam}>
            <div className="form-group">
              <label className="form-label">Название команды</label>
              <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Например: Backend Team" className="input" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setShowCreateTeam(false)} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{formLoading ? <><Spinner size={15} /> Создание...</> : 'Создать'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Этап 2: опциональный шаг «компания» после создания пространства. Два
          равнозначных по визуальному весу варианта; ни один не блокирует продукт. */}
      {companyStep && (
        <Modal title={t('company.stepTitle')} onClose={() => setCompanyStep(null)}>
          {!companyStep.showSearch ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
                {t('company.stepSubtitle')}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { key: 'company', title: t('company.optionCompanyTitle'), desc: t('company.optionCompanyDesc'),
                    onClick: () => setCompanyStep(s => ({ ...s, showSearch: true })) },
                  { key: 'skip', title: t('company.optionSkipTitle'), desc: t('company.optionSkipDesc'),
                    onClick: () => setCompanyStep(null) },
                ].map(opt => (
                  <button key={opt.key} type="button" onClick={opt.onClick} style={{
                    textAlign: 'left', padding: '18px 16px', borderRadius: 12, cursor: 'pointer',
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'inherit',
                    display: 'flex', flexDirection: 'column', gap: 6, minHeight: 116,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{opt.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <CompanySearch
              submitting={companySaving}
              onCancel={() => setCompanyStep(s => ({ ...s, showSearch: false }))}
              onSubmit={(payload) => handleSaveCompany(companyStep.teamId, payload, { fromStep: true })}
            />
          )}
        </Modal>
      )}

      {/* Этап 4: раздел «Организация» в настройках пространства. */}
      {showOrg && (
        <Modal title={t('company.sectionTitle')} onClose={() => { setShowOrg(false); setOrgEditing(false) }}>
          {!orgData ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('common.loading')}</p>
          ) : orgEditing || !orgData.has_company ? (
            !orgEditing && !orgData.has_company ? (
              <div>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
                  {t('company.sectionEmpty')}
                </p>
                {/* В Mini App данные о компании — только просмотр (таблица) */}
                {!isTg && (
                  <button className="btn btn-accent" onClick={() => setOrgEditing(true)}>
                    {t('company.addCompany')}
                  </button>
                )}
              </div>
            ) : (
              <CompanySearch
                initial={orgData.company || undefined}
                submitting={companySaving}
                onCancel={orgData.has_company ? () => setOrgEditing(false) : undefined}
                onSubmit={(payload) => handleSaveCompany(selectedTeamId, payload)}
              />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['company.fieldName', orgData.company.name],
                ['company.fieldInn', orgData.company.inn],
                ['company.fieldKpp', orgData.company.kpp],
                ['company.fieldOgrn', orgData.company.ogrn],
                ['company.fieldAddress', orgData.company.legal_address],
                ['company.fieldIndustry', orgData.company.industry],
                ['company.fieldManagement', orgData.company.management],
                ['company.fieldStatus', orgData.company.status],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t(k)}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              {/* Редактирование/удаление компании — только в полной версии */}
              {!isTg && (
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleRemoveCompany(selectedTeamId)} disabled={companySaving}>
                    {t('common.delete')}
                  </button>
                  <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => setOrgEditing(true)}>
                    {t('common.edit')}
                  </button>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Этап 5: мягкая, полностью закрываемая рекомендация тарифа (только веб).
          Информационная ссылка на тарифы, без автоматических действий. */}
      {pricingHint && (
        <Modal title="Рекомендация тарифа" onClose={dismissPricingHint}>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
            Судя по размеру вашей компании, вам может подойти тариф «{pricingHint.label}». Это лишь
            подсказка — посмотрите условия и решите сами.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={dismissPricingHint}>
              Позже
            </button>
            <button className="btn btn-accent" style={{ flex: 1 }}
              onClick={() => { dismissPricingHint(); window.location.href = `/?upgrade=1&plan=${pricingHint.plan}` }}>
              Посмотреть тарифы
            </button>
          </div>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setShowAddMember(false)} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{formLoading ? <><Spinner size={15} /> Добавление...</> : 'Добавить'}</button>
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
              {/*
                Коучинг "до встречи": подсказки стоят прямо у поля повестки, а не
                отдельным советом дня, потому что именно здесь руководитель решает,
                о чём говорить. Рождаются из данных участника (каденция, просрочки).
                Полностью опциональны — прячутся кнопкой и глобально выключаются в
                меню (coachingEnabled). coachTick заставляет пересчитать при
                переключении настройки. Читаем задачи участника из memberTasks.
              */}
              {!coachHidden && coachingEnabled(user.id) && (() => {
                const sugg = buildAgendaSuggestions({
                  member: scheduleMember,
                  tasks: memberTasks[scheduleMember.user_id] || [],
                })
                void coachTick
                if (sugg.length === 0) return null
                const add = (line) => setScheduleAgenda(prev => prev.trim() ? `${prev.trim()}\n- ${line}` : `- ${line}`)
                return (
                  <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>Пит подсказывает темы</span>
                      <button type="button" onClick={() => setCoachHidden(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12 }}>
                        Скрыть
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sugg.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{s.line}</p>
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.reason}</p>
                          </div>
                          <button type="button" onClick={() => add(s.line)}
                            style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', background: 'var(--color-surface)', border: '1px solid var(--blue-200)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
                            Добавить
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => { setShowSchedule(false); setScheduleMember(null) }} className="btn btn-secondary" style={{ flex: 1 }}>Отмена</button>
              <button type="submit" disabled={formLoading} className="btn btn-accent" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{formLoading ? <><Spinner size={15} /> Сохранение...</> : 'Запланировать'}</button>
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
        onClose={() => { setActiveCall(null); loadMyMeetings() }}
      />
    )}

    {/* Групповая встреча (Задача 4) */}
    {showGroupModal && (
      <GroupMeetingModal
        members={(teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => ({ user_id: m.user_id, name: usersMap[m.user_id]?.name || `Участник #${m.user_id}` }))}
        teamId={selectedTeamId}
        teamLeadId={user.id}
        onClose={() => setShowGroupModal(false)}
        onCreated={() => loadMyMeetings()}
      />
    )}

    {/* Предложения встреч (Задача 5) */}
    {showProposals && (
      <MeetingProposals
        currentUser={user}
        contacts={(teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => ({ user_id: m.user_id, name: usersMap[m.user_id]?.name || `Участник #${m.user_id}` }))}
        teamId={selectedTeamId}
        onClose={() => setShowProposals(false)}
        onChanged={() => loadMyMeetings()}
      />
    )}

    {/* Взаимодействия (блок 39) */}
    {showInteractions && (
      <InteractionsPanel
        currentUser={user}
        contacts={(teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => ({ user_id: m.user_id, name: usersMap[m.user_id]?.name || `Участник #${m.user_id}` }))}
        tasks={myTasks}
        teamId={selectedTeamId}
        onClose={() => setShowInteractions(false)}
      />
    )}

    {/* Совместная задача */}
    {collabModal && (
      <CollabTaskModal
        members={(teamDetail?.members || []).filter(m => m.user_id !== user.id).map(m => ({ user_id: m.user_id, name: usersMap[m.user_id]?.name || `Участник #${m.user_id}` }))}
        teamId={selectedTeamId}
        assignedBy={user.id}
        onClose={() => setCollabModal(false)}
        onCreated={handleCollabCreated}
      />
    )}

    {rescheduleModal && (
      <div className="overlay-center" onClick={() => setRescheduleModal(null)}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, width: '90vw' }}>
          <div className="modal-header" style={{ paddingBottom: 12 }}>
            <div>
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #3B6EF0, #2554D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg></span>
                AI предлагает слоты
              </span>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Перенос встречи с {rescheduleModal.memberName} · каденция {rescheduleModal.cadence} дн.
              </p>
            </div>
            <button className="modal-close" aria-label="Закрыть" onClick={() => setRescheduleModal(null)}>✕</button>
          </div>
          {slotsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0' }}>
              <div className="spinner" style={{ borderColor: '#ddd6fe', borderTopColor: '#3B6EF0' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>AI подбирает слоты...</span>
            </div>
          ) : slotsLocked ? (
            // Тарифное ограничение (Задача 3): мягкое сообщение + переход к тарифам.
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '18px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.5 }}>
                {slotsLocked.message}
              </p>
              <button onClick={() => openPricing('team')} className="btn btn-accent btn-sm">Посмотреть тарифы</button>
            </div>
          ) : aiSlots.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiSlots.map((slot, i) => {
                const dt = new Date(slot)
                return (
                  <button
                    key={i}
                    onClick={() => handleRescheduleSelect(slot)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 10,
                      background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-100)'; e.currentTarget.style.borderColor = 'var(--color-accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--blue-50)'; e.currentTarget.style.borderColor = 'var(--blue-200)' }}
                  >
                    <div style={{ width: 42, height: 42, background: 'var(--color-accent)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'white', fontWeight: 700 }}>{dt.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', margin: 0 }}>
                        {dt.toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                        {dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 0' }}>Не удалось получить слоты</p>
          )}
        </div>
      </div>
    )}
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
