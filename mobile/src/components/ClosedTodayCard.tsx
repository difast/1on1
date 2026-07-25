import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { getUserStats, getClosedTodayTasks } from '../lib/api';

/*
 * Счётчик «Закрыто сегодня» — сводная статистика по закрытым за текущий день
 * задачам. Роль учитывает бэкенд: участник видит свои, тимлид — по всей команде.
 * Обновляется реактивно: на монтировании, по refreshKey (после действий
 * пользователя на экране), и лёгким поллингом (закрытия других участников).
 * По нажатию — список соответствующих задач.
 */
export function ClosedTodayCard({
  userId, role, refreshKey = 0,
}: {
  userId: number;
  role?: string;
  refreshKey?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[] | null>(null);

  const load = useCallback(() => {
    getUserStats(userId).then(s => setCount(s.closed_today ?? 0)).catch(() => {});
  }, [userId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const openList = () => {
    setOpen(true);
    setList(null);
    getClosedTodayTasks(userId).then(setList).catch(() => setList([]));
  };

  const isLead = role === 'team_lead';

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={openList} activeOpacity={0.8}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-done" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Закрыто сегодня</Text>
          <Text style={styles.sub}>{isLead ? 'по команде' : 'мои задачи'}</Text>
        </View>
        <Text style={styles.count}>{count === null ? '—' : count}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Закрыто сегодня</Text>
            <Text style={styles.sheetSub}>{isLead ? 'Задачи, закрытые сегодня всей командой' : 'Ваши задачи, закрытые сегодня'}</Text>
            {list === null ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 24 }} />
            ) : list.length === 0 ? (
              <Text style={styles.empty}>Сегодня ещё нет закрытых задач</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {list.map(t => (
                  <View key={t.id} style={styles.row}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{t.title}</Text>
                      <Text style={styles.rowMeta}>
                        {t.completed_at ? new Date(t.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
                        {t.is_multi && t.progress ? ` · ${t.progress.done}/${t.progress.total} участников` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Закрыть</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    padding: 12,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 9, backgroundColor: c.success,
    alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: c.success, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 2,
  },
  title: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
  sub: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  count: { fontSize: 20, fontWeight: '800', color: c.success },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 400, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
  sheetSub: { fontSize: 12, color: c.textMuted, marginTop: 2, marginBottom: 12 },
  empty: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  rowMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  closeBtn: { marginTop: 12, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: c.accent },
  closeText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
