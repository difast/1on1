import { supabase } from './supabase';

const BASE =
  (process.env.EXPO_PUBLIC_API_URL || 'https://fulfilling-stillness-production-a6e1.up.railway.app') + '/api';

async function req<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const controller = new AbortController();
  // 30s default — the backend runs on a free Railway instance that cold-starts
  // slowly; a 15s timeout aborted long operations (e.g. broadcast) on the client
  // even though the server completed them, showing a false "error".
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 30000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...authHeader, ...(options?.headers ?? {}) },
      ...options,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      const detail = Array.isArray(body?.detail)
        ? body.detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
        : (body?.detail ?? body?.message ?? `HTTP ${res.status}`);
      throw { response: { data: body, status: res.status, detail } };
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw { response: { detail: 'Превышено время ожидания', status: 0 } };
    }
    throw err;
  }
}

// Users
export const createUser = (data: unknown) =>
  req('/users/', { method: 'POST', body: JSON.stringify(data) });
export const getUsers = () => req('/users/');
export const getUser = (id: number) => req(`/users/${id}`);
export const getUserByEmail = (email: string) =>
  req(`/users/by-email/${encodeURIComponent(email)}`);
export const deleteUser = (id: number) =>
  req<any>(`/users/${id}`, { method: 'DELETE' });
export const updateUser = (id: number, data: unknown) =>
  req(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Teams
export const createTeam = (data: unknown) =>
  req('/teams/', { method: 'POST', body: JSON.stringify(data) });
export const getTeams = () => req<any[]>('/teams/');
export const getTeam = (id: number) => req(`/teams/${id}`);
export const getMemberTeam = (userId: number) => req<any>(`/teams/by-member/${userId}`);
export const joinTeam = (data: unknown) =>
  req('/teams/join', { method: 'POST', body: JSON.stringify(data) });
export const addMember = (teamId: number, userId: number, role: string) =>
  req(`/teams/${teamId}/members?user_id=${userId}&role=${role}`, { method: 'POST' });
export const regenerateInviteCode = (teamId: number) =>
  req(`/teams/${teamId}/regenerate-invite`, { method: 'POST' });

// Meetings
export const createMeeting = (data: unknown) =>
  req('/meetings/', { method: 'POST', body: JSON.stringify(data) });
export const getMeetings = (params: Record<string, string | number>) => {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return req<any[]>(`/meetings/?${qs}`);
};
export const getMeeting = (id: number) => req<any>(`/meetings/${id}`);
export const updateMeeting = (id: number, data: unknown) =>
  req(`/meetings/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const requestMeeting = (data: unknown) =>
  req('/meetings/request', { method: 'POST', body: JSON.stringify(data) });
export const confirmMeeting = (id: number) =>
  req(`/meetings/${id}/confirm`, { method: 'POST' });
export const declineMeeting = (id: number) =>
  req(`/meetings/${id}/decline`, { method: 'POST' });
export const endCall = (id: number) =>
  req<any>(`/meetings/${id}/end-call`, { method: 'POST' });
export const startCall = (meetingId: number, userId: number) =>
  req<{ room_url: string; token: string; room_name: string }>(
    `/meetings/${meetingId}/start-call?user_id=${userId}`,
    { method: 'POST' },
  );

// Tasks
export const createTask = (data: unknown) =>
  req('/tasks/', { method: 'POST', body: JSON.stringify(data) });
export const getTasks = (params: Record<string, string | number>) => {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return req<any[]>(`/tasks/?${qs}`);
};
export const updateTask = (id: number, data: unknown) =>
  req(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTask = (id: number) =>
  req(`/tasks/${id}`, { method: 'DELETE' });

// Notifications
export const getNotifications = (userId: number) =>
  req<any[]>(`/notifications/?user_id=${userId}`);
export const getUnreadCount = (userId: number) =>
  req<{ unread_count: number }>(`/notifications/count?user_id=${userId}`);
export const markRead = (id: number) =>
  req(`/notifications/${id}/read`, { method: 'POST' });
export const markAllRead = (userId: number) =>
  req(`/notifications/read-all?user_id=${userId}`, { method: 'POST' });

// Analytics
export const getLeadAnalytics = (userId: number) =>
  req(`/analytics/lead/${userId}`);
export const getMemberAnalytics = (userId: number) =>
  req(`/analytics/member/${userId}`);

// Notes
export const getNotes = (userId: number) =>
  req<any[]>(`/notes/?user_id=${userId}`);
export const createNote = (data: { user_id: number; content: string; meeting_id?: number }) =>
  req<any>('/notes/', { method: 'POST', body: JSON.stringify(data) });
export const updateNote = (id: number, data: { content: string }) =>
  req<any>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteNote = (id: number) =>
  req<any>(`/notes/${id}`, { method: 'DELETE' });

// Check-in
export const checkInArrive = (userId: number) =>
  req<any>('/checkins/arrive', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const checkInLeave = (userId: number) =>
  req<any>('/checkins/leave', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const getTodayCheckin = (userId: number) =>
  req<any>(`/checkins/today/${userId}`);

// Support (user side)
export const createSupportTicket = (data: { user_id: number; subject: string; body: string }) =>
  req<any>('/support/', { method: 'POST', body: JSON.stringify(data) });
export const getUserTickets = (userId: number) =>
  req<any[]>(`/support/user/${userId}`);
export const userSendMessage = (ticketId: number, body: string) =>
  req<any>(`/support/${ticketId}/message`, { method: 'POST', body: JSON.stringify({ body }) });
export const userReadReply = (ticketId: number) =>
  req<any>(`/support/${ticketId}/user-read`, { method: 'PATCH' });

// Subtasks
export const getSubtasks = (taskId: number) =>
  req<any[]>(`/subtasks/?task_id=${taskId}`);
export const createSubtasks = (taskId: number, titles: string[]) =>
  req<any[]>('/subtasks/bulk', { method: 'POST', body: JSON.stringify({ task_id: taskId, titles }) });
export const updateSubtask = (subtaskId: number, data: { completed?: boolean; title?: string }) =>
  req<any>(`/subtasks/${subtaskId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteSubtask = (subtaskId: number) =>
  req<any>(`/subtasks/${subtaskId}`, { method: 'DELETE' });
export const getTaskAiAdvice = (title: string, status?: string, due_date?: string, role?: string) =>
  req<{ steps: string[] }>('/tasks/ai-advice', { method: 'POST', body: JSON.stringify({ title, status, due_date, role: role ?? 'member' }) });

// Mood
export const submitMood = (team_id: number, answers: string[]) =>
  req<any>('/mood/', { method: 'POST', body: JSON.stringify({ team_id, answers }) });
export const getTeamMoodSummary = (teamId: number) =>
  req<any>(`/mood/team/${teamId}/summary`);

// AI Assistant
export const assistantChat = (messages: { role: string; content: string }[], context = '') =>
  req<{ reply: string }>('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages, context }) });

// Admin
export const getAdminStats = () => req<any>('/users/admin/stats');
export const getAdminAnalytics = () => req<any>('/users/admin/analytics');
export const blockUser = (id: number) => req<any>(`/users/${id}/block`, { method: 'PATCH' });
export const unblockUser = (id: number) => req<any>(`/users/${id}/unblock`, { method: 'PATCH' });
export const getServiceHealth = () => req<any>('/health/detailed');
export const broadcastNotification = (data: { title: string; body?: string; target?: string }) =>
  // Broadcast fans out to every user — give it a generous timeout so a slow
  // (but successful) server response isn't reported as an error to the admin.
  req<any>('/notifications/broadcast', { method: 'POST', body: JSON.stringify(data), timeoutMs: 60000 });
export const getSupportTickets = () => req<any[]>('/support/');
export const adminReplyTicket = (ticketId: number, body: string) =>
  req<any>(`/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
