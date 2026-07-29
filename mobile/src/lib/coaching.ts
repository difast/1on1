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
  // Перевод передаёт вызывающий экран: подсказки формируются на языке интерфейса.
  t: (k: string, v?: Record<string, unknown>) => string = (k) => k,
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
      reason: t('ui.eto_pervaya_vstrecha_1_na_1'),
      line: t('ui.dogovoritsya_ob_ozhidaniyah_celyah_i_komfortno'),
    });
  }

  if (member.status_color === 'red' || (lastMeetingDays !== null && lastMeetingDays > cadence)) {
    out.push({
      id: 'overdue-meeting',
      reason: lastMeetingDays !== null
        ? `Последняя встреча была ${lastMeetingDays} дн. назад — дольше обычного.`
        : t('ui.vstrech_davno_ne_bylo'),
      line: t('ui.sprosit_kak_dela_i_chto_izmenilos'),
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
      reason: t('ui.skoro_planovaya_vstrecha_horoshiy_moment_sveri'),
      line: t('ui.sveritsya_po_progressu_zadach_s_proshloy'),
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
export function buildMeetingFeedback(agenda?: string, transcript?: string, summary?: string, t: (k: string, v?: Record<string, unknown>) => string = (k) => k): MeetingFeedback | null {
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
    return { covered: true, missed: [], note: t('ui.pohozhe_vsya_zaplanirovannaya_povestka_byla_za') };
  }
  return {
    covered: false,
    missed: missed.slice(0, 3),
    note: t('ui.sudya_po_rasshifrovke_eti_temy_iz'),
  };
}
