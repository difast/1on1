import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/auth';
import { getTasks, updateTask } from '../lib/api';
import { colors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

export default function MemberTasksScreen() {
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

  const toggle = async (task: any) => {
    try {
      await updateTask(task.id, { completed: !task.completed });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    } catch {}
  };

  if (loading) return <Spinner />;

  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Задачи</Text>
        {tasks.length > 0 && (
          <Text style={styles.headerSub}>
            {pending.length} из {tasks.length} выполнено
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

        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Активные</Text>
            {pending.map(task => (
              <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} />
            ))}
          </View>
        )}

        {done.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Выполненные</Text>
            {done.map(task => (
              <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({ task, onToggle }: { task: any; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.taskCard} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, task.completed && styles.checkboxDone]}>
        {task.completed && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, task.completed && styles.taskDone]}>
          {task.title || task.description}
        </Text>
        {task.description && task.title && (
          <Text style={styles.taskDesc} numberOfLines={1}>{task.description}</Text>
        )}
      </View>
      {task.due_date && (
        <Text style={styles.taskDue}>{new Date(task.due_date).toLocaleDateString('ru-RU')}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 13, color: colors.textSecondary },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    borderWidth: 2, borderColor: colors.gray300,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { fontSize: 13, color: '#fff', fontWeight: '700' },
  taskTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  taskDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  taskDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  taskDue: { fontSize: 12, color: colors.textMuted, flexShrink: 0 },
});
