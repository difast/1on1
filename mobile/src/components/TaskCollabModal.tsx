import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import {
  getTaskActivity, getTaskComments, addTaskComment, addTaskAssignee, removeTaskAssigneeById, getTaskById,
} from '../lib/api';

const ACTION_LABEL: Record<string, string> = {
  created: 'создал(а) задачу', status_changed: 'изменил(а) статус',
  assignee_added: 'добавил(а) исполнителя', assignee_removed: 'удалил(а) исполнителя',
  commented: 'оставил(а) комментарий', collab_joined: 'присоединил(ся) к работе',
};
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/*
 * Совместная работа над задачей в приложении (39.2/39.3): лента активности,
 * комментарии, состав исполнителей (тимлид добавляет/удаляет).
 */
export function TaskCollabModal({
  visible, onClose, task, currentUserId, canManage, contacts, onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  task: any;
  currentUserId: number;
  canManage?: boolean;
  contacts?: { user_id: number; name: string }[];
  onChanged?: (t: any) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<'activity' | 'comments' | 'members'>('activity');
  const [activity, setActivity] = useState<any[] | null>(null);
  const [comments, setComments] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [localTask, setLocalTask] = useState<any>(task);
  const [busy, setBusy] = useState(false);

  const loadActivity = () => getTaskActivity(task.id).then(a => setActivity(a || [])).catch(() => setActivity([]));
  const loadComments = () => getTaskComments(task.id).then(c => setComments(c || [])).catch(() => setComments([]));
  const refreshTask = async () => { try { const t = await getTaskById(task.id); setLocalTask(t); onChanged?.(t); } catch {} };

  useEffect(() => { if (visible) { setLocalTask(task); loadActivity(); loadComments(); } }, [visible, task.id]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try { await addTaskComment(task.id, currentUserId, text.trim()); setText(''); loadComments(); loadActivity(); }
    catch { Alert.alert('Ошибка', 'Не удалось отправить'); }
    finally { setSending(false); }
  };

  const assignees: any[] = localTask.assignees || [];
  const assignedIds = new Set(assignees.map(a => a.user_id));
  const addable = (contacts || []).filter(c => !assignedIds.has(c.user_id));

  const doAdd = async (uid: number) => {
    setBusy(true);
    try { await addTaskAssignee(task.id, { user_id: uid, actor_id: currentUserId }); await refreshTask(); loadActivity(); }
    catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось добавить'); }
    finally { setBusy(false); }
  };
  const doRemove = async (assigneeId: number) => {
    setBusy(true);
    try { await removeTaskAssigneeById(task.id, assigneeId, currentUserId); await refreshTask(); loadActivity(); }
    catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось удалить'); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Совместная работа</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{localTask.title}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {([['activity', 'Активность'], ['comments', 'Комментарии'], ['members', 'Состав']] as const).map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {tab === 'activity' && (
            activity === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> :
            activity.length === 0 ? <Text style={styles.empty}>Пока нет событий</Text> :
            activity.map(a => (
              <View key={a.id} style={styles.activityRow}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityText}><Text style={{ fontWeight: '700' }}>{a.actor_name || 'Участник'}</Text> {ACTION_LABEL[a.action] || a.action}{a.detail && a.action !== 'created' ? ` — ${a.detail}` : ''}</Text>
                  <Text style={styles.activityTime}>{fmt(a.created_at)}</Text>
                </View>
              </View>
            ))
          )}

          {tab === 'comments' && (
            <>
              {comments === null ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> :
                comments.length === 0 ? <Text style={styles.empty}>Комментариев пока нет</Text> :
                comments.map(c => (
                  <View key={c.id} style={styles.comment}>
                    <Text style={styles.commentAuthor}>{c.author_name || 'Участник'} · {fmt(c.created_at)}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                ))}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                <TextInput style={[styles.input, { flex: 1 }]} value={text} onChangeText={setText} placeholder="Комментарий..." placeholderTextColor={colors.textMuted} multiline />
                <TouchableOpacity style={styles.sendBtn} disabled={sending || !text.trim()} onPress={send}>
                  {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>
            </>
          )}

          {tab === 'members' && (
            <>
              {assignees.map(a => (
                <View key={a.id} style={styles.memberRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{a.user_name || `#${a.user_id}`}</Text>
                    {!!a.part_description && <Text style={styles.memberPart}>{a.part_description}</Text>}
                  </View>
                  {canManage && (
                    <TouchableOpacity style={styles.removeBtn} disabled={busy} onPress={() => doRemove(a.id)}>
                      <Text style={styles.removeText}>Удалить</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {assignees.length === 0 && <Text style={styles.empty}>Один исполнитель (без совместной работы)</Text>}
              {canManage && addable.length > 0 && (
                <>
                  <Text style={styles.addLabel}>Добавить исполнителя</Text>
                  {addable.map(c => (
                    <TouchableOpacity key={c.user_id} style={styles.addRow} disabled={busy} onPress={() => doAdd(c.user_id)}>
                      <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                      <Text style={styles.memberName}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {!canManage && <Text style={styles.hint}>Изменять состав может только тимлид.</Text>}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  tabActive: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  tabTextActive: { color: '#fff' },
  empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 20 },
  activityRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 6 },
  activityText: { fontSize: 13, color: c.textPrimary },
  activityTime: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  comment: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10 },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
  commentBody: { fontSize: 14, color: c.textPrimary, marginTop: 2 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.surface, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12 },
  memberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  memberPart: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  removeBtn: { borderWidth: 1, borderColor: c.danger, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  removeText: { fontSize: 12, fontWeight: '600', color: c.danger },
  addLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
});
