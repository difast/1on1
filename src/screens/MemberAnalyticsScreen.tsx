import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { getMemberAnalytics } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Spinner } from '../components/Spinner';

export default function MemberAnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const d = await getMemberAnalytics(user!.id);
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
            <View style={styles.statsRow}>
              <StatCard label="Всего встреч" value={data.total_meetings ?? '—'} accent />
              <StatCard label="За этот месяц" value={data.meetings_this_month ?? '—'} />
              <StatCard label="Выполнено задач" value={data.completed_tasks ?? '—'} />
            </View>

            {data.last_meeting_date && (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Последняя встреча</Text>
                <Text style={styles.infoValue}>
                  {new Date(data.last_meeting_date).toLocaleDateString('ru-RU', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </Text>
              </View>
            )}

            {data.next_meeting_date && (
              <View style={[styles.infoCard, { borderColor: colors.blue200, backgroundColor: colors.blue50 }]}>
                <Text style={[styles.infoLabel, { color: colors.accent }]}>Следующая встреча</Text>
                <Text style={[styles.infoValue, { color: colors.accent }]}>
                  {new Date(data.next_meeting_date).toLocaleDateString('ru-RU', {
                    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, accent }: any) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  noData: { textAlign: 'center', color: c.textMuted, fontSize: 14, paddingTop: 48 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  statLabel: {
    fontSize: 10, fontWeight: '600', color: c.textMuted,
    textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  infoCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
  },
  infoLabel: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  infoValue: { fontSize: 16, fontWeight: '600', color: c.textPrimary },
});
