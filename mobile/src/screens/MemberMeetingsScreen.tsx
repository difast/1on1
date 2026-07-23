import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getMeetings, requestMeeting, getMemberTeam, getNotes, createNote, updateNote, startCall, updateMeeting, assistantChat, getTasks } from '../lib/api';
import { MeetingProposalsModal } from '../components/MeetingProposalsModal';
import { InteractionsModal } from '../components/InteractionsModal';
import { useTheme } from '../context/theme';
import { useRouter } from 'expo-router';
import type { AppColors } from '../constants/colors';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { WeekCalendar } from '../components/WeekCalendar';
import { DateTimePickerField } from '../components/DateTimePickerField';

export default function MemberMeetingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const goToDetail = (m: any) => router.push({ pathname: '/meeting-detail', params: { id: String(m.id) } } as any);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<{ user_id: number; name: string }[]>([]);
  const [showProposals, setShowProposals] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [interactionTasks, setInteractionTasks] = useState<{ id: number; title: string }[]>([]);
  const openInteractions = async () => {
    try { const t = await getTasks({ assigned_to: user!.id }) as any[]; setInteractionTasks((t || []).map((x: any) => ({ id: x.id, title: x.title }))); } catch {}
    setShowInteractions(true);
  };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTopic, setMeetingTopic] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Meeting notes
  const [notes, setNotes] = useState<any[]>([]);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<Record<number, boolean>>({});
  const [callLoading, setCallLoading] = useState<Record<number, boolean>>({});

  // Reschedule with AI slots
  const rescheduleSheetRef = useRef<BottomSheet>(null);
  const rescheduleSnapPoints = useMemo(() => ['60%', '80%'], []);
  const [rescheduleMeetingId, setRescheduleMeetingId] = useState<number | null>(null);
  const [aiSlots, setAiSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [customSlot, setCustomSlot] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  const openReschedule = async (meeting: any) => {
    setRescheduleMeetingId(meeting.id);
    setAiSlots([]);
    setSelectedSlot('');
    setCustomSlot('');
    rescheduleSheetRef.current?.expand();
    setSlotsLoading(true);
    try {
      const existing = new Date(meeting.scheduled_date).toLocaleString('ru-RU');
      const res = await assistantChat([
        { role: 'user', content: `Предложи 3 варианта для переноса встречи (текущее время: ${existing}). Просто 3 строки в формате ГГГГ-ММ-ДД ЧЧ:ММ, без лишнего текста.` },
      ]) as any;
      const text: string = res.reply ?? '';
      const matches = text.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g) || [];
      setAiSlots(matches.slice(0, 3));
    } catch { setAiSlots([]); }
    finally { setSlotsLoading(false); }
  };

  const handleReschedule = async () => {
    const slot = selectedSlot || customSlot.trim();
    if (!slot || !rescheduleMeetingId) return;
    setRescheduleLoading(true);
    try {
      await updateMeeting(rescheduleMeetingId, { scheduled_date: slot, is_rescheduled: true });
      setMeetings(prev => prev.map(m => m.id === rescheduleMeetingId ? { ...m, scheduled_date: slot, is_rescheduled: true } : m));
      rescheduleSheetRef.current?.close();
    } catch {
      Alert.alert('Ошибка', 'Не удалось перенести встречу');
    } finally { setRescheduleLoading(false); }
  };

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
      // Контакты для предложений встреч: участники команды + тимлид, кроме себя.
      const cs = (detail.members || [])
        .filter((m: any) => m.user_id !== user!.id)
        .map((m: any) => ({ user_id: m.user_id, name: m.user_name || `Участник #${m.user_id}` }));
      setContacts(cs);
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
  const filteredMeetings = statusFilter === 'all'
    ? meetings.filter(m => m.status !== 'requested')
    : statusFilter === 'rescheduled'
    ? meetings.filter(m => m.is_rescheduled && !['cancelled', 'declined'].includes(m.status))
    : meetings.filter(m => m.status === statusFilter);
  const visibleFilters = FILTERS.filter(f => f.key === 'all' || meetings.some(m =>
    f.key === 'rescheduled'
      ? m.is_rescheduled && !['cancelled','declined'].includes(m.status)
      : m.status === f.key
  ));
  const upcoming = filteredMeetings
    .filter(m => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  const past = filteredMeetings
    .filter(m => new Date(m.scheduled_date) < now || m.status === 'completed')
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
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
            style={[styles.requestBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
            onPress={openInteractions}
          >
            <Text style={[styles.requestBtnText, { color: colors.accent }]}>Взаимодействия</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setShowProposals(true)}
          >
            <Text style={[styles.requestBtnText, { color: colors.accent }]}>Предложить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => bottomSheetRef.current?.expand()}
          >
            <Text style={styles.requestBtnText}>+ Запросить</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Предложения встреч (Задача 5): участник может предложить встречу другому */}
      <MeetingProposalsModal
        visible={showProposals}
        onClose={() => setShowProposals(false)}
        currentUser={{ id: user!.id }}
        contacts={contacts}
        teamId={teamId}
        onChanged={loadMeetings}
      />

      {/* Взаимодействия (блок 39) */}
      <InteractionsModal
        visible={showInteractions}
        onClose={() => setShowInteractions(false)}
        currentUser={{ id: user!.id }}
        contacts={contacts}
        tasks={interactionTasks}
        teamId={teamId}
        onChanged={loadMeetings}
      />

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

        {filteredMeetings.length === 0 && meetings.length === 0 && (
          <EmptyState icon="calendar-outline" title="Нет встреч" description="Запросите первую встречу с тимлидом" />
        )}
        {filteredMeetings.length === 0 && meetings.length > 0 && (
          <EmptyState icon="calendar-outline" title="Нет встреч" description="По выбранному фильтру встреч нет" />
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
                    <TouchableOpacity activeOpacity={0.8} onPress={() => goToDetail(m)}>
                      <MeetingItem meeting={m} />
                    </TouchableOpacity>
                    <View style={styles.upcomingActions}>
                      <TouchableOpacity
                        style={[styles.rescheduleBtn]}
                        onPress={() => openReschedule(m)}
                      >
                        <Ionicons name="calendar-outline" size={14} color={colors.accent} />
                        <Text style={styles.rescheduleBtnText}>Перенести</Text>
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
                      <TouchableOpacity activeOpacity={0.8} onPress={() => goToDetail(m)}>
                        <MeetingItem meeting={m} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.noteToggleBtn, styles.noteToggleRow]}
                        onPress={() => setExpandedNoteId(isOpen ? null : m.id)}
                      >
                        {hasNote && <View style={styles.noteDot} />}
                        <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={hasNote ? colors.accent : colors.textSecondary} />
                        <Text style={[styles.noteToggleText, hasNote && styles.noteToggleActive]}>
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

          <Text style={styles.sheetLabel}>Дата и время</Text>
          <DateTimePickerField value={meetingDate} onChange={setMeetingDate} />

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

      {/* Reschedule sheet */}
      <BottomSheet
        ref={rescheduleSheetRef}
        index={-1}
        snapPoints={rescheduleSnapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Перенести встречу</Text>

          {slotsLoading && <Text style={{ color: colors.textMuted, textAlign: 'center', marginBottom: 12 }}>Пит подбирает слоты...</Text>}

          {aiSlots.length > 0 && (
            <View style={{ gap: 8, marginBottom: 14 }}>
              <Text style={styles.sheetLabel}>Варианты от Пита</Text>
              {aiSlots.map(slot => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.slotBtn, selectedSlot === slot && styles.slotBtnActive]}
                  onPress={() => { setSelectedSlot(slot); setCustomSlot(''); }}
                >
                  <Ionicons name="time-outline" size={15} color={selectedSlot === slot ? '#fff' : colors.accent} />
                  <Text style={[styles.slotBtnText, selectedSlot === slot && styles.slotBtnTextActive]}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.sheetLabel}>Или введите своё время (ГГГГ-ММ-ДД ЧЧ:ММ)</Text>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={customSlot}
            onChangeText={v => { setCustomSlot(v); setSelectedSlot(''); }}
            placeholder="2025-12-31 14:00"
            placeholderTextColor={colors.textMuted}
          />

          <View style={styles.sheetRow}>
            <TouchableOpacity style={[styles.sheetBtnSecondary, { flex: 1 }]} onPress={() => rescheduleSheetRef.current?.close()}>
              <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, { flex: 1 }, (!selectedSlot && !customSlot.trim() || rescheduleLoading) && styles.btnDisabled]}
              onPress={handleReschedule}
              disabled={!selectedSlot && !customSlot.trim() || rescheduleLoading}
            >
              <Text style={styles.sheetBtnText}>{rescheduleLoading ? 'Сохранение...' : 'Перенести'}</Text>
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
  content: { padding: 16, gap: 20, paddingBottom: 100 },
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
  upcomingActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border },
  rescheduleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, borderRightWidth: 1, borderRightColor: c.border,
    backgroundColor: c.accentLight,
  },
  rescheduleBtnText: { fontSize: 13, fontWeight: '600', color: c.accent },
  callBtn: {
    flex: 1, backgroundColor: '#0061ff', paddingVertical: 10,
    alignItems: 'center',
  },
  callBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  slotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: c.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  slotBtnActive: { backgroundColor: c.accent },
  slotBtnText: { fontSize: 14, fontWeight: '500', color: c.accent },
  slotBtnTextActive: { color: '#fff' },
  pastCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  noteToggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
  noteToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
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
  filterChip: {
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
  },
  filterChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  filterChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  filterChipTextActive: { color: '#fff' },
});
