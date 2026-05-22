import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getTeams, getTeam, joinTeam, getMeetings } from '../lib/api';
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

  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const findTeam = useCallback(async () => {
    try {
      const allTeams = await getTeams() as any[];
      for (const t of allTeams) {
        try {
          const detail = await getTeam(t.id) as any;
          const isMember = (detail.members || []).some((m: any) => m.user_id === user!.id);
          if (isMember) { setTeam(detail); return; }
        } catch {}
      }
      setTeam(null);
    } catch { setTeam(null); }
    finally { setLoading(false); }
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
    } catch {}
  }, [user]);

  useEffect(() => { findTeam(); }, [user?.id]);

  useEffect(() => {
    if (team) loadMeetings();
  }, [team]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLoading(true);
    await findTeam();
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

  if (loading) return <Spinner />;

  // No team — show join form
  if (!team) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Обзор</Text>
        </View>
        <View style={styles.joinContainer}>
          <Text style={styles.joinIcon}>🔗</Text>
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

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{team.name}</Text>
        <Text style={styles.headerSub}>Добро пожаловать, {user?.name}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Team lead card */}
        {team.team_lead_id && (
          <View style={styles.leadCard}>
            <Avatar name={leadMember?.user_name || team.team_lead_name} imageUrl={leadMember?.user_avatar_url} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.leadLabel}>Тимлид</Text>
              <Text style={styles.leadName}>{team.team_lead_name || 'Тимлид'}</Text>
              {team.team_lead_title ? (
                <Text style={styles.leadTitle}>{team.team_lead_title}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Upcoming meetings */}
        {upcomingMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ближайшие встречи</Text>
            {upcomingMeetings.map(m => (
              <MeetingItem key={m.id} meeting={m} />
            ))}
          </View>
        )}

        {/* Team members */}
        {otherMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Участники команды</Text>
            <View style={styles.membersGrid}>
              {otherMembers.map((m: any) => (
                <View key={m.user_id} style={styles.memberChip}>
                  <Avatar name={m.user_name} imageUrl={m.user_avatar_url} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.memberName} numberOfLines={1}>{m.user_name}</Text>
                    <Text style={styles.memberRole} numberOfLines={1}>{m.role}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {upcomingMeetings.length === 0 && otherMembers.length === 0 && (
          <EmptyState icon="👥" title="Команда пуста" description="Ждём когда тимлид добавит участников" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 14, color: c.textSecondary, marginTop: 2 },
  content: { padding: 16, gap: 20, paddingBottom: 32 },

  leadCard: {
    backgroundColor: c.blue50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.blue200,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leadLabel: { fontSize: 11, fontWeight: '700', color: c.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  leadName: { fontSize: 17, fontWeight: '600', color: c.textPrimary },
  leadTitle: { fontSize: 13, color: c.textSecondary, marginTop: 2 },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },

  membersGrid: { gap: 8 },
  memberChip: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberName: { fontSize: 13, fontWeight: '500', color: c.textPrimary },
  memberRole: { fontSize: 11, color: c.textMuted },

  // Join form
  joinContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  joinIcon: { fontSize: 48, marginBottom: 12 },
  joinTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginBottom: 6 },
  joinDesc: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginBottom: 24 },
  joinForm: {
    width: '100%', maxWidth: 360,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
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
  btnDisabled: { opacity: 0.6 },
});
