import axios from 'axios'

const baseURL = (import.meta.env.VITE_API_URL || '') + '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
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
export const createTask = (data) => api.post('/tasks/', data)
export const getTasks = (params) => api.get('/tasks/', { params })
export const getMyLeadTasks = (userId) => api.get('/tasks/', { params: { assigned_to: userId, assigned_by: userId } })
export const updateTask = (id, data) => api.patch(`/tasks/${id}`, data)
export const deleteTask = (id) => api.delete(`/tasks/${id}`)

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

// Knowledge Base
export const getKnowledgeArticles = (teamId) => api.get(`/knowledge/team/${teamId}`)
export const createKnowledgeArticle = (data) => api.post('/knowledge/', data)
export const updateKnowledgeArticle = (id, data) => api.patch(`/knowledge/${id}`, data)
export const deleteKnowledgeArticle = (id) => api.delete(`/knowledge/${id}`)

// Mood
export const submitMood = (data) => api.post('/mood/', data)
export const getTeamMoodSummary = (teamId) => api.get(`/mood/team/${teamId}/summary`)

export default api
