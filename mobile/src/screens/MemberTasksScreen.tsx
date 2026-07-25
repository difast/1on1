import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getTasks, createTask, updateTask, deleteTask, getTaskAiAdvice, getSubtasks, createSubtasks, updateSubtask } from '../lib/api';
// updateTask imported for auto-complete when all subtasks done
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { StatusPicker } from '../components/StatusPicker';
import { Status3DIcon } from '../components/Status3DIcon';
import { TaskAssignees } from '../components/TaskAssignees';
import { ClosedTodayCard } from '../components/ClosedTodayCard';
import { parseFeatureLock, openPricing } from '../lib/featureLock';

type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';

const ALL_STATUSES: TaskStatus[] = ['in_progress', 'blocked', 'review', 'done'];

const STATUS_CONFIG: Record<TaskStatus, { label: string; short: string }> = {
  in_progress: { label: 'В работе', short: 'В работе' },
  blocked: { label: 'Блокер', short: 'Блок' },
  review: { label: 'На ревью', short: 'Ревью' },
  done: { label: 'Готово', short: '✓' },
};

function getTaskStatus(task: any): TaskStatus {
  if (task.status && ALL_STATUSES.includes(task.status)) return task.status as TaskStatus;
  return task.completed ? 'done' : 'in_progress';
}

function isOverdue(task: any): boolean {
  if (!task.due_date || getTaskStatus(task) === 'done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.due_date) < today;
}

export default function MemberTasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsKey, setStatsKey] = useState(0);  // bump -> обновить счётчик «Закрыто сегодня»

  // Self-task form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getTasks({ assigned_to: user!.id }) as any[];
      setTasks(data || []);
    } catch { setTasks([]); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setStatus = async (task: any, next: TaskStatus) => {
    if (next === getTaskStatus(task)) return;
    const completed = next === 'done';
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed } : t));
    try {
      await updateTask(task.id, { status: next, completed });
      setStatsKey(k => k + 1);  // реактивно обновляем счётчик «Закрыто сегодня»
    } catch {
      // Revert on failure
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: getTaskStatus(task), completed: task.completed } : t));
    }
  };

  const handleCreateTask = async () => {
    const title = formTitle.trim();
    if (!title) return;
    const due_date = formDue.trim() || null;
    // Оптимистичное добавление: задача видна сразу, форма закрывается.
    const tempId = `temp-${Date.now()}` as any;
    const optimistic = {
      id: tempId, _optimistic: true, title, due_date,
      assigned_to: user!.id, assigned_by: user!.id, team_id: null,
      status: 'in_progress', completed: false, created_at: new Date().toISOString(),
    };
    setTasks(prev => [optimistic, ...prev]);
    setFormTitle(''); setFormDue(''); setShowForm(false);
    setFormLoading(true);
    try {
      const task = await createTask({ title, due_date, assigned_to: user!.id, assigned_by: user!.id, team_id: null }) as any;
      setTasks(prev => prev.map(t => t.id === tempId ? task : t));
    } catch {
      setTasks(prev => prev.filter(t => t.id !== tempId));
      setFormTitle(title); setFormDue(due_date || ''); setShowForm(true);
      Alert.alert('Ошибка', 'Не удалось создать задачу');
    } finally { setFormLoading(false); }
  };

  const handleDelete = (taskId: number) => {
    Alert.alert('Удалить задачу?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            await deleteTask(taskId);
            setTasks(prev => prev.filter(t => t.id !== taskId));
          } catch {}
        },
      },
    ]);
  };

  const [search, setSearch] = useState('');

  if (loading) return <Spinner />;

  const q = search.toLowerCase();
  const filtered = q ? tasks.filter(t => (t.title || t.description || '').toLowerCase().includes(q)) : tasks;
  const active = filtered.filter(t => getTaskStatus(t) !== 'done');
  const done = filtered.filter(t => getTaskStatus(t) === 'done');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Задачи</Text>
          {tasks.length > 0 && (
            <Text style={styles.headerSub}>{done.length} из {tasks.length} готово</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.addBtn, showForm && styles.addBtnActive]}
          onPress={() => setShowForm(s => !s)}
        >
          <Text style={[styles.addBtnText, showForm && styles.addBtnTextActive]}>
            {showForm ? '✕' : '+ Задача'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginLeft: 10 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск задач..."
          placeholderTextColor={colors.textMuted}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ paddingHorizontal: 10 }}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <ClosedTodayCard userId={user!.id} role={user?.role} refreshKey={statsKey} />

        {/* Self-task creation form */}
        {showForm && (
          <View style={styles.formCard}>
            <TextInput
              style={styles.formInput}
              value={formTitle}
              onChangeText={setFormTitle}
              placeholder="Название задачи"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <TextInput
              style={styles.formInput}
              value={formDue}
              onChangeText={setFormDue}
              placeholder="Срок: ГГГГ-ММ-ДД (необязательно)"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.formRow}>
              <TouchableOpacity
                style={styles.formBtnSecondary}
                onPress={() => { setShowForm(false); setFormTitle(''); setFormDue(''); }}
              >
                <Text style={styles.formBtnSecondaryText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formBtnPrimary, formLoading && styles.btnDisabled, { flexDirection: 'row', gap: 8 }]}
                onPress={handleCreateTask}
                disabled={formLoading}
              >
                {formLoading && <ActivityIndicator size="small" color="#fff" />}
                <Text style={styles.formBtnPrimaryText}>Добавить</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tasks.length === 0 && !showForm && (
          <EmptyState icon="checkmark-circle-outline" title="Нет задач" description="Создайте личную задачу или ждите от тимлида" />
        )}

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Активные</Text>
            {active.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onSetStatus={(s) => setStatus(task, s)}
                onDelete={task.assigned_by === user!.id ? () => handleDelete(task.id) : undefined}
                colors={colors}
                currentUserId={user!.id}
                onUpdated={(u) => setTasks(prev => prev.map(x => x.id === u.id ? u : x))}
              />
            ))}
          </View>
        )}

        {done.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Выполненные</Text>
            {done.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onSetStatus={(s) => setStatus(task, s)}
                colors={colors}
                currentUserId={user!.id}
                onUpdated={(u) => setTasks(prev => prev.map(x => x.id === u.id ? u : x))}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({
  task, onSetStatus, onDelete, colors, currentUserId, onUpdated,
}: {
  task: any;
  onSetStatus: (status: TaskStatus) => void;
  onDelete?: () => void;
  colors: AppColors;
  currentUserId?: number;
  onUpdated?: (u: any) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const status = getTaskStatus(task);
  const cfg = STATUS_CONFIG[status];
  const overdue = isOverdue(task);
  const [expanded, setExpanded] = useState(false);
  const [aiSteps, setAiSteps] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [subtasksLoaded, setSubtasksLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const statusColors: Record<TaskStatus, { bg: string; border: string; text: string }> = {
    in_progress: { bg: colors.warningBg, border: colors.warning, text: colors.warning },
    blocked: { bg: colors.dangerBg, border: colors.danger, text: colors.danger },
    review: { bg: colors.accentLight, border: colors.accent, text: colors.accent },
    done: { bg: colors.successBg, border: colors.success, text: colors.success },
  };
  const sc = statusColors[status];

  const handleExpand = async () => {
    setExpanded(v => !v);
    if (!subtasksLoaded) {
      setSubtasksLoaded(true);
      try {
        const data = await getSubtasks(task.id) as any[];
        setSubtasks(data || []);
      } catch {}
    }
  };

  const handleAiAdvice = async () => {
    if (aiSteps.length > 0) { setAiSteps([]); return; }
    setAiLoading(true);
    try {
      const res = await getTaskAiAdvice(task.title || task.description, status, task.due_date, 'member', currentUserId) as any;
      const steps: string[] = res.steps || [];
      setAiSteps(steps);
      if (steps.length > 0) {
        const data = await createSubtasks(task.id, steps) as any[];
        setSubtasks(data || []);
      }
    } catch (err) {
      const fl = parseFeatureLock(err);
      if (fl) {
        Alert.alert('Функция недоступна', fl.message, [
          { text: 'Закрыть', style: 'cancel' },
          { text: 'Тарифы', onPress: openPricing },
        ]);
      } else {
        Alert.alert('Ошибка', 'Не удалось получить AI советы');
      }
    } finally { setAiLoading(false); }
  };

  const toggleSubtask = async (sub: any) => {
    try {
      const newCompleted = !sub.completed;
      await updateSubtask(sub.id, { completed: newCompleted });
      const updated = subtasks.map(s => s.id === sub.id ? { ...s, completed: newCompleted } : s);
      setSubtasks(updated);
      // When every subtask is checked, the parent task is done — update it
      // directly (don't "cycle" the status, that previously landed on "Блок").
      if (newCompleted && updated.length > 0 && updated.every(s => s.completed) && status !== 'done') {
        onSetStatus('done');
      }
    } catch {}
  };

  return (
    <View style={styles.taskCard}>
      <TouchableOpacity onPress={handleExpand} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskTitle, status === 'done' && styles.taskDone]}>
            {task.title || task.description}
          </Text>
          {task.description && task.title && (
            <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
          )}
          {task.due_date && (
            <Text style={[styles.taskDue, overdue && styles.taskOverdue]}>
              {overdue ? '⚠ Просрочено · ' : 'до '}
              {new Date(task.due_date).toLocaleDateString('ru-RU')}
            </Text>
          )}
          {subtasks.length > 0 && (
            <Text style={styles.subtaskProgress}>
              {subtasks.filter(s => s.completed).length}/{subtasks.length} шагов
            </Text>
          )}
          {/* Совместная задача: участники со своими частями и статусами. Участник
              может менять статус только своей части (canManageAll=false). */}
          {task.is_multi && (
            <TaskAssignees
              task={task}
              currentUserId={currentUserId ?? 0}
              canManageAll={false}
              onChanged={(u) => onUpdated?.(u)}
            />
          )}
        </View>
        {task.is_multi ? (
          <View style={[styles.statusBadge, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Text style={[styles.statusBadgeText, { color: colors.textSecondary }]}>
              {task.progress ? `${task.progress.done}/${task.progress.total}` : '—'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.7}
          >
            <Status3DIcon status={status} size={16} />
            <Text style={[styles.statusBadgeText, { color: sc.text }]}>{cfg.short}</Text>
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.taskExpanded}>
          {/* Subtasks checklist */}
          {subtasks.map(sub => (
            <TouchableOpacity key={sub.id} style={styles.subtaskRow} onPress={() => toggleSubtask(sub)} activeOpacity={0.7}>
              <Ionicons
                name={sub.completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={sub.completed ? colors.success : colors.textMuted}
              />
              <Text style={[styles.subtaskTitle, sub.completed && styles.subtaskDone]}>{sub.title}</Text>
            </TouchableOpacity>
          ))}

          {/* AI advice button */}
          {status !== 'done' && !task.is_multi && (
            <TouchableOpacity
              style={[styles.aiBtn, aiLoading && { opacity: 0.6 }]}
              onPress={handleAiAdvice}
              disabled={aiLoading}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
              <Text style={styles.aiBtnText}>
                {aiLoading ? 'AI генерирует шаги...' : aiSteps.length > 0 ? 'Сбросить AI шаги' : 'AI-советы (4 шага)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <StatusPicker
        visible={pickerOpen}
        current={status}
        onSelect={onSetStatus}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  addBtn: {
    borderWidth: 1, borderColor: c.accent, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  addBtnActive: { backgroundColor: c.accentLight },
  addBtnText: { fontSize: 13, fontWeight: '600', color: c.accent },
  addBtnTextActive: { color: c.accent },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: c.surface,
  },
  searchInput: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, fontSize: 14, color: c.textPrimary },
  content: { padding: 16, gap: 20, paddingBottom: 100 },
  formCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 14, gap: 10,
  },
  formInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 8,
    padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg,
  },
  formRow: { flexDirection: 'row', gap: 8 },
  formBtnSecondary: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  formBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  formBtnPrimary: {
    flex: 1, backgroundColor: c.accent, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  formBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  taskCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  taskTitle: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  taskDone: { textDecorationLine: 'line-through', color: c.textMuted },
  taskDesc: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  taskDue: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  taskOverdue: { color: c.danger, fontWeight: '600' },
  statusBadge: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 14, color: c.textMuted },
  subtaskProgress: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  taskExpanded: { marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subtaskTitle: { fontSize: 13, color: c.textPrimary, flex: 1 },
  subtaskDone: { textDecorationLine: 'line-through', color: c.textMuted },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: c.accent, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: c.accentLight, alignSelf: 'flex-start',
  },
  aiBtnText: { fontSize: 12, fontWeight: '600', color: c.accent },
});
