import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getTasks, updateTask } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';

const STATUSES: TaskStatus[] = ['in_progress', 'blocked', 'review', 'done'];

const STATUS_CONFIG: Record<TaskStatus, { label: string; short: string }> = {
  in_progress: { label: 'В работе', short: 'В работе' },
  blocked: { label: 'Заблокировано', short: 'Блок' },
  review: { label: 'На ревью', short: 'Ревью' },
  done: { label: 'Выполнено', short: '✓' },
};

function getTaskStatus(task: any): TaskStatus {
  if (task.status && STATUSES.includes(task.status)) return task.status as TaskStatus;
  return task.completed ? 'done' : 'in_progress';
}

export default function MemberTasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    const idx = STATUSES.indexOf(current);
    const next = STATUSES[(idx + 1) % STATUSES.length];
    const completed = next === 'done';
    try {
      await updateTask(task.id, { status: next, completed });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed } : t));
    } catch {}
  };

  if (loading) return <Spinner />;

  const active = tasks.filter(t => getTaskStatus(t) !== 'done');
  const done = tasks.filter(t => getTaskStatus(t) === 'done');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Задачи</Text>
        {tasks.length > 0 && (
          <Text style={styles.headerSub}>
            {done.length} из {tasks.length} готово
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {tasks.length === 0 && (
          <EmptyState icon="✅" title="Нет задач" description="Задачи появятся после встреч с тимлидом" />
        )}

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Активные</Text>
            {active.map(task => (
              <TaskRow key={task.id} task={task} onCycle={() => cycleStatus(task)} colors={colors} />
            ))}
          </View>
        )}

        {done.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Выполненные</Text>
            {done.map(task => (
              <TaskRow key={task.id} task={task} onCycle={() => cycleStatus(task)} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({ task, onCycle, colors }: { task: any; onCycle: () => void; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const status = getTaskStatus(task);
  const cfg = STATUS_CONFIG[status];

  const statusColors: Record<TaskStatus, { bg: string; border: string; text: string }> = {
    in_progress: { bg: colors.warningBg, border: colors.warning, text: colors.warning },
    blocked: { bg: colors.dangerBg, border: colors.danger, text: colors.danger },
    review: { bg: colors.accentLight, border: colors.accent, text: colors.accent },
    done: { bg: colors.successBg, border: colors.success, text: colors.success },
  };
  const sc = statusColors[status];

  return (
    <TouchableOpacity style={styles.taskCard} onPress={onCycle} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, status === 'done' && styles.taskDone]}>
          {task.title || task.description}
        </Text>
        {task.description && task.title && (
          <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
        )}
        {task.due_date && (
          <Text style={styles.taskDue}>{new Date(task.due_date).toLocaleDateString('ru-RU')}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}
        onPress={onCycle}
        activeOpacity={0.7}
      >
        <Text style={[styles.statusBadgeText, { color: sc.text }]}>{cfg.short}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  taskCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskTitle: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  taskDone: { textDecorationLine: 'line-through', color: c.textMuted },
  taskDesc: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  taskDue: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  statusBadge: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    flexShrink: 0,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
});
