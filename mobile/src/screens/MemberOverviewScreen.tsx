import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getMemberTeam, joinTeam, getMeetings, getNotes, createNote, updateNote, deleteNote, checkInArrive, checkInLeave, getTodayCheckin } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Avatar } from '../components/Avatar';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

export default function MemberOverviewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upcomingMeetings, setUpcomingMeetings] = useState<any[]>([]);
  const [lastMeeting, setLastMeeting] = useState<any>(null);
  const [pastMeetings, setPastMeetings] = useState<any[]>([]);

  // Meeting notes
  const [expandedMeetingNote, setExpandedMeetingNote] = useState<number | null>(null);
  const [meetingNoteDrafts, setMeetingNoteDrafts] = useState<Record<number, string>>({});
  const [savingNote, setSavingNote] = useState<Record<number, boolean>>({});

  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  // Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteLoading, setEditNoteLoading] = useState(false);

  // Check-in
  const [checkin, setCheckin] = useState<any>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);

  const findTeam = useCallback(async () => {
    try {
      const detail = await getMemberTeam(user!.id) as any;
      setTeam(detail);
    } catch {
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getMeetings({ member_id: user!.id }) as any[];
      const now = new Date();
      setUpcomingMeetings(
        (data || [])
          .filter((m: any) => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
          .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
          .slice(0, 3)
      );
      const past = (data || [])
        .filter((m: any) => new Date(m.scheduled_date) < now || m.status === 'completed')
        .sort((a: any, b: any) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
      setLastMeeting(past[0] ?? null);
      setPastMeetings(past);
    } catch {}
  }, [user]);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotes(user.id) as any[];
      setNotes(data || []);
      const drafts: Record<number, string> = {};
      for (const n of (data || [])) {
        if (n.meeting_id) drafts[n.meeting_id] = n.content;
      }
      setMeetingNoteDrafts(drafts);
    } catch {}
  }, [user]);

  useEffect(() => {
    findTeam(); loadNotes();
    if (user) getTodayCheckin(user.id).then(setCheckin).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (team) loadMeetings();
  }, [team]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLoading(true);
    await Promise.all([findTeam(), loadNotes()]);
    if (team) await loadMeetings();
    setRefreshing(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinLoading(true); setJoinError('');
    try {
      await joinTeam({ invite_code: joinCode.trim(), user_id: user!.id });
      await findTeam();
    } catch (err: any) {
      setJoinError(err?.response?.detail ?? err?.response?.data?.detail ?? 'Не удалось присоединиться. Проверьте код.');
    } finally { setJoinLoading(false); }
  };

  const handleCreateNote = async () => {
    if (!noteText.trim() || !user) return;
    setNoteLoading(true);
    try {
      const note = await createNote({ user_id: user.id, content: noteText.trim() });
      setNotes(prev => [note, ...prev]);
      setNoteText('');
      setShowNoteForm(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать заметку');
    } finally { setNoteLoading(false); }
  };

  const handleEditNote = (n: any) => { setEditingNoteId(n.id); setEditNoteText(n.content); };

  const handleSaveEditNote = async () => {
    if (!editNoteText.trim() || !editingNoteId) return;
    setEditNoteLoading(true);
    try {
      await updateNote(editingNoteId, { content: editNoteText.trim() });
      setNotes(prev => prev.map((n: any) => n.id === editingNoteId ? { ...n, content: editNoteText.trim() } : n));
      setEditingNoteId(null);
    } catch { Alert.alert('Ошибка', 'Не удалось сохранить'); }
    finally { setEditNoteLoading(false); }
  };

  const handleDeleteNote = (noteId: number) => {
    Alert.alert('Удалить заметку?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try {
            await deleteNote(noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
          } catch {}
        },
      },
    ]);
  };

  const handleSaveMeetingNote = async (meetingId: number) => {
    const content = (meetingNoteDrafts[meetingId] ?? '').trim();
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
      setExpandedMeetingNote(null);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить заметку');
    } finally {
      setSavingNote(prev => ({ ...prev, [meetingId]: false }));
    }
  };

  const handleArrive = async () => {
    if (!user) return;
    setCheckinLoading(true);
    try { const c = await checkInArrive(user.id); setCheckin(c); } catch {}
    finally { setCheckinLoading(false); }
  };

  const handleLeave = async () => {
    if (!user) return;
    setCheckinLoading(true);
    try { const c = await checkInLeave(user.id); setCheckin(c); } catch {}
    finally { setCheckinLoading(false); }
  };

  if (loading) return <Spinner />;

  if (!team) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Обзор</Text>
        </View>
        <View style={styles.joinContainer}>
          <View style={styles.joinIconWrap}><Ionicons name="link-outline" size={36} color={colors.accent} /></View>
          <Text style={styles.joinTitle}>Присоединитесь к команде</Text>
          <Text style={styles.joinDesc}>Введите код приглашения от вашего тимлида</Text>
          <View style={styles.joinForm}>
            <Text style={styles.label}>Код приглашения</Text>
            <TextInput
              style={styles.input}
              value={joinCode}
              onChangeText={v => setJoinCode(v.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
            />
            {joinError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{joinError}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.joinBtn, joinLoading && styles.btnDisabled]}
              onPress={handleJoin}
              disabled={joinLoading}
            >
              <Text style={styles.joinBtnText}>{joinLoading ? 'Присоединение...' : 'Присоединиться'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const leadMember = (team.members || []).find((m: any) => m.user_id === team.team_lead_id);
  const otherMembers = (team.members || []).filter((m: any) => m.user_id !== user?.id);
  const filteredMembers = memberSearch.trim()
    ? otherMembers.filter((m: any) => (m.user_name || '').toLowerCase().includes(memberSearch.toLowerCase()))
    : otherMembers;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{team.name}</Text>
          <Text style={styles.headerSub}>Добро пожаловать, {user?.name}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.actionBtn, showSearch && styles.actionBtnActive]}
            onPress={() => { setShowSearch(s => !s); setMemberSearch(''); }}
          >
            <Ionicons name="search-outline" size={18} color={showSearch ? colors.accent : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, showNoteForm && styles.actionBtnActive]}
            onPress={() => setShowNoteForm(s => !s)}
          >
            <Ionicons name="create-outline" size={18} color={showNoteForm ? colors.accent : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Team lead card */}
        {team.team_lead_id && (
          <View style={styles.leadCard}>
            <Avatar name={leadMember?.user_name || team.team_lead_name} imageUrl={leadMember?.user_avatar_url} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.leadLabel}>Тимлид</Text>
              <Text style={styles.leadName}>{team.team_lead_name || 'Тимлид'}</Text>
              {team.team_lead_title ? <Text style={styles.leadTitle}>{team.team_lead_title}</Text> : null}
            </View>
          </View>
        )}

        {/* Check-in */}
        <View style={styles.checkinCard}>
          <View style={styles.checkinLeft}>
            <View style={[styles.checkinDot, checkin?.arrived_at && !checkin?.left_at ? styles.checkinDotActive : checkin?.left_at ? styles.checkinDotLeft : {}]} />
            <View>
              <Text style={styles.checkinTitle}>
                {checkin?.arrived_at && !checkin?.left_at
                  ? 'Вы на рабочем месте'
                  : checkin?.left_at
                  ? 'Рабочий день завершён'
                  : 'Не отмечено сегодня'}
              </Text>
              {checkin?.arrived_at && (
                <Text style={styles.checkinTime}>
                  Пришёл: {new Date(checkin.arrived_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  {checkin.left_at ? `  ·  Ушёл: ${new Date(checkin.left_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.checkinActions}>
            {(!checkin?.arrived_at || checkin?.left_at) && (
              <TouchableOpacity
                style={[styles.checkinBtn, styles.checkinBtnArrive, checkinLoading && styles.btnDisabled]}
                onPress={handleArrive} disabled={checkinLoading}
              >
                <Ionicons name="log-in-outline" size={14} color="#fff" />
                <Text style={styles.checkinBtnText}>Пришёл</Text>
              </TouchableOpacity>
            )}
            {checkin?.arrived_at && !checkin?.left_at && (
              <TouchableOpacity
                style={[styles.checkinBtn, styles.checkinBtnLeave, checkinLoading && styles.btnDisabled]}
                onPress={handleLeave} disabled={checkinLoading}
              >
                <Ionicons name="log-out-outline" size={14} color="#fff" />
                <Text style={styles.checkinBtnText}>Ушёл</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Upcoming meetings */}
        {upcomingMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ближайшие встречи</Text>
            {upcomingMeetings.map(m => (
              <MeetingItem key={m.id} meeting={m} />
            ))}
          </View>
        )}

        {/* Last meeting with lead */}
        {lastMeeting && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Последняя встреча с тимлидом</Text>
            <View style={styles.lastMeetingCard}>
              <View style={styles.lastMeetingDate}>
                <Text style={styles.lastMeetingDay}>
                  {new Date(lastMeeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                </Text>
                <Text style={styles.lastMeetingTime}>
                  {new Date(lastMeeting.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lastMeetingLabel}>
                  {new Date(lastMeeting.scheduled_date).toLocaleDateString('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' })}
                </Text>
                {lastMeeting.topic ? (
                  <Text style={styles.lastMeetingTopic} numberOfLines={1}>{lastMeeting.topic}</Text>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {/* Meeting notes */}
        {pastMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Заметки по встречам</Text>
            {pastMeetings.slice(0, 8).map((m: any) => {
              const hasNote = notes.some((n: any) => n.meeting_id === m.id);
              const isOpen = expandedMeetingNote === m.id;
              const draft = meetingNoteDrafts[m.id] ?? '';
              const saving = savingNote[m.id] ?? false;
              return (
                <View key={m.id} style={styles.meetingNoteCard}>
                  <TouchableOpacity
                    style={styles.meetingNoteHeader}
                    onPress={() => setExpandedMeetingNote(isOpen ? null : m.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.meetingNoteDateBox}>
                      <Text style={styles.meetingNoteDateDay}>
                        {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.meetingNoteTitle} numberOfLines={1}>
                        {new Date(m.scheduled_date).toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'long' })}
                      </Text>
                      {m.topic ? <Text style={styles.meetingNoteSub} numberOfLines={1}>{m.topic}</Text> : null}
                    </View>
                    <Text style={styles.meetingNoteToggle}>
                      {hasNote ? '● ' : ''}{isOpen ? '▾' : '▸'}
                    </Text>
                  </TouchableOpacity>
                  {isOpen && (
                    <View style={styles.meetingNoteEditor}>
                      <TextInput
                        style={styles.meetingNoteInput}
                        value={draft}
                        onChangeText={v => setMeetingNoteDrafts(prev => ({ ...prev, [m.id]: v }))}
                        placeholder="Добавьте заметку по встрече..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        autoFocus
                      />
                      <View style={styles.noteFormRow}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setExpandedMeetingNote(null)}>
                          <Text style={styles.cancelBtnText}>Закрыть</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.saveBtn, (!draft.trim() || saving) && styles.btnDisabled]}
                          onPress={() => handleSaveMeetingNote(m.id)}
                          disabled={!draft.trim() || saving}
                        >
                          <Text style={styles.saveBtnText}>{saving ? '...' : 'Сохранить'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Notes section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Общие заметки</Text>
            <TouchableOpacity onPress={() => setShowNoteForm(s => !s)}>
              <Text style={styles.addLink}>{showNoteForm ? 'Закрыть' : '+ Добавить'}</Text>
            </TouchableOpacity>
          </View>

          {showNoteForm && (
            <View style={styles.noteForm}>
              <TextInput
                style={styles.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Введите заметку..."
                placeholderTextColor={colors.textMuted}
                multiline
                autoFocus
              />
              <View style={styles.noteFormRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowNoteForm(false); setNoteText(''); }}>
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!noteText.trim() || noteLoading) && styles.btnDisabled]}
                  onPress={handleCreateNote}
                  disabled={!noteText.trim() || noteLoading}
                >
                  <Text style={styles.saveBtnText}>{noteLoading ? '...' : 'Сохранить'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {notes.filter((n: any) => !n.meeting_id).length === 0 && !showNoteForm ? (
            <View style={styles.notesEmpty}>
              <Text style={styles.notesEmptyText}>Заметок нет. Нажмите «+ Добавить»</Text>
            </View>
          ) : (
            notes.filter((n: any) => !n.meeting_id).slice(0, 5).map((n: any) => (
              editingNoteId === n.id ? (
                <View key={n.id} style={styles.noteForm}>
                  <TextInput
                    style={styles.noteInput}
                    value={editNoteText}
                    onChangeText={setEditNoteText}
                    multiline autoFocus
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={styles.noteFormRow}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingNoteId(null)}>
                      <Text style={styles.cancelBtnText}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, (!editNoteText.trim() || editNoteLoading) && styles.btnDisabled]}
                      onPress={handleSaveEditNote} disabled={!editNoteText.trim() || editNoteLoading}
                    >
                      <Text style={styles.saveBtnText}>{editNoteLoading ? '...' : 'Сохранить'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  key={n.id} style={styles.noteCard}
                  onPress={() => handleEditNote(n)}
                  onLongPress={() => handleDeleteNote(n.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.noteContent} numberOfLines={2}>{n.content}</Text>
                  <Text style={styles.noteDate}>
                    {new Date(n.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </Text>
                </TouchableOpacity>
              )
            ))
          )}
        </View>

        {/* Team members with search */}
        {otherMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Участники команды</Text>
            {showSearch && (
              <TextInput
                style={styles.searchInput}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Поиск по имени..."
                placeholderTextColor={colors.textMuted}
                autoFocus={showSearch}
              />
            )}
            <View style={styles.membersGrid}>
              {filteredMembers.length === 0 ? (
                <Text style={styles.noResults}>Участники не найдены</Text>
              ) : (
                filteredMembers.map((m: any) => (
                  <View key={m.user_id} style={styles.memberChip}>
                    <Avatar name={m.user_name} imageUrl={m.user_avatar_url} size={32} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.memberName} numberOfLines={1}>{m.user_name}</Text>
                      <Text style={styles.memberRole} numberOfLines={1}>{m.role}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {upcomingMeetings.length === 0 && otherMembers.length === 0 && notes.length === 0 && (
          <EmptyState icon="people-outline" title="Команда пуста" description="Ждём когда тимлид добавит участников" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38, height: 38, borderRadius: 11,
    borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
  },
  actionBtnActive: { backgroundColor: c.accentLight, borderColor: c.accent },
  actionBtnText: { fontSize: 16 },

  content: { padding: 16, gap: 20, paddingBottom: 32 },

  leadCard: {
    backgroundColor: c.blue50, borderRadius: 14,
    borderWidth: 1, borderColor: c.blue200,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  leadLabel: { fontSize: 10, fontWeight: '700', color: c.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  leadName: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
  leadTitle: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  addLink: { fontSize: 13, fontWeight: '600', color: c.accent },
  meetingNoteCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
  },
  meetingNoteHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
  },
  meetingNoteDateBox: {
    width: 38, height: 38, borderRadius: 8, backgroundColor: c.blue50,
    borderWidth: 1, borderColor: c.blue200, alignItems: 'center', justifyContent: 'center',
  },
  meetingNoteDateDay: { fontSize: 10, fontWeight: '700', color: c.accent, textAlign: 'center' },
  meetingNoteTitle: { fontSize: 13, fontWeight: '500', color: c.textPrimary },
  meetingNoteSub: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
  meetingNoteToggle: { fontSize: 13, color: c.textMuted, flexShrink: 0 },
  meetingNoteEditor: {
    borderTopWidth: 1, borderTopColor: c.border,
    padding: 12, gap: 10,
  },
  meetingNoteInput: {
    fontSize: 14, color: c.textPrimary, minHeight: 70,
    textAlignVertical: 'top', borderWidth: 1, borderColor: c.border,
    borderRadius: 8, padding: 10, backgroundColor: c.bg,
  },
  lastMeetingCard: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
    borderColor: '#bbf7d0', padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  lastMeetingDate: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#f0fdf4',
    borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center',
  },
  lastMeetingDay: { fontSize: 11, fontWeight: '700', color: '#16a34a', lineHeight: 14 },
  lastMeetingTime: { fontSize: 10, color: '#86efac' },
  lastMeetingLabel: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  lastMeetingTopic: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  // Note form
  noteForm: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12,
  },
  noteInput: {
    fontSize: 15, color: c.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
    marginBottom: 10,
  },
  noteFormRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: c.border,
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    backgroundColor: c.surface2,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
  saveBtn: {
    flex: 1, backgroundColor: c.accent,
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },

  // Note cards
  notesEmpty: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
    padding: 16, alignItems: 'center',
  },
  notesEmptyText: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
  noteCard: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
    padding: 12, flexDirection: 'row',
    alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  noteContent: { flex: 1, fontSize: 14, color: c.textPrimary, lineHeight: 20 },
  noteDate: { fontSize: 11, color: c.textMuted, flexShrink: 0, marginTop: 2 },

  // Members
  searchInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: c.textPrimary, backgroundColor: c.surface,
  },
  membersGrid: { gap: 8 },
  memberChip: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  memberName: { fontSize: 13, fontWeight: '500', color: c.textPrimary },
  memberRole: { fontSize: 11, color: c.textMuted },
  noResults: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 12 },

  // Join form
  joinContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  joinIconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  joinTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginBottom: 6 },
  joinDesc: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginBottom: 24 },
  joinForm: {
    width: '100%', maxWidth: 360,
    backgroundColor: c.surface, borderRadius: 16,
    borderWidth: 1, borderColor: c.border, padding: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary,
    backgroundColor: c.surface, marginBottom: 14,
  },
  errorBox: {
    backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorText: { fontSize: 14, color: c.danger },
  joinBtn: {
    backgroundColor: c.accent, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  joinBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  checkinCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.surface, borderRadius: 14,
    borderWidth: 1, borderColor: c.border, padding: 14, gap: 12,
  },
  checkinLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  checkinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.border, flexShrink: 0 },
  checkinDotActive: { backgroundColor: '#22c55e' },
  checkinDotLeft: { backgroundColor: c.textMuted },
  checkinTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  checkinTime: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  checkinActions: { flexDirection: 'row', gap: 8 },
  checkinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  checkinBtnArrive: { backgroundColor: '#22c55e' },
  checkinBtnLeave: { backgroundColor: c.textMuted },
  checkinBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
