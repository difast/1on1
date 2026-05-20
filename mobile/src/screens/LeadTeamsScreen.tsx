import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, RefreshControl, SafeAreaView, Alert,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/auth';
import {
  getTeams, getTeam, createTeam, createUser,
  addMember, createMeeting, getTasks, createTask, updateTask,
} from '../lib/api';
import { colors } from '../constants/colors';
import { Avatar } from '../components/Avatar';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

const STATUS_BORDER: Record<string, string> = {
  green: colors.statusGreenBorder,
  yellow: colors.statusYellowBorder,
  red: colors.statusRedBorder,
};

const STATUS_BADGE_LABEL: Record<string, string> = {
  green: 'В порядке',
  yellow: 'Скоро',
  red: 'Просрочено',
};

const STATUS_BADGE_VARIANT: Record<string, 'green' | 'amber' | 'red'> = {
  green: 'green',
  yellow: 'amber',
  red: 'red',
};

type SheetType = 'createTeam' | 'addMember' | 'scheduleMeeting' | 'addTask' | null;

export default function LeadTeamsScreen() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamDetail, setTeamDetail] = useState<any>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [memberTasks, setMemberTasks] = useState<Record<number, any[]>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const [sheetType, setSheetType] = useState<SheetType>(null);
  const [scheduleMember, setScheduleMember] = useState<any>(null);
  const [taskMember, setTaskMember] = useState<any>(null);

  // Form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberTitle, setNewMemberTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = ['50%', '85%'];

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

  useEffect(() => { loadTeams(); }, [user?.id]);
  useEffect(() => { if (selectedTeamId) loadTeamDetail(selectedTeamId); }, [selectedTeamId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeams();
    if (selectedTeamId) await loadTeamDetail(selectedTeamId);
    setRefreshing(false);
  };

  const handleCopyInvite = async () => {
    if (!teamDetail?.invite_code) return;
    await Clipboard.setStringAsync(teamDetail.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const handleToggleTask = async (task: any, memberId: number) => {
    try {
      await updateTask(task.id, { completed: !task.completed });
      setMemberTasks(prev => ({
        ...prev,
        [memberId]: (prev[memberId] || []).map(t =>
          t.id === task.id ? { ...t, completed: !t.completed } : t
        ),
      }));
    } catch {}
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
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    setFormLoading(true);
    try {
      const u = await createUser({ name: newMemberName.trim(), email: newMemberEmail.trim(), title: newMemberTitle.trim() || undefined, role: 'member' }) as any;
      await addMember(selectedTeamId!, u.id, 'member');
      setNewMemberName(''); setNewMemberEmail(''); setNewMemberTitle('');
      closeSheet();
      await loadTeamDetail(selectedTeamId!);
    } catch {} finally { setFormLoading(false); }
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

  const members = (teamDetail?.members || []).filter((m: any) => m.user_id !== user?.id);

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
          <EmptyState icon="👥" title="Нет команд" description="Создайте первую команду, чтобы начать" />
        )}

        {/* Team detail */}
        {selectedTeamId && !loadingTeam && teamDetail && (
          <View style={{ gap: 12 }}>
            {/* Invite banner */}
            <TouchableOpacity style={styles.inviteBanner} onPress={handleCopyInvite}>
              <View style={styles.inviteIcon}>
                <Text style={{ fontSize: 20 }}>🔗</Text>
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
              </View>
            </TouchableOpacity>

            {/* Members */}
            {members.length === 0 ? (
              <EmptyState
                icon="👤"
                title="Нет участников"
                description="Добавьте первого участника в команду"
              >
                <TouchableOpacity style={[styles.addBtn, { marginTop: 16 }]} onPress={() => openSheet('addMember')}>
                  <Text style={styles.addBtnText}>+ Добавить участника</Text>
                </TouchableOpacity>
              </EmptyState>
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
                      <Text style={styles.tasksToggleText}>
                        {tasksExpanded ? '▾' : '▸'} Задачи
                        {tasks !== undefined && (
                          <Text style={{ color: colors.textMuted }}> ({tasks.length})</Text>
                        )}
                      </Text>
                    </TouchableOpacity>

                    {tasksExpanded && (
                      <View style={styles.tasksList}>
                        {tasks === undefined && <Text style={styles.tasksLoading}>Загрузка...</Text>}
                        {tasks?.map((task: any) => (
                          <TouchableOpacity
                            key={task.id}
                            style={styles.taskRow}
                            onPress={() => handleToggleTask(task, member.user_id)}
                          >
                            <View style={[styles.checkbox, task.completed && styles.checkboxDone]}>
                              {task.completed && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.taskTitle, task.completed && styles.taskDone]}>
                                {task.title || task.description}
                              </Text>
                              {task.due_date && (
                                <Text style={styles.taskDue}>
                                  до {new Date(task.due_date).toLocaleDateString('ru-RU')}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
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
              {[
                { label: 'Имя *', value: newMemberName, setter: setNewMemberName, placeholder: 'Иван Иванов' },
                { label: 'Email *', value: newMemberEmail, setter: setNewMemberEmail, placeholder: 'ivan@company.com', type: 'email' },
                { label: 'Должность', value: newMemberTitle, setter: setNewMemberTitle, placeholder: 'Senior Engineer' },
              ].map(f => (
                <View key={f.label} style={{ marginBottom: 14 }}>
                  <Text style={styles.sheetLabel}>{f.label}</Text>
                  <BottomSheetTextInput
                    style={styles.sheetInput}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textMuted}
                    keyboardType={f.type === 'email' ? 'email-address' : 'default'}
                    autoCapitalize="none"
                  />
                </View>
              ))}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  addBtn: {
    backgroundColor: colors.accent,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  teamTabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  teamTabTextActive: { color: '#fff' },

  inviteBanner: {
    backgroundColor: colors.blue50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.blue200,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteIcon: {
    width: 44, height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.blue200,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.blue600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  inviteCode: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.blue700,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  copyBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  addMemberBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  addMemberBtnText: { fontSize: 12, fontWeight: '600', color: colors.accent },

  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  memberRole: { fontSize: 12, color: colors.textMuted },
  lastMeeting: { fontSize: 12, color: colors.textSecondary, marginBottom: 12 },
  scheduleBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  scheduleBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  tasksToggle: { paddingVertical: 4 },
  tasksToggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tasksLoading: { fontSize: 12, color: colors.textMuted, paddingVertical: 4 },
  tasksList: { marginTop: 8, gap: 6 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.gray300,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { fontSize: 11, color: '#fff', fontWeight: '700' },
  taskTitle: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  taskDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  taskDue: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  addTaskBtn: { fontSize: 13, color: colors.accent, fontWeight: '500', paddingVertical: 4 },

  // Sheet
  sheetContent: { padding: 20, gap: 4, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  sheetInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetBtnSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  sheetBtnSecondaryText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  btnDisabled: { opacity: 0.6 },
});
