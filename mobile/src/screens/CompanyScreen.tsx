// Компания рабочего пространства: просмотр, поиск по ИНН/БИН (DaData через
// бэкенд-прокси), ручной ввод и сохранение. Порт веб-логики CompanySearch.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { getTeams, getMemberTeam, getTeamCompany, suggestCompany, saveTeamCompany } from '../lib/api';

type Status = 'loading' | 'error' | 'view' | 'empty';

const EMPTY_FORM = {
  country: 'RU', source: 'manual', name: '', inn: '', kpp: '', ogrn: '',
  legal_address: '', industry: '', management: '', status: '', size: '', data: null as any,
};

const FIELD_DEFS: { key: keyof typeof EMPTY_FORM; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Название' },
  { key: 'inn', label: 'ИНН / БИН' },
  { key: 'kpp', label: 'КПП' },
  { key: 'ogrn', label: 'ОГРН' },
  { key: 'legal_address', label: 'Юридический адрес' },
  { key: 'industry', label: 'Отрасль' },
  { key: 'management', label: 'Руководитель' },
  { key: 'status', label: 'Статус' },
  { key: 'size', label: 'Размер (сотрудников)', numeric: true },
];

export default function CompanyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, activeRole } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<Status>('loading');
  const [teamId, setTeamId] = useState<number | null>(null);
  const [company, setCompany] = useState<any>(null);

  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) { setStatus('error'); return; }
      try {
        let tid: number | null = null;
        if ((activeRole ?? user.role) === 'team_lead') {
          const teams = await getTeams().catch(() => []);
          tid = ((teams as any[]) || []).filter((t: any) => t.team_lead_id === user.id)[0]?.id ?? null;
        } else {
          const team = await getMemberTeam(user.id).catch(() => null);
          tid = (team as any)?.id ?? null;
        }
        if (!alive) return;
        if (!tid) { setStatus('empty'); return; }
        setTeamId(tid);
        const res = await getTeamCompany(tid);
        if (!alive) return;
        if (res?.has_company && res?.company) { setCompany(res.company); setStatus('view'); }
        else setStatus('empty');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [user?.id, activeRole]);

  // Дебаунс-поиск (в режиме поиска, не в ручном вводе).
  useEffect(() => {
    if (!editing || manual) return;
    if (query.trim().length < 2) { setSuggestions([]); setSearched(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await suggestCompany(query.trim());
        setNotConfigured(data?.configured === false);
        setSuggestions(data?.suggestions || []);
        setSearched(true);
      } catch {
        setSuggestions([]); setSearched(true);
      } finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, editing, manual]);

  const startEdit = () => {
    if (company) {
      setForm({
        ...EMPTY_FORM, ...company,
        size: company.size != null ? String(company.size) : '',
        country: (company.country || 'RU').toUpperCase(),
      });
      setManual(true);
    } else {
      setForm({ ...EMPTY_FORM });
      setManual(false);
    }
    setQuery(''); setSuggestions([]); setSearched(false);
    setEditing(true);
  };

  const pick = (s: any) => {
    setForm({
      ...EMPTY_FORM,
      country: (s.country || 'RU').toUpperCase(), source: 'dadata',
      name: s.name || '', inn: s.inn || '', kpp: s.kpp || '', ogrn: s.ogrn || '',
      legal_address: s.legal_address || '', industry: s.industry || '',
      management: s.management || '', status: s.status || '', size: '', data: s.raw || null,
    });
    setManual(true);
  };

  const setField = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!teamId) return;
    if (!String(form.name || '').trim()) { Alert.alert('Проверьте данные', 'Название обязательно'); return; }
    setSaving(true);
    try {
      const payload = { ...form, size: form.size ? Number(form.size) : null };
      const res = await saveTeamCompany(teamId, payload);
      setCompany(res?.company || payload);
      setEditing(false); setManual(false);
      setStatus('view');
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить реквизиты');
    } finally { setSaving(false); }
  };

  const countryLabel = (c?: string) => (c === 'KZ' ? 'Казахстан' : c === 'RU' ? 'Россия' : c || '');

  const viewRows = company ? [
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
        <TouchableOpacity onPress={() => (editing ? setEditing(false) : router.back())} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Организация</Text>
        <View style={{ width: 24 }} />
      </View>

      {status === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>}
      {status === 'error' && <View style={styles.center}><Text style={styles.muted}>Не удалось загрузить. Попробуйте позже.</Text></View>}

      {(status === 'view' || status === 'empty') && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!editing && status === 'view' && (
            <>
              <View style={styles.card}>
                {viewRows.map((f, i) => (
                  <View key={f.label} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Text style={styles.rowLabel}>{f.label}</Text>
                    <Text style={styles.rowValue}>{`${f.value}`}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={startEdit}>
                <Text style={styles.primaryBtnText}>Редактировать</Text>
              </TouchableOpacity>
            </>
          )}

          {!editing && status === 'empty' && (
            <>
              <Text style={styles.muted}>Реквизиты компании не заполнены. Можно найти по ИНН/БИН или ввести вручную.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={startEdit}>
                <Text style={styles.primaryBtnText}>Добавить компанию</Text>
              </TouchableOpacity>
            </>
          )}

          {editing && !manual && (
            <>
              <Text style={styles.fieldLabel}>Поиск по названию, ИНН или БИН</Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Например: ИНН или название"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              {searching && <Text style={[styles.muted, { marginTop: 10 }]}>Поиск...</Text>}
              {!searching && searched && suggestions.length > 0 && suggestions.map((s, i) => (
                <TouchableOpacity key={i} style={styles.suggestion} onPress={() => pick(s)}>
                  <Text style={styles.suggestionName}>{s.name}</Text>
                  {(s.inn || s.legal_address) ? (
                    <Text style={styles.suggestionSub}>{[s.inn && `ИНН/БИН ${s.inn}`, s.legal_address].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              {!searching && (notConfigured || (searched && suggestions.length === 0)) && query.trim().length >= 2 && (
                <Text style={[styles.muted, { marginTop: 10 }]}>
                  {notConfigured ? 'Автопоиск недоступен. Введите реквизиты вручную.' : 'Ничего не найдено. Можно ввести вручную.'}
                </Text>
              )}
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setManual(true)}>
                <Text style={styles.secondaryBtnText}>Ввести вручную</Text>
              </TouchableOpacity>
            </>
          )}

          {editing && manual && (
            <>
              {FIELD_DEFS.map((f) => (
                <View key={f.key as string} style={{ marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>{f.label}{f.key === 'name' ? ' *' : ''}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(form[f.key] ?? '')}
                    onChangeText={(v) => setField(f.key as string, v)}
                    keyboardType={f.numeric ? 'number-pad' : 'default'}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              ))}
              <TouchableOpacity style={[styles.primaryBtn, saving && styles.btnDisabled]} onPress={handleSave} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? 'Сохранение...' : 'Сохранить'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditing(false)}>
                <Text style={styles.secondaryBtnText}>Отмена</Text>
              </TouchableOpacity>
            </>
          )}
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
  content: { padding: 16, paddingBottom: 60 },
  card: {
    backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, marginBottom: 14,
  },
  row: { paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 4 },
  rowValue: { fontSize: 15, color: c.textPrimary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary, backgroundColor: c.surface,
  },
  suggestion: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10,
    padding: 12, marginTop: 8,
  },
  suggestionName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  suggestionSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  primaryBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    marginTop: 10, backgroundColor: c.surface,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  btnDisabled: { opacity: 0.6 },
});
