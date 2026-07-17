// Просмотр реквизитов компании рабочего пространства (только чтение).
// Поиск по ИНН/БИН и редактирование — на вебе (по таблице разграничения).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { getTeams, getMemberTeam, getTeamCompany } from '../lib/api';

type Status = 'loading' | 'empty' | 'error' | 'ready';

export default function CompanyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, activeRole } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { setStatus('empty'); return; }
      try {
        let teamId: number | null = null;
        if ((activeRole ?? user.role) === 'team_lead') {
          const teams = await getTeams().catch(() => []);
          const mine = (teams || []).filter((t: any) => t.team_lead_id === user.id);
          teamId = mine[0]?.id ?? null;
        } else {
          const team = await getMemberTeam(user.id).catch(() => null);
          teamId = (team as any)?.id ?? null;
        }
        if (!teamId) { if (alive) setStatus('empty'); return; }
        const res = await getTeamCompany(teamId);
        if (!alive) return;
        if (res?.has_company && res?.company) { setCompany(res.company); setStatus('ready'); }
        else setStatus('empty');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [user?.id, activeRole]);

  const countryLabel = (c?: string) => (c === 'KZ' ? 'Казахстан' : c === 'RU' ? 'Россия' : c || '');

  const fields: { label: string; value?: string | number }[] = company ? [
    { label: 'Название', value: company.name },
    { label: 'Страна', value: countryLabel(company.country) },
    { label: 'ИНН / БИН', value: company.inn },
    { label: 'КПП', value: company.kpp },
    { label: 'ОГРН', value: company.ogrn },
    { label: 'Юридический адрес', value: company.legal_address },
    { label: 'Отрасль', value: company.industry },
    { label: 'Руководитель', value: company.management },
    { label: 'Статус', value: company.status },
    { label: 'Размер (сотрудников)', value: company.size },
  ].filter((f) => f.value !== null && f.value !== undefined && `${f.value}`.length > 0) : [];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Организация</Text>
        <View style={{ width: 24 }} />
      </View>

      {status === 'loading' && (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      )}

      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.muted}>Не удалось загрузить данные. Попробуйте позже.</Text>
        </View>
      )}

      {status === 'empty' && (
        <View style={styles.center}>
          <Ionicons name="business-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.muted, { marginTop: 12, textAlign: 'center' }]}>
            Реквизиты компании не заполнены. Добавить и отредактировать их можно в веб-версии.
          </Text>
        </View>
      )}

      {status === 'ready' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            {fields.map((f, i) => (
              <View key={f.label} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Text style={styles.rowLabel}>{f.label}</Text>
                <Text style={styles.rowValue}>{`${f.value}`}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            Изменить реквизиты можно в веб-версии, в разделе «Организация».
          </Text>
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
  muted: { fontSize: 14, color: c.textMuted },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16,
  },
  row: { paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 4 },
  rowValue: { fontSize: 15, color: c.textPrimary },
  note: { fontSize: 12, color: c.textMuted, marginTop: 14, paddingHorizontal: 4 },
});
