import {
  getTeams, getTeam, getMemberTeam, getTasks, getMeetings,
  createTask, createMeeting,
} from '../api/client'

/**
 * Pit (AI assistant) helpers for the web — mirror of mobile/src/lib/pit.ts.
 * Builds a rich team context (teams/lead/members + their tasks & meetings,
 * all with ids) and executes <<ACTION:...>> tags Pit emits.
 */

const statusOf = (t) => t.status ?? (t.completed ? 'done' : 'in_progress')

export async function buildPitContext(user) {
  const members = []
  const lines = []
  const seen = new Set()
  const isLead = user?.role === 'team_lead'

  async function addTeam(detail) {
    if (!detail || !detail.id || seen.has(detail.id)) return
    seen.add(detail.id)
    const leadId = detail.team_lead_id
    lines.push(`Команда "${detail.name}" [team_id:${detail.id}], тимлид [id:${leadId}]:`)
    for (const m of (detail.members || [])) {
      const self = m.user_id === user.id
      members.push({ id: m.user_id, name: m.user_name, teamId: detail.id, teamLeadId: leadId })
      let tasksTxt = ''
      let meetTxt = ''
      try {
        const { data: tasks } = await getTasks({ assigned_to: m.user_id, team_id: detail.id })
        if (tasks?.length) tasksTxt = ' Задачи: ' + tasks.slice(0, 8)
          .map(t => `[task_id:${t.id}] "${t.title || t.description || ''}" (${statusOf(t)})`).join('; ')
      } catch { /* ignore */ }
      try {
        const { data: meets } = await getMeetings({ member_id: m.user_id, team_id: detail.id })
        if (meets?.length) meetTxt = ' Встречи: ' + meets.slice(0, 6)
          .map(mm => `[meeting_id:${mm.id}] ${mm.scheduled_date ? new Date(mm.scheduled_date).toLocaleDateString('ru-RU') : '—'} (${mm.status})`).join('; ')
      } catch { /* ignore */ }
      lines.push(`  • ${m.user_name} [id:${m.user_id}] — роль: ${m.role}${self ? ' (это текущий пользователь)' : ''}.${tasksTxt}${meetTxt}`)
    }
  }

  try {
    const { data: all } = await getTeams()
    for (const t of (all || []).filter(t => t.team_lead_id === user.id)) {
      try { const { data } = await getTeam(t.id); await addTeam(data) }
      catch { lines.push(`Команда "${t.name}" [team_id:${t.id}] — не удалось загрузить участников.`) }
    }
  } catch { /* ignore */ }

  try {
    const { data: team } = await getMemberTeam(user.id)
    if (team && team.id) await addTeam(team)
  } catch { /* ignore */ }

  const header = `Текущий пользователь: ${user?.name || user?.email} [id:${user?.id}], роль: ${isLead ? 'тимлид' : 'участник'}.`
  const text = lines.length
    ? `${header}\n\n${lines.join('\n')}`
    : `${header}\n\nДанные команд не загрузились. Помоги с общими вопросами и предложи попробовать ещё раз.`
  return { text, members }
}

export function parsePitActions(reply) {
  const actions = []
  const re = /<<ACTION:(create_task|schedule_meeting):(\d+):([^>]*)>>/g
  let match
  while ((match = re.exec(reply)) !== null) {
    actions.push({ kind: match[1], memberId: Number(match[2]), text: (match[3] || '').trim() })
  }
  const clean = reply.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
  return { clean, actions }
}

export async function executePitAction(action, ctx, user) {
  const member = (ctx.members || []).find(m => m.id === action.memberId)
  const who = member?.name ?? `участник #${action.memberId}`
  try {
    if (action.kind === 'create_task') {
      await createTask({
        title: action.text,
        assigned_to: action.memberId,
        assigned_by: user.id,
        team_id: member?.teamId || null,
      })
      return `Задача «${action.text}» создана для ${who}`
    }
    const when = new Date()
    when.setDate(when.getDate() + 1)
    when.setHours(10, 0, 0, 0)
    await createMeeting({
      team_id: member?.teamId,
      team_lead_id: member?.teamLeadId ?? user.id,
      member_id: action.memberId,
      scheduled_date: when.toISOString(),
      agenda: action.text || undefined,
    })
    return `Встреча с ${who} запланирована на ${when.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return `Не удалось выполнить действие для ${who}. Попробуйте ещё раз или обратитесь в поддержку.`
  }
}
