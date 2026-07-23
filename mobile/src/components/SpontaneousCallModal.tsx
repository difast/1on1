import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { startSpontaneousCall } from '../lib/api';

/*
 * Спонтанный созвон по кнопке (39.8): выбор режима — всем, нескольким или
 * индивидуально; мгновенное создание комнаты и рассылка приглашений. Сам звонок
 * открывается внешним клиентом по ссылке (согласно таблице разделения).
 */
export function SpontaneousCallModal({
  visible, onClose, leadId, teamId, members, onStarted,
}: {
  visible: boolean;
  onClose: () => void;
  leadId: number;
  teamId: number | null;
  members: { user_id: number; name: string }[];
  onStarted?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'type' | 'select' | 'done'>('type');
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ room_url: string } | null>(null);

  const reset = () => { setStep('type'); setSelected([]); setResult(null); setLoading(false); };
  const close = () => { reset(); onClose(); };

  const start = async (memberIds: number[], isGroup: boolean) => {
    if (!teamId) { Alert.alert('Ошибка', 'Нет команды'); return; }
    if (memberIds.length === 0) { Alert.alert('Выберите участников'); return; }
    setLoading(true);
    try {
      const data = await startSpontaneousCall({ lead_id: leadId, team_id: teamId, member_ids: memberIds, is_group: isGroup });
      setResult({ room_url: data.room_url });
      setStep('done');
      onStarted?.();
    } catch { Alert.alert('Ошибка', 'Не удалось создать созвон'); }
    finally { setLoading(false); }
  };

  const allIds = members.map(m => m.user_id);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Быстрый созвон</Text>
          <TouchableOpacity onPress={close} hitSlop={8}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {step === 'type' && (
            <>
              <Text style={styles.hint}>Выберите тип созвона:</Text>
              <TouchableOpacity style={styles.optPrimary} disabled={loading} onPress={() => start(allIds, true)}>
                <Ionicons name="people" size={20} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optPrimaryTitle}>Общий созвон</Text>
                  <Text style={styles.optPrimarySub}>Вся команда получит приглашение ({members.length})</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.opt} disabled={loading} onPress={() => { setSelected([]); setStep('select'); }}>
                <Ionicons name="people-outline" size={20} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optTitle}>Несколько участников</Text>
                  <Text style={styles.optSub}>Выбрать нескольких из команды</Text>
                </View>
              </TouchableOpacity>
              {members.map(m => (
                <TouchableOpacity key={m.user_id} style={styles.opt} disabled={loading} onPress={() => start([m.user_id], false)}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{(m.name || '?').charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optTitle}>Индивидуально: {m.name}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />}
            </>
          )}

          {step === 'select' && (
            <>
              <TouchableOpacity onPress={() => setStep('type')}><Text style={styles.back}>Назад</Text></TouchableOpacity>
              <Text style={styles.hint}>Отметьте участников:</Text>
              {members.map(m => {
                const on = selected.includes(m.user_id);
                return (
                  <TouchableOpacity key={m.user_id} style={[styles.opt, on && styles.optOn]} onPress={() => setSelected(s => on ? s.filter(x => x !== m.user_id) : [...s, m.user_id])}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.accent : colors.textMuted} />
                    <Text style={styles.optTitle}>{m.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.startBtn} disabled={loading || selected.length === 0} onPress={() => start(selected, selected.length > 1)}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.startText}>Начать созвон{selected.length ? ` (${selected.length})` : ''}</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 'done' && result && (
            <View style={{ gap: 14, alignItems: 'center', paddingTop: 20 }}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <Text style={styles.doneTitle}>Созвон создан</Text>
              <Text style={styles.hint}>Приглашения отправлены. Откройте комнату:</Text>
              <TouchableOpacity style={styles.startBtn} onPress={() => { Linking.openURL(result.room_url).catch(() => {}); }}>
                <Text style={styles.startText}>Войти в созвон</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close}><Text style={styles.back}>Закрыть</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  hint: { fontSize: 13, color: c.textSecondary },
  optPrimary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.accent, borderRadius: 12, padding: 14 },
  optPrimaryTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  optPrimarySub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: 12, padding: 14 },
  optOn: { borderColor: c.accent, backgroundColor: c.accentLight },
  optTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  optSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: c.accent },
  back: { fontSize: 13, color: c.accent, fontWeight: '600' },
  startBtn: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minWidth: 200 },
  startText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  doneTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
});
