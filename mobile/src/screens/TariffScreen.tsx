// Просмотр текущего тарифа: план, статус, лимиты, срок/пробный период.
// Оплата и смена тарифа — на вебе (на мобиле оплаты нет, по таблице).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { getBillingMe } from '../lib/api';

type Status = 'loading' | 'error' | 'ready';

const PLAN_NAMES: Record<string, string> = {
  free: 'Free', start: 'Старт', team: 'Команда', company: 'Компания',
  enterprise: 'Enterprise', unlimited: 'Полный доступ',
};
const SUB_STATUS: Record<string, string> = {
  free: 'Бесплатный', trialing: 'Пробный период', active: 'Активна',
  past_due: 'Ожидает оплаты', canceled: 'Отменена',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('ru-RU'); } catch { return ''; }
}
function limitValue(v: any) {
  return v === null || v === undefined ? 'без ограничений' : `${v}`;
}

export default function TariffScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { setStatus('error'); return; }
      try {
        const res = await getBillingMe(user.id);
        if (!alive) return;
        setData(res); setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const limits = data?.limits || {};
  const sub = data?.subscription;
  const planName = PLAN_NAMES[data?.plan_code] ?? (data?.plan_code || '');

  const limitRows: { label: string; value: string }[] = [
    { label: 'Команды', value: limitValue(limits.max_teams) },
    { label: 'Участников в команде', value: limitValue(limits.max_members_per_team) },
    { label: 'Встреч в месяц', value: limitValue(limits.max_meetings_per_month) },
    { label: 'История, дней', value: limitValue(limits.history_days) },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Мой тариф</Text>
        <View style={{ width: 24 }} />
      </View>

      {status === 'loading' && (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      )}
      {status === 'error' && (
        <View style={styles.center}><Text style={styles.muted}>Не удалось загрузить тариф. Попробуйте позже.</Text></View>
      )}

      {status === 'ready' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.planCard}>
            <Text style={styles.planLabel}>Текущий тариф</Text>
            <Text style={styles.planName}>{planName}</Text>
            {data?.full_access_override ? (
              <Text style={styles.planSub}>Полный доступ предоставлен</Text>
            ) : sub ? (
              <Text style={styles.planSub}>
                {SUB_STATUS[sub.status] ?? sub.status}
                {sub.current_period_end ? ` · до ${fmtDate(sub.current_period_end)}` : ''}
              </Text>
            ) : data?.free_until ? (
              <Text style={styles.planSub}>
                {data?.free_expired ? 'Пробный период истёк' : `Пробный период до ${fmtDate(data.free_until)}`}
              </Text>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Лимиты тарифа</Text>
          <View style={styles.card}>
            {limitRows.map((r, i) => (
              <View key={r.label} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          {data?.usage?.meetings_this_month !== undefined && (
            <>
              <Text style={styles.sectionLabel}>Использование в этом месяце</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Встреч создано</Text>
                  <Text style={styles.rowValue}>{data.usage.meetings_this_month}</Text>
                </View>
              </View>
            </>
          )}

          {sub?.manager_name ? (
            <>
              <Text style={styles.sectionLabel}>Персональный менеджер</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{sub.manager_name}</Text>
                  {sub.manager_contact ? <Text style={styles.rowValue}>{sub.manager_contact}</Text> : null}
                </View>
              </View>
            </>
          ) : null}

          <Text style={styles.note}>Сменить тариф и оплатить можно в веб-версии.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { width: 24, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { fontSize: 14, color: c.textMuted, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  planCard: {
    backgroundColor: c.accent, borderRadius: 16, padding: 20, marginBottom: 20,
  },
  planLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginBottom: 6 },
  planName: { fontSize: 26, fontWeight: '800', color: '#fff' },
  planSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, marginBottom: 18,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { fontSize: 14, color: c.textSecondary, flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: c.textPrimary, textAlign: 'right' },
  note: { fontSize: 12, color: c.textMuted, marginTop: 2, paddingHorizontal: 4 },
});
