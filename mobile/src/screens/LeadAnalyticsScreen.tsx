import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getLeadAnalytics, assistantChat } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';

function RiskSignalCard({ signal, colors }: { signal: any; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [advice, setAdvice] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const variant = getFlagVariant(signal);
  const tint = variant === 'red' ? '#ef4444' : variant === 'amber' ? '#f59e0b' : colors.textMuted;

  const getAdvice = async () => {
    if (advice) { setAdvice(''); return; }
    setLoading(true);
    try {
      const prompt = `Тимлид видит сигнал риска по участнику "${signal.member_name}": ${getFlagDesc(signal)}. `
        + `Дай 3 коротких конкретных совета, как помочь участнику и снизить риск выгорания. Только пункты, без вступления.`;
      const res = await assistantChat([{ role: 'user', content: prompt }]) as any;
      setAdvice(res.reply ?? 'Не удалось получить совет.');
    } catch { setAdvice('Не удалось получить совет. Попробуйте позже.'); }
    finally { setLoading(false); }
  };

  return (
    <View style={[styles.riskCard, { borderLeftColor: tint }]}>
      <View style={styles.riskTop}>
        <View style={[styles.riskIcon, { backgroundColor: tint + '1A' }]}>
          <Ionicons name="alert-circle" size={18} color={tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.riskMember}>{signal.member_name}</Text>
          <Text style={styles.riskDesc}>{getFlagDesc(signal)}</Text>
        </View>
        <StatusBadge label={getFlagLabel(signal)} variant={variant} />
      </View>
      <TouchableOpacity style={styles.aiBtn} onPress={getAdvice} disabled={loading} activeOpacity={0.8}>
        {loading
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name="sparkles" size={14} color={colors.accent} />}
        <Text style={styles.aiBtnText}>{advice ? 'Скрыть совет' : loading ? 'AI думает...' : 'Совет от AI'}</Text>
      </TouchableOpacity>
      {!!advice && (
        <View style={styles.aiBox}>
          <Text style={styles.aiText}>{advice}</Text>
        </View>
      )}
    </View>
  );
}

export default function LeadAnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(0);

  const load = async () => {
    try {
      const d = await getLeadAnalytics(user!.id) as any;
      setData(d);
    } catch { setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <Spinner />;

  const teams: any[] = data?.teams ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.navigate('/(tabs)/profile' as any)}
          style={{ marginRight: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Аналитика</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {teams.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.noData}>Нет данных для отображения.</Text>
            <Text style={styles.noDataSub}>Создайте команду и проведите встречи.</Text>
          </View>
        ) : (
          <>
            {/* Team selector */}
            {teams.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {teams.map((t: any, i: number) => (
                    <TouchableOpacity
                      key={t.team_id}
                      style={[styles.teamChip, i === selectedTeam && styles.teamChipActive]}
                      onPress={() => setSelectedTeam(i)}
                    >
                      <Text style={[styles.teamChipText, i === selectedTeam && styles.teamChipTextActive]}>
                        {t.team_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {teams[selectedTeam] && <TeamStats team={teams[selectedTeam]} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TeamStats({ team }: { team: any }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const members: any[] = team.member_stats ?? [];
  const signals: any[] = team.warning_signals ?? [];

  return (
    <>
      {/* Summary */}
      <View style={styles.statsRow}>
        <StatCard label="Всего встреч" value={team.total_meetings ?? '—'} accent />
        <StatCard label="Участников" value={members.length} />
        <StatCard
          label="Под риском"
          value={(team.at_risk_members ?? []).length}
          danger={(team.at_risk_members ?? []).length > 0}
        />
      </View>

      {team.avg_interval_days != null && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Средний интервал между встречами</Text>
          <Text style={styles.infoValue}>{team.avg_interval_days} дн.</Text>
        </View>
      )}

      {/* Risk signals */}
      {signals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.riskHeader}>
            <Ionicons name="warning-outline" size={16} color="#ef4444" />
            <Text style={styles.riskHeaderText}>Зоны риска · выгорание</Text>
            <View style={styles.riskCountBadge}><Text style={styles.riskCountText}>{signals.length}</Text></View>
          </View>
          {signals.map((s: any, i: number) => (
            <RiskSignalCard key={i} signal={s} colors={colors} />
          ))}
        </View>
      )}

      {/* Member stats */}
      {members.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Участники</Text>
          {members.map((ms: any) => (
            <View key={ms.user_id} style={styles.memberStat}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{ms.name}</Text>
                <Text style={styles.memberMeta}>
                  За 30 дн: {ms.meetings_last_30 ?? 0} встреч ·{' '}
                  {ms.days_since_last != null
                    ? `${ms.days_since_last} дн. назад`
                    : 'встреч не было'}
                </Text>
                {ms.task_completion_pct != null && (
                  <Text style={styles.memberMeta}>
                    Задачи: {ms.task_completion_pct}% выполнено ({ms.open_tasks} открыто)
                  </Text>
                )}
              </View>
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                {(ms.warning_flags ?? []).map((f: string, i: number) => (
                  <StatusBadge
                    key={i}
                    label={getFlagLabel({ type: f, days: ms.days_since_last, count: ms.open_tasks })}
                    variant={getFlagVariant({ type: f })}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Mood drop alerts */}
      {signals.filter((s: any) => s.type === 'mood_declining').length > 0 && (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠️ Снижение настроения</Text>
          {signals.filter((s: any) => s.type === 'mood_declining').map((s: any, i: number) => (
            <Text key={i} style={styles.alertText}>• {s.member_name} — негативный тренд</Text>
          ))}
        </View>
      )}

      {/* Mood sparklines per member */}
      {members.some((ms: any) => (ms.mood_trend ?? []).length > 1) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Тренд настроения (12 встреч)</Text>
          {members.filter((ms: any) => (ms.mood_trend ?? []).length > 1).map((ms: any) => (
            <View key={ms.user_id} style={styles.moodRow}>
              <Text style={styles.moodName}>{ms.name}</Text>
              <MoodSparkline trend={ms.mood_trend ?? []} />
            </View>
          ))}
        </View>
      )}

      {/* По таблице разделения функционала приложение показывает только сводку
          (цифры), без графиков. Полные графики — в веб-версии. */}
    </>
  );
}

function StatCard({ label, value, accent, danger }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

function MoodSparkline({ trend }: { trend: string[] }) {
  const { colors } = useTheme();
  const last12 = trend.slice(-12);
  const moodColor = (m: string) => m === 'good' ? '#1D9E75' : m === 'bad' ? '#E24B4A' : '#D0CEC7';
  const moodH = (m: string) => m === 'good' ? 28 : m === 'bad' ? 8 : 16;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 32 }}>
      {last12.map((m, i) => (
        <View key={i} style={{ flex: 1, height: moodH(m), backgroundColor: moodColor(m), borderRadius: 3, maxWidth: 18 }} />
      ))}
    </View>
  );
}

function getFlagDesc(s: any): string {
  if (s.type === 'no_meeting_14_days') return `${s.days ?? '14+'} дн. без встречи`;
  if (s.type === 'mood_declining') return 'Настроение ухудшается';
  if (s.type === 'many_incomplete_tasks') return `${s.count} незакрытых задач`;
  return s.type;
}

function getFlagLabel(s: any): string {
  if (s.type === 'no_meeting_14_days') return 'Нет встречи';
  if (s.type === 'mood_declining') return 'Настроение ↓';
  if (s.type === 'many_incomplete_tasks') return 'Задачи';
  return s.type;
}

function getFlagVariant(s: any): 'red' | 'amber' | 'gray' {
  if (s.type === 'no_meeting_14_days') return 'red';
  return 'amber';
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  emptyCard: {
    backgroundColor: c.surface, borderRadius: 16,
    borderWidth: 1, borderColor: c.border,
    padding: 32, alignItems: 'center', gap: 8,
  },
  noData: { textAlign: 'center', color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  noDataSub: { textAlign: 'center', color: c.textMuted, fontSize: 13 },

  teamChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border,
  },
  teamChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  teamChipText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
  teamChipTextActive: { color: '#fff' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14, alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', color: c.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },

  infoCard: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 16,
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { fontSize: 18, fontWeight: '600', color: c.textPrimary },

  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  signalRow: {
    backgroundColor: c.dangerBg, borderRadius: 12,
    borderWidth: 1, borderColor: '#FCA5A5',
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  riskHeaderText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
  riskCountBadge: { backgroundColor: '#fee2e2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  riskCountText: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  riskCard: {
    backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
    borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 10,
  },
  riskTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  riskIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  riskMember: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
  riskDesc: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: c.accent, backgroundColor: c.accentLight,
    borderRadius: 10, paddingVertical: 9,
  },
  aiBtnText: { fontSize: 13, fontWeight: '700', color: c.accent },
  aiBox: { backgroundColor: c.surface2, borderRadius: 10, padding: 12 },
  aiText: { fontSize: 13, lineHeight: 20, color: c.textPrimary },
  signalMember: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  signalDesc: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  memberStat: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  memberName: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  memberMeta: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

  alertCard: {
    backgroundColor: '#FEF3C7', borderRadius: 12,
    borderWidth: 1, borderColor: '#FCD34D', padding: 14, gap: 6,
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  alertText: { fontSize: 12, color: '#B45309' },

  moodRow: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12, gap: 8,
  },
  moodName: { fontSize: 13, fontWeight: '500', color: c.textSecondary },

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
