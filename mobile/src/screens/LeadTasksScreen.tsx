import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getTasks, createTask, updateTask, deleteTask, getTeams, getTeam } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';
const ALL_STATUSES: TaskStatus[] = ['in_progress', 'blocked', 'review', 'done'];

const STATUS_CONFIG: Record<TaskStatus, { short: string }> = {
  in_progress: { short: 'В работе' },
  blocked: { short: 'Блок' },
  review: { short: 'Ревью' },
  done: { short: '✓' },
};

function getStatus(task: any): TaskStatus {
  if (task.status && ALL_STATUSES.includes(task.status)) return task.status as TaskStatus;
  return task.completed ? 'done' : 'in_progress';
}

function isOverdue(task: any): boolean {
  if (!task.due_date || getStatus(task) === 'done') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(task.due_date) < today;
}

export default function LeadTasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [tab, setTab] = useState<'mine' | 'members'>('mine');

  // My tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Members tasks
  const [teams, setTeams] = useState<any[]>([]);
  const [memberTasks, setMemberTasks] = useState<Record<number, any[]>>({});
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  const statusColors: Record<TaskStatus, { bg: string; border: string; text: string }> = {
    in_progress: { bg: colors.warningBg, border: colors.warning, text: colors.warning },
    blocked: { bg: colors.dangerBg, border: colors.danger, text: colors.danger },
    review: { bg: colors.accentLight, border: colors.accent, text: colors.accent },
    done: { bg: colors.successBg, border: colors.success, text: colors.success },
  };

  const loadMyTasks = useCallback(async () => {
    try {
      const data = await getTasks({ assigned_to: user!.id, assigned_by: user!.id }) as any[];
      setTasks(data || []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [user]);

  const loadTeamsWithMembers = useCallback(async () => {
    if (teamsLoaded) return;
    setTeamsLoading(true);
    try {
      const all = await getTeams() as any[];
      const mine = all.filter((t: any) => t.team_lead_id === user!.id);
      const details = await Promise.all(mine.map((t: any) => getTeam(t.id)));
      setTeams(details as any[]);
      setTeamsLoaded(true);
    } catch { setTeams([]); }
    finally { setTeamsLoading(false); }
  }, [user, teamsLoaded]);

  useEffect(() => { loadMyTasks(); }, [user?.id]);
  useEffect(() => { if (tab === 'members') loadTeamsWithMembers(); }, [tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'mine') await loadMyTasks();
    else { setTeamsLoaded(false); await loadTeamsWithMembers(); }
    setRefreshing(false);
  };

  const cycleStatus = async (task: any) => {
    const current = getStatus(task);
    const idx = ALL_STATUSES.indexOf(current);
    const next = ALL_STATUSES[(idx + 1) % ALL_STATUSES.length];
    try {
      await updateTask(task.id, { status: next, completed: next === 'done' });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed: next === 'done' } : t));
    } catch {}
  };

  const cycleMemberTaskStatus = async (task: any, memberId: number) => {
    const current = getStatus(task);
    const idx = ALL_STATUSES.indexOf(current);
    const next = ALL_STATUSES[(idx + 1) % ALL_STATUSES.length];
    try {
      await updateTask(task.id, { status: next, completed: next === 'done' });
      setMemberTasks(prev => ({
        ...prev,
        [memberId]: (prev[memberId] || []).map(t =>
          t.id === task.id ? { ...t, status: next, completed: next === 'done' } : t
        ),
      }));
    } catch {}
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    setFormLoading(true);
    try {
      const task = await createTask({
        title: formTitle.trim(), due_date: formDue.trim() || null,
        assigned_to: user!.id, assigned_by: user!.id, team_id: null,
      }) as any;
      setTasks(prev => [task, ...prev]);
      setFormTitle(''); setFormDue(''); setShowForm(false);
    } catch { Alert.alert('Ошибка', 'Не удалось создать задачу'); }
    finally { setFormLoading(false); }
  };

  const handleDelete = (taskId: number) => {
    Alert.alert('Удалить задачу?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        try { await deleteTask(taskId); setTasks(prev => prev.filter(t => t.id !== taskId)); } catch {}
      }},
    ]);
  };

  const toggleMember = async (memberId: number, teamId: number) => {
    if (expandedMembers.has(memberId)) {
      setExpandedMembers(prev => { const s = new Set(prev); s.delete(memberId); return s; });
      return;
    }
    setExpandedMembers(prev => new Set([...prev, memberId]));
    if (!memberTasks[memberId]) {
      try {
        const data = await getTasks({ assigned_to: memberId, team_id: teamId }) as any[];
        setMemberTasks(prev => ({ ...prev, [memberId]: data || [] }));
      } catch { setMemberTasks(prev => ({ ...prev, [memberId]: [] })); }
    }
  };

  const renderTask = (task: any, onCycle: () => void, onDel?: () => void) => {
    const st = getStatus(task);
    const sc = statusColors[st];
    const overdue = isOverdue(task);
    return (
      <View key={task.id} style={styles.taskCard}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskTitle, st === 'done' && styles.taskDone]}>
            {task.title || task.description}
          </Text>
          {task.due_date && (
            <Text style={[styles.taskDue, overdue && styles.taskOverdue]}>
              {overdue ? '⚠ Просрочено · ' : 'до '}
              {new Date(task.due_date).toLocaleDateString('ru-RU')}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}
          onPress={onCycle} activeOpacity={0.7}
        >
          <Text style={[styles.statusText, { color: sc.text }]}>{STATUS_CONFIG[st].short}</Text>
        </TouchableOpacity>
        {onDel && (
          <TouchableOpacity onPress={onDel} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading && tab === 'mine') return <Spinner />;

  const active = tasks.filter(t => getStatus(t) !== 'done');
  const done = tasks.filter(t => getStatus(t) === 'done');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Задачи</Text>
          {tab === 'mine' && tasks.length > 0 && (
            <Text style={styles.headerSub}>{done.length} из {tasks.length} готово</Text>
          )}
        </View>
        {tab === 'mine' && (
          <TouchableOpacity
            style={[styles.addBtn, showForm && styles.addBtnActive]}
            onPress={() => setShowForm(s => !s)}
          >
            <Text style={[styles.addBtnText, showForm && styles.addBtnTextActive]}>
              {showForm ? '✕' : '+ Задача'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        <TouchableOpacity
          style={[styles.subTab, tab === 'mine' && styles.subTabActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.subTabText, tab === 'mine' && styles.subTabTextActive]}>Мои задачи</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, tab === 'members' && styles.subTabActive]}
          onPress={() => setTab('members')}
        >
          <Text style={[styles.subTabText, tab === 'members' && styles.subTabTextActive]}>Участников</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {tab === 'mine' && (
          <>
            {showForm && (
              <View style={styles.formCard}>
                <TextInput
                  style={styles.formInput} value={formTitle} onChangeText={setFormTitle}
                  placeholder="Название задачи" placeholderTextColor={colors.textMuted} autoFocus
                />
                <TextInput
                  style={styles.formInput} value={formDue} onChangeText={setFormDue}
                  placeholder="Срок: ГГГГ-ММ-ДД (необязательно)" placeholderTextColor={colors.textMuted}
                />
                <View style={styles.formRow}>
                  <TouchableOpacity style={styles.formBtnSecondary}
                    onPress={() => { setShowForm(false); setFormTitle(''); setFormDue(''); }}>
                    <Text style={styles.formBtnSecondaryText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.formBtnPrimary, formLoading && styles.btnDisabled]}
                    onPress={handleCreate} disabled={formLoading}>
                    <Text style={styles.formBtnPrimaryText}>{formLoading ? '...' : 'Добавить'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {tasks.length === 0 && !showForm && (
              <EmptyState icon="document-text-outline" title="Нет личных задач" description="Добавьте задачи для себя" />
            )}
            {active.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Активные</Text>
                {active.map(t => renderTask(t, () => cycleStatus(t), () => handleDelete(t.id)))}
              </View>
            )}
            {done.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Выполненные</Text>
                {done.map(t => renderTask(t, () => cycleStatus(t), () => handleDelete(t.id)))}
              </View>
            )}
          </>
        )}

        {tab === 'members' && (
          <>
            {teamsLoading && <Spinner />}
            {!teamsLoading && teams.length === 0 && (
              <EmptyState icon="people-outline" title="Нет команд" description="Создайте команду чтобы добавлять участников" />
            )}
            {teams.map((team: any) => {
              const members = (team.members || []).filter((m: any) => m.user_id !== user!.id);
              if (members.length === 0) return null;
              return (
                <View key={team.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>{team.name}</Text>
                  {members.map((member: any) => {
                    const isExpanded = expandedMembers.has(member.user_id);
                    const mTasks = memberTasks[member.user_id];
                    return (
                      <View key={member.user_id} style={styles.memberAccordion}>
                        <TouchableOpacity
                          style={styles.memberRow}
                          onPress={() => toggleMember(member.user_id, team.id)}
                        >
                          <View style={styles.memberAvatar}>
                            <Text style={styles.memberAvatarText}>
                              {(member.user_name || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName}>{member.user_name}</Text>
                            <Text style={styles.memberRole}>{member.role}</Text>
                          </View>
                          <Text style={styles.chevron}>
                            {mTasks !== undefined
                              ? `${mTasks.length} · `
                              : ''}{isExpanded ? '▾' : '▸'}
                          </Text>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.memberTasksList}>
                            {mTasks === undefined && (
                              <Text style={styles.loadingText}>Загрузка...</Text>
                            )}
                            {mTasks !== undefined && mTasks.length === 0 && (
                              <Text style={styles.emptyText}>Нет задач</Text>
                            )}
                            {mTasks !== undefined && mTasks.map((t: any) =>
                              renderTask(t, () => cycleMemberTaskStatus(t, member.user_id))
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  addBtn: { borderWidth: 1, borderColor: c.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnActive: { backgroundColor: c.accentLight },
  addBtnText: { fontSize: 13, fontWeight: '600', color: c.accent },
  addBtnTextActive: { color: c.accent },
  subTabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  subTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
  },
  subTabActive: { backgroundColor: c.accent, borderColor: c.accent },
  subTabText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  subTabTextActive: { color: '#fff' },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  formCard: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
  formInput: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg },
  formRow: { flexDirection: 'row', gap: 8 },
  formBtnSecondary: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  formBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  formBtnPrimary: { flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  formBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  taskCard: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskTitle: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  taskDone: { textDecorationLine: 'line-through', color: c.textMuted },
  taskDue: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  taskOverdue: { color: c.danger, fontWeight: '600' },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  statusText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 14, color: c.textMuted },
  memberAccordion: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  memberAvatarText: { fontSize: 15, fontWeight: '700', color: c.accent },
  memberName: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  memberRole: { fontSize: 12, color: c.textMuted },
  chevron: { fontSize: 13, color: c.textMuted },
  memberTasksList: { borderTopWidth: 1, borderTopColor: c.border, padding: 12, gap: 8 },
  loadingText: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 8 },
  emptyText: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
});
