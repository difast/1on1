// Цели: постановка и отслеживание. Экран нативный (React Native), логика
// повторяет веб-модуль. Права проверяются на бэкенде — сотрудник редактирует
// только свои цели, тимлид видит цели команды и оставляет комментарии/оценку.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import {
  getGoals, createGoal, updateGoal, deleteGoal, addGoalComment,
  getTeams, getTeamGoals, getTeamSharedGoals, getGoal, getMemberTeam,
  type Goal, type GoalComment, type TeamGoals,
} from '../lib/api';

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Не начата',
  in_progress: 'В работе',
  at_risk: 'Под риском',
  achieved: 'Достигнута',
  failed: 'Не достигнута',
};
const OPEN_STATUSES = ['not_started', 'in_progress', 'at_risk'];
const SELECTABLE = ['not_started', 'in_progress', 'at_risk', 'achieved', 'failed'];

function statusColors(c: AppColors): Record<string, { bg: string; fg: string; bd: string }> {
  return {
    not_started: { bg: c.surface2, fg: c.textSecondary, bd: c.border },
    in_progress: { bg: c.accentLight, fg: c.accent, bd: c.accent },
    at_risk: { bg: c.warningBg, fg: c.warning, bd: c.warning },
    achieved: { bg: c.successBg, fg: c.success, bd: c.success },
    failed: { bg: c.dangerBg, fg: c.danger, bd: c.danger },
  };
}

const ROMAN = ['I', 'II', 'III', 'IV'];
function quarterOptions() {
  const now = new Date();
  const y = now.getFullYear();
  const curQ = Math.floor(now.getMonth() / 3);
  const opts: { value: string; label: string; period_start: string; period_end: string }[] = [];
  for (let i = 0; i < 4; i++) {
    let q = curQ + i, year = y;
    while (q > 3) { q -= 4; year += 1; }
    const start = new Date(Date.UTC(year, q * 3, 1));
    const end = new Date(Date.UTC(year, q * 3 + 3, 0, 23, 59, 59));
    opts.push({
      value: `${year}-Q${q + 1}`,
      label: `${ROMAN[q]} квартал ${year}`,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    });
  }
  return opts;
}

function periodText(g: Goal) {
  if (g.period_label) return g.period_label;
  if (g.period_end) return `до ${new Date(g.period_end).toLocaleDateString('ru-RU')}`;
  return 'Без срока';
}

// ── общие мелкие компоненты ─────────────────────────────────────────────────
function StatusBadge({ status, colors }: { status: string; colors: AppColors }) {
  const sc = statusColors(colors)[status] || statusColors(colors).not_started;
  return (
    <View style={{ backgroundColor: sc.bg, borderColor: sc.bd, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: sc.fg, fontSize: 12, fontWeight: '600' }}>{STATUS_LABEL[status] || status}</Text>
    </View>
  );
}

export function Bar({ value, colors }: { value: number; colors: AppColors }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v >= 100 ? colors.success : v > 0 ? colors.accent : colors.border;
  return (
    <View style={{ flex: 1, height: 8, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
      <View style={{ width: `${v}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
    </View>
  );
}

// ── обсуждение цели ─────────────────────────────────────────────────────────
export function Thread({
  comments, meId, colors, canFeedback, onSend,
}: {
  comments: GoalComment[]; meId: number; colors: AppColors; canFeedback: boolean;
  onSend: (p: { body: string; kind?: string; rating?: number }) => Promise<void>;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'comment' | 'feedback'>('comment');
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await onSend({ body, kind, rating: kind === 'feedback' && rating ? rating : undefined });
      setText(''); setRating(null); setKind('comment');
    } finally { setSending(false); }
  };

  return (
    <View style={styles.thread}>
      {comments.length === 0 && <Text style={styles.muted}>Обсуждения пока нет.</Text>}
      {comments.map(cm => {
        const mine = cm.author_id === meId;
        const isFb = cm.kind === 'feedback';
        return (
          <View key={cm.id} style={[styles.bubble, {
            alignSelf: mine ? 'flex-end' : 'flex-start',
            backgroundColor: isFb ? colors.accentLight : (mine ? colors.accentLight : colors.surface2),
            borderColor: colors.border,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={styles.bubbleAuthor}>{cm.author_name || 'Участник'}</Text>
              {isFb && <Text style={styles.fbTag}>Итоговая оценка{cm.rating != null ? ` · ${cm.rating}/5` : ''}</Text>}
            </View>
            <Text style={styles.bubbleBody}>{cm.body}</Text>
            {cm.created_at && <Text style={styles.bubbleTime}>{new Date(cm.created_at).toLocaleDateString('ru-RU')}</Text>}
          </View>
        );
      })}

      {canFeedback && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {(['comment', 'feedback'] as const).map(k => (
            <TouchableOpacity key={k} onPress={() => setKind(k)} style={[styles.kindChip, kind === k && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
              <Text style={[styles.kindChipText, kind === k && { color: colors.accent }]}>{k === 'comment' ? 'Комментарий' : 'Итоговая оценка'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {canFeedback && kind === 'feedback' && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} style={[styles.ratingDot, rating === n && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              <Text style={[styles.ratingText, rating === n && { color: '#fff' }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
        <TextInput
          style={styles.threadInput}
          value={text}
          onChangeText={setText}
          placeholder={kind === 'feedback' ? 'Итоговая обратная связь…' : 'Комментарий…'}
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <TouchableOpacity style={[styles.sendBtn, (sending || !text.trim()) && { opacity: 0.5 }]} onPress={submit} disabled={sending || !text.trim()}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── карточка цели сотрудника (с редактированием) ────────────────────────────
function OwnGoalCard({ goal, meId, colors, onChanged, onRemoved }: {
  goal: Goal; meId: number; colors: AppColors;
  onChanged: (g: Goal) => void; onRemoved: (id: number) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const sc = statusColors(colors)[goal.status] || statusColors(colors).not_started;

  const patch = async (payload: any) => {
    setSaving(true);
    try { const g = await updateGoal(goal.id, { actor_id: meId, ...payload }); onChanged(g); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось сохранить'); }
    finally { setSaving(false); }
  };

  const setProgress = (p: number) => {
    const next = Math.max(0, Math.min(100, p));
    if (next !== goal.progress) patch({ progress: next });
  };

  const remove = () => {
    Alert.alert('Удалить цель?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        try { await deleteGoal(goal.id, meId); onRemoved(goal.id); } catch {}
      } },
    ]);
  };

  const suggestDiffers = goal.suggested_status && goal.suggested_status !== goal.status
    && OPEN_STATUSES.includes(goal.suggested_status);

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: sc.fg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalPeriod}>{periodText(goal)}</Text>
        </View>
        <StatusBadge status={goal.status} colors={colors} />
      </View>

      {!!goal.description && <Text style={styles.goalDesc}>{goal.description}</Text>}

      {goal.stagnant && OPEN_STATUSES.includes(goal.status) && (
        <View style={styles.stagnant}>
          <Text style={styles.stagnantText}>Давно без обновлений · {goal.days_since_progress} дн.</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <Bar value={goal.progress} colors={colors} />
        <Text style={styles.pct}>{goal.progress}%</Text>
      </View>

      {/* Управление прогрессом — основное регулярное действие */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => setProgress(goal.progress - 5)}>
          <Ionicons name="remove" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'center' }}>
          {[0, 25, 50, 75, 100].map(p => (
            <TouchableOpacity key={p} disabled={saving} onPress={() => setProgress(p)}
              style={[styles.presetBtn, goal.progress === p && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
              <Text style={[styles.presetText, goal.progress === p && { color: colors.accent }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => setProgress(goal.progress + 5)}>
          <Ionicons name="add" size={16} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Статус — вручную сотрудником */}
      <TouchableOpacity style={styles.statusRow} onPress={() => setStatusOpen(v => !v)} disabled={saving}>
        <Text style={styles.statusRowLabel}>Статус: {STATUS_LABEL[goal.status]}</Text>
        <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {statusOpen && (
        <View style={styles.statusOptions}>
          {SELECTABLE.map(s => (
            <TouchableOpacity key={s} onPress={() => { setStatusOpen(false); patch({ status: s }); }}
              style={[styles.statusOption, goal.status === s && { backgroundColor: colors.accentLight }]}>
              <Text style={{ color: goal.status === s ? colors.accent : colors.textPrimary, fontSize: 13 }}>{STATUS_LABEL[s]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {suggestDiffers && (
        <View style={styles.hintRow}>
          <Text style={styles.hintText}>По прогрессу и сроку статус ближе к «{STATUS_LABEL[goal.suggested_status!]}».</Text>
          <TouchableOpacity onPress={() => patch({ status: goal.suggested_status })} disabled={saving}>
            <Text style={styles.hintApply}>Применить</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <TouchableOpacity onPress={() => setExpanded(v => !v)}>
          <Text style={styles.link}>Обсуждение{goal.comments?.length ? ` (${goal.comments.length})` : ''}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={remove}><Text style={styles.removeLink}>Удалить</Text></TouchableOpacity>
      </View>

      {expanded && (
        <Thread comments={goal.comments || []} meId={meId} colors={colors} canFeedback={false}
          onSend={async (p) => { const g = await addGoalComment(goal.id, { actor_id: meId, ...p }); onChanged(g); }} />
      )}
    </View>
  );
}

// ── переиспользуемая форма создания цели (личная / командная) ────────────────
export function GoalForm({ colors, submitLabel, titlePlaceholder, onCreate, onCancel }: {
  colors: AppColors; submitLabel: string; titlePlaceholder: string;
  onCreate: (p: { title: string; description: string | null; period_label: string; period_start: string; period_end: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const qOpts = useMemo(() => quarterOptions(), []);
  const [period, setPeriod] = useState(qOpts[0].value);
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Укажите название цели'); return; }
    setCreating(true);
    try {
      const opt = qOpts.find(o => o.value === period) || qOpts[0];
      await onCreate({ title: title.trim(), description: desc.trim() || null, period_label: opt.label, period_start: opt.period_start, period_end: opt.period_end });
      setTitle(''); setDesc(''); setPeriod(qOpts[0].value);
    } catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось создать цель'); }
    finally { setCreating(false); }
  };

  return (
    <View style={styles.formCard}>
      <TextInput style={styles.formInput} value={title} onChangeText={setTitle}
        placeholder={titlePlaceholder} placeholderTextColor={colors.textMuted} />
      <TextInput style={[styles.formInput, { minHeight: 70, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc}
        placeholder="Ожидаемый результат — как поймём, что цель достигнута" placeholderTextColor={colors.textMuted} multiline />
      <Text style={styles.formLabel}>Период</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {qOpts.map(o => (
          <TouchableOpacity key={o.value} onPress={() => setPeriod(o.value)}
            style={[styles.periodChip, period === o.value && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
            <Text style={[styles.periodChipText, period === o.value && { color: colors.accent }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <TouchableOpacity style={styles.formBtnSecondary} onPress={onCancel}>
          <Text style={styles.formBtnSecondaryText}>Отмена</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.formBtnPrimary, creating && { opacity: 0.6 }]} onPress={submit} disabled={creating}>
          <Text style={styles.formBtnPrimaryText}>{creating ? 'Создаём…' : submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── командная цель глазами сотрудника (только чтение + обсуждение) ────────────
function TeamGoalCardRO({ goal, meId, colors, onChanged }: {
  goal: Goal; meId: number; colors: AppColors; onChanged: (g: Goal) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const sc = statusColors(colors)[goal.status] || statusColors(colors).not_started;
  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: sc.fg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalPeriod}>{periodText(goal)} · ведёт тимлид</Text>
        </View>
        <StatusBadge status={goal.status} colors={colors} />
      </View>
      {!!goal.description && <Text style={styles.goalDesc}>{goal.description}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <Bar value={goal.progress} colors={colors} />
        <Text style={styles.pct}>{goal.progress}%</Text>
      </View>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} style={{ marginTop: 12 }}>
        <Text style={styles.link}>Обсуждение{goal.comments?.length ? ` (${goal.comments.length})` : ''}</Text>
      </TouchableOpacity>
      {expanded && (
        <Thread comments={goal.comments || []} meId={meId} colors={colors} canFeedback={false}
          onSend={async (p) => { const g = await addGoalComment(goal.id, { actor_id: meId, ...p }); onChanged(g); }} />
      )}
    </View>
  );
}

// ── экран сотрудника ────────────────────────────────────────────────────────
function MemberGoals({ meId, colors }: { meId: number; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [teamGoals, setTeamGoals] = useState<Goal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try { const data = await getGoals(meId, meId); setGoals(data || []); }
    catch { setGoals([]); }
    // Командные цели своей команды (только чтение + обсуждение).
    try {
      const team = await getMemberTeam(meId);
      if (team?.id) { const t = await getTeamSharedGoals(team.id, meId); setTeamGoals(t || []); }
      else setTeamGoals([]);
    } catch { setTeamGoals([]); }
  }, [meId]);
  useEffect(() => { load(); }, [load]);

  const onChanged = (g: Goal) => setGoals(prev => (prev || []).map(x => x.id === g.id ? g : x));
  const onRemoved = (id: number) => setGoals(prev => (prev || []).filter(x => x.id !== id));
  const onTeamChanged = (g: Goal) => setTeamGoals(prev => prev.map(x => x.id === g.id ? g : x));

  if (goals === null) return <Spinner />;
  const active = goals.filter(g => OPEN_STATUSES.includes(g.status));
  const history = goals.filter(g => !OPEN_STATUSES.includes(g.status));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
    >
      {teamGoals.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Цели команды</Text>
          {teamGoals.map(g => <TeamGoalCardRO key={g.id} goal={g} meId={meId} colors={colors} onChanged={onTeamChanged} />)}
        </>
      )}

      <Text style={styles.intro}>Ставьте личные цели на квартал и регулярно отмечайте прогресс. Тимлид видит ваши цели и может оставить обратную связь.</Text>

      {!showForm && (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.primaryBtnText}>+ Новая цель</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <GoalForm colors={colors} submitLabel="Создать" titlePlaceholder="Название цели"
          onCancel={() => setShowForm(false)}
          onCreate={async (p) => {
            const g = await createGoal({ user_id: meId, ...p });
            setGoals(prev => [g, ...(prev || [])]);
            setShowForm(false);
          }} />
      )}

      {goals.length === 0 && !showForm && teamGoals.length === 0 && (
        <EmptyState icon="flag-outline" title="Целей пока нет" description="Создайте первую цель на текущий квартал и отслеживайте прогресс." />
      )}

      {active.length > 0 && <Text style={styles.sectionTitle}>Мои цели</Text>}
      {active.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} colors={colors} onChanged={onChanged} onRemoved={onRemoved} />)}

      {history.length > 0 && <Text style={[styles.sectionTitle, { marginTop: 8 }]}>История</Text>}
      {history.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} colors={colors} onChanged={onChanged} onRemoved={onRemoved} />)}
    </ScrollView>
  );
}

// ── карточка цели в сводном виде тимлида ─────────────────────────────────────
function LeadGoalCard({ goal, meId, colors, onCommented }: {
  goal: Goal; meId: number; colors: AppColors; onCommented: (g: Goal) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sc = statusColors(colors)[goal.status] || statusColors(colors).not_started;

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      setLoaded(true);
      try { const g = await getGoal(goal.id, meId); onCommented(g); } catch {}
    }
  };

  return (
    <View style={[styles.subCard, { borderLeftWidth: 3, borderLeftColor: sc.fg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subTitle}>{goal.title}</Text>
          <Text style={styles.goalPeriod}>{periodText(goal)}</Text>
        </View>
        <StatusBadge status={goal.status} colors={colors} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <Bar value={goal.progress} colors={colors} />
        <Text style={styles.pct}>{goal.progress}%</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
        {goal.stagnant && OPEN_STATUSES.includes(goal.status) && (
          <View style={styles.stagnant}><Text style={styles.stagnantText}>Без обновлений {goal.days_since_progress} дн.</Text></View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={toggle}>
          <Text style={styles.link}>Комментарии и оценка{goal.comments?.length ? ` (${goal.comments.length})` : ''}</Text>
        </TouchableOpacity>
      </View>
      {expanded && (
        <Thread comments={goal.comments || []} meId={meId} colors={colors} canFeedback
          onSend={async (p) => { const g = await addGoalComment(goal.id, { actor_id: meId, ...p }); onCommented(g); }} />
      )}
    </View>
  );
}

// ── экран тимлида ───────────────────────────────────────────────────────────
function LeadGoals({ meId, colors }: { meId: number; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [data, setData] = useState<TeamGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamGoals, setTeamGoals] = useState<Goal[]>([]);
  const [showTeamForm, setShowTeamForm] = useState(false);

  useEffect(() => {
    getTeams().then((all: any[]) => {
      const mine = (all || []).filter(t => t.team_lead_id === meId);
      setTeams(mine);
      setTeamId(prev => prev ?? (mine[0]?.id ?? null));
    }).catch(() => setTeams([]));
  }, [meId]);

  const load = useCallback(async () => {
    if (!teamId) { setData(null); setTeamGoals([]); setLoading(false); return; }
    setLoading(true);
    try { const d = await getTeamGoals(teamId, meId); setData(d); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось загрузить цели'); setData(null); }
    finally { setLoading(false); }
    try { const tg = await getTeamSharedGoals(teamId, meId); setTeamGoals(tg || []); }
    catch { setTeamGoals([]); }
  }, [teamId, meId]);
  useEffect(() => { load(); }, [load]);

  const patchGoal = (g: Goal) => setData(prev => prev && ({
    ...prev,
    members: prev.members.map(m => ({ ...m, goals: m.goals.map(x => x.id === g.id ? { ...x, ...g } : x) })),
  }));

  // Командную цель ведёт тимлид (он владелец) — те же карточки с редактированием.
  const onTeamChanged = (g: Goal) => setTeamGoals(prev => prev.map(x => x.id === g.id ? g : x));
  const onTeamRemoved = (id: number) => setTeamGoals(prev => prev.filter(x => x.id !== id));

  const members = data?.members || [];
  const totalGoals = members.reduce((n, m) => n + m.goals.length, 0);
  const attention = members.reduce((n, m) => n + m.goals.filter(g => g.status === 'at_risk' || (g.stagnant && OPEN_STATUSES.includes(g.status))).length, 0);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}
    >
      <Text style={styles.intro}>Командные цели ставите и ведёте вы, их видит вся команда. Личные цели сотрудников вы не редактируете — оставляете комментарии и итоговую оценку.</Text>

      {teams.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          {teams.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTeamId(t.id)}
              style={[styles.periodChip, teamId === t.id && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
              <Text style={[styles.periodChipText, teamId === t.id && { color: colors.accent }]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Командные цели — их ставит и ведёт тимлид */}
      {teamId && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Цели команды</Text>
            {!showTeamForm && (
              <TouchableOpacity onPress={() => setShowTeamForm(true)}><Text style={styles.link}>+ Командная цель</Text></TouchableOpacity>
            )}
          </View>
          {showTeamForm && (
            <GoalForm colors={colors} submitLabel="Создать командную цель" titlePlaceholder="Например: Сократить время ответа клиенту до 2 часов"
              onCancel={() => setShowTeamForm(false)}
              onCreate={async (p) => {
                const g = await createGoal({ user_id: meId, scope: 'team', team_id: teamId, ...p });
                setTeamGoals(prev => [g, ...prev]);
                setShowTeamForm(false);
              }} />
          )}
          {teamGoals.length === 0 && !showTeamForm && (
            <Text style={styles.muted}>Командных целей пока нет. Поставьте цель на команду — её увидят все участники.</Text>
          )}
          {teamGoals.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} colors={colors} onChanged={onTeamChanged} onRemoved={onTeamRemoved} />)}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Личные цели сотрудников</Text>

      {totalGoals > 0 && (
        <Text style={styles.summary}>Всего целей: {totalGoals}{attention > 0 ? `  ·  требуют внимания: ${attention}` : ''}</Text>
      )}

      {loading && <Spinner />}

      {!loading && members.length === 0 && (
        <EmptyState icon="flag-outline" title="В команде пока нет личных целей" description="Как только сотрудники создадут цели, они появятся здесь." />
      )}

      {!loading && members.map(m => (
        <View key={m.user_id} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(m.user_name || '?').slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.memberName}>{m.user_name}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.muted}>{m.goals.length ? `${m.goals.length} цел.` : 'нет целей'}</Text>
          </View>
          {m.goals.length === 0
            ? <Text style={styles.muted}>Сотрудник ещё не поставил цели.</Text>
            : m.goals.map(g => <LeadGoalCard key={g.id} goal={g} meId={meId} colors={colors} onCommented={patchGoal} />)}
        </View>
      ))}
    </ScrollView>
  );
}

// ── корневой экран с заголовком/назад ───────────────────────────────────────
export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, activeRole } = useAuth();
  const router = useRouter();
  const isLead = (activeRole ?? user?.role) === 'team_lead';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isLead ? 'Цели команды' : 'Цели'}</Text>
        <View style={{ width: 28 }} />
      </View>
      {user && (isLead
        ? <LeadGoals meId={user.id} colors={colors} />
        : <MemberGoals meId={user.id} colors={colors} />)}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 14, paddingBottom: 100 },
  intro: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
  summary: { fontSize: 12, color: c.textMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  primaryBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 18 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  formCard: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
  formInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg },
  formLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  formBtnSecondary: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  formBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  formBtnPrimary: { flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  formBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  periodChip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.surface },
  periodChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 },
  goalTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  goalPeriod: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  goalDesc: { fontSize: 13, color: c.textSecondary, marginTop: 8, lineHeight: 18 },
  pct: { fontSize: 13, fontWeight: '700', color: c.textPrimary, width: 42, textAlign: 'right' },
  stepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  presetBtn: { minWidth: 40, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', backgroundColor: c.surface },
  presetText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingVertical: 6 },
  statusRowLabel: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
  statusOptions: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden', marginTop: 4 },
  statusOption: { paddingVertical: 10, paddingHorizontal: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  hintText: { fontSize: 12, color: c.textSecondary, flex: 1 },
  hintApply: { fontSize: 12, fontWeight: '700', color: c.accent },
  stagnant: { backgroundColor: c.warningBg, borderColor: c.warning, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  stagnantText: { fontSize: 11, fontWeight: '600', color: c.warning },
  link: { fontSize: 12, fontWeight: '600', color: c.accent },
  removeLink: { fontSize: 12, color: c.textMuted },
  subCard: { backgroundColor: c.bg, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 12, marginTop: 10 },
  subTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: c.accent },
  memberName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  muted: { fontSize: 13, color: c.textMuted },
  thread: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 6 },
  bubble: { maxWidth: '90%', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  bubbleAuthor: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
  bubbleBody: { fontSize: 13, color: c.textPrimary },
  bubbleTime: { fontSize: 10, color: c.textMuted, marginTop: 3 },
  fbTag: { fontSize: 10, fontWeight: '700', color: c.accent },
  kindChip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: c.surface },
  kindChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  ratingDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  ratingText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  threadInput: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: c.textPrimary, backgroundColor: c.surface, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
});
