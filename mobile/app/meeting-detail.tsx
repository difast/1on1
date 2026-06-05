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
import { getMeeting, getNotes, createNote, updateNote, startCall } from '../src/lib/api';
import type { AppColors } from '../src/constants/colors';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#F59E0B',
  confirmed: '#10B981',
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

  const scheduledAt = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
  const statusColor = STATUS_COLOR[meeting.status] ?? colors.textMuted;
  const statusLabel = STATUS_LABEL[meeting.status] ?? meeting.status;
  const isUpcoming = scheduledAt && scheduledAt > new Date();

  const otherName = meeting.member_name ?? meeting.lead_name ?? meeting.participant_name ?? 'Участник';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Встреча</Text>
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
          {meeting.is_rescheduled && (
            <View style={styles.infoRow}>
              <Ionicons name="refresh-outline" size={16} color={colors.warning} />
              <Text style={[styles.infoText, { color: colors.warning }]}>Перенесена</Text>
            </View>
          )}
        </View>

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
