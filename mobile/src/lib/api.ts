import { getToken } from './authToken';

const BASE =
  (process.env.EXPO_PUBLIC_API_URL || 'https://api.oneononehq.com') + '/api';

async function req<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const token = await getToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
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
// Групповой созвон: несколько участников / вся команда.
export const createGroupMeeting = (data: {
  team_id: number; team_lead_id: number; scheduled_date: string; agenda?: string | null;
  member_ids?: number[] | null; whole_team?: boolean;
}) => req<any[]>('/meetings/group', { method: 'POST', body: JSON.stringify(data) });
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
// Спонтанный созвон (39.8): всем / нескольким / индивидуально. Сам звонок
// открывается внешним клиентом по ссылке (согласно таблице).
export const startSpontaneousCall = (data: { lead_id: number; team_id: number; member_ids: number[]; is_group?: boolean }) =>
  req<{ room_url: string; room_name: string; meeting_id: number | null }>(
    '/video/start-call', { method: 'POST', body: JSON.stringify(data) });

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
// Совместные задачи: статус части одного участника + закрытые сегодня.
export const updateTaskAssignee = (assigneeId: number, data: { status?: string; part_description?: string }) =>
  req<any>(`/tasks/assignee/${assigneeId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const getClosedTodayTasks = (userId: number) =>
  req<any[]>(`/tasks/closed-today/${userId}`);

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
export const getTaskAiAdvice = (title: string, status?: string, due_date?: string, role?: string, user_id?: number) =>
  req<{ steps: string[] }>('/tasks/ai-advice', { method: 'POST', body: JSON.stringify({ title, status, due_date, role: role ?? 'member', user_id }) });

// Mood
export const submitMood = (team_id: number, answers: string[], user_id?: number) =>
  req<any>('/mood/', { method: 'POST', body: JSON.stringify({ team_id, user_id, answers }) });
export const getTeamMoodSummary = (teamId: number) =>
  req<any>(`/mood/team/${teamId}/summary`);
export const getMoodToday = (userId: number, teamId: number) =>
  req<any>(`/mood/today/${userId}?team_id=${teamId}`);
export const getMyMoodSeries = (
  userId: number,
  opts: { period?: string; start?: string; end?: string; teamId?: number } = {},
) => {
  const p = new URLSearchParams();
  if (opts.period) p.set('period', opts.period);
  if (opts.start) p.set('start', opts.start);
  if (opts.end) p.set('end', opts.end);
  if (opts.teamId != null) p.set('team_id', String(opts.teamId));
  return req<any>(`/mood/me/${userId}/series?${p.toString()}`);
};

// AI Assistant
export const assistantChat = (messages: { role: string; content: string }[], context = '', user_id?: number) =>
  req<{ reply: string }>('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages, context, user_id }) });

// ONE AI (стратегический AI-центр; общий AI-слой с Питом, права на бэкенде)
export type OneAiSection = { key: string; title: string; scope: string };
export const getOneAiSections = (actorId: number) =>
  req<{ sections: OneAiSection[] }>(`/oneai/sections?actor_id=${actorId}`);
export const oneAiQuery = (data: { actor_id: number; section: string; target_user_id?: number; team_id?: number; message?: string }) =>
  req<{ reply: string; based_on: any }>('/oneai/query', { method: 'POST', body: JSON.stringify(data) });

// Per-user summary stats (включает closed_today — закрытые сегодня, по роли)
export const getUserStats = (userId: number) =>
  req<{ meetings: number; tasks_done: number; teams: number; closed_today: number }>(`/users/${userId}/stats`);

// Предложения встреч (переговоры о встрече с подтверждением)
export const createProposal = (data: { from_user_id: number; to_user_id: number; proposed_time: string; topic?: string | null; team_id?: number | null }) =>
  req<any>('/proposals/', { method: 'POST', body: JSON.stringify(data) });
export const getProposals = (userId: number) =>
  req<any[]>(`/proposals/?user_id=${userId}`);
export const acceptProposal = (id: number, userId: number) =>
  req<any>(`/proposals/${id}/accept`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const declineProposal = (id: number, userId: number) =>
  req<any>(`/proposals/${id}/decline`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const counterProposal = (id: number, userId: number, proposed_time: string, topic?: string) =>
  req<any>(`/proposals/${id}/counter`, { method: 'POST', body: JSON.stringify({ user_id: userId, proposed_time, topic }) });

// Предложения задач (отдельная сущность от предложения встречи и от задачи).
export const createTaskProposal = (data: { from_user_id: number; to_user_id: number; title: string; description?: string | null; due_date?: string | null; team_id?: number | null }) =>
  req<any>('/task-proposals/', { method: 'POST', body: JSON.stringify(data) });
export const getTaskProposals = (userId: number) =>
  req<any[]>(`/task-proposals/?user_id=${userId}`);
export const acceptTaskProposal = (id: number, userId: number) =>
  req<any>(`/task-proposals/${id}/accept`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const declineTaskProposal = (id: number, userId: number) =>
  req<any>(`/task-proposals/${id}/decline`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const commentTaskProposal = (id: number, userId: number, note: string) =>
  req<any>(`/task-proposals/${id}/comment`, { method: 'POST', body: JSON.stringify({ user_id: userId, note }) });

// Цели (постановка и отслеживание). Права проверяются на бэкенде: цель редактирует
// только владелец; тимлид видит цели команды и оставляет комментарии/итоговую оценку.
export type GoalComment = {
  id: number; author_id: number; author_name?: string | null;
  body: string; kind: string; rating?: number | null; created_at?: string | null;
};
export type Goal = {
  id: number; user_id: number; user_name?: string | null; team_id?: number | null;
  scope?: string;
  title: string; description?: string | null;
  period_label?: string | null; period_start?: string | null; period_end?: string | null;
  progress: number; status: string;
  created_at?: string | null; updated_at?: string | null; progress_updated_at?: string | null;
  suggested_status?: string | null; stagnant?: boolean; days_since_progress?: number | null;
  comments?: GoalComment[];
};
export type TeamGoals = {
  team_id: number;
  members: { user_id: number; user_name: string; user_avatar_url?: string | null; goals: Goal[] }[];
};
export const createGoal = (data: {
  user_id: number; title: string; description?: string | null; team_id?: number | null;
  scope?: string; period_label?: string | null; period_start?: string | null; period_end?: string | null;
}) => req<Goal>('/goals/', { method: 'POST', body: JSON.stringify(data) });
export const getGoals = (userId: number, actorId: number) =>
  req<Goal[]>(`/goals/?user_id=${userId}&actor_id=${actorId}`);
export const getTeamGoals = (teamId: number, actorId: number) =>
  req<TeamGoals>(`/goals/team/${teamId}?actor_id=${actorId}`);
export const getTeamSharedGoals = (teamId: number, actorId: number) =>
  req<Goal[]>(`/goals/team/${teamId}/goals?actor_id=${actorId}`);
export const getGoal = (goalId: number, actorId: number) =>
  req<Goal>(`/goals/${goalId}?actor_id=${actorId}`);
export const updateGoal = (goalId: number, data: {
  actor_id: number; title?: string; description?: string | null;
  period_label?: string | null; period_start?: string | null; period_end?: string | null;
  progress?: number; status?: string;
}) => req<Goal>(`/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteGoal = (goalId: number, actorId: number) =>
  req<any>(`/goals/${goalId}?actor_id=${actorId}`, { method: 'DELETE' });
export const addGoalComment = (goalId: number, data: { actor_id: number; body: string; kind?: string; rating?: number }) =>
  req<Goal>(`/goals/${goalId}/comments`, { method: 'POST', body: JSON.stringify(data) });

// Развитие (навыки, уровни, план развития, рекомендации). Права — на бэкенде.
export type DevSkill = {
  id: number; user_id: number; skill_id: number; skill_name?: string | null; category: string;
  current_level: number; current_level_label?: string | null;
  desired_level?: number | null; desired_level_label?: string | null;
  target_date?: string | null; gap: number;
  history?: { id: number; level: number; level_label?: string | null; note?: string | null; changed_at?: string | null }[];
};
export type DevStep = {
  id: number; user_id: number; title: string; description?: string | null;
  skill_id?: number | null; skill_name?: string | null; goal_id?: number | null; goal_title?: string | null;
  due_date?: string | null; status: string; progress: number;
  assigned_by?: number | null; assigned_by_name?: string | null; assigned_by_lead?: boolean; overdue?: boolean;
  comments?: GoalComment[];
};
export type DevRecommendation = {
  id: number; user_id: number; skill_id?: number | null; skill_name?: string | null;
  source: string; source_label?: string | null; title: string; body?: string | null;
  article_id?: number | null; target_level?: number | null; target_date?: string | null;
  status: string; created_by?: number | null; created_by_name?: string | null; created_at?: string | null;
};
export type Development = {
  user_id: number; skills: DevSkill[]; steps: DevStep[];
  recommendations: DevRecommendation[]; learning_goals: Goal[]; plan_progress: number;
};
export type TeamDevelopment = {
  team_id: number;
  members: { user_id: number; user_name: string; skills: DevSkill[]; plan_progress: number;
    active_steps: number; overdue_steps: number; gaps: number; has_active_plan: boolean }[];
};
export const getSkills = (teamId: number | undefined, actorId: number) =>
  req<any[]>(`/development/skills?actor_id=${actorId}${teamId ? `&team_id=${teamId}` : ''}`);
export const createSkill = (data: { actor_id: number; name: string; category?: string; team_id?: number | null }) =>
  req<any>('/development/skills', { method: 'POST', body: JSON.stringify(data) });
export const getDevelopment = (userId: number, actorId: number) =>
  req<Development>(`/development/${userId}?actor_id=${actorId}`);
export const addUserSkill = (data: { actor_id: number; user_id: number; skill_id?: number; skill_name?: string; category?: string; current_level?: number; desired_level?: number; target_date?: string | null }) =>
  req<DevSkill>('/development/skills/user', { method: 'POST', body: JSON.stringify(data) });
export const updateUserSkill = (usId: number, data: { actor_id: number; current_level?: number; desired_level?: number; target_date?: string | null; note?: string }) =>
  req<DevSkill>(`/development/skills/user/${usId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteUserSkill = (usId: number, actorId: number) =>
  req<any>(`/development/skills/user/${usId}?actor_id=${actorId}`, { method: 'DELETE' });
export const createDevStep = (data: { actor_id: number; user_id: number; title: string; description?: string | null; skill_id?: number; goal_id?: number; due_date?: string | null }) =>
  req<DevStep>('/development/steps', { method: 'POST', body: JSON.stringify(data) });
export const updateDevStep = (stepId: number, data: { actor_id: number; title?: string; description?: string | null; skill_id?: number; goal_id?: number; due_date?: string | null; status?: string; progress?: number }) =>
  req<DevStep>(`/development/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteDevStep = (stepId: number, actorId: number) =>
  req<any>(`/development/steps/${stepId}?actor_id=${actorId}`, { method: 'DELETE' });
export const addDevStepComment = (stepId: number, data: { actor_id: number; body: string; kind?: string; rating?: number }) =>
  req<DevStep>(`/development/steps/${stepId}/comments`, { method: 'POST', body: JSON.stringify(data) });
export const createDevRecommendation = (data: { actor_id: number; user_id: number; skill_id?: number; title: string; body?: string | null; target_level?: number; target_date?: string | null }) =>
  req<DevRecommendation>('/development/recommendations', { method: 'POST', body: JSON.stringify(data) });
export const aiDevRecommendation = (userId: number, actorId: number) =>
  req<DevRecommendation>(`/development/recommendations/ai?user_id=${userId}&actor_id=${actorId}`, { method: 'POST' });
export const actOnDevRecommendation = (recId: number, data: { actor_id: number; action: string; note?: string }) =>
  req<DevRecommendation>(`/development/recommendations/${recId}/action`, { method: 'POST', body: JSON.stringify(data) });
export const getTeamDevelopment = (teamId: number, actorId: number) =>
  req<TeamDevelopment>(`/development/team/${teamId}?actor_id=${actorId}`);
export const getMemberDevAnalytics = (userId: number, actorId: number) =>
  req<any>(`/development/analytics/member/${userId}?actor_id=${actorId}`);
export const getTeamDevAnalytics = (teamId: number, actorId: number) =>
  req<any>(`/development/analytics/team/${teamId}?actor_id=${actorId}`);

// Взаимодействия (блок 39): единая лента предложений/обсуждений/рекомендаций
export const createInteraction = (data: any) =>
  req<any>('/interactions/', { method: 'POST', body: JSON.stringify(data) });
export const getInteractions = (userId: number) =>
  req<any[]>(`/interactions/?user_id=${userId}`);
export const acceptInteraction = (id: number, userId: number) =>
  req<any>(`/interactions/${id}/accept`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const declineInteraction = (id: number, userId: number) =>
  req<any>(`/interactions/${id}/decline`, { method: 'POST', body: JSON.stringify({ user_id: userId }) });
export const replyInteraction = (id: number, userId: number, body: string) =>
  req<any>(`/interactions/${id}/reply`, { method: 'POST', body: JSON.stringify({ user_id: userId, body }) });
export const closeInteraction = (id: number, userId: number, outcome?: string) =>
  req<any>(`/interactions/${id}/close`, { method: 'POST', body: JSON.stringify({ user_id: userId, outcome }) });
export const getUserRecommendations = (userId: number) =>
  req<any[]>(`/interactions/recommendations/${userId}`);

// Совместная работа над задачей (39.2/39.3)
export const addTaskAssignee = (taskId: number, data: { user_id: number; actor_id: number; part_description?: string | null }) =>
  req<any>(`/tasks/${taskId}/assignees`, { method: 'POST', body: JSON.stringify(data) });
export const removeTaskAssigneeById = (taskId: number, assigneeId: number, actorId: number) =>
  req<any>(`/tasks/${taskId}/assignees/${assigneeId}?actor_id=${actorId}`, { method: 'DELETE' });
export const getTaskActivity = (taskId: number) => req<any[]>(`/tasks/${taskId}/activity`);
export const getTaskComments = (taskId: number) => req<any[]>(`/tasks/${taskId}/comments`);
export const addTaskComment = (taskId: number, authorId: number, body: string) =>
  req<any>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ author_id: authorId, body }) });
export const getTaskById = (taskId: number) => req<any>(`/tasks/${taskId}`);

// Собственная аутентификация (email/пароль + JWT), замена Supabase
export const authRegister = (data: { name: string; email: string; password: string }) =>
  req<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const authLogin = (data: { email: string; password: string }) =>
  req<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const authMe = () => req<any>('/auth/me');
export const authForgotPassword = (email: string) =>
  req<any>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
export const authResendConfirmation = (user_id: number) =>
  req<any>('/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ user_id }) });
export const authChangePassword = (data: { user_id: number; current_password: string; new_password: string }) =>
  req<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) });

// Telegram: привязка аккаунта по коду из бота
export const telegramLink = (user_id: number, code: string) =>
  req<{ status: string; user: any }>('/telegram/link', { method: 'POST', body: JSON.stringify({ user_id, code }) });

// Компания рабочего пространства (просмотр + поиск DaData + сохранение)
export const getTeamCompany = (teamId: number) =>
  req<{ has_company: boolean; company: any }>(`/companies/by-team/${teamId}`);
export const suggestCompany = (query: string) =>
  req<{ configured: boolean; suggestions: any[] }>(`/companies/suggest?query=${encodeURIComponent(query)}`);
export const saveTeamCompany = (teamId: number, data: any) =>
  req<{ has_company: boolean; company: any }>(`/companies/by-team/${teamId}`, { method: 'PUT', body: JSON.stringify(data) });

// База знаний (просмотр/чтение) — статьи, которые ведёт администратор
export const getKnowledgeArticles = () => req<any[]>('/knowledge/admin/all');

// Тариф пользователя (просмотр)
export const getBillingMe = (userId: number) =>
  req<any>(`/billing/me?user_id=${userId}`);

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

// Сотрудники (реестр менеджеров) — тот же backend, что и в вебе (задача 2).
export interface StaffMember {
  id: number; name: string; contact?: string | null; email?: string | null;
  role?: string | null; responsibility?: string | null;
}
export const getManagers = () => req<StaffMember[]>('/admin/billing/managers');
export const createManager = (data: Partial<StaffMember>) =>
  req<StaffMember>('/admin/billing/managers', { method: 'POST', body: JSON.stringify(data) });
export const updateManager = (id: number, data: Partial<StaffMember>) =>
  req<StaffMember>(`/admin/billing/managers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteManager = (id: number) =>
  req<any>(`/admin/billing/managers/${id}`, { method: 'DELETE' });
