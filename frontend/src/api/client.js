import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Users
export const createUser = (data) => api.post('/users/', data)
export const getUsers = () => api.get('/users/')
export const getUser = (id) => api.get(`/users/${id}`)
export const updateUser = (id, data) => api.patch(`/users/${id}`, data)

// Teams
export const createTeam = (data) => api.post('/teams/', data)
export const getTeams = () => api.get('/teams/')
export const getTeam = (id) => api.get(`/teams/${id}`)
export const joinTeam = (data) => api.post('/teams/join', data)
export const addMember = (teamId, userId, role) =>
  api.post(`/teams/${teamId}/members`, null, { params: { user_id: userId, role } })

// Meetings
export const createMeeting = (data) => api.post('/meetings/', data)
export const getMeetings = (params) => api.get('/meetings/', { params })
export const getMeeting = (id) => api.get(`/meetings/${id}`)
export const updateMeeting = (id, data) => api.patch(`/meetings/${id}`, data)
export const requestMeeting = (data) => api.post('/meetings/request', data)
export const confirmMeeting = (id) => api.post(`/meetings/${id}/confirm`)
export const declineMeeting = (id) => api.post(`/meetings/${id}/decline`)

// Scheduling
export const getAvailableSlots = (data) => api.post('/scheduling/slots', data)

// Tasks
export const createTask = (data) => api.post('/tasks/', data)
export const getTasks = (params) => api.get('/tasks/', { params })
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

export default api