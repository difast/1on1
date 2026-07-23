import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import {
  getAdminStats, blockUser, unblockUser, getServiceHealth,
  broadcastNotification, getSupportTickets, adminReplyTicket, getUsers,
  getTeams, getTeam, getMeetings, getTasks, createTeam, createTask, createMeeting,
  updateUser, deleteUser,
} from '../lib/api';
import { Avatar } from '../components/Avatar';
import { DateTimePickerField } from '../components/DateTimePickerField';
import { UserDetailModal } from '../components/admin/UserDetailModal';
import { EntityPicker } from '../components/admin/EntityPicker';
import { EmployeesTab } from '../components/admin/EmployeesTab';
import type { AppColors } from '../constants/colors';

type Tab = 'users' | 'employees' | 'tickets' | 'broadcast' | 'manage' | 'health' | 'monetize';

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'users', label: 'Пользователи', icon: 'people-outline' },
  { id: 'employees', label: 'Сотрудники', icon: 'id-card-outline' },
  { id: 'tickets', label: 'Обращения', icon: 'chatbubbles-outline' },
  { id: 'broadcast', label: 'Рассылка', icon: 'megaphone-outline' },
  { id: 'manage', label: 'Управление', icon: 'construct-outline' },
  { id: 'health', label: 'Здоровье', icon: 'pulse-outline' },
  { id: 'monetize', label: 'Монетизация', icon: 'card-outline' },
];

export default function AdminScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { exitAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  // Android's on-screen nav bar overlaps fixed bottom inputs — pad by the inset.
  const bottomPad = Math.max(insets.bottom, 8);

  const [tab, setTab] = useState<Tab>('users');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tickets
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const ticketScrollRef = useRef<ScrollView>(null);

  // Broadcast
  const [bcTitle, setBcTitle] = useState('');
  const [bcBody, setBcBody] = useState('');
  const [bcSending, setBcSending] = useState(false);
  const [bcResult, setBcResult] = useState('');

  // Users search + detail
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Manage (create — pick people/teams by name)
  const [mgTeamName, setMgTeamName] = useState('');
  const [mgTeamLead, setMgTeamLead] = useState<number | null>(null);
  const [mgTaskTitle, setMgTaskTitle] = useState('');
  const [mgTaskAssignee, setMgTaskAssignee] = useState<number | null>(null);
  const [mgTaskTeam, setMgTaskTeam] = useState<number | null>(null);
  const [mgMeetTeam, setMgMeetTeam] = useState<number | null>(null);
  const [mgMeetMember, setMgMeetMember] = useState<number | null>(null);
  const [mgMeetDate, setMgMeetDate] = useState('');
  const [mgBusy, setMgBusy] = useState(false);
  const [mgMsg, setMgMsg] = useState('');
  const [mgTeamsData, setMgTeamsData] = useState<any[]>([]);

  // Health
  const [health, setHealth] = useState<any>(null);
  const [statsError, setStatsError] = useState(false);

  const mgNotify = (msg: string) => { setMgMsg(msg); setTimeout(() => setMgMsg(''), 3500); };

  const handleCreateTeam = async () => {
    if (!mgTeamName.trim() || !mgTeamLead) { mgNotify('Укажите название и тимлида'); return; }
    setMgBusy(true);
    try {
      await createTeam({ name: mgTeamName.trim(), team_lead_id: mgTeamLead });
      setMgTeamName(''); setMgTeamLead(null); mgNotify('✓ Команда создана');
    } catch { mgNotify('Ошибка создания команды'); } finally { setMgBusy(false); }
  };

  const handleCreateTask = async () => {
    if (!mgTaskTitle.trim() || !mgTaskAssignee) { mgNotify('Укажите задачу и исполнителя'); return; }
    setMgBusy(true);
    try {
      await createTask({
        title: mgTaskTitle.trim(),
        assigned_to: mgTaskAssignee,
        assigned_by: mgTaskAssignee,
        team_id: mgTaskTeam ?? null,
      });
      setMgTaskTitle(''); setMgTaskAssignee(null); setMgTaskTeam(null); mgNotify('✓ Задача создана');
    } catch { mgNotify('Ошибка создания задачи'); } finally { setMgBusy(false); }
  };

  const handleCreateMeeting = async () => {
    const team = mgTeamsData.find(t => t.id === mgMeetTeam);
    if (!team || !mgMeetMember || !mgMeetDate) { mgNotify('Выберите команду, участника и дату'); return; }
    setMgBusy(true);
    try {
      await createMeeting({
        team_id: team.id,
        team_lead_id: team.team_lead_id,
        member_id: mgMeetMember,
        scheduled_date: mgMeetDate,
      });
      setMgMeetTeam(null); setMgMeetMember(null); setMgMeetDate(''); mgNotify('✓ Встреча создана');
    } catch { mgNotify('Ошибка создания встречи'); } finally { setMgBusy(false); }
  };

  const loadStats = useCallback(async () => {
    try { setStats(await getAdminStats()); setStatsError(false); }
    catch { setStatsError(true); }
    finally { setLoading(false); }
  }, []);

  const loadTickets = useCallback(async () => {
    try { setTickets(await getSupportTickets() as any[]); } catch {}
  }, []);

  const loadHealth = useCallback(async () => {
    try { setHealth(await getServiceHealth()); } catch { setHealth(null); }
  }, []);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (tab === 'tickets') loadTickets();
    if (tab === 'health') loadHealth();
    if (tab === 'manage' && mgTeamsData.length === 0) {
      (async () => {
        try {
          const all = await getTeams() as any[];
          const det = await Promise.all((all || []).map(t => getTeam(t.id).catch(() => t)));
          setMgTeamsData(det as any[]);
        } catch {}
      })();
    }
  }, [tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'users') await loadStats();
    else if (tab === 'tickets') await loadTickets();
    else if (tab === 'health') await loadHealth();
    setRefreshing(false);
  };

  const handleToggleBlock = async (u: any) => {
    try {
      if (u.is_blocked) await unblockUser(u.id);
      else await blockUser(u.id);
      setStats((prev: any) => ({
        ...prev,
        users: prev.users.map((x: any) => x.id === u.id ? { ...x, is_blocked: !u.is_blocked } : x),
      }));
    } catch { Alert.alert('Ошибка', 'Не удалось изменить статус'); }
  };

  const openTicket = (t: any) => {
    setActiveTicket(t);
    setTimeout(() => ticketScrollRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const handleReply = async () => {
    if (!replyText.trim() || !activeTicket) return;
    setReplying(true);
    try {
      const updated = await adminReplyTicket(activeTicket.id, replyText.trim()) as any;
      setActiveTicket(updated);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      setReplyText('');
      setTimeout(() => ticketScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { Alert.alert('Ошибка', 'Не удалось отправить ответ'); }
    finally { setReplying(false); }
  };

  const handleBroadcast = async () => {
    if (!bcTitle.trim()) return;
    setBcSending(true);
    setBcResult('');
    try {
      await broadcastNotification({ title: bcTitle.trim(), body: bcBody.trim() || undefined, target: 'all' });
      setBcResult('ok');
      setBcTitle(''); setBcBody('');
      setTimeout(() => setBcResult(''), 3000);
    } catch { setBcResult('error'); }
    finally { setBcSending(false); }
  };

  const handleLogout = () => {
    Alert.alert('Выйти из админ-панели', 'Вернуться к обычному входу?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => exitAdmin() },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Админ-панель</Text>
          <Text style={styles.headerSub}>Управление платформой OneOnOne</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="exit-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, tab === t.id && styles.tabActive]}
              onPress={() => { setTab(t.id); setActiveTicket(null); }}
            >
              <Ionicons name={t.icon} size={15} color={tab === t.id ? '#fff' : colors.textSecondary} />
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
      ) : (
        <>
          {/* СОТРУДНИКИ (задача 2) */}
          {tab === 'employees' && <EmployeesTab />}

          {/* USERS */}
          {tab === 'users' && statsError && (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Не удалось загрузить данные</Text>
              <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>Сервер недоступен или запрос завис</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { setLoading(true); loadStats(); }}
              >
                <Text style={styles.retryBtnText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          )}
          {tab === 'users' && !statsError && stats && (() => {
            const q = search.trim().toLowerCase();
            const allUsers = (stats.users ?? []) as any[];
            const filtered = q
              ? allUsers.filter(u =>
                  String(u.id) === q ||
                  (u.name || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q) ||
                  (u.title || '').toLowerCase().includes(q))
              : allUsers;
            return (
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
              <View style={styles.statsGrid}>
                {[
                  { label: 'Пользователей', value: stats.total_users },
                  { label: 'Тимлидов', value: stats.total_leads },
                  { label: 'Участников', value: stats.total_members },
                  { label: 'Команд', value: stats.total_teams },
                  { label: 'Встреч', value: stats.total_meetings },
                  { label: 'Звонков', value: stats.total_calls },
                ].map(s => (
                  <View key={s.label} style={styles.statCard}>
                    <Text style={styles.statValue}>{s.value ?? 0}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск по имени, email, должности или ID"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.usersHint}>
                <Ionicons name="hand-left-outline" size={14} color={colors.accent} />
                <Text style={styles.usersHintText}>Нажмите на пользователя — откроются детали, команды, встречи, задачи и управление (роль, блок, удаление).</Text>
              </View>
              <Text style={styles.sectionLabel}>Пользователи ({filtered.length})</Text>
              {filtered.map((u: any) => (
                <TouchableOpacity
                  key={u.id}
                  style={[styles.userCard, u.is_blocked && styles.userCardBlocked]}
                  onPress={() => setSelectedUser(u)}
                  activeOpacity={0.7}
                >
                  <Avatar name={u.name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.userName} numberOfLines={1}>{u.name}</Text>
                    <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                    <View style={styles.userMeta}>
                      <View style={styles.idChip}><Text style={styles.idChipText}>ID {u.id}</Text></View>
                      <View style={[styles.roleBadge, u.role === 'team_lead' ? styles.roleLead : styles.roleMember]}>
                        <Text style={styles.roleBadgeText}>{u.role === 'team_lead' ? 'Тимлид' : 'Участник'}</Text>
                      </View>
                      <Text style={styles.userStat}>{u.meetings_count} встр · {u.tasks_count} зад</Text>
                    </View>
                  </View>
                  <View style={styles.manageHintPill}>
                    <Text style={styles.manageHintPillText}>Управление</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            );
          })()}

          {/* TICKETS */}
          {tab === 'tickets' && !activeTicket && (
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
              {tickets.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Обращений пока нет</Text>
                </View>
              ) : tickets.map(t => (
                <TouchableOpacity key={t.id} style={styles.ticketCard} onPress={() => openTicket(t)}>
                  <View style={[styles.ticketDot, !t.read_by_admin && styles.ticketDotUnread]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.ticketSubject, !t.read_by_admin && styles.ticketSubjectBold]} numberOfLines={1}>{t.subject}</Text>
                    <Text style={styles.ticketMeta} numberOfLines={1}>{t.user_name} · {t.user_email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* TICKET THREAD */}
          {tab === 'tickets' && activeTicket && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.threadHeader}>
                <TouchableOpacity onPress={() => setActiveTicket(null)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.threadSubject} numberOfLines={1}>{activeTicket.subject}</Text>
                  <Text style={styles.threadUser} numberOfLines={1}>{activeTicket.user_name}</Text>
                </View>
              </View>
              <ScrollView ref={ticketScrollRef} contentContainerStyle={styles.threadContent}>
                {/* Full user info for the admin */}
                <View style={styles.userInfoCard}>
                  <View style={styles.userInfoRow}><Text style={styles.userInfoK}>Пользователь</Text><Text style={styles.userInfoV}>{activeTicket.user_name}</Text></View>
                  <View style={styles.userInfoRow}><Text style={styles.userInfoK}>ID</Text><Text style={styles.userInfoV}>{activeTicket.user_id}</Text></View>
                  <View style={styles.userInfoRow}><Text style={styles.userInfoK}>Email</Text><Text style={styles.userInfoV} numberOfLines={1}>{activeTicket.user_email}</Text></View>
                  <View style={styles.userInfoRow}><Text style={styles.userInfoK}>Роль</Text><Text style={styles.userInfoV}>{activeTicket.user_role === 'team_lead' ? 'Тимлид' : activeTicket.user_role === 'member' ? 'Участник' : activeTicket.user_role}</Text></View>
                  <View style={styles.userInfoRow}><Text style={styles.userInfoK}>Обращение</Text><Text style={styles.userInfoV}>#{activeTicket.id}{activeTicket.created_at ? ` · ${new Date(activeTicket.created_at).toLocaleDateString('ru-RU')}` : ''}</Text></View>
                </View>
                <View style={[styles.bubble, styles.bubbleUser]}>
                  <Text style={styles.bubbleBody}>{activeTicket.body}</Text>
                </View>
                {(activeTicket.messages ?? []).map((m: any) => (
                  <View key={m.id} style={[styles.bubble, m.sender === 'admin' ? styles.bubbleAdmin : styles.bubbleUser]}>
                    <Text style={[styles.bubbleBody, m.sender === 'admin' && styles.bubbleBodyAdmin]}>{m.body}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={[styles.replyBar, { paddingBottom: bottomPad }]}>
                <TextInput
                  style={styles.replyInput}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Ответить пользователю..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!replyText.trim() || replying) && styles.btnDisabled]}
                  onPress={handleReply}
                  disabled={!replyText.trim() || replying}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}

          {/* BROADCAST */}
          {tab === 'broadcast' && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]} keyboardShouldPersistTaps="handled">
                <View style={styles.infoBanner}>
                  <Ionicons name="megaphone-outline" size={18} color={colors.accent} />
                  <Text style={styles.infoBannerText}>Сообщение придёт всем пользователям как уведомление с красной плашкой</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Заголовок</Text>
                  <TextInput
                    style={styles.input}
                    value={bcTitle}
                    onChangeText={setBcTitle}
                    placeholder="Например: Плановые работы"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Текст (необязательно)</Text>
                  <TextInput
                    style={[styles.input, styles.textarea]}
                    value={bcBody}
                    onChangeText={setBcBody}
                    placeholder="Подробности объявления..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
                {bcResult === 'ok' && (
                  <View style={styles.successBanner}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.successBannerText}>Рассылка отправлена всем пользователям</Text>
                  </View>
                )}
                {bcResult === 'error' && (
                  <View style={styles.errorBox}><Text style={styles.errorText}>Ошибка при отправке</Text></View>
                )}
                <TouchableOpacity
                  style={[styles.submitBtn, (bcSending || !bcTitle.trim()) && styles.btnDisabled]}
                  onPress={handleBroadcast}
                  disabled={bcSending || !bcTitle.trim()}
                >
                  <Text style={styles.submitBtnText}>{bcSending ? 'Отправка...' : 'Отправить всем'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* MANAGE — create by ID */}
          {tab === 'manage' && (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]} keyboardShouldPersistTaps="handled">
                <View style={styles.infoBanner}>
                  <Ionicons name="construct-outline" size={18} color={colors.accent} />
                  <Text style={styles.infoBannerText}>Выбирайте людей и команды по имени — ID подставляются автоматически.</Text>
                </View>

                {mgMsg ? (
                  <View style={mgMsg.startsWith('✓') ? styles.successBanner : styles.errorBox}>
                    <Text style={mgMsg.startsWith('✓') ? styles.successBannerText : styles.errorText}>{mgMsg}</Text>
                  </View>
                ) : null}

                {(() => {
                  const userItems = (stats?.users ?? []).map((u: any) => ({ id: u.id, label: u.name, sub: `${u.email} · ${u.role === 'team_lead' ? 'тимлид' : 'участник'}` }));
                  const teamItems = mgTeamsData.map((t: any) => ({ id: t.id, label: t.name, sub: `тимлид #${t.team_lead_id}` }));
                  const meetTeam = mgTeamsData.find((t: any) => t.id === mgMeetTeam);
                  const memberItems = (meetTeam?.members ?? []).map((m: any) => ({ id: m.user_id, label: m.user_name, sub: m.role }));
                  return (
                  <>
                    {/* Create team */}
                    <Text style={styles.sectionLabel}>Создать команду</Text>
                    <View style={styles.field}><Text style={styles.label}>Название</Text>
                      <TextInput style={styles.input} value={mgTeamName} onChangeText={setMgTeamName} placeholder="Название команды" placeholderTextColor={colors.textMuted} />
                    </View>
                    <EntityPicker label="Тимлид" placeholder="Выберите тимлида" valueId={mgTeamLead} items={userItems} onSelect={setMgTeamLead} />
                    <TouchableOpacity style={[styles.submitBtn, mgBusy && styles.btnDisabled]} onPress={handleCreateTeam} disabled={mgBusy}>
                      <Text style={styles.submitBtnText}>Создать команду</Text>
                    </TouchableOpacity>

                    {/* Create task */}
                    <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Создать задачу</Text>
                    <View style={styles.field}><Text style={styles.label}>Задача</Text>
                      <TextInput style={styles.input} value={mgTaskTitle} onChangeText={setMgTaskTitle} placeholder="Текст задачи" placeholderTextColor={colors.textMuted} />
                    </View>
                    <EntityPicker label="Исполнитель" placeholder="Выберите пользователя" valueId={mgTaskAssignee} items={userItems} onSelect={setMgTaskAssignee} />
                    <EntityPicker label="Команда (необязательно)" placeholder="Без команды" valueId={mgTaskTeam} items={teamItems} onSelect={setMgTaskTeam} emptyText="Команды не загружены" />
                    <TouchableOpacity style={[styles.submitBtn, mgBusy && styles.btnDisabled]} onPress={handleCreateTask} disabled={mgBusy}>
                      <Text style={styles.submitBtnText}>Создать задачу</Text>
                    </TouchableOpacity>

                    {/* Create meeting */}
                    <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Создать встречу</Text>
                    <EntityPicker label="Команда" placeholder="Выберите команду" valueId={mgMeetTeam} items={teamItems} onSelect={(id) => { setMgMeetTeam(id); setMgMeetMember(null); }} emptyText="Команды не загружены" />
                    <EntityPicker label="Участник" placeholder={mgMeetTeam ? 'Выберите участника' : 'Сначала выберите команду'} valueId={mgMeetMember} items={memberItems} onSelect={setMgMeetMember} emptyText="В команде нет участников" />
                    <View style={styles.field}><Text style={styles.label}>Дата и время</Text>
                      <DateTimePickerField value={mgMeetDate} onChange={setMgMeetDate} />
                    </View>
                    <Text style={styles.hintNote}>Тимлид встречи определяется автоматически по выбранной команде.</Text>
                    <TouchableOpacity style={[styles.submitBtn, mgBusy && styles.btnDisabled]} onPress={handleCreateMeeting} disabled={mgBusy}>
                      <Text style={styles.submitBtnText}>Создать встречу</Text>
                    </TouchableOpacity>
                  </>
                  );
                })()}
              </ScrollView>
            </KeyboardAvoidingView>
          )}

          {/* HEALTH */}
          {tab === 'health' && (
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
              {!health ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="warning-outline" size={40} color={colors.warning} />
                  <Text style={styles.emptyText}>Не удалось загрузить данные</Text>
                </View>
              ) : (
                <>
                  <View style={[styles.healthStatus, health.status === 'ok' ? styles.healthOk : styles.healthWarn]}>
                    <View style={[styles.healthDot, { backgroundColor: health.status === 'ok' ? '#22c55e' : '#f59e0b' }]} />
                    <Text style={styles.healthStatusText}>
                      {health.status === 'ok' ? 'Все системы работают' : 'Есть проблемы'}
                    </Text>
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                      <Text style={styles.statValue}>{Math.floor((health.uptime_seconds ?? 0) / 3600)}ч</Text>
                      <Text style={styles.statLabel}>Аптайм</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statValue}>{health.db_latency_ms ?? '—'}мс</Text>
                      <Text style={styles.statLabel}>Задержка БД</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statValue}>{health.stats?.users ?? '—'}</Text>
                      <Text style={styles.statLabel}>Пользователей</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statValue}>{health.stats?.open_tickets ?? '—'}</Text>
                      <Text style={styles.statLabel}>Открытых обращений</Text>
                    </View>
                  </View>

                  <Text style={styles.sectionLabel}>Сервисы</Text>
                  {Object.entries(health.services ?? {}).map(([name, status]: any) => {
                    const ok = status === 'ok' || status === 'up';
                    const notConfigured = status === 'not_configured';
                    return (
                      <View key={name} style={styles.serviceRow}>
                        <View style={[styles.healthDot, { backgroundColor: ok ? '#22c55e' : notConfigured ? colors.textMuted : '#ef4444' }]} />
                        <Text style={styles.serviceName}>{name}</Text>
                        <Text style={styles.serviceStatus}>{String(status)}</Text>
                      </View>
                    );
                  })}

                  {health.migration_rev && (
                    <Text style={styles.migrationRev}>Миграция: {health.migration_rev}</Text>
                  )}
                </>
              )}
            </ScrollView>
          )}

          {/* MONETIZE */}
          {tab === 'monetize' && (
            <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 40 }]}>
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
                <Text style={styles.infoBannerText}>Монетизация пока не подключена</Text>
              </View>
              {[
                { code: 'TP', title: 'Team Pro', desc: 'Расширенная аналитика и неограниченные команды' },
                { code: 'HP', title: 'HR Plus', desc: 'Интеграции с HR-системами и отчёты' },
                { code: 'PP', title: 'Priority', desc: 'Приоритетная поддержка и SLA' },
              ].map(p => (
                <View key={p.code} style={styles.planCard}>
                  <View style={styles.planMono}><Text style={styles.planMonoText}>{p.code}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>{p.title}</Text>
                    <Text style={styles.planDesc}>{p.desc}</Text>
                  </View>
                  <View style={styles.devBadge}><Text style={styles.devBadgeText}>В разработке</Text></View>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}

      <UserDetailModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onChanged={loadStats}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  logoutBtn: {
    width: 38, height: 38, borderRadius: 11,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },

  tabsWrap: { borderBottomWidth: 1, borderBottomColor: c.border },
  tabs: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  tabActive: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  tabTextActive: { color: '#fff' },

  content: { padding: 16, gap: 12, paddingBottom: 40 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '31%', backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
  statLabel: { fontSize: 10, color: c.textMuted, marginTop: 2, textAlign: 'center' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 4, marginTop: 4,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: c.textPrimary },
  hintNote: { fontSize: 11, color: c.textMuted, marginTop: -4, marginBottom: 6, fontStyle: 'italic' },
  usersHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.accentLight, borderRadius: 10, padding: 10, marginTop: 8 },
  usersHintText: { flex: 1, fontSize: 12, color: c.textSecondary, lineHeight: 17 },
  manageHintPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: c.accentLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0 },
  manageHintPillText: { fontSize: 11, fontWeight: '700', color: c.accent },
  idChip: { backgroundColor: c.surface2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  idChipText: { fontSize: 10, fontWeight: '700', color: c.textSecondary },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12,
  },
  userCardBlocked: { opacity: 0.55 },
  userName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  userEmail: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  roleBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  roleLead: { backgroundColor: c.accentLight },
  roleMember: { backgroundColor: c.surface2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: c.textSecondary },
  userStat: { fontSize: 11, color: c.textMuted },
  blockBtn: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
  },
  blockBtnText: { fontSize: 12, fontWeight: '600', color: c.danger },
  unblockBtn: { backgroundColor: c.successBg, borderColor: '#86efac' },
  unblockBtnText: { color: c.success },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: c.textMuted },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: c.accent, borderRadius: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  ticketCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
  },
  ticketDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  ticketDotUnread: { backgroundColor: '#ef4444' },
  ticketSubject: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  ticketSubjectBold: { fontWeight: '700' },
  ticketMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },

  threadHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  threadSubject: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  threadUser: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  userInfoCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, marginBottom: 8, gap: 6 },
  userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  userInfoK: { fontSize: 12, color: c.textMuted },
  userInfoV: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flexShrink: 1, textAlign: 'right' },
  threadContent: { padding: 16, gap: 10 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12 },
  bubbleUser: { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  bubbleAdmin: { alignSelf: 'flex-end', backgroundColor: c.accent },
  bubbleBody: { fontSize: 14, color: c.textPrimary, lineHeight: 20 },
  bubbleBodyAdmin: { color: '#fff' },
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface,
  },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
    maxHeight: 100, backgroundColor: c.bg,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: c.textPrimary, backgroundColor: c.surface,
  },
  textarea: { minHeight: 100, paddingTop: 12 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.accentLight, borderRadius: 12, padding: 12,
  },
  infoBannerText: { flex: 1, fontSize: 12, color: c.textSecondary, lineHeight: 17 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.successBg, borderRadius: 12, padding: 12,
  },
  successBannerText: { fontSize: 13, color: c.success, fontWeight: '500' },
  errorBox: { backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 12 },
  errorText: { fontSize: 13, color: c.danger },
  submitBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },

  healthStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  healthOk: { backgroundColor: c.successBg, borderColor: '#86efac' },
  healthWarn: { backgroundColor: c.warningBg, borderColor: '#FCD34D' },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
  healthStatusText: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 10,
    borderWidth: 1, borderColor: c.border, padding: 12,
  },
  serviceName: { flex: 1, fontSize: 14, fontWeight: '500', color: c.textPrimary, textTransform: 'capitalize' },
  serviceStatus: { fontSize: 12, color: c.textMuted },
  migrationRev: { fontSize: 11, color: c.textMuted, marginTop: 8, textAlign: 'center' },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
  },
  planMono: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  planMonoText: { fontSize: 15, fontWeight: '800', color: c.accent },
  planTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  planDesc: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  devBadge: { backgroundColor: c.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  devBadgeText: { fontSize: 10, fontWeight: '600', color: c.textMuted },
});
