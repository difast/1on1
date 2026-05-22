import { supabase } from './supabase';

const BASE =
  (process.env.EXPO_PUBLIC_API_URL || 'https://ideal-upliftment-production-2850.up.railway.app') + '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const authHeader: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...authHeader, ...(options?.headers ?? {}) },
      ...options,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      // FastAPI returns detail as string or array of validation errors
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
export const updateUser = (id: number, data: unknown) =>
  req(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Teams
export const createTeam = (data: unknown) =>
  req('/teams/', { method: 'POST', body: JSON.stringify(data) });
export const getTeams = () => req<any[]>('/teams/');
export const getTeam = (id: number) => req(`/teams/${id}`);
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
export const requestMeeting = (data: unknown) =>
  req('/meetings/request', { method: 'POST', body: JSON.stringify(data) });
export const confirmMeeting = (id: number) =>
  req(`/meetings/${id}/confirm`, { method: 'POST' });
export const declineMeeting = (id: number) =>
  req(`/meetings/${id}/decline`, { method: 'POST' });

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
export const markAllRead = (userId: number) =>
  req(`/notifications/read-all?user_id=${userId}`, { method: 'POST' });

// Analytics
export const getLeadAnalytics = (userId: number) =>
  req(`/analytics/lead/${userId}`);
export const getMemberAnalytics = (userId: number) =>
  req(`/analytics/member/${userId}`);
