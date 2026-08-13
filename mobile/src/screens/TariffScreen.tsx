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

import { useI18n } from '../lib/i18n';
import { KeyboardAwareScroll } from '../components/KeyboardAvoider';
type Status = 'loading' | 'error' | 'ready';

// Запасные подписи: обычно название и цену тарифа отдаёт бэкенд
// (/billing/me -> plan_name, price_label, users_label), это тот же каталог,
// что у веба и лендинга. Локальная карта нужна только на случай старого ответа.
const PLAN_NAMES: Record<string, string> = {
  free: 'Без подписки', start: 'Start', team: 'Team', business: 'Business',
  company: 'Business', enterprise: 'Enterprise', unlimited: 'Полный доступ',
};
const PLAN_PRICES: Record<string, string> = {
  start: '1 490 ₽/мес', team: '49 990 ₽/год',
  business: 'Цена договорная', enterprise: 'цена по запросу',
};
const SUB_STATUS: Record<string, string> = {
  free: 'Без подписки', trialing: 'Пробный период', active: 'Активна',
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
  const { t } = useI18n();
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
  const planName = data?.plan_name || PLAN_NAMES[data?.plan_code] || (data?.plan_code || '');
  const priceLabel = data?.price_label || PLAN_PRICES[data?.plan_code] || '';
  // ONE AI и Развитие закрыты на пробном периоде Team — показываем это прямо
  // на экране тарифа, чтобы отсутствие разделов не выглядело сбоем.
  const trialLocked: string[] = data?.trial_restricted_features || [];

  const limitRows: { label: string; value: string }[] = [
    { label: t('ui.polzovateley'), value: data?.users_label || limitValue(limits.max_users ?? limits.max_members_per_team) },
    { label: t('ui.komandy'), value: limitValue(limits.max_teams) },
    { label: t('ui.vstrech_v_mesyac'), value: limitValue(limits.max_meetings_per_month) },
    { label: t('ui.istoriya_dney'), value: limitValue(limits.history_days) },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('ui.moy_tarif')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {status === 'loading' && (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      )}
      {status === 'error' && (
        <View style={styles.center}><Text style={styles.muted}>{t('ui.ne_udalos_zagruzit_tarif_poprobuyte_pozzhe')}</Text></View>
      )}

      {status === 'ready' && (
        <KeyboardAwareScroll contentContainerStyle={styles.content}>
          <View style={styles.planCard}>
            <Text style={styles.planLabel}>{t('ui.tekuschiy_tarif')}</Text>
            <Text style={styles.planName}>{planName}</Text>
            {priceLabel && !data?.full_access_override ? (
              <Text style={styles.planPrice}>{priceLabel}</Text>
            ) : null}
            {data?.full_access_override ? (
              <Text style={styles.planSub}>{t('ui.polnyy_dostup_predostavlen')}</Text>
            ) : sub ? (
              <Text style={styles.planSub}>
                {SUB_STATUS[sub.status] ?? sub.status}
                {sub.current_period_end ? t('ui.do_3', { v1: fmtDate(sub.current_period_end) }) : ''}
              </Text>
            ) : data?.trial_until ? (
              <Text style={styles.planSub}>
                {data?.trial_expired ? t('ui.probnyy_period_istek') : t('ui.probnyy_period_do', { v1: fmtDate(data.trial_until) })}
              </Text>
            ) : null}
          </View>

          {trialLocked.length > 0 && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>{t('ui.na_probnom_periode_tarifa_team_nedostupny_2')}</Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>{t('ui.limity_tarifa')}</Text>
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
              <Text style={styles.sectionLabel}>{t('ui.ispolzovanie_v_etom_mesyace')}</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('ui.vstrech_sozdano')}</Text>
                  <Text style={styles.rowValue}>{data.usage.meetings_this_month}</Text>
                </View>
              </View>
            </>
          )}

          {sub?.manager_name ? (
            <>
              <Text style={styles.sectionLabel}>{t('ui.personalnyy_menedzher')}</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{sub.manager_name}</Text>
                  {sub.manager_contact ? <Text style={styles.rowValue}>{sub.manager_contact}</Text> : null}
                </View>
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>{t('ui.tarify')}</Text>
          <View style={styles.card}>
            {[
              { name: 'Start', price: t('ui.1_990_mes'), users: t('ui.do_8_polzovateley_1_komanda') },
              { name: 'Team', price: `${t('ui.4_990_mes')} / ${t('ui.49_990_god')}`, users: t('ui.do_30_polzovateley_1_komanda') },
              { name: 'Business', price: t('ui.9_990_mes'), users: t('ui.do_80_polzovateley') },
              { name: 'Enterprise', price: t('ui.cena_po_zaprosu'), users: t('ui.bez_ogranicheniy') },
            ].map((p, i) => (
              <View key={p.name} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{p.name}</Text>
                  <Text style={styles.rowHint}>{p.users}</Text>
                </View>
                <Text style={styles.rowValue}>{p.price}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.note}>{t('ui.avtotranskripciya_vstrech_poka_nedostupna_skor')}</Text>
        </KeyboardAwareScroll>
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
  planPrice: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.95)', marginTop: 6 },
  planSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  noticeCard: {
    backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
    padding: 14, marginBottom: 18,
  },
  noticeText: { fontSize: 13, lineHeight: 19, color: c.textSecondary },
  rowHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
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
