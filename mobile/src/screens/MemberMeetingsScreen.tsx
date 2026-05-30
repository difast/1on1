import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useAuth } from '../context/auth';
import { getMeetings, requestMeeting, getMemberTeam, getNotes, createNote, updateNote, startCall } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { WeekCalendar } from '../components/WeekCalendar';

export default function MemberMeetingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarView, setCalendarView] = useState(false);

  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTopic, setMeetingTopic] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Meeting notes
  const [notes, setNotes] = useState<any[]>([]);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<Record<number, boolean>>({});
  const [callLoading, setCallLoading] = useState<Record<number, boolean>>({});

  const handleStartCall = async (meetingId: number) => {
    if (!user) return;
    setCallLoading(prev => ({ ...prev, [meetingId]: true }));
    try {
      const data = await startCall(meetingId, user.id);
      await Linking.openURL(`${data.room_url}?t=${data.token}`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось начать созвон');
    } finally {
      setCallLoading(prev => ({ ...prev, [meetingId]: false }));
    }
  };

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['45%', '75%'], []);

  const findTeamId = useCallback(async () => {
    try {
      const detail = await getMemberTeam(user!.id) as any;
      setTeamId(detail.id);
    } catch {}
  }, [user]);

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getMeetings({ member_id: user!.id }) as any[];
      setMeetings(data || []);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }, [user]);

  const loadNotes = useCallback(async () => {
    try {
      const data = await getNotes(user!.id) as any[];
      setNotes(data || []);
      const drafts: Record<number, string> = {};
      for (const n of (data || [])) {
        if (n.meeting_id) drafts[n.meeting_id] = n.content;
      }
      setNoteDrafts(drafts);
    } catch {}
  }, [user]);

  useEffect(() => {
    findTeamId();
    loadMeetings();
    loadNotes();
  }, [user?.id]);

  const handleSaveNote = async (meetingId: number) => {
    const content = (noteDrafts[meetingId] ?? '').trim();
    if (!content || !user) return;
    setSavingNote(prev => ({ ...prev, [meetingId]: true }));
    try {
      const existing = notes.find((n: any) => n.meeting_id === meetingId);
      if (existing) {
        await updateNote(existing.id, { content });
        setNotes(prev => prev.map((n: any) => n.id === existing.id ? { ...n, content } : n));
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMeetings(), loadNotes()]);
    setRefreshing(false);
  };

  const handleRequest = async () => {
    if (!meetingDate) return;
    setFormLoading(true);
    try {
      await requestMeeting({
        team_id: teamId,
        member_id: user!.id,
        scheduled_date: meetingDate,
        topic: meetingTopic.trim() || undefined,
      });
      setMeetingDate(''); setMeetingTopic('');
      bottomSheetRef.current?.close();
      await loadMeetings();
    } catch {} finally { setFormLoading(false); }
  };

  const now = new Date();
  const upcoming = meetings
    .filter(m => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  const past = meetings
    .filter(m => new Date(m.scheduled_date) < now || m.status === 'completed')
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Встречи</Text>
        <View style={styles.headerRight}>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, !calendarView && styles.toggleBtnActive]}
              onPress={() => setCalendarView(false)}
            >
              <Text style={[styles.toggleBtnText, !calendarView && styles.toggleBtnTextActive]}>
                Список
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, calendarView && styles.toggleBtnActive]}
              onPress={() => setCalendarView(true)}
            >
              <Text style={[styles.toggleBtnText, calendarView && styles.toggleBtnTextActive]}>
                Неделя
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => bottomSheetRef.current?.expand()}
          >
            <Text style={styles.requestBtnText}>+ Запросить</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {meetings.length === 0 && (
          <EmptyState icon="📅" title="Нет встреч" description="Запросите первую встречу с тимлидом" />
        )}

        {calendarView ? (
          <WeekCalendar meetings={meetings} />
        ) : (
          <>
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Предстоящие</Text>
                {upcoming.map(m => (
                  <View key={m.id} style={styles.upcomingCard}>
                    <MeetingItem meeting={m} />
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
                  const hasNote = notes.some((n: any) => n.meeting_id === m.id);
                  const isOpen = expandedNoteId === m.id;
                  const draft = noteDrafts[m.id] ?? '';
                  const saving = savingNote[m.id] ?? false;
                  return (
                    <View key={m.id} style={styles.pastCard}>
                      <MeetingItem meeting={m} />
                      <TouchableOpacity
                        style={styles.noteToggleBtn}
                        onPress={() => setExpandedNoteId(isOpen ? null : m.id)}
                      >
                        <Text style={[styles.noteToggleText, hasNote && styles.noteToggleActive]}>
                          {hasNote ? '● ' : ''}{isOpen ? '▾ Заметки' : '▸ Заметки'}
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
                            multiline autoFocus
                          />
                          <View style={styles.noteEditorRow}>
                            <TouchableOpacity style={styles.noteCancelBtn} onPress={() => setExpandedNoteId(null)}>
                              <Text style={styles.noteCancelText}>Закрыть</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.noteSaveBtn, (!draft.trim() || saving) && styles.btnDisabled]}
                              onPress={() => handleSaveNote(m.id)} disabled={!draft.trim() || saving}
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

      {/* Request meeting sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Запросить встречу</Text>

          <Text style={styles.sheetLabel}>Дата и время (ГГГГ-ММ-ДД ЧЧ:ММ)</Text>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={meetingDate}
            onChangeText={setMeetingDate}
            placeholder="2025-12-31 14:00"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Тема (необязательно)</Text>
          <BottomSheetTextInput
            style={[styles.sheetInput, { height: 80, textAlignVertical: 'top' }]}
            value={meetingTopic}
            onChangeText={setMeetingTopic}
            placeholder="О чём хотите поговорить?"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <View style={styles.sheetRow}>
            <TouchableOpacity
              style={[styles.sheetBtnSecondary, { flex: 1 }]}
              onPress={() => bottomSheetRef.current?.close()}
            >
              <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
              onPress={handleRequest}
              disabled={formLoading}
            >
              <Text style={styles.sheetBtnText}>{formLoading ? 'Отправка...' : 'Запросить'}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggle: {
    flexDirection: 'row', borderRadius: 8, borderWidth: 1,
    borderColor: c.border, overflow: 'hidden', backgroundColor: c.surface,
  },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  toggleBtnActive: { backgroundColor: c.accent },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  toggleBtnTextActive: { color: '#fff' },
  requestBtn: {
    backgroundColor: c.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  requestBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  sheetContent: { padding: 20, gap: 4, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 16 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  sheetInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary,
    backgroundColor: c.surface, marginBottom: 14,
  },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetBtn: {
    backgroundColor: c.accent, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetBtnSecondary: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', backgroundColor: c.surface,
  },
  sheetBtnSecondaryText: { fontSize: 15, fontWeight: '500', color: c.textSecondary },
  btnDisabled: { opacity: 0.6 },
  upcomingCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  callBtn: {
    backgroundColor: '#0061ff', paddingVertical: 10,
    alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border,
  },
  callBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  pastCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  noteToggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
  noteToggleText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  noteToggleActive: { color: c.accent },
  noteEditor: { borderTopWidth: 1, borderTopColor: c.border, padding: 12, gap: 10 },
  noteInput: {
    fontSize: 14, color: c.textPrimary, minHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, backgroundColor: c.bg,
  },
  noteEditorRow: { flexDirection: 'row', gap: 8 },
  noteCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingVertical: 9, alignItems: 'center', backgroundColor: c.surface2 ?? c.surface,
  },
  noteCancelText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
  noteSaveBtn: { flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  noteSaveText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
