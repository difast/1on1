import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../src/context/auth';
import { useTheme } from '../src/context/theme';
import {
  getMeeting, getNotes, createNote, updateNote, startCall,
  getUsers, confirmMeeting, declineMeeting, updateMeeting,
} from '../src/lib/api';
import type { AppColors } from '../src/constants/colors';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  requested: 'Запрос',
  scheduled: 'Запланирована',
  confirmed: 'Подтверждена',
  in_progress: 'Идёт',
  declined: 'Отклонена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  requested: '#F59E0B',
  scheduled: '#0061ff',
  confirmed: '#10B981',
  in_progress: '#0061ff',
  declined: '#EF4444',
  completed: '#6366F1',
  cancelled: '#6B7280',
};

export default function MeetingDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string; data?: string }>();

  const [meeting, setMeeting] = useState<any>(params.data ? JSON.parse(params.data) : null);
  const [loading, setLoading] = useState(!meeting);
  const [callLoading, setCallLoading] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<number, any>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Reschedule
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');

  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);

  const load = useCallback(async () => {
    if (!params.id) return;
    try {
      const m = await getMeeting(Number(params.id));
      setMeeting(m);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить встречу');
      router.back();
    } finally { setLoading(false); }
  }, [params.id]);

  // Resolve participant names — the meetings API returns ids only.
  const loadUsers = useCallback(async () => {
    try {
      const users = await getUsers() as any[];
      const map: Record<number, any> = {};
      for (const u of (users || [])) map[u.id] = u;
      setUsersMap(map);
    } catch {}
  }, []);

  useEffect(() => { loadUsers(); }, []);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotes(user.id) as any[];
      const meetId = meeting?.id ?? Number(params.id);
      setNotes((data || []).filter((n: any) => n.meeting_id === meetId));
    } catch {}
  }, [user, meeting, params.id]);

  useEffect(() => {
    if (!meeting) load();
  }, []);

  useEffect(() => {
    if (meeting) loadNotes();
  }, [meeting?.id]);

  const handleCall = async () => {
    if (!meeting || !user) return;
    setCallLoading(true);
    try {
      const res = await startCall(meeting.id, user.id) as any;
      const url = res?.room_url
        ?? `https://meet.jit.si/oneonone-${String(meeting.id).replace(/-/g, '').slice(0, 20)}`;
      await Linking.openURL(url);
    } catch {
      const fallback = `https://meet.jit.si/oneonone-${String(meeting.id).replace(/-/g, '').slice(0, 20)}`;
      await Linking.openURL(fallback);
    } finally { setCallLoading(false); }
  };

  const handleConfirm = async () => {
    if (!meeting) return;
    setActionLoading(true);
    try {
      await confirmMeeting(meeting.id);
      setMeeting((prev: any) => ({ ...prev, status: 'confirmed' }));
    } catch { Alert.alert('Ошибка', 'Не удалось подтвердить встречу'); }
    finally { setActionLoading(false); }
  };

  const handleDecline = async () => {
    if (!meeting) return;
    setActionLoading(true);
    try {
      await declineMeeting(meeting.id);
      setMeeting((prev: any) => ({ ...prev, status: 'declined' }));
    } catch { Alert.alert('Ошибка', 'Не удалось отклонить встречу'); }
    finally { setActionLoading(false); }
  };

  const handleReschedule = async () => {
    const slot = newDate.trim();
    if (!slot || !meeting) return;
    // Accept "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM"
    const iso = slot.replace(' ', 'T');
    if (isNaN(new Date(iso).getTime())) {
      Alert.alert('Неверная дата', 'Формат: ГГГГ-ММ-ДД ЧЧ:ММ');
      return;
    }
    setActionLoading(true);
    try {
      await updateMeeting(meeting.id, { scheduled_date: iso, is_rescheduled: true });
      setMeeting((prev: any) => ({ ...prev, scheduled_date: iso, is_rescheduled: true, status: prev.status === 'declined' || prev.status === 'cancelled' ? 'scheduled' : prev.status }));
      setShowReschedule(false);
      setNewDate('');
    } catch { Alert.alert('Ошибка', 'Не удалось перенести встречу'); }
    finally { setActionLoading(false); }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || !user || !meeting) return;
    setNoteLoading(true);
    try {
      if (editingNote) {
        await updateNote(editingNote.id, { content: noteText.trim() });
        setNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, content: noteText.trim() } : n));
        setEditingNote(null);
      } else {
        const n = await createNote({ user_id: user.id, content: noteText.trim(), meeting_id: meeting.id }) as any;
        setNotes(prev => [...prev, n]);
      }
      setNoteText('');
    } catch { Alert.alert('Ошибка', 'Не удалось сохранить заметку'); }
    finally { setNoteLoading(false); }
  };

  if (loading || !meeting) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} size="large" /></View>
      </SafeAreaView>
    );
  }

  // Backend field is `scheduled_date` (older code read `scheduled_at`, so the
  // date never rendered). Support both for safety.
  const rawDate = meeting.scheduled_date ?? meeting.scheduled_at;
  const scheduledAt = rawDate ? new Date(rawDate) : null;
  const statusColor = STATUS_COLOR[meeting.status] ?? colors.textMuted;
  const statusLabel = STATUS_LABEL[meeting.status] ?? meeting.status;
  const isUpcoming = scheduledAt && scheduledAt > new Date();

  // Show the *other* participant's real name (resolved from the users list).
  const isLead = user?.id === meeting.team_lead_id;
  const otherId = isLead ? meeting.member_id : meeting.team_lead_id;
  const otherName =
    usersMap[otherId]?.name
    ?? meeting.member_name ?? meeting.lead_name ?? meeting.participant_name
    ?? (otherId ? `Участник #${otherId}` : 'Участник');

  const isFinal = ['declined', 'cancelled', 'completed'].includes(meeting.status);
  // The lead can accept/decline incoming requests; both sides can reschedule a live meeting.
  const canAct = !isFinal;
  const canConfirm = canAct && ['requested', 'pending', 'scheduled'].includes(meeting.status);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{otherName}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Main card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: colors.accentLight }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>
                {otherName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.participantName}>{otherName}</Text>
              {meeting.title && <Text style={styles.meetingTitle}>{meeting.title}</Text>}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {scheduledAt && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>
                {scheduledAt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
          )}
          {scheduledAt && (
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>
                {scheduledAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
          {meeting.duration_minutes && (
            <View style={styles.infoRow}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.infoText}>{meeting.duration_minutes} минут</Text>
            </View>
          )}
          {meeting.is_rescheduled === true && (
            <View style={styles.infoRow}>
              <Ionicons name="refresh-outline" size={16} color={colors.warning} />
              <Text style={[styles.infoText, { color: colors.warning }]}>Перенесена</Text>
            </View>
          )}
        </View>

        {/* Actions: confirm / decline / reschedule */}
        {canAct && (
          <View style={styles.actions}>
            {canConfirm && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.confirmBtn, actionLoading && styles.btnDisabled]}
                  onPress={handleConfirm}
                  disabled={actionLoading}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.confirmBtnText}>Подтвердить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.declineBtn, actionLoading && styles.btnDisabled]}
                  onPress={handleDecline}
                  disabled={actionLoading}
                >
                  <Ionicons name="close" size={18} color={colors.danger} />
                  <Text style={styles.declineBtnText}>Отклонить</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.rescheduleBtn}
              onPress={() => setShowReschedule(s => !s)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.accent} />
              <Text style={styles.rescheduleBtnText}>Перенести встречу</Text>
            </TouchableOpacity>

            {showReschedule && (
              <View style={styles.rescheduleBox}>
                <TextInput
                  style={styles.rescheduleInput}
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="Новая дата: ГГГГ-ММ-ДД ЧЧ:ММ"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <View style={styles.noteInputRow}>
                  <TouchableOpacity
                    style={styles.noteCancelBtn}
                    onPress={() => { setShowReschedule(false); setNewDate(''); }}
                  >
                    <Text style={styles.noteCancelText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.noteSaveBtn, (!newDate.trim() || actionLoading) && styles.btnDisabled]}
                    onPress={handleReschedule}
                    disabled={!newDate.trim() || actionLoading}
                  >
                    <Text style={styles.noteSaveText}>{actionLoading ? '...' : 'Перенести'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Call button */}
        {(isUpcoming || meeting.status === 'confirmed') && (
          <TouchableOpacity
            style={[styles.callBtn, callLoading && { opacity: 0.7 }]}
            onPress={handleCall}
            disabled={callLoading}
            activeOpacity={0.85}
          >
            <Ionicons name="videocam-outline" size={20} color="#fff" />
            <Text style={styles.callBtnText}>
              {callLoading ? 'Подключение...' : 'Начать видеозвонок'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Notes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Заметки</Text>
        </View>

        {notes.map(note => (
          <View key={note.id} style={styles.noteCard}>
            <Text style={styles.noteText}>{note.content}</Text>
            <TouchableOpacity
              onPress={() => { setEditingNote(note); setNoteText(note.content); }}
              style={styles.noteEditBtn}
            >
              <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.noteInputWrap}>
          <TextInput
            style={styles.noteInput}
            value={noteText}
            onChangeText={setNoteText}
            placeholder={editingNote ? 'Редактировать заметку...' : 'Добавить заметку...'}
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <View style={styles.noteInputRow}>
            {editingNote && (
              <TouchableOpacity
                style={styles.noteCancelBtn}
                onPress={() => { setEditingNote(null); setNoteText(''); }}
              >
                <Text style={styles.noteCancelText}>Отмена</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.noteSaveBtn, (!noteText.trim() || noteLoading) && styles.btnDisabled]}
              onPress={handleSaveNote}
              disabled={!noteText.trim() || noteLoading}
            >
              <Text style={styles.noteSaveText}>{noteLoading ? '...' : editingNote ? 'Сохранить' : 'Добавить'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surface },
  headerTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 18, gap: 10 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700' },
  participantName: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
  meetingTitle: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: c.border },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 14, color: c.textSecondary },
  callBtn: {
    backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  callBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  actions: { gap: 10 },
  actionRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1, backgroundColor: c.success, borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  declineBtn: {
    flex: 1, backgroundColor: c.dangerBg, borderWidth: 1, borderColor: c.danger,
    borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  declineBtnText: { fontSize: 15, fontWeight: '700', color: c.danger },
  rescheduleBtn: {
    backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.accent,
    borderRadius: 12, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  rescheduleBtnText: { fontSize: 15, fontWeight: '700', color: c.accent },
  rescheduleBox: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 12, gap: 10,
  },
  rescheduleInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  noteCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },
  noteText: { flex: 1, fontSize: 14, color: c.textPrimary, lineHeight: 20 },
  noteEditBtn: { padding: 4 },
  noteInputWrap: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, gap: 8 },
  noteInput: { fontSize: 14, color: c.textPrimary, minHeight: 60, textAlignVertical: 'top' },
  noteInputRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  noteCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  noteCancelText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  noteSaveBtn: { backgroundColor: c.accent, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  noteSaveText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.45 },
  warning: { color: '#F59E0B' },
});
