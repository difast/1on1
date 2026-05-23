import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getMeetings, getUsers, confirmMeeting, declineMeeting } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { WeekCalendar } from '../components/WeekCalendar';

export default function LeadMeetingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [calendarView, setCalendarView] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meetingsData, usersData] = await Promise.all([
        getMeetings({ team_lead_id: user!.id }),
        getUsers(),
      ]) as [any[], any[]];
      setMeetings(meetingsData || []);
      const map: Record<number, any> = {};
      for (const u of (usersData || [])) map[u.id] = u;
      setUsersMap(map);
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

  const now = new Date();
  const requests = meetings.filter(m => m.status === 'requested');
  const upcoming = meetings
    .filter(m => m.status !== 'requested' && m.status !== 'cancelled' && m.status !== 'declined' && new Date(m.scheduled_date) >= now)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  const past = meetings
    .filter(m => (new Date(m.scheduled_date) < now && m.status !== 'requested') || m.status === 'completed' || m.status === 'cancelled' || m.status === 'declined')
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Мои встречи</Text>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {meetings.length === 0 && (
          <EmptyState icon="📅" title="Встреч пока нет" description="Встречи появятся после планирования" />
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
                    <MeetingItem
                      meeting={m}
                      subtitle={usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`}
                    />
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
                  <MeetingItem
                    key={m.id}
                    meeting={m}
                    subtitle={usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`}
                  />
                ))}
              </View>
            )}

            {past.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Прошедшие</Text>
                {past.map(m => (
                  <MeetingItem
                    key={m.id}
                    meeting={m}
                    subtitle={usersMap[m.member_id]?.name ?? `Участник #${m.member_id}`}
                  />
                ))}
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
  content: { padding: 16, gap: 20, paddingBottom: 32 },
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
});
