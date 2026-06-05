import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { getMemberAnalytics } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Spinner } from '../components/Spinner';

export default function MemberAnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const d = await getMemberAnalytics(user!.id) as any;
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {router.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Аналитика</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {!data ? (
          <View style={styles.emptyCard}>
            <Text style={styles.noData}>Нет данных</Text>
            <Text style={styles.noDataSub}>Данные появятся после первых встреч</Text>
          </View>
        ) : (
          <>
            {/* Summary stats */}
            <View style={styles.statsRow}>
              <StatCard label="Всего встреч" value={data.total_meetings ?? '—'} accent />
              <StatCard label="За 90 дней" value={data.meetings_last_90 ?? '—'} />
              <StatCard label="Задач выполнено" value={data.completed_tasks ?? '—'} />
            </View>

            {/* Task progress */}
            {data.task_completion_pct != null && (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Выполнение задач</Text>
                <View style={styles.progressRow}>
                  <Text style={styles.infoValue}>{data.task_completion_pct}%</Text>
                  <Text style={styles.infoSub}>
                    {data.open_tasks} открыто · {data.closed_last_30 ?? 0} закрыто за 30 дн.
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {
                    width: `${data.task_completion_pct}%` as any,
                    backgroundColor: colors.accent,
                  }]} />
                </View>
              </View>
            )}

            {/* Meeting activity */}
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Активность встреч</Text>
              <View style={styles.meetingRow}>
                <View style={styles.meetingItem}>
                  <Text style={styles.meetingNum}>{data.lead_initiated ?? 0}</Text>
                  <Text style={styles.meetingLabel}>Назначено тимлидом</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.meetingItem}>
                  <Text style={styles.meetingNum}>{data.member_initiated ?? 0}</Text>
                  <Text style={styles.meetingLabel}>Запрошено мной</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.meetingItem}>
                  <Text style={[styles.meetingNum, data.days_since_last != null && data.days_since_last >= 14 && { color: colors.danger }]}>
                    {data.days_since_last != null ? `${data.days_since_last} дн.` : '—'}
                  </Text>
                  <Text style={styles.meetingLabel}>С последней</Text>
                </View>
              </View>
            </View>

            {/* Mood trend */}
            {data.mood_trend && data.mood_trend.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Настроение на встречах</Text>
                <View style={styles.moodRow}>
                  {data.mood_trend.map((m: any, i: number) => (
                    <View key={i} style={styles.moodItem}>
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={styles.moodDate}>{m.date}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Weekly chart */}
            {data.meetings_per_week && data.meetings_per_week.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Встречи по неделям</Text>
                <BarChart data={data.meetings_per_week} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, accent }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BarChart({ data }: { data: any[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const max = Math.max(...data.map((d: any) => d.count ?? 0), 1);
  return (
    <View style={styles.chart}>
      {data.map((d: any, i: number) => (
        <View key={i} style={styles.chartBar}>
          <Text style={styles.chartCount}>{d.count > 0 ? d.count : ''}</Text>
          <View style={[
            styles.bar,
            {
              height: Math.max((d.count / max) * 60, d.count > 0 ? 4 : 0),
              backgroundColor: d.count > 0 ? colors.accent : colors.gray200,
              opacity: d.count > 0 ? 1 : 0.4,
            },
          ]} />
          <Text style={styles.chartLabel} numberOfLines={1}>{d.week}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  emptyCard: {
    backgroundColor: c.surface, borderRadius: 16,
    borderWidth: 1, borderColor: c.border,
    padding: 32, alignItems: 'center', gap: 8,
  },
  noData: { textAlign: 'center', color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  noDataSub: { textAlign: 'center', color: c.textMuted, fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14, alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', color: c.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoCard: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 16, gap: 10,
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  infoSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  progressBar: {
    height: 6, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  meetingRow: { flexDirection: 'row', alignItems: 'center' },
  meetingItem: { flex: 1, alignItems: 'center', gap: 4 },
  meetingNum: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  meetingLabel: { fontSize: 10, color: c.textMuted, textAlign: 'center' },
  divider: { width: 1, height: 32, backgroundColor: c.border },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  moodRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
  },
  moodItem: { alignItems: 'center', gap: 2, minWidth: 36 },
  moodEmoji: { fontSize: 22 },
  moodDate: { fontSize: 9, color: c.textMuted },
  chart: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
  },
  chartBar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: '100%' },
  chartCount: { fontSize: 10, fontWeight: '700', color: c.textMuted },
  bar: { width: '100%', borderRadius: 3 },
  chartLabel: { fontSize: 9, color: c.textMuted, maxWidth: 40 },
});
