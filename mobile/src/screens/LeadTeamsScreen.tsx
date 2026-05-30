import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import {
  getTeams, getTeam, createTeam,
  addMember, createMeeting, getTasks, createTask, getUserByEmail,
  regenerateInviteCode, getNotes, createNote, updateNote, deleteNote,
} from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';


const STATUS_BADGE_LABEL: Record<string, string> = {
  green: 'В порядке',
  yellow: 'Скоро',
  red: 'Нет встречи',
};

const STATUS_BADGE_VARIANT: Record<string, 'green' | 'amber' | 'red'> = {
  green: 'green',
  yellow: 'amber',
  red: 'red',
};

type SheetType = 'createTeam' | 'addMember' | 'scheduleMeeting' | 'addTask' | null;

export default function LeadTeamsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const STATUS_BORDER: Record<string, string> = {
    green: colors.statusGreenBorder,
    yellow: colors.statusYellowBorder,
    red: colors.statusRedBorder,
  };
  const { user } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamDetail, setTeamDetail] = useState<any>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [memberTasks, setMemberTasks] = useState<Record<number, any[]>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteLoading, setEditNoteLoading] = useState(false);

  const [sheetType, setSheetType] = useState<SheetType>(null);
  const [scheduleMember, setScheduleMember] = useState<any>(null);
  const [taskMember, setTaskMember] = useState<any>(null);

  // Form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['50%', '85%'], []);

  const openSheet = (type: SheetType) => {
    setSheetType(type);
    bottomSheetRef.current?.expand();
  };

  const closeSheet = () => {
    bottomSheetRef.current?.close();
    setSheetType(null);
  };

  const loadTeams = useCallback(async () => {
    try {
      const data = await getTeams() as any[];
      const mine = data.filter((t: any) => t.team_lead_id === user!.id);
      setTeams(mine);
      if (mine.length > 0 && !selectedTeamId) setSelectedTeamId(mine[0].id);
    } catch { setTeams([]); }
  }, [user, selectedTeamId]);

  const loadTeamDetail = useCallback(async (id: number) => {
    setLoadingTeam(true);
    try {
      const data = await getTeam(id) as any;
      const sorted = [...(data.members || [])].sort((a: any, b: any) => {
        if (!a.last_meeting_date && !b.last_meeting_date) return 0;
        if (!a.last_meeting_date) return -1;
        if (!b.last_meeting_date) return 1;
        return new Date(a.last_meeting_date).getTime() - new Date(b.last_meeting_date).getTime();
      });
      setTeamDetail({ ...data, members: sorted });
    } catch { setTeamDetail(null); }
    finally { setLoadingTeam(false); }
  }, []);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    try { setNotes((await getNotes(user.id)) || []); } catch {}
  }, [user]);

  const handleCreateNote = async () => {
    if (!noteText.trim() || !user) return;
    setNoteLoading(true);
    try {
      const note = await createNote({ user_id: user.id, content: noteText.trim() });
      setNotes(prev => [note, ...prev]);
      setNoteText(''); setShowNoteForm(false);
    } catch { Alert.alert('Ошибка', 'Не удалось создать заметку'); }
    finally { setNoteLoading(false); }
  };

  const handleDeleteNote = (id: number) => {
    Alert.alert('Удалить заметку?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        try { await deleteNote(id); setNotes(prev => prev.filter(n => n.id !== id)); } catch {}
      }},
    ]);
  };

  const handleEditNote = (n: any) => {
    setEditingNoteId(n.id);
    setEditNoteText(n.content);
  };

  const handleSaveEditNote = async () => {
    if (!editNoteText.trim() || !editingNoteId) return;
    setEditNoteLoading(true);
    try {
      await updateNote(editingNoteId, { content: editNoteText.trim() });
      setNotes(prev => prev.map(n => n.id === editingNoteId ? { ...n, content: editNoteText.trim() } : n));
      setEditingNoteId(null);
    } catch { Alert.alert('Ошибка', 'Не удалось сохранить'); }
    finally { setEditNoteLoading(false); }
  };

  useEffect(() => { loadTeams(); loadNotes(); }, [user?.id]);
  useEffect(() => { if (selectedTeamId) loadTeamDetail(selectedTeamId); }, [selectedTeamId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTeams(), loadNotes()]);
    if (selectedTeamId) await loadTeamDetail(selectedTeamId);
    setRefreshing(false);
  };

  const handleCopyInvite = async () => {
    if (!teamDetail?.invite_code) return;
    await Clipboard.setStringAsync(teamDetail.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateCode = async () => {
    if (!selectedTeamId) return;
    setRegenerating(true);
    try {
      const result = await regenerateInviteCode(selectedTeamId) as any;
      setTeamDetail((prev: any) => ({ ...prev, invite_code: result.invite_code }));
    } catch {} finally { setRegenerating(false); }
  };

  const loadMemberTasks = async (memberId: number) => {
    try {
      const data = await getTasks({ assigned_to: memberId, team_id: selectedTeamId! }) as any[];
      setMemberTasks(prev => ({ ...prev, [memberId]: data || [] }));
    } catch {
      setMemberTasks(prev => ({ ...prev, [memberId]: [] }));
    }
  };

  const toggleTasks = (memberId: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) { next.delete(memberId); }
      else {
        next.add(memberId);
        if (memberTasks[memberId] === undefined) loadMemberTasks(memberId);
      }
      return next;
    });
  };


  // Form handlers
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setFormLoading(true);
    try {
      const t = await createTeam({ name: newTeamName.trim(), team_lead_id: user!.id }) as any;
      setNewTeamName('');
      closeSheet();
      await loadTeams();
      setSelectedTeamId(t.id);
    } catch {} finally { setFormLoading(false); }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) return;
    setFormLoading(true);
    setAddMemberError('');
    try {
      const found = await getUserByEmail(newMemberEmail.trim()) as any;
      await addMember(selectedTeamId!, found.id, 'member');
      setNewMemberEmail('');
      closeSheet();
      await loadTeamDetail(selectedTeamId!);
    } catch (err: any) {
      const detail = err?.response?.detail ?? err?.response?.data?.detail ?? 'Пользователь не найден или уже в команде';
      setAddMemberError(detail);
    } finally { setFormLoading(false); }
  };

  const handleScheduleMeeting = async () => {
    if (!scheduleDate || !scheduleMember) return;
    setFormLoading(true);
    try {
      await createMeeting({
        team_id: selectedTeamId,
        team_lead_id: user!.id,
        member_id: scheduleMember.user_id,
        scheduled_date: scheduleDate,
        status: 'scheduled',
      });
      setScheduleDate('');
      closeSheet();
      await loadTeamDetail(selectedTeamId!);
    } catch {} finally { setFormLoading(false); }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !taskMember) return;
    setFormLoading(true);
    try {
      const task = await createTask({
        title: newTaskTitle.trim(),
        due_date: newTaskDue || null,
        team_id: selectedTeamId,
        assigned_to: taskMember.user_id,
        assigned_by: user!.id,
        meeting_id: null,
      }) as any;
      setMemberTasks(prev => ({
        ...prev,
        [taskMember.user_id]: [...(prev[taskMember.user_id] || []), task],
      }));
      setNewTaskTitle(''); setNewTaskDue('');
      closeSheet();
    } catch {} finally { setFormLoading(false); }
  };

  const allMembers = (teamDetail?.members || []).filter((m: any) => m.user_id !== user?.id);
  const members = memberSearch.trim()
    ? allMembers.filter((m: any) => (m.user_name || '').toLowerCase().includes(memberSearch.toLowerCase()))
    : allMembers;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Мои команды</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => openSheet('createTeam')}>
          <Text style={styles.addBtnText}>+ Создать</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Notes section */}
        <View style={styles.notesSection}>
          <View style={styles.notesSectionHeader}>
            <Text style={styles.notesSectionTitle}>Мои заметки</Text>
            <TouchableOpacity onPress={() => setShowNoteForm(s => !s)}>
              <Text style={styles.notesAddLink}>{showNoteForm ? 'Закрыть' : '+ Добавить'}</Text>
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.noteCancelBtn} onPress={() => { setShowNoteForm(false); setNoteText(''); }}>
                  <Text style={styles.noteCancelText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.noteSaveBtn, (!noteText.trim() || noteLoading) && { opacity: 0.5 }]}
                  onPress={handleCreateNote} disabled={!noteText.trim() || noteLoading}
                >
                  <Text style={styles.noteSaveText}>{noteLoading ? '...' : 'Сохранить'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {notes.length === 0 && !showNoteForm ? (
            <Text style={styles.notesEmpty}>Нет заметок. Нажмите «+ Добавить»</Text>
          ) : (
            notes.filter((n: any) => !n.meeting_id).slice(0, 5).map(n => (
              editingNoteId === n.id ? (
                <View key={n.id} style={styles.noteForm}>
                  <TextInput
                    style={styles.noteInput}
                    value={editNoteText}
                    onChangeText={setEditNoteText}
                    multiline autoFocus
                    placeholderTextColor={colors.textMuted}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.noteCancelBtn} onPress={() => setEditingNoteId(null)}>
                      <Text style={styles.noteCancelText}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.noteSaveBtn, (!editNoteText.trim() || editNoteLoading) && { opacity: 0.5 }]}
                      onPress={handleSaveEditNote} disabled={!editNoteText.trim() || editNoteLoading}
                    >
                      <Text style={styles.noteSaveText}>{editNoteLoading ? '...' : 'Сохранить'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity key={n.id} style={styles.noteCard}
                  onPress={() => handleEditNote(n)}
                  onLongPress={() => handleDeleteNote(n.id)} activeOpacity={0.8}
                >
                  <Text style={styles.noteContent} numberOfLines={2}>{n.content}</Text>
                  <Text style={styles.noteDate}>{new Date(n.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</Text>
                </TouchableOpacity>
              )
            ))
          )}
        </View>

        {/* Team tabs */}
        {teams.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamTabs}>
            {teams.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.teamTab, selectedTeamId === t.id && styles.teamTabActive]}
                onPress={() => setSelectedTeamId(t.id)}
              >
                <Text style={[styles.teamTabText, selectedTeamId === t.id && styles.teamTabTextActive]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Empty state */}
        {teams.length === 0 && (
          <EmptyState icon="people-outline" title="Нет команд" description="Создайте первую команду, чтобы начать" />
        )}

        {/* Team detail */}
        {selectedTeamId && !loadingTeam && teamDetail && (
          <View style={{ gap: 12 }}>
            {/* Invite banner */}
            <TouchableOpacity style={styles.inviteBanner} onPress={handleCopyInvite}>
              <View style={styles.inviteIcon}>
                <Ionicons name="link-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteLabel}>Код приглашения</Text>
                <Text style={styles.inviteCode}>{teamDetail.invite_code}</Text>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInvite}>
                  <Text style={styles.copyBtnText}>{copied ? '✓ Скопировано' : 'Скопировать'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addMemberBtn} onPress={() => openSheet('addMember')}>
                  <Text style={styles.addMemberBtnText}>+ Участника</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.newCodeBtn, regenerating && styles.btnDisabled]}
                  onPress={handleRegenerateCode}
                  disabled={regenerating}
                >
                  <Text style={styles.newCodeBtnText}>{regenerating ? '...' : '🔄 Новый код'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Members search — always visible when team is selected */}
            <TextInput
              style={styles.memberSearchInput}
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Поиск участников..."
              placeholderTextColor={colors.textMuted}
            />

            {/* Members */}
            {allMembers.length === 0 ? (
              <EmptyState
                icon="person-outline"
                title="Нет участников"
                description="Добавьте первого участника в команду"
              >
                <TouchableOpacity style={[styles.addBtn, { marginTop: 16 }]} onPress={() => openSheet('addMember')}>
                  <Text style={styles.addBtnText}>+ Добавить участника</Text>
                </TouchableOpacity>
              </EmptyState>
            ) : members.length === 0 ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Участники не найдены</Text>
              </View>
            ) : (
              members.map((member: any) => {
                const tasksExpanded = expandedTasks.has(member.user_id);
                const tasks = memberTasks[member.user_id];
                const borderColor = member.status_color ? STATUS_BORDER[member.status_color] : colors.border;

                return (
                  <View
                    key={member.user_id}
                    style={[styles.memberCard, { borderColor, borderWidth: member.status_color ? 2 : 1 }]}
                  >
                    {/* Member header */}
                    <View style={styles.memberHeader}>
                      <Avatar name={member.user_name} imageUrl={member.user_avatar_url} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName} numberOfLines={1}>{member.user_name}</Text>
                        <Text style={styles.memberRole} numberOfLines={1}>{member.role}</Text>
                      </View>
                      {member.status_color && (
                        <StatusBadge
                          label={STATUS_BADGE_LABEL[member.status_color] ?? '—'}
                          variant={STATUS_BADGE_VARIANT[member.status_color] ?? 'gray'}
                        />
                      )}
                    </View>

                    <Text style={styles.lastMeeting}>
                      Последняя встреча:{' '}
                      <Text style={{ fontWeight: '500', color: colors.textPrimary }}>
                        {member.last_meeting_date
                          ? new Date(member.last_meeting_date).toLocaleDateString('ru-RU')
                          : 'Не было'}
                      </Text>
                    </Text>

                    <TouchableOpacity
                      style={styles.scheduleBtn}
                      onPress={() => { setScheduleMember(member); openSheet('scheduleMeeting'); }}
                    >
                      <Text style={styles.scheduleBtnText}>Запланировать встречу</Text>
                    </TouchableOpacity>

                    {/* Tasks */}
                    <TouchableOpacity
                      style={styles.tasksToggle}
                      onPress={() => toggleTasks(member.user_id)}
                    >
                      <Ionicons name={tasksExpanded ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textSecondary} />
                      <Text style={styles.tasksToggleText}>
                        {' '}Задачи
                        {tasks !== undefined && (
                          <Text style={{ color: colors.textMuted }}> ({tasks.length})</Text>
                        )}
                      </Text>
                    </TouchableOpacity>

                    {tasksExpanded && (
                      <View style={styles.tasksList}>
                        {tasks === undefined && <Text style={styles.tasksLoading}>Загрузка...</Text>}
                        {tasks?.map((task: any) => {
                          const st: string = task.status ?? (task.completed ? 'done' : 'in_progress');
                          const TASK_STATUS: Record<string, { label: string; color: string; bg: string }> = {
                            in_progress: { label: 'В работе', color: colors.warning, bg: colors.warningBg },
                            blocked: { label: 'Блок', color: colors.danger, bg: colors.dangerBg },
                            review: { label: 'Ревью', color: colors.accent, bg: colors.accentLight },
                            done: { label: '✓', color: colors.success, bg: colors.successBg },
                          };
                          const stCfg = TASK_STATUS[st] ?? TASK_STATUS.in_progress;
                          const today = new Date(); today.setHours(0,0,0,0);
                          const overdue = task.due_date && st !== 'done' && new Date(task.due_date) < today;
                          return (
                            <View key={task.id} style={styles.taskRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.taskTitle, st === 'done' && styles.taskDone]}>
                                  {task.title || task.description}
                                </Text>
                                {task.due_date && (
                                  <Text style={[styles.taskDue, overdue && { color: colors.danger, fontWeight: '600' }]}>
                                    {overdue ? `⚠ Просрочено · ` : 'до '}
                                    {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                  </Text>
                                )}
                              </View>
                              <View style={[styles.taskStatusBadge, { backgroundColor: stCfg.bg, borderColor: stCfg.color }]}>
                                <Text style={[styles.taskStatusText, { color: stCfg.color }]}>{stCfg.label}</Text>
                              </View>
                            </View>
                          );
                        })}
                        <TouchableOpacity
                          onPress={() => { setTaskMember(member); openSheet('addTask'); }}
                        >
                          <Text style={styles.addTaskBtn}>+ Добавить задачу</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {selectedTeamId && loadingTeam && <Spinner />}
      </ScrollView>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={() => setSheetType(null)}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {sheetType === 'createTeam' && (
            <>
              <Text style={styles.sheetTitle}>Создать команду</Text>
              <Text style={styles.sheetLabel}>Название команды</Text>
              <BottomSheetTextInput
                style={styles.sheetInput}
                value={newTeamName}
                onChangeText={setNewTeamName}
                placeholder="Например: Backend Team"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.sheetRow}>
                <TouchableOpacity style={[styles.sheetBtnSecondary, { flex: 1 }]} onPress={closeSheet}>
                  <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
                  onPress={handleCreateTeam}
                  disabled={formLoading}
                >
                  <Text style={styles.sheetBtnText}>{formLoading ? 'Создание...' : 'Создать'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {sheetType === 'addMember' && (
            <>
              <Text style={styles.sheetTitle}>Добавить участника</Text>
              <Text style={styles.sheetLabel}>Email *</Text>
              <BottomSheetTextInput
                style={styles.sheetInput}
                value={newMemberEmail}
                onChangeText={setNewMemberEmail}
                placeholder="ivan@company.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={styles.sheetHint}>Участник должен быть зарегистрирован в приложении</Text>
              {addMemberError ? (
                <View style={styles.sheetErrorBox}>
                  <Text style={styles.sheetErrorText}>{addMemberError}</Text>
                </View>
              ) : null}
              <View style={styles.sheetRow}>
                <TouchableOpacity style={[styles.sheetBtnSecondary, { flex: 1 }]} onPress={closeSheet}>
                  <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
                  onPress={handleAddMember}
                  disabled={formLoading}
                >
                  <Text style={styles.sheetBtnText}>{formLoading ? 'Добавление...' : 'Добавить'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {sheetType === 'scheduleMeeting' && scheduleMember && (
            <>
              <Text style={styles.sheetTitle}>Встреча с {scheduleMember.user_name}</Text>
              <Text style={styles.sheetLabel}>Дата и время (ГГГГ-ММ-ДД ЧЧ:ММ)</Text>
              <BottomSheetTextInput
                style={styles.sheetInput}
                value={scheduleDate}
                onChangeText={setScheduleDate}
                placeholder="2025-12-31 14:00"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.sheetRow}>
                <TouchableOpacity style={[styles.sheetBtnSecondary, { flex: 1 }]} onPress={closeSheet}>
                  <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
                  onPress={handleScheduleMeeting}
                  disabled={formLoading}
                >
                  <Text style={styles.sheetBtnText}>{formLoading ? 'Сохранение...' : 'Запланировать'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {sheetType === 'addTask' && taskMember && (
            <>
              <Text style={styles.sheetTitle}>Задача для {taskMember.user_name}</Text>
              <Text style={styles.sheetLabel}>Название задачи</Text>
              <BottomSheetTextInput
                style={styles.sheetInput}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="Что нужно сделать?"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.sheetLabel}>Срок (ГГГГ-ММ-ДД, необязательно)</Text>
              <BottomSheetTextInput
                style={styles.sheetInput}
                value={newTaskDue}
                onChangeText={setNewTaskDue}
                placeholder="2025-12-31"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.sheetRow}>
                <TouchableOpacity style={[styles.sheetBtnSecondary, { flex: 1 }]} onPress={closeSheet}>
                  <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
                  onPress={handleCreateTask}
                  disabled={formLoading}
                >
                  <Text style={styles.sheetBtnText}>{formLoading ? 'Добавление...' : 'Добавить'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  iconSearchBtn: {
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 1, borderColor: c.border,
    backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center',
  },
  iconSearchBtnActive: { backgroundColor: c.accentLight, borderColor: c.accent },
  memberSearchInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: c.textPrimary, backgroundColor: c.surface,
    marginBottom: 8,
  },
  notesSection: { gap: 8 },
  notesSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notesSectionTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  notesAddLink: { fontSize: 13, fontWeight: '600', color: c.accent },
  notesEmpty: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', paddingVertical: 8 },
  noteForm: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12, gap: 8,
  },
  noteInput: {
    fontSize: 15, color: c.textPrimary,
    minHeight: 72, textAlignVertical: 'top',
  },
  noteCancelBtn: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingVertical: 9, alignItems: 'center', backgroundColor: c.surface2,
  },
  noteCancelText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
  noteSaveBtn: {
    flex: 1, backgroundColor: c.accent, borderRadius: 8,
    paddingVertical: 9, alignItems: 'center',
  },
  noteSaveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  noteCard: {
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border,
    padding: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8,
  },
  noteContent: { flex: 1, fontSize: 14, color: c.textPrimary, lineHeight: 20 },
  noteDate: { fontSize: 11, color: c.textMuted, flexShrink: 0, marginTop: 2 },
  addBtn: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },

  teamTabs: { marginBottom: 4 },
  teamTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  teamTabActive: { backgroundColor: c.accent, borderColor: c.accent },
  teamTabText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
  teamTabTextActive: { color: '#fff' },

  inviteBanner: {
    backgroundColor: c.blue50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.blue200,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteIcon: {
    width: 44, height: 44,
    borderRadius: 10,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.blue200,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: c.blue600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  inviteCode: {
    fontSize: 18,
    fontWeight: '700',
    color: c.blue700,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  copyBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  addMemberBtn: {
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  addMemberBtnText: { fontSize: 12, fontWeight: '600', color: c.accent },
  newCodeBtn: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: c.surface,
  },
  newCodeBtnText: { fontSize: 12, fontWeight: '500', color: c.textSecondary },

  memberCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  memberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  memberRole: { fontSize: 12, color: c.textMuted },
  lastMeeting: { fontSize: 12, color: c.textSecondary, marginBottom: 12 },
  scheduleBtn: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  scheduleBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  tasksToggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  tasksToggleText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  tasksLoading: { fontSize: 12, color: c.textMuted, paddingVertical: 4 },
  tasksList: { marginTop: 8, gap: 6 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  taskTitle: { fontSize: 13, color: c.textPrimary, lineHeight: 18 },
  taskDone: { textDecorationLine: 'line-through', color: c.textMuted },
  taskDue: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  taskStatusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  taskStatusText: { fontSize: 11, fontWeight: '600' },
  addTaskBtn: { fontSize: 13, color: c.accent, fontWeight: '500', paddingVertical: 4 },

  // Sheet
  sheetContent: { padding: 20, gap: 4, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 16 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  sheetInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.textPrimary,
    backgroundColor: c.surface,
    marginBottom: 14,
  },
  sheetHint: { fontSize: 12, color: c.textMuted, marginBottom: 12, marginTop: -8 },
  sheetErrorBox: {
    backgroundColor: c.dangerBg,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  sheetErrorText: { fontSize: 14, color: c.danger },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetBtn: {
    backgroundColor: c.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetBtnSecondary: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: c.surface,
  },
  sheetBtnSecondaryText: { fontSize: 15, fontWeight: '500', color: c.textSecondary },
  btnDisabled: { opacity: 0.6 },
});
