import axios from 'axios'
import { getToken } from '../lib/auth'

const baseURL = (import.meta.env.VITE_API_URL || '') + '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Подставляем собственный JWT (если есть) на каждый запрос. Telegram-сессии
// токена не имеют — тогда заголовок не добавляется, как и раньше.
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Users
export const createUser = (data) => api.post('/users/', data)
export const getUsers = () => api.get('/users/')
export const getUser = (id) => api.get(`/users/${id}`)
export const getUserByEmail = (email) => api.get(`/users/by-email/${encodeURIComponent(email)}`)
export const updateUser = (id, data) => api.patch(`/users/${id}`, data)

// Teams
export const createTeam = (data) => api.post('/teams/', data)
export const getTeams = () => api.get('/teams/')
export const getTeam = (id) => api.get(`/teams/${id}`)
export const getMemberTeam = (userId) => api.get(`/teams/by-member/${userId}`)
export const joinTeam = (data) => api.post('/teams/join', data)
export const addMember = (teamId, userId, role) =>
  api.post(`/teams/${teamId}/members`, null, { params: { user_id: userId, role } })
export const regenerateInviteCode = (teamId) =>
  api.post(`/teams/${teamId}/regenerate-invite`)

// Meetings
export const createMeeting = (data) => api.post('/meetings/', data)
export const getMeetings = (params) => api.get('/meetings/', { params })
export const getMeeting = (id) => api.get(`/meetings/${id}`)
export const updateMeeting = (id, data) => api.patch(`/meetings/${id}`, data)
export const requestMeeting = (data) => api.post('/meetings/request', data)
export const confirmMeeting = (id) => api.post(`/meetings/${id}/confirm`)
export const declineMeeting = (id) => api.post(`/meetings/${id}/decline`)
export const endCall = (id) => api.post(`/meetings/${id}/end-call`)
export const getMeetingAISlots = (data) => api.post('/meetings/ai-slots', data)
export const startCall = (meetingId, userId) =>
  api.post(`/meetings/${meetingId}/start-call`, null, { params: { user_id: userId } })
export const startSpontaneousCall = (data) => api.post('/video/start-call', data)
export const uploadRecording = (meetingId, formData) =>
  api.post(`/video/meetings/${meetingId}/upload-recording`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getTranscript = (meetingId) =>
  api.get(`/video/meetings/${meetingId}/transcript`)

// Scheduling
export const getAvailableSlots = (data) => api.post('/scheduling/slots', data)

// Tasks
// После любой мутации задачи оповещаем интерфейс событием 'tasks-updated',
// чтобы счётчик «Закрыто сегодня» (Задача 2) обновлялся мгновенно, без refresh.
const notifyTasksUpdated = (r) => {
  try { window.dispatchEvent(new Event('tasks-updated')) } catch {}
  return r
}
export const createTask = (data) => api.post('/tasks/', data).then(notifyTasksUpdated)
export const getTasks = (params) => api.get('/tasks/', { params })
export const getMyLeadTasks = (userId) => api.get('/tasks/', { params: { assigned_to: userId, assigned_by: userId } })
export const updateTask = (id, data) => api.patch(`/tasks/${id}`, data).then(notifyTasksUpdated)
export const deleteTask = (id) => api.delete(`/tasks/${id}`).then(notifyTasksUpdated)
export const getTaskAIAdvice = (data) => api.post('/tasks/ai-advice', data)
// Совместные задачи (Задача 4): статус части одного участника + закрытые сегодня.
export const updateTaskAssignee = (assigneeId, data) => api.patch(`/tasks/assignee/${assigneeId}`, data).then(notifyTasksUpdated)
export const getClosedTodayTasks = (userId) => api.get(`/tasks/closed-today/${userId}`)

// Notifications
export const getNotifications = (userId, unreadOnly = false) =>
  api.get('/notifications/', { params: { user_id: userId, unread_only: unreadOnly } })
export const getUnreadCount = (userId) =>
  api.get('/notifications/count', { params: { user_id: userId } })
export const markRead = (id) => api.post(`/notifications/${id}/read`)
export const markAllRead = (userId) =>
  api.post('/notifications/read-all', null, { params: { user_id: userId } })

// Analytics
export const getLeadAnalytics = (userId) => api.get(`/analytics/lead/${userId}`)
export const getMemberAnalytics = (userId) => api.get(`/analytics/member/${userId}`)

// Notes
export const getNotes = (userId) => api.get('/notes/', { params: { user_id: userId } })
export const createNote = (data) => api.post('/notes/', data)
export const updateNote = (id, data) => api.patch(`/notes/${id}`, data)
export const deleteNote = (id) => api.delete(`/notes/${id}`)

export const heartbeat = (userId) => api.post(`/users/${userId}/heartbeat`)
export const getUserStats = (userId) => api.get(`/users/${userId}/stats`)

// Admin
export const getAdminStats = () => api.get('/users/admin/stats')
export const broadcastNotification = (data) => api.post('/notifications/broadcast', data)
export const getServiceHealth = () => api.get('/health/detailed')

// Assistant (Пит)
export const pitChat = (messages, context = '', userId = null) => api.post('/assistant/chat', { messages, context, user_id: userId })

// Knowledge Base
export const getKnowledgeArticles = (teamId) => api.get(`/knowledge/team/${teamId}`)
export const createKnowledgeArticle = (data) => api.post('/knowledge/', data)
export const updateKnowledgeArticle = (id, data) => api.patch(`/knowledge/${id}`, data)
export const deleteKnowledgeArticle = (id) => api.delete(`/knowledge/${id}`)

// Mood
export const submitMood = (data) => api.post('/mood/', data)
export const getTeamMoodSummary = (teamId) => api.get(`/mood/team/${teamId}/summary`)

// Subtasks
export const createSubtasks = (taskId, titles) => api.post('/subtasks/bulk', { task_id: taskId, titles })
export const getSubtasks = (taskId) => api.get('/subtasks/', { params: { task_id: taskId } })
export const updateSubtask = (id, data) => api.patch(`/subtasks/${id}`, data)
export const deleteSubtask = (id) => api.delete(`/subtasks/${id}`)

// Checkins
export const checkInArrive = (userId) => api.post('/checkins/arrive', { user_id: userId })
export const checkInLeave = (userId) => api.post('/checkins/leave', { user_id: userId })
export const getTodayCheckin = (userId) => api.get(`/checkins/today/${userId}`)
export const getTeamCheckins = (teamId, days = 7) => api.get(`/checkins/team/${teamId}`, { params: { days } })

// Support tickets
export const createSupportTicket = (data) => api.post('/support/', data)
export const getSupportTickets = () => api.get('/support/')
export const getUserTickets = (userId) => api.get(`/support/user/${userId}`)
export const getSupportUnreadCount = () => api.get('/support/unread-count')
export const markTicketRead = (id) => api.patch(`/support/${id}/read`)
export const markAllTicketsRead = () => api.patch('/support/read-all')
export const adminReplyTicket = (id, body) => api.post(`/support/${id}/reply`, { body })
export const userSendMessage = (id, body) => api.post(`/support/${id}/message`, { body })
export const userReadReply = (id) => api.patch(`/support/${id}/user-read`)
// Admin user management
export const blockUser = (id) => api.patch(`/users/${id}/block`)
export const unblockUser = (id) => api.patch(`/users/${id}/unblock`)
export const deleteUser = (id) => api.delete(`/users/${id}`)
export const getAdminAnalytics = () => api.get('/users/admin/analytics')
// Billing (public)
export const getBillingPlans = () => api.get('/billing/plans')
export const getBillingMe = (userId) => api.get('/billing/me', { params: userId ? { user_id: userId } : {} })
export const checkoutPlan = (data) => api.post('/billing/checkout', data)
// Единая точка решения о смене тарифа (лендинг и ЛК) и отмена подписки.
export const changePlanPreview = (data) => api.post('/billing/change/preview', data)
export const cancelMySubscription = (userId) => api.post('/billing/cancel', { user_id: userId })
// Admin billing
export const getAdminSubscriptions = () => api.get('/admin/billing/subscriptions')
export const getAdminPayments = () => api.get('/admin/billing/payments')
export const activateSubscription = (data) => api.post('/admin/billing/subscriptions/activate', data)
export const startTrialSubscription = (data) => api.post('/admin/billing/subscriptions/trial', data)
export const extendSubscription = (id) => api.post(`/admin/billing/subscriptions/${id}/extend`)
export const cancelSubscription = (id) => api.post(`/admin/billing/subscriptions/${id}/cancel`)
export const setUserOverride = (id, data) => api.patch(`/admin/billing/users/${id}/override`, data)
export const getAdminMetrics = () => api.get('/admin/billing/metrics')
// Аудит превышений лимитов перед включением ENTITLEMENTS_ENFORCE (Этап 1).
export const getEnforcementAudit = () => api.get('/admin/billing/enforcement-audit')
export const getUserBilling = (userId) => api.get(`/admin/billing/user/${userId}`)
// Реестр менеджеров + назначение из списка (manager_id, null = снять).
export const getManagers = () => api.get('/admin/billing/managers')
export const createManager = (data) => api.post('/admin/billing/managers', data)
export const deleteManager = (id) => api.delete(`/admin/billing/managers/${id}`)
export const assignManager = (userId, managerId) => api.post(`/admin/billing/users/${userId}/manager`, { manager_id: managerId })
// Компания рабочего пространства (Этапы 2-4) + регион по IP (Этап 5)
export const suggestCompany = (query) => api.get('/companies/suggest', { params: { query } })
export const getTeamCompany = (teamId) => api.get(`/companies/by-team/${teamId}`)
export const saveTeamCompany = (teamId, data) => api.put(`/companies/by-team/${teamId}`, data)
export const deleteTeamCompany = (teamId) => api.delete(`/companies/by-team/${teamId}`)
export const detectRegion = (userId) => api.post(`/users/${userId}/detect-region`)

// Telegram-авторизация (Этапы 2-5)
export const getTelegramConfig = () => api.get('/telegram/config')
export const telegramCallback = (data) => api.post('/telegram/callback', data)
export const telegramLink = (userId, code) => api.post('/telegram/link', { user_id: userId, code })
export const telegramMiniAppAuth = (initData) => api.post('/telegram/miniapp-auth', { init_data: initData })

// Собственная аутентификация (email/пароль + JWT), замена Supabase
export const authRegister = (data) => api.post('/auth/register', data)
export const authLogin = (data) => api.post('/auth/login', data)
export const authMe = () => api.get('/auth/me')
export const authConfirmEmail = (token) => api.post('/auth/confirm-email', { token })
export const authResendConfirmation = (data) => api.post('/auth/resend-confirmation', data)
export const authForgotPassword = (email) => api.post('/auth/forgot-password', { email })
export const authResetPassword = (token, new_password) => api.post('/auth/reset-password', { token, new_password })
export const authChangePassword = (data) => api.post('/auth/change-password', data)
export const authAddEmail = (userId, email) => api.post('/auth/add-email', { user_id: userId, email })

// Admin knowledge base
export const getAdminArticles = () => api.get('/knowledge/admin/all')
export const createAdminArticle = (data) => api.post('/knowledge/', { ...data, is_admin: true })
export const updateAdminArticle = (id, data) => api.patch(`/knowledge/${id}`, data)
export const deleteAdminArticle = (id) => api.delete(`/knowledge/${id}`)

export default api
