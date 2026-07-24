import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert, Linking, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getMeetings, getUsers, confirmMeeting, declineMeeting, getNotes, createNote, updateNote, startCall, getTeams, getTeam, createMeeting, createGroupMeeting, getTasks } from '../lib/api';
import { useTheme } from '../context/theme';
import { useRouter } from 'expo-router';
import type { AppColors } from '../constants/colors';
import { getCoaching, buildAgendaSuggestions } from '../lib/coaching';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { WeekCalendar } from '../components/WeekCalendar';
import { DateTimePickerField } from '../components/DateTimePickerField';
import { MeetingProposalsModal } from '../components/MeetingProposalsModal';
import { TaskProposalsModal } from '../components/TaskProposalsModal';
import { InteractionsModal } from '../components/InteractionsModal';
import { SpontaneousCallModal } from '../components/SpontaneousCallModal';

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

  // Create-meeting flow (pick participant + date)
  const [showCreate, setShowCreate] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ user_id: number; user_name: string; team_id: number }[]>([]);
  const [createMemberId, setCreateMemberId] = useState<number | null>(null);
  const [createDate, setCreateDate] = useState('');
  const [createTopic, setCreateTopic] = useState('');
  const [creating, setCreating] = useState(false);
  // Групповой созвон: несколько участников / вся команда.
  const [groupMode, setGroupMode] = useState(false);
  const [wholeTeam, setWholeTeam] = useState(false);
  const [groupSelected, setGroupSelected] = useState<number[]>([]);

  // Коучинг «до встречи»: подсказки тем повестки у поля темы. Опционально.
  const [coachOn, setCoachOn] = useState(false);
  const [coachHidden, setCoachHidden] = useState(false);
  useEffect(() => { getCoaching().then(setCoachOn); }, []);

  const [showProposals, setShowProposals] = useState(false);

  const ensureMembers = async () => {
    if (teamMembers.length > 0) return;
    try {
      const all = await getTeams() as any[];
      const mine = (all || []).filter((t: any) => t.team_lead_id === user!.id);
      const details = await Promise.all(mine.map((t: any) => getTeam(t.id)));
      const members: { user_id: number; user_name: string; team_id: number }[] = [];
      for (const t of details as any[]) {
        for (const m of (t.members || [])) {
          if (m.user_id !== user!.id) members.push({ user_id: m.user_id, user_name: m.user_name, team_id: t.id });
        }
      }
      setTeamMembers(members);
    } catch {}
  };

  const openCreate = async () => {
    setShowCreate(true);
    await ensureMembers();
  };

  const openProposals = async () => {
    await ensureMembers();
    setShowProposals(true);
  };

  const [showTaskProposals, setShowTaskProposals] = useState(false);
  const openTaskProposals = async () => {
    await ensureMembers();
    setShowTaskProposals(true);
  };

  const [showInteractions, setShowInteractions] = useState(false);
  const [interactionTasks, setInteractionTasks] = useState<{ id: number; title: string }[]>([]);
  const [showQuickCall, setShowQuickCall] = useState(false);
  const openQuickCall = async () => { await ensureMembers(); setShowQuickCall(true); };
  const openInteractions = async () => {
    await ensureMembers();
    try { const t = await getTasks({ assigned_by: user!.id }) as any[]; setInteractionTasks((t || []).map((x: any) => ({ id: x.id, title: x.title }))); } catch {}
    setShowInteractions(true);
  };

  // Подсказки повестки для выбранного участника. Данные берём из уже
  // загруженных встреч: дату последней завершённой встречи с этим участником.
  const agendaSuggestions = useMemo(() => {
    if (!coachOn || coachHidden || !createMemberId) return [];
    const mine = (meetings || []).filter((m: any) => m.member_id === createMemberId);
    const past = mine
      .filter((m: any) => m.status === 'completed' && (m.scheduled_date || m.scheduled_at))
      .map((m: any) => new Date(m.scheduled_date || m.scheduled_at).getTime())
      .filter((t: number) => !isNaN(t));
    const lastMeetingDate = past.length ? new Date(Math.max(...past)).toISOString() : null;
    return buildAgendaSuggestions({ last_meeting_date: lastMeetingDate }, []);
  }, [coachOn, coachHidden, createMemberId, meetings]);

  const addAgendaLine = (line: string) =>
    setCreateTopic(prev => (prev.trim() ? `${prev.trim()}\n- ${line}` : `- ${line}`));

  const resetCreate = () => {
    setShowCreate(false);
    setCreateMemberId(null); setCreateDate(''); setCreateTopic('');
    setGroupMode(false); setWholeTeam(false); setGroupSelected([]);
  };

  const handleCreateMeeting = async () => {
    if (!createDate) { Alert.alert('Заполните поля', 'Выберите дату'); return; }
    setCreating(true);
    try {
      if (groupMode) {
        // Групповая встреча: несколько участников или вся команда.
        const teamId = teamMembers[0]?.team_id;
        if (!teamId) { Alert.alert('Ошибка', 'Нет команды'); setCreating(false); return; }
        if (!wholeTeam && groupSelected.length === 0) {
          Alert.alert('Выберите участников', 'Отметьте участников или «Вся команда»'); setCreating(false); return;
        }
        await createGroupMeeting({
          team_id: teamId,
          team_lead_id: user!.id,
          scheduled_date: createDate,
          agenda: createTopic.trim() || null,
          member_ids: wholeTeam ? null : groupSelected,
          whole_team: wholeTeam,
        });
      } else {
        const member = teamMembers.find(m => m.user_id === createMemberId);
        if (!member) { Alert.alert('Заполните поля', 'Выберите участника'); setCreating(false); return; }
        await createMeeting({
          team_id: member.team_id,
          team_lead_id: user!.id,
          member_id: member.user_id,
          scheduled_date: createDate,
          agenda: createTopic.trim() || undefined,
        });
      }
      resetCreate();
      await load();
    } catch { Alert.alert('Ошибка', 'Не удалось создать встречу'); }
    finally { setCreating(false); }
  };

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={openQuickCall}>
            <Ionicons name="videocam-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={openInteractions}>
            <Ionicons name="people-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={openProposals}>
            <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={openTaskProposals}>
            <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Взаимодействия (блок 39) */}
      <InteractionsModal
        visible={showInteractions}
        onClose={() => setShowInteractions(false)}
        currentUser={{ id: user!.id }}
        contacts={teamMembers.map(m => ({ user_id: m.user_id, name: m.user_name }))}
        tasks={interactionTasks}
        teamId={teamMembers[0]?.team_id ?? null}
        onChanged={load}
      />

      {/* Спонтанный созвон (39.8): всем / нескольким / индивидуально */}
      <SpontaneousCallModal
        visible={showQuickCall}
        onClose={() => setShowQuickCall(false)}
        leadId={user!.id}
        teamId={teamMembers[0]?.team_id ?? null}
        members={teamMembers.map(m => ({ user_id: m.user_id, name: m.user_name }))}
        onStarted={load}
      />

      {/* Предложения встреч (Задача 5) */}
      <MeetingProposalsModal
        visible={showProposals}
        onClose={() => setShowProposals(false)}
        currentUser={{ id: user!.id }}
        contacts={teamMembers.map(m => ({ user_id: m.user_id, name: m.user_name }))}
        teamId={teamMembers[0]?.team_id ?? null}
        onChanged={load}
      />

      {/* Предложения задач */}
      <TaskProposalsModal
        visible={showTaskProposals}
        onClose={() => setShowTaskProposals(false)}
        currentUser={{ id: user!.id }}
        contacts={teamMembers.map(m => ({ user_id: m.user_id, name: m.user_name }))}
        teamId={teamMembers[0]?.team_id ?? null}
        onChanged={load}
      />

      {/* Create meeting modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Новая встреча</Text>

            {/* Формат: 1-на-1 или групповая (Задача 4) */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.memberPick, { flex: 1, justifyContent: 'center' }, !groupMode && styles.memberPickActive]}
                onPress={() => setGroupMode(false)}
              >
                <Text style={[styles.memberPickName, { flex: 0 }]}>1-на-1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.memberPick, { flex: 1, justifyContent: 'center' }, groupMode && styles.memberPickActive]}
                onPress={() => setGroupMode(true)}
              >
                <Text style={[styles.memberPickName, { flex: 0 }]}>Групповая</Text>
              </TouchableOpacity>
            </View>

            {groupMode && (
              <TouchableOpacity
                style={[styles.memberPick, wholeTeam && styles.memberPickActive]}
                onPress={() => setWholeTeam(w => !w)}
              >
                <Ionicons name={wholeTeam ? 'checkbox' : 'square-outline'} size={20} color={wholeTeam ? colors.accent : colors.textMuted} />
                <Text style={styles.memberPickName}>Вся команда</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.modalLabel}>{groupMode ? 'Участники' : 'Участник'}</Text>
            {teamMembers.length === 0 ? (
              <Text style={styles.modalHint}>Нет участников в командах</Text>
            ) : (
              <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                {teamMembers.map(m => {
                  const selected = groupMode ? groupSelected.includes(m.user_id) : createMemberId === m.user_id;
                  return (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[styles.memberPick, selected && styles.memberPickActive, groupMode && wholeTeam && { opacity: 0.4 }]}
                      disabled={groupMode && wholeTeam}
                      onPress={() => {
                        if (groupMode) {
                          setGroupSelected(prev => prev.includes(m.user_id) ? prev.filter(x => x !== m.user_id) : [...prev, m.user_id]);
                        } else {
                          setCreateMemberId(m.user_id);
                        }
                      }}
                    >
                      <View style={styles.memberPickAvatar}>
                        <Text style={styles.memberPickAvatarText}>{(m.user_name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.memberPickName}>{m.user_name}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Text style={styles.modalLabel}>Дата и время</Text>
            <DateTimePickerField value={createDate} onChange={setCreateDate} />

            <Text style={styles.modalLabel}>Тема (необязательно)</Text>
            <TextInput
              style={styles.modalInput}
              value={createTopic}
              onChangeText={setCreateTopic}
              placeholder="О чём встреча"
              placeholderTextColor={colors.textMuted}
            />

            {agendaSuggestions.length > 0 && (
              <View style={styles.coachBox}>
                <View style={styles.coachBoxHead}>
                  <Text style={styles.coachBoxTitle}>Пит подсказывает темы</Text>
                  <TouchableOpacity onPress={() => setCoachHidden(true)} hitSlop={8}>
                    <Text style={styles.coachBoxHide}>Скрыть</Text>
                  </TouchableOpacity>
                </View>
                {agendaSuggestions.map(s => (
                  <View key={s.id} style={styles.coachRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachLine}>{s.line}</Text>
                      <Text style={styles.coachReason}>{s.reason}</Text>
                    </View>
                    <TouchableOpacity style={styles.coachAdd} onPress={() => addAgendaLine(s.line)}>
                      <Text style={styles.coachAddText}>Добавить</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={resetCreate}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              {(() => {
                const invalid = !createDate || creating || (groupMode
                  ? (!wholeTeam && groupSelected.length === 0)
                  : !createMemberId);
                return (
                  <TouchableOpacity
                    style={[styles.modalCreate, invalid && styles.btnDisabled]}
                    onPress={handleCreateMeeting}
                    disabled={invalid}
                  >
                    <Text style={styles.modalCreateText}>{creating ? 'Создание...' : 'Создать встречу'}</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  createBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalSheet: { width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 18, gap: 6 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginTop: 8 },
  modalHint: { fontSize: 13, color: c.textMuted, paddingVertical: 8 },
  memberPick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10 },
  memberPickActive: { backgroundColor: c.accentLight },
  memberPickAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center' },
  memberPickAvatarText: { fontSize: 14, fontWeight: '700', color: c.accent },
  memberPickName: { flex: 1, fontSize: 14, fontWeight: '500', color: c.textPrimary },
  coachBox: { marginTop: 12, padding: 12, backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.accent, borderRadius: 10, gap: 8 },
  coachBoxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coachBoxTitle: { fontSize: 12, fontWeight: '700', color: c.accent, letterSpacing: 0.2 },
  coachBoxHide: { fontSize: 12, color: c.textMuted },
  coachRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  coachLine: { fontSize: 13, color: c.textPrimary, lineHeight: 18 },
  coachReason: { fontSize: 11, color: c.textMuted, marginTop: 2, lineHeight: 15 },
  coachAdd: { flexShrink: 0, backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  coachAddText: { fontSize: 12, fontWeight: '600', color: c.accent },
  modalInput: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  modalCreate: { flex: 2, backgroundColor: c.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCreateText: { fontSize: 14, fontWeight: '700', color: '#fff' },
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
