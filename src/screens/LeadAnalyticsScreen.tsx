import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getLeadAnalytics } from '../lib/api';
import { colors } from '../constants/colors';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';

export default function LeadAnalyticsScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const d = await getLeadAnalytics(user!.id);
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Аналитика</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {!data ? (
          <Text style={styles.noData}>Нет данных для отображения</Text>
        ) : (
          <>
            {/* Summary stats */}
            <View style={styles.statsRow}>
              <StatCard label="Встреч за месяц" value={data.meetings_this_month ?? '—'} accent />
              <StatCard label="Участников" value={data.total_members ?? '—'} />
              <StatCard label="Без встречи" value={data.members_without_meeting ?? '—'} danger={!!data.members_without_meeting} />
            </View>

            {/* Members with flags */}
            {data.member_stats && data.member_stats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Статус участников</Text>
                {data.member_stats.map((ms: any) => (
                  <View key={ms.member_id} style={styles.memberStat}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{ms.name}</Text>
                      <Text style={styles.memberMeta}>
                        Встреч: {ms.meetings_count ?? 0} ·{' '}
                        Последняя: {ms.last_meeting_date
                          ? new Date(ms.last_meeting_date).toLocaleDateString('ru-RU')
                          : 'никогда'}
                      </Text>
                    </View>
                    <View style={{ gap: 4, alignItems: 'flex-end' }}>
                      {(ms.flags || []).map((f: any, i: number) => (
                        <StatusBadge
                          key={i}
                          label={getFlagLabel(f)}
                          variant={getFlagVariant(f)}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Weekly meetings chart */}
            {data.meetings_by_week && data.meetings_by_week.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Встречи по неделям</Text>
                <BarChart data={data.meetings_by_week} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, accent, danger }: any) {
  return (
    <View style={styles.statCard}>
      <Text style={[
        styles.statValue,
        accent && { color: colors.accent },
        danger && { color: colors.danger },
      ]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BarChart({ data }: { data: any[] }) {
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

function getFlagLabel(flag: any): string {
  if (flag.type === 'no_meeting_14_days') return `${flag.days ?? '14+'} дн. без встречи`;
  if (flag.type === 'mood_declining') return 'Настроение ↓';
  if (flag.type === 'many_incomplete_tasks') return `${flag.count} задач незакрыто`;
  return flag.type;
}

function getFlagVariant(flag: any): 'red' | 'amber' | 'gray' {
  if (flag.type === 'no_meeting_14_days') return 'red';
  return 'amber';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  noData: { textAlign: 'center', color: colors.textMuted, fontSize: 14, paddingTop: 48 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  memberStat: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  memberName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  memberMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 100,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    height: '100%',
  },
  chartCount: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  bar: { width: '100%', borderRadius: 3 },
  chartLabel: { fontSize: 9, color: colors.textMuted, maxWidth: 40 },
});
