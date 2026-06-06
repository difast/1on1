import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/theme';
import {
  getTeams, getMemberTeam, getMeetings, getTasks,
  updateUser, deleteUser, blockUser, unblockUser,
} from '../../lib/api';
import type { AppColors } from '../../constants/colors';

const statusOf = (t: any) => t.status ?? (t.completed ? 'done' : 'in_progress');

export function UserDetailModal({
  user, onClose, onChanged,
}: {
  user: any | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<{ id: number; name: string; role: string }[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [role, setRole] = useState<string>('member');

  useEffect(() => {
    if (!user) return;
    setBlocked(!!user.is_blocked);
    setRole(user.role);
    setLoading(true);
    (async () => {
      const found: { id: number; name: string; role: string }[] = [];
      try {
        const all = await getTeams() as any[];
        for (const t of (all || [])) {
          if (t.team_lead_id === user.id) found.push({ id: t.id, name: t.name, role: 'тимлид' });
        }
      } catch {}
      try {
        const mt = await getMemberTeam(user.id) as any;
        if (mt && mt.id && !found.some(f => f.id === mt.id)) {
          const me = (mt.members || []).find((m: any) => m.user_id === user.id);
          found.push({ id: mt.id, name: mt.name, role: me?.role ?? 'участник' });
        }
      } catch {}
      setTeams(found);
      try {
        const [asMember, asLead] = await Promise.all([
          getMeetings({ member_id: user.id }) as Promise<any[]>,
          getMeetings({ team_lead_id: user.id }) as Promise<any[]>,
        ]);
        const map: Record<number, any> = {};
        for (const m of [...(asMember || []), ...(asLead || [])]) map[m.id] = m;
        setMeetings(Object.values(map));
      } catch { setMeetings([]); }
      try { setTasks(await getTasks({ assigned_to: user.id }) as any[]); } catch { setTasks([]); }
      setLoading(false);
    })();
  }, [user?.id]);

  if (!user) return null;

  const changeRole = async (newRole: string) => {
    if (newRole === role) return;
    setBusy(true);
    try { await updateUser(user.id, { role: newRole }); setRole(newRole); onChanged(); }
    catch { Alert.alert('Ошибка', 'Не удалось сменить роль'); }
    finally { setBusy(false); }
  };

  const toggleBlock = async () => {
    setBusy(true);
    try {
      if (blocked) await unblockUser(user.id); else await blockUser(user.id);
      setBlocked(!blocked); onChanged();
    } catch { Alert.alert('Ошибка', 'Не удалось'); }
    finally { setBusy(false); }
  };

  const handleDelete = () => {
    Alert.alert('Удалить пользователя?', `${user.name} (id ${user.id}) будет удалён безвозвратно.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await deleteUser(user.id); onChanged(); onClose(); }
          catch { Alert.alert('Ошибка', 'Не удалось удалить'); setBusy(false); }
        },
      },
    ]);
  };

  return (
    <Modal visible={!!user} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.sub}>{user.email}</Text>
            <View style={styles.idRow}>
              <Text style={styles.idBadge}>ID: {user.id}</Text>
              <Text style={[styles.idBadge, { backgroundColor: colors.accentLight, color: colors.accent }]}>
                {role === 'team_lead' ? 'Тимлид' : 'Участник'}
              </Text>
              {blocked && <Text style={[styles.idBadge, { backgroundColor: colors.dangerBg, color: colors.danger }]}>Заблокирован</Text>}
            </View>

            {loading ? <ActivityIndicator style={{ marginVertical: 20 }} color={colors.accent} /> : (
              <>
                {/* Teams */}
                <Text style={styles.section}>Команды ({teams.length})</Text>
                {teams.length === 0 ? <Text style={styles.empty}>Не состоит в командах</Text> :
                  teams.map(t => (
                    <View key={t.id} style={styles.row}>
                      <Text style={styles.rowMain}>{t.name}</Text>
                      <Text style={styles.rowMeta}>team_id:{t.id} · {t.role}</Text>
                    </View>
                  ))}

                {/* Meetings */}
                <Text style={styles.section}>Встречи ({meetings.length})</Text>
                {meetings.length === 0 ? <Text style={styles.empty}>Нет встреч</Text> :
                  meetings.slice(0, 20).map(m => (
                    <View key={m.id} style={styles.row}>
                      <Text style={styles.rowMain}>
                        {m.scheduled_date ? new Date(m.scheduled_date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </Text>
                      <Text style={styles.rowMeta}>meeting_id:{m.id} · {m.status}</Text>
                    </View>
                  ))}

                {/* Tasks */}
                <Text style={styles.section}>Задачи ({tasks.length})</Text>
                {tasks.length === 0 ? <Text style={styles.empty}>Нет задач</Text> :
                  tasks.slice(0, 20).map(t => (
                    <View key={t.id} style={styles.row}>
                      <Text style={styles.rowMain} numberOfLines={1}>{t.title || t.description}</Text>
                      <Text style={styles.rowMeta}>task_id:{t.id} · {statusOf(t)}</Text>
                    </View>
                  ))}

                {/* Role change */}
                <Text style={styles.section}>Сменить роль</Text>
                <View style={styles.roleRow}>
                  <TouchableOpacity
                    style={[styles.roleBtn, role === 'member' && styles.roleBtnActive]}
                    onPress={() => changeRole('member')} disabled={busy}
                  >
                    <Text style={[styles.roleBtnText, role === 'member' && styles.roleBtnTextActive]}>Участник</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleBtn, role === 'team_lead' && styles.roleBtnActive]}
                    onPress={() => changeRole('team_lead')} disabled={busy}
                  >
                    <Text style={[styles.roleBtnText, role === 'team_lead' && styles.roleBtnTextActive]}>Тимлид</Text>
                  </TouchableOpacity>
                </View>

                {/* Danger actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.blockBtn, blocked && styles.unblockBtn]} onPress={toggleBlock} disabled={busy}>
                    <Text style={[styles.blockBtnText, blocked && styles.unblockBtnText]}>{blocked ? 'Разблокировать' : 'Заблокировать'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={busy}>
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.deleteBtnText}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
  sub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  idRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  idBadge: { fontSize: 12, fontWeight: '700', color: c.textSecondary, backgroundColor: c.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  section: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 6 },
  empty: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  rowMain: { flex: 1, fontSize: 14, color: c.textPrimary },
  rowMeta: { fontSize: 11, color: c.textMuted },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: c.surface },
  roleBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  roleBtnTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  blockBtn: { flex: 1, backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  blockBtnText: { fontSize: 14, fontWeight: '600', color: c.danger },
  unblockBtn: { backgroundColor: c.successBg, borderColor: '#86efac' },
  unblockBtnText: { color: c.success },
  deleteBtn: { flex: 1, backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
