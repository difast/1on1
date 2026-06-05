import {
  getTeams, getTeam, getMemberTeam,
  createTask, createMeeting, getTasks, getMeetings,
} from './api';
import type { AppUser } from '../context/auth';

/**
 * Pit (the AI assistant) helpers.
 *
 * The backend system prompt understands a team-context block where every
 * entity is tagged with an id ([id:], [team_id:], [task_id:], [meeting_id:])
 * and action tags it can emit:
 *   <<ACTION:create_task:MEMBER_ID:text>>
 *   <<ACTION:schedule_meeting:MEMBER_ID:topic>>
 *
 * buildPitContext loads the full picture (teams, lead, members, and each
 * member's tasks + meetings) so Pit can reliably find people and act.
 */

export interface PitMember {
  id: number;
  name: string;
  teamId: number;
  teamLeadId: number;
}

export interface PitContext {
  text: string;
  members: PitMember[];
}

export interface PitAction {
  kind: 'create_task' | 'schedule_meeting';
  memberId: number;
  text: string;
}

const statusOf = (t: any) => t.status ?? (t.completed ? 'done' : 'in_progress');

/** Build the rich team-context string (with ids) sent to the assistant. */
export async function buildPitContext(user: AppUser, isLead: boolean): Promise<PitContext> {
  const members: PitMember[] = [];
  const lines: string[] = [];
  const seenTeams = new Set<number>();

  // Describe one team: lead + every member with their tasks & meetings.
  async function addTeam(detail: any) {
    if (!detail || !detail.id || seenTeams.has(detail.id)) return;
    seenTeams.add(detail.id);
    const leadId = detail.team_lead_id;
    lines.push(`Команда "${detail.name}" [team_id:${detail.id}], тимлид [id:${leadId}]:`);

    for (const m of (detail.members || [])) {
      const self = m.user_id === user.id;
      members.push({ id: m.user_id, name: m.user_name, teamId: detail.id, teamLeadId: leadId });

      let tasksTxt = '';
      let meetTxt = '';
      try {
        const tasks = await getTasks({ assigned_to: m.user_id, team_id: detail.id }) as any[];
        if (tasks?.length) {
          tasksTxt = ' Задачи: ' + tasks.slice(0, 8)
            .map(t => `[task_id:${t.id}] "${t.title || t.description || ''}" (${statusOf(t)})`).join('; ');
        }
      } catch {}
      try {
        const meets = await getMeetings({ member_id: m.user_id, team_id: detail.id }) as any[];
        if (meets?.length) {
          meetTxt = ' Встречи: ' + meets.slice(0, 6)
            .map(mm => `[meeting_id:${mm.id}] ${mm.scheduled_date ? new Date(mm.scheduled_date).toLocaleDateString('ru-RU') : '—'} (${mm.status})`).join('; ');
        }
      } catch {}

      lines.push(`  • ${m.user_name} [id:${m.user_id}] — роль: ${m.role}${self ? ' (это текущий пользователь)' : ''}.${tasksTxt}${meetTxt}`);
    }
  }

  // Teams where the user is the lead.
  try {
    const all = (await getTeams()) as any[];
    const mine = (all || []).filter(t => t.team_lead_id === user.id);
    for (const t of mine) {
      try { await addTeam(await getTeam(t.id)); }
      catch { lines.push(`Команда "${t.name}" [team_id:${t.id}] — не удалось загрузить участников.`); }
    }
  } catch {}

  // Team where the user is a member (covers members and dual-role users).
  try {
    const team = await getMemberTeam(user.id) as any;
    if (team && team.id) await addTeam(team);
  } catch {}

  const header =
    `Текущий пользователь: ${user.name || user.email} [id:${user.id}], роль: ${isLead ? 'тимлид' : 'участник'}.`;
  const text = lines.length
    ? `${header}\n\n${lines.join('\n')}`
    : `${header}\n\nДанные команд не загрузились (нет команд/участников, либо сервер недоступен). Помоги с общими вопросами и предложи попробовать ещё раз.`;

  return { text, members };
}

/** Extract <<ACTION:...>> tags from a reply, returning the clean reply + actions. */
export function parsePitActions(reply: string): { clean: string; actions: PitAction[] } {
  const actions: PitAction[] = [];
  const re = /<<ACTION:(create_task|schedule_meeting):(\d+):([^>]*)>>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(reply)) !== null) {
    actions.push({
      kind: match[1] as PitAction['kind'],
      memberId: Number(match[2]),
      text: (match[3] || '').trim(),
    });
  }
  const clean = reply.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
  return { clean, actions };
}

/** Execute one action. Returns a short human-readable confirmation. */
export async function executePitAction(
  action: PitAction,
  ctx: PitContext,
  user: AppUser,
): Promise<string> {
  const member = ctx.members.find(m => m.id === action.memberId);
  const who = member?.name ?? `участник #${action.memberId}`;

  try {
    if (action.kind === 'create_task') {
      await createTask({
        title: action.text,
        assigned_to: action.memberId,
        assigned_by: user.id,
        team_id: member?.teamId || null,
      });
      return `✓ Задача «${action.text}» создана для ${who}`;
    }

    // schedule_meeting — no time was supplied, default to tomorrow 10:00.
    const when = new Date();
    when.setDate(when.getDate() + 1);
    when.setHours(10, 0, 0, 0);
    await createMeeting({
      team_id: member?.teamId,
      team_lead_id: member?.teamLeadId ?? user.id,
      member_id: action.memberId,
      scheduled_date: when.toISOString(),
      agenda: action.text || undefined,
    });
    return `✓ Встреча с ${who} запланирована на ${when.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return `⚠ Не удалось выполнить действие для ${who}. Попробуйте ещё раз или обратитесь в поддержку.`;
  }
}
