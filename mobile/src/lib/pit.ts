import {
  getTeams, getTeam, getMemberTeam,
  createTask, createMeeting,
} from './api';
import type { AppUser } from '../context/auth';

/**
 * Pit (the AI assistant) helpers.
 *
 * The backend system prompt already understands two things:
 *   1. A team context block where each person is tagged with `[id:<user_id>]`.
 *   2. Action tags it can emit:  <<ACTION:create_task:MEMBER_ID:text>>
 *                                <<ACTION:schedule_meeting:MEMBER_ID:topic>>
 *
 * Previously neither the mobile app nor the web client sent the context or
 * executed the actions, so Pit "couldn't see" anyone and couldn't create
 * anything. These helpers build the context and run the actions.
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

/** Build the team-context string (with member ids) sent to the assistant. */
export async function buildPitContext(user: AppUser, isLead: boolean): Promise<PitContext> {
  const members: PitMember[] = [];
  const lines: string[] = [];

  try {
    if (isLead) {
      const all = (await getTeams()) as any[];
      const mine = (all || []).filter(t => t.team_lead_id === user.id);
      for (const t of mine) {
        let detail: any;
        try { detail = await getTeam(t.id); } catch { detail = t; }
        lines.push(`Команда "${detail.name}" [id:${detail.id}]:`);
        for (const m of (detail.members || [])) {
          if (m.user_id === user.id) continue;
          members.push({ id: m.user_id, name: m.user_name, teamId: detail.id, teamLeadId: user.id });
          const last = m.last_meeting_date
            ? `последняя встреча ${new Date(m.last_meeting_date).toLocaleDateString('ru-RU')}`
            : 'встреч ещё не было';
          lines.push(`  • ${m.user_name} [id:${m.user_id}] — роль: ${m.role}, ${last}`);
        }
      }
    } else {
      // Member: list their teammates + the team lead so Pit can reference people.
      let team: any = null;
      try { team = await getMemberTeam(user.id); } catch {}
      if (team) {
        lines.push(`Команда "${team.name}" [id:${team.id}]:`);
        for (const m of (team.members || [])) {
          members.push({ id: m.user_id, name: m.user_name, teamId: team.id, teamLeadId: team.team_lead_id });
          lines.push(`  • ${m.user_name} [id:${m.user_id}] — роль: ${m.role}`);
        }
      }
      // The member themselves (so "создай мне задачу" works).
      members.push({ id: user.id, name: user.name, teamId: team?.id ?? 0, teamLeadId: team?.team_lead_id ?? user.id });
      lines.push(`Текущий пользователь: ${user.name} [id:${user.id}]`);
    }
  } catch {
    // Best effort — return whatever we collected.
  }

  const header = `Текущий пользователь: ${user.name || user.email} [id:${user.id}], роль: ${isLead ? 'тимлид' : 'участник'}.`;
  const text = lines.length
    ? `${header}\n\nУчастники команд:\n${lines.join('\n')}`
    : header;

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
    return `⚠ Не удалось выполнить действие для ${who}`;
  }
}
