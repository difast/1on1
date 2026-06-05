import { getTeams, getTeam, getMeetings, createTask, createMeeting } from '../api/client'

/**
 * Pit (AI assistant) helpers for the web — mirror of mobile/src/lib/pit.ts.
 *
 * The backend system prompt expects a team-context block where each person is
 * tagged with `[id:<user_id>]`, and can emit action tags:
 *   <<ACTION:create_task:MEMBER_ID:text>>
 *   <<ACTION:schedule_meeting:MEMBER_ID:topic>>
 * Without sending the context / executing the actions, Pit couldn't see anyone
 * or create anything. These helpers fix that.
 */

export async function buildPitContext(user) {
  const members = []
  const lines = []
  const isLead = user?.role === 'team_lead'

  try {
    if (isLead) {
      const { data: all } = await getTeams()
      const mine = (all || []).filter(t => t.team_lead_id === user.id)
      for (const t of mine) {
        let detail = t
        try { const r = await getTeam(t.id); detail = r.data } catch { /* keep base */ }
        lines.push(`Команда "${detail.name}" [id:${detail.id}]:`)
        for (const m of (detail.members || [])) {
          if (m.user_id === user.id) continue
          members.push({ id: m.user_id, name: m.user_name, teamId: detail.id, teamLeadId: user.id })
          const last = m.last_meeting_date
            ? `последняя встреча ${new Date(m.last_meeting_date).toLocaleDateString('ru-RU')}`
            : 'встреч ещё не было'
          lines.push(`  • ${m.user_name} [id:${m.user_id}] — роль: ${m.role}, ${last}`)
        }
      }
    }
  } catch { /* best effort */ }

  const header = `Текущий пользователь: ${user?.name || user?.email} [id:${user?.id}], роль: ${isLead ? 'тимлид' : 'участник'}.`
  const text = lines.length
    ? `${header}\n\nУчастники команд:\n${lines.join('\n')}`
    : header
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
      return `✓ Задача «${action.text}» создана для ${who}`
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
    return `✓ Встреча с ${who} запланирована на ${when.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return `⚠ Не удалось выполнить действие для ${who}`
  }
}
