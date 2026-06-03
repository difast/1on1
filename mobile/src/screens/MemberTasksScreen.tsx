import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getTasks, createTask, updateTask, deleteTask, getTaskAiAdvice, getSubtasks, createSubtasks, updateSubtask } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';

// Member can cycle through these — only lead can mark done
const MEMBER_CYCLE: TaskStatus[] = ['in_progress', 'blocked', 'review'];
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

  const cycleStatus = async (task: any) => {
    const current = getTaskStatus(task);
    // Don't cycle 'done' tasks (lead-only)
    if (current === 'done') return;
    const idx = MEMBER_CYCLE.indexOf(current);
    const next = MEMBER_CYCLE[(idx + 1) % MEMBER_CYCLE.length];
    try {
      await updateTask(task.id, { status: next, completed: false });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed: false } : t));
    } catch {}
  };

  const handleCreateTask = async () => {
    if (!formTitle.trim()) return;
    setFormLoading(true);
    try {
      const task = await createTask({
        title: formTitle.trim(),
        due_date: formDue.trim() || null,
        assigned_to: user!.id,
        assigned_by: user!.id,
        team_id: null,
      }) as any;
      setTasks(prev => [task, ...prev]);
      setFormTitle('');
      setFormDue('');
      setShowForm(false);
    } catch {
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

  if (loading) return <Spinner />;

  const active = tasks.filter(t => getTaskStatus(t) !== 'done');
  const done = tasks.filter(t => getTaskStatus(t) === 'done');

  return (
    <SafeAreaView style={styles.root}>
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

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
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
                style={[styles.formBtnPrimary, formLoading && styles.btnDisabled]}
                onPress={handleCreateTask}
                disabled={formLoading}
              >
                <Text style={styles.formBtnPrimaryText}>{formLoading ? '...' : 'Добавить'}</Text>
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
                onCycle={() => cycleStatus(task)}
                onDelete={task.assigned_by === user!.id ? () => handleDelete(task.id) : undefined}
                colors={colors}
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
                onCycle={() => cycleStatus(task)}
                colors={colors}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({
  task, onCycle, onDelete, colors,
}: {
  task: any;
  onCycle: () => void;
  onDelete?: () => void;
  colors: AppColors;
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
      const res = await getTaskAiAdvice(task.title || task.description, status, task.due_date) as any;
      const steps: string[] = res.steps || [];
      setAiSteps(steps);
      if (steps.length > 0) {
        const data = await createSubtasks(task.id, steps) as any[];
        setSubtasks(data || []);
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось получить AI советы');
    } finally { setAiLoading(false); }
  };

  const toggleSubtask = async (sub: any) => {
    try {
      await updateSubtask(sub.id, { completed: !sub.completed });
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s));
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
        </View>
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}
          onPress={status !== 'done' ? onCycle : undefined}
          activeOpacity={status !== 'done' ? 0.7 : 1}
        >
          <Text style={[styles.statusBadgeText, { color: sc.text }]}>{cfg.short}</Text>
        </TouchableOpacity>
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
          {status !== 'done' && (
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
