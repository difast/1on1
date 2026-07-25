import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/theme';
import type { AppColors } from '../../constants/colors';
import { getManagers, createManager, updateManager, deleteManager, StaffMember } from '../../lib/api';

// Вкладка «Сотрудники» на мобильном (задача 2): полный CRUD над тем же реестром,
// что и в вебе. Роли согласованы с ролевой моделью продукта. Без эмодзи.
const ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'support', label: 'Поддержка' },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

type FormState = { name: string; role: string; email: string; contact: string; responsibility: string };
const EMPTY: FormState = { name: '', role: 'manager', email: '', contact: '', responsibility: '' };

export function EmployeesTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [list, setList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getManagers().then(setList).catch(() => setList([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setForm(EMPTY); };
  const startEdit = (e: StaffMember) => {
    setEditingId(e.id);
    setForm({
      name: e.name || '', role: e.role || 'manager', email: e.email || '',
      contact: e.contact || '', responsibility: e.responsibility || '',
    });
  };

  const save = async () => {
    if (!form.name.trim()) { Alert.alert('Проверьте форму', 'Укажите имя сотрудника'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateManager(editingId, form);
        setList(prev => prev.map(m => (m.id === editingId ? updated : m)));
      } else {
        const created = await createManager(form);
        setList(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      reset();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить сотрудника');
    } finally { setSaving(false); }
  };

  const remove = (e: StaffMember) => {
    Alert.alert('Удалить сотрудника?', `${e.name} будет снят со всех назначений. Действие необратимо.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          await deleteManager(e.id).catch(() => {});
          setList(prev => prev.filter(m => m.id !== e.id));
          if (editingId === e.id) reset();
        },
      },
    ]);
  };

  const field = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <View style={{ gap: 16 }}>
      {/* Форма */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editingId ? 'Изменить сотрудника' : 'Добавить сотрудника'}</Text>
        <Text style={styles.label}>Имя</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={t => field('name', t)}
          placeholder="Иван Петров" placeholderTextColor={colors.textMuted} />
        <Text style={styles.label}>Роль</Text>
        <View style={styles.roleRow}>
          {ROLES.map(r => (
            <TouchableOpacity key={r.value} onPress={() => field('role', r.value)}
              style={[styles.roleChip, form.role === r.value && styles.roleChipActive]}>
              <Text style={[styles.roleChipText, form.role === r.value && styles.roleChipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={form.email} onChangeText={t => field('email', t)}
          placeholder="ivan@company.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" />
        <Text style={styles.label}>Контакт</Text>
        <TextInput style={styles.input} value={form.contact} onChangeText={t => field('contact', t)}
          placeholder="Telegram, телефон" placeholderTextColor={colors.textMuted} />
        <Text style={styles.label}>Зона ответственности</Text>
        <TextInput style={[styles.input, { height: 64, textAlignVertical: 'top' }]} value={form.responsibility}
          onChangeText={t => field('responsibility', t)} placeholder="Например: клиенты Enterprise" placeholderTextColor={colors.textMuted} multiline />
        {/* Порядок: основное действие первым, отмена — второй (задача 4). */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 2 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.primaryBtnText}>{editingId ? 'Сохранить' : 'Добавить'}</Text>}
          </TouchableOpacity>
          {editingId && (
            <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={reset} disabled={saving}>
              <Text style={styles.secondaryBtnText}>Отмена</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Список */}
      <Text style={styles.sectionLabel}>Сотрудники ({list.length})</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 24 }} />
      ) : list.length === 0 ? (
        <Text style={styles.empty}>Сотрудников пока нет. Добавьте первого в форме выше.</Text>
      ) : (
        list.map(e => (
          <View key={e.id} style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name}>{e.name}</Text>
                <Text style={styles.roleTag}>{ROLE_LABEL[e.role || 'manager'] || e.role}</Text>
                {!!e.responsibility && <Text style={styles.meta}>{e.responsibility}</Text>}
                {!!e.email && <Text style={styles.meta}>Email: {e.email}</Text>}
                {!!e.contact && <Text style={styles.meta}>Контакт: {e.contact}</Text>}
              </View>
              <TouchableOpacity onPress={() => startEdit(e)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={18} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(e)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: c.textPrimary, backgroundColor: c.bg,
  },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  roleChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  roleChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  roleChipTextActive: { color: '#fff' },
  primaryBtn: { backgroundColor: c.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryBtn: { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: c.textSecondary, fontSize: 14, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  roleTag: { fontSize: 12, fontWeight: '600', color: c.accent, marginTop: 2 },
  meta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  iconBtn: { padding: 6 },
  empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginVertical: 20 },
});
