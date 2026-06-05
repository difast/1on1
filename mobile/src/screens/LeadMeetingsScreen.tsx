import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getMeetings, getUsers, confirmMeeting, declineMeeting, getNotes, createNote, updateNote, startCall } from '../lib/api';
import { useTheme } from '../context/theme';
import { useRouter } from 'expo-router';
import type { AppColors } from '../constants/colors';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { WeekCalendar } from '../components/WeekCalendar';

export default function LeadMeetingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const goToDetail = (m: any) => router.push({ pathname: '/meeting-detail', params: { id: String(m.id) } } as any);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<number, any>>({});
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [calendarView, setCalendarView] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Meeting notes state
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<Record<number, boolean>>({});
  const [callLoading, setCallLoading] = useState<Record<number, boolean>>({});

  const handleStartCall = async (meetingId: number) => {
    if (!user) return;
    setCallLoading(prev => ({ ...prev, [meetingId]: true }));
    try {
      const data = await startCall(meetingId, user.id);
      const url = `${data.room_url}?t=${data.token}`;
      await Linking.openURL(url);
    } catch {
      Alert.alert('Ошибка', 'Не удалось начать созвон');
    } finally {
      setCallLoading(prev => ({ ...prev, [meetingId]: false }));
    }
  };

  const load = useCallback(async () => {
    try {
      const [meetingsData, usersData, notesData] = await Promise.all([
        getMeetings({ team_lead_id: user!.id }),
        getUsers(),
        getNotes(user!.id),
      ]) as [any[], any[], any[]];
      setMeetings(meetingsData || []);
      const map: Record<number, any> = {};
      for (const u of (usersData || [])) map[u.id] = u;
      setUsersMap(map);
      setNotes(notesData || []);
      const drafts: Record<number, string> = {};
      for (const n of (notesData || [])) {
        if (n.meeting_id) drafts[n.meeting_id] = n.content;
      }
      setNoteDrafts(drafts);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleConfirm = async (id: number) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await confirmMeeting(id);
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: 'confirmed' } : m));
    } catch {} finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDecline = async (id: number) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await declineMeeting(id);
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: 'declined' } : m));
    } catch {} finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveNote = async (meetingId: number) => {
    const content = (noteDrafts[meetingId] ?? '').trim();
    if (!content || !user) return;
    setSavingNote(prev => ({ ...prev, [meetingId]: true }));
    try {
      const existing = notes.find(n => n.meeting_id === meetingId);
      if (existing) {
        await updateNote(existing.id, { content });
        setNotes(prev => prev.map(n => n.id === existing.id ? { ...n, content } : n));
      } else {
        const note = await createNote({ user_id: user.id, content, meeting_id: meetingId }) as any;
        setNotes(prev => [...prev, note]);
      }
      setExpandedNoteId(null);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить заметку');
    } finally {
      setSavingNote(prev => ({ ...prev, [meetingId]: false }));
    }
  };

  const now = new Date();
  const FILTERS = [
    { key: 'all', label: 'Все' },
    { key: 'scheduled', label: 'Запланировано' },
    { key: 'confirmed', label: 'Подтверждено' },
    { key: 'in_progress', label: 'Идёт' },
    { key: 'completed', label: 'Завершено' },
    { key: 'rescheduled', label: 'Перенесено' },
    { key: 'cancelled', label: 'Отменено' },
    { key: 'declined', label: 'Отклонено' },
  ];
  const visibleFilters = FILTERS.filter(f => f.key === 'all' || meetings.some(m =>
    f.key === 'rescheduled'
      ? m.is_rescheduled && !['cancelled','declined'].includes(m.status)
      : m.status === f.key && m.status !== 'requested'
  ));
  const requests = meetings.filter(m => m.status === 'requested');
  const baseMeetings = statusFilter === 'all'
    ? meetings.filter(m => m.status !== 'requested')
    : statusFilter === 'rescheduled'
    ? meetings.filter(m => m.is_rescheduled && !['cancelled','declined'].includes(m.status))
    : meetings.filter(m => m.status === statusFilter);
  const upcoming = baseMeetings
    .filter(m => m.status !== 'cancelled' && m.status !== 'declined' && new Date(m.scheduled_date) >= now)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  const past = baseMeetings
    .filter(m => new Date(m.scheduled_date) < now || m.status === 'completed' || m.status === 'cancelled' || m.status === 'declined')
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Мои встречи</Text>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, !calendarView && styles.toggleBtnActive]}
            onPress={() => setCalendarView(false)}
          >
            <Text style={[styles.toggleBtnText, !calendarView && styles.toggleBtnTextActive]}>Список</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, calendarView && styles.toggleBtnActive]}
            onPress={() => setCalendarView(true)}
          >
            <Text style={[styles.toggleBtnText, calendarView && styles.toggleBtnTextActive]}>Неделя</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {!calendarView && visibleFilters.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
            {visibleFilters.map(f => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setStatusFilter(f.key)}
                style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {meetings.length === 0 && (
          <EmptyState icon="calendar-outline" title="Встреч пока нет" description="Встречи появятся после планирования" />
        )}

        {calendarView ? (
          <WeekCalendar
            meetings={meetings}
            subtitleFn={m => usersMap[m.member_id]?.name ?? null}
          />
        ) : (
          <>
            {requests.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Запросы на встречу</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{requests.length}</Text>
                  </View>
                </View>
                {requests.map(m => (
                  <View key={m.id} style={{ gap: 8 }}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => goToDetail(m)}>
                    <MeetingItem
                      meeting={m}
                      subtitle={usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`}
                    />
                    </TouchableOpacity>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.confirmBtn, actionLoading[m.id] && styles.btnDisabled]}
                        onPress={() => handleConfirm(m.id)}
                        disabled={actionLoading[m.id]}
                      >
                        <Text style={styles.confirmBtnText}>Принять</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.declineBtn, actionLoading[m.id] && styles.btnDisabled]}
                        onPress={() => handleDecline(m.id)}
                        disabled={actionLoading[m.id]}
                      >
                        <Text style={styles.declineBtnText}>Отклонить</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {upcoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Предстоящие</Text>
                {upcoming.map(m => (
                  <View key={m.id} style={styles.upcomingCard}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => goToDetail(m)}>
                    <MeetingItem
                      meeting={m}
                      subtitle={usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`}
                    />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.callBtn, callLoading[m.id] && styles.btnDisabled]}
                      onPress={() => handleStartCall(m.id)}
                      disabled={callLoading[m.id]}
                    >
                      <Text style={styles.callBtnText}>
                        {callLoading[m.id] ? 'Подключение...' : 'Начать созвон'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {past.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Прошедшие</Text>
                {past.map(m => {
                  const memberName = usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`;
                  const hasNote = notes.some(n => n.meeting_id === m.id);
                  const isOpen = expandedNoteId === m.id;
                  const draft = noteDrafts[m.id] ?? '';
                  const saving = savingNote[m.id] ?? false;
                  return (
                    <View key={m.id} style={styles.pastMeetingCard}>
                      <TouchableOpacity activeOpacity={0.8} onPress={() => goToDetail(m)}>
                        <MeetingItem meeting={m} subtitle={memberName} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.noteToggleBtn, styles.noteToggleRow]}
                        onPress={() => setExpandedNoteId(isOpen ? null : m.id)}
                        activeOpacity={0.7}
                      >
                        {hasNote && <View style={styles.noteDot} />}
                        <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={hasNote ? colors.accent : colors.textSecondary} />
                        <Text style={[styles.noteToggleText, hasNote && styles.noteToggleTextActive]}>
                          {' '}Заметки
                        </Text>
                      </TouchableOpacity>
                      {isOpen && (
                        <View style={styles.noteEditor}>
                          <TextInput
                            style={styles.noteInput}
                            value={draft}
                            onChangeText={v => setNoteDrafts(prev => ({ ...prev, [m.id]: v }))}
                            placeholder="Добавьте заметку по встрече..."
                            placeholderTextColor={colors.textMuted}
                            multiline
                            autoFocus
                          />
                          <View style={styles.noteEditorRow}>
                            <TouchableOpacity style={styles.noteCancelBtn} onPress={() => setExpandedNoteId(null)}>
                              <Text style={styles.noteCancelText}>Закрыть</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.noteSaveBtn, (!draft.trim() || saving) && styles.btnDisabled]}
                              onPress={() => handleSaveNote(m.id)}
                              disabled={!draft.trim() || saving}
                            >
                              <Text style={styles.noteSaveText}>{saving ? '...' : 'Сохранить'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  viewToggle: {
    flexDirection: 'row', borderRadius: 8, borderWidth: 1,
    borderColor: c.border, overflow: 'hidden', backgroundColor: c.surface,
  },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  toggleBtnActive: { backgroundColor: c.accent },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  toggleBtnTextActive: { color: '#fff' },
  content: { padding: 16, gap: 20, paddingBottom: 100 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  badge: { backgroundColor: c.warningBg, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', color: c.warning },
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  confirmBtn: { flex: 1, backgroundColor: c.success, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  declineBtn: {
    flex: 1, backgroundColor: c.dangerBg, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: c.danger,
  },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: c.danger },
  btnDisabled: { opacity: 0.6 },

  // Upcoming with call button
  upcomingCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  callBtn: {
    backgroundColor: '#0061ff', paddingVertical: 10,
    alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border,
  },
  callBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // Past meeting with notes
  pastMeetingCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  noteToggleBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  noteToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
  noteToggleText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  noteToggleTextActive: { color: c.accent },
  noteEditor: {
    borderTopWidth: 1, borderTopColor: c.border,
    padding: 12, gap: 10,
  },
  noteInput: {
    fontSize: 14, color: c.textPrimary, minHeight: 70,
    textAlignVertical: 'top', borderWidth: 1, borderColor: c.border,
    borderRadius: 8, padding: 10, backgroundColor: c.bg,
  },
  noteEditorRow: { flexDirection: 'row', gap: 8 },
  noteCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingVertical: 9, alignItems: 'center', backgroundColor: c.surface2,
  },
  noteCancelText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
  noteSaveBtn: {
    flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 9, alignItems: 'center',
  },
  noteSaveText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  filterChip: {
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
  },
  filterChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  filterChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  filterChipTextActive: { color: '#fff' },
});
