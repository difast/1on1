// Локальная настройка «Подсказки Пита» (коучинг). Хранится на устройстве
// (AsyncStorage), как и тема. По умолчанию включено — как на вебе.
// Значение читают будущие экраны коучинга (подсказки повестки, итоги встречи).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'coaching_enabled';

export async function getCoaching(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export async function setCoaching(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* no-op */
  }
}

// ── AI-коучинг Пита (правила, без сети) — порт веб-логики lib/coaching.js ──────

function daysBetween(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export type AgendaSuggestion = { id: string; reason: string; line: string };

// Подсказки к повестке встречи с участником: причина сигнала + готовая строка.
export function buildAgendaSuggestions(
  member?: any,
  tasks: any[] = [],
): AgendaSuggestion[] {
  if (!member) return [];
  const out: AgendaSuggestion[] = [];

  const openOverdue = (tasks || []).filter((t: any) => {
    if (t.status === 'done' || t.completed) return false;
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date(new Date().toDateString());
  });

  const lastMeetingDays = daysBetween(member.last_meeting_date);
  const cadence = member.cadence_days || 14;

  if (!member.last_meeting_date) {
    out.push({
      id: 'first-meeting',
      reason: 'Это первая встреча 1-на-1 — фундамент дальнейших отношений.',
      line: 'Договориться об ожиданиях, целях и комфортной частоте встреч',
    });
  }

  if (member.status_color === 'red' || (lastMeetingDays !== null && lastMeetingDays > cadence)) {
    out.push({
      id: 'overdue-meeting',
      reason: lastMeetingDays !== null
        ? `Последняя встреча была ${lastMeetingDays} дн. назад — дольше обычного.`
        : 'Встреч давно не было.',
      line: 'Спросить, как дела и что изменилось с прошлого разговора',
    });
  }

  if (openOverdue.length > 0) {
    const t = openOverdue[0];
    out.push({
      id: 'overdue-task',
      reason: openOverdue.length === 1
        ? `Задача «${(t.title || '').slice(0, 40)}» просрочена.`
        : `${openOverdue.length} задач(и) просрочено.`,
      line: `Обсудить, что мешает закрыть задачу «${(t.title || '').slice(0, 40)}», и нужна ли помощь`,
    });
  }

  if (out.length === 0 && member.status_color === 'yellow') {
    out.push({
      id: 'progress-check',
      reason: 'Скоро плановая встреча — хороший момент свериться по прогрессу.',
      line: 'Свериться по прогрессу задач с прошлой встречи',
    });
  }

  return out.slice(0, 3);
}

const STOP = new Set([
  'который', 'которая', 'нужно', 'надо', 'быть', 'этом', 'этой', 'этот', 'обсудить',
  'встреча', 'встречи', 'повестка', 'вопрос', 'вопросы', 'задача', 'задачи', 'участник',
  'через', 'после', 'перед', 'также', 'чтобы', 'когда', 'если', 'можно', 'сделать',
]);

function keywords(line: string): string[] {
  return (line.toLowerCase().match(/[a-zа-яё0-9]{5,}/gi) || []).filter((w) => !STOP.has(w));
}

export type MeetingFeedback = { covered: boolean; missed: string[]; note: string };

// Коучинг после встречи: сверяем запланированную повестку с расшифровкой/резюме.
export function buildMeetingFeedback(agenda?: string, transcript?: string, summary?: string): MeetingFeedback | null {
  if (!agenda || !agenda.trim()) return null;
  const haystack = `${transcript || ''} ${summary || ''}`.toLowerCase();
  if (!haystack.trim()) return null;

  const lines = agenda.split('\n').map((l) => l.replace(/^[-*•\s]+/, '').trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const missed: string[] = [];
  for (const line of lines) {
    const kw = keywords(line);
    if (kw.length === 0) continue;
    if (!kw.some((w) => haystack.includes(w))) missed.push(line);
  }

  if (missed.length === 0) {
    return { covered: true, missed: [], note: 'Похоже, вся запланированная повестка была затронута.' };
  }
  return {
    covered: false,
    missed: missed.slice(0, 3),
    note: 'Судя по расшифровке, эти темы из повестки, возможно, не обсудили. Стоит перенести их на следующую встречу.',
  };
}
