import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { DateTimePickerField } from './DateTimePickerField';
import { getProposals, createProposal, acceptProposal, declineProposal, counterProposal } from '../lib/api';

const STATUS_LABEL: Record<string, string> = { pending: 'Ожидает ответа', accepted: 'Принято', declined: 'Отклонено' };
const ACTION_LABEL: Record<string, string> = { proposed: 'предложил(а) встречу', countered: 'предложил(а) другое время', accepted: 'принял(а)', declined: 'отклонил(а)' };
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/*
 * Предложения встреч в приложении (Задача 5): отдельный от прямого создания
 * встречи флоу с подтверждением. Инициатор предлагает время, получатель
 * принимает / отклоняет / предлагает другое время (цикл переговоров). Встреча
 * создаётся только после принятия — на бэкенде.
 */
export function MeetingProposalsModal({
  visible, onClose, currentUser, contacts, teamId, onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: { id: number };
  contacts: { user_id: number; name: string }[];
  teamId?: number | null;
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<'inbox' | 'all' | 'new'>('inbox');
  const [proposals, setProposals] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [counterFor, setCounterFor] = useState<number | null>(null);
  const [counterTime, setCounterTime] = useState('');

  // Форма создания
  const [toUser, setToUser] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [when, setWhen] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    getProposals(currentUser.id).then(p => setProposals(p || [])).catch(() => setProposals([]));
  };
  useEffect(() => { if (visible) load(); }, [visible, currentUser.id]);

  const awaitingMe = (p: any) => p.status === 'pending' && p.awaiting_user_id === currentUser.id;
  const incoming = (proposals || []).filter(awaitingMe);
  const mine = (proposals || []).filter(p => !awaitingMe(p));

  const act = async (fn: (id: number, uid: number) => Promise<any>, id: number) => {
    setBusyId(id);
    try { await fn(id, currentUser.id); load(); onChanged?.(); }
    catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось выполнить'); }
    finally { setBusyId(null); }
  };

  const doCounter = async (id: number) => {
    if (!counterTime) { Alert.alert('Укажите время', 'Выберите новое время встречи'); return; }
    setBusyId(id);
    try {
      await counterProposal(id, currentUser.id, counterTime);
      setCounterFor(null); setCounterTime(''); load(); onChanged?.();
    } catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось отправить'); }
    finally { setBusyId(null); }
  };

  const submitNew = async () => {
    if (!toUser) { Alert.alert('Выберите получателя'); return; }
    if (!when) { Alert.alert('Укажите время'); return; }
    setCreating(true);
    try {
      await createProposal({ from_user_id: currentUser.id, to_user_id: toUser, proposed_time: when, topic: topic.trim() || null, team_id: teamId ?? null });
      setToUser(null); setTopic(''); setWhen('');
      setTab('all'); load(); onChanged?.();
    } catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось отправить предложение'); }
    finally { setCreating(false); }
  };

  const renderCard = (p: any) => {
    const mineTurn = awaitingMe(p);
    const badgeColor = p.status === 'accepted' ? colors.success : p.status === 'declined' ? colors.danger : colors.warning;
    return (
      <View key={p.id} style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>
            {p.from_user_id === currentUser.id ? `Вы -> ${p.to_user_name || 'Участник'}` : `${p.from_user_name || 'Участник'} -> вам`}
          </Text>
          <Text style={[styles.badge, { color: badgeColor }]}>{mineTurn ? 'Ваш ход' : (STATUS_LABEL[p.status] || p.status)}</Text>
        </View>
        {!!p.topic && <Text style={styles.cardTopic}>{p.topic}</Text>}
        <Text style={styles.cardTime}>Время: {fmt(p.proposed_time)}</Text>

        {p.events?.length > 1 && (
          <TouchableOpacity onPress={() => setExpanded(expanded === p.id ? null : p.id)}>
            <Text style={styles.historyToggle}>{expanded === p.id ? 'Скрыть историю' : `История (${p.events.length})`}</Text>
          </TouchableOpacity>
        )}
        {expanded === p.id && (
          <View style={styles.history}>
            {p.events.map((e: any) => (
              <Text key={e.id} style={styles.historyLine}>
                <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{e.actor_name || 'Участник'}</Text> {ACTION_LABEL[e.action] || e.action}
                {e.proposed_time ? ` (${fmt(e.proposed_time)})` : ''} · {fmt(e.created_at)}
              </Text>
            ))}
          </View>
        )}

        {mineTurn && (counterFor === p.id ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={styles.label}>Предложить другое время</Text>
            <DateTimePickerField value={counterTime} onChange={setCounterTime} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => { setCounterFor(null); setCounterTime(''); }}>
                <Text style={styles.btnSecondaryText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={busyId === p.id} onPress={() => doCounter(p.id)}>
                {busyId === p.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Отправить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnPrimary} disabled={busyId === p.id} onPress={() => act(acceptProposal, p.id)}>
              <Text style={styles.btnPrimaryText}>Принять</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} disabled={busyId === p.id} onPress={() => { setCounterFor(p.id); setCounterTime(''); }}>
              <Text style={styles.btnSecondaryText}>Другое время</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDanger} disabled={busyId === p.id} onPress={() => act(declineProposal, p.id)}>
              <Text style={styles.btnDangerText}>Отклонить</Text>
            </TouchableOpacity>
          </View>
        ))}
        {p.status === 'accepted' && <Text style={styles.accepted}>Встреча создана на {fmt(p.proposed_time)}</Text>}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Предложения встреч</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {([['inbox', `Входящие${incoming.length ? ` (${incoming.length})` : ''}`], ['all', 'Все'], ['new', 'Создать']] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {tab === 'new' ? (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={styles.label}>Кому</Text>
                <ScrollView style={{ maxHeight: 180 }}>
                  {contacts.map(c => (
                    <TouchableOpacity key={c.user_id} style={[styles.pick, toUser === c.user_id && styles.pickActive]} onPress={() => setToUser(c.user_id)}>
                      <Text style={styles.pickName}>{c.name}</Text>
                      {toUser === c.user_id && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  ))}
                  {contacts.length === 0 && <Text style={styles.hint}>Нет доступных участников</Text>}
                </ScrollView>
              </View>
              <View>
                <Text style={styles.label}>Тема</Text>
                <TextInput style={styles.input} value={topic} onChangeText={setTopic} placeholder="О чём встреча" placeholderTextColor={colors.textMuted} />
              </View>
              <View>
                <Text style={styles.label}>Предлагаемое время</Text>
                <DateTimePickerField value={when} onChange={setWhen} />
              </View>
              <TouchableOpacity style={styles.btnPrimaryWide} disabled={creating} onPress={submitNew}>
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Отправить предложение</Text>}
              </TouchableOpacity>
            </View>
          ) : proposals === null ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : (() => {
            const list = tab === 'inbox' ? incoming : mine;
            if (list.length === 0) return <Text style={styles.emptyList}>{tab === 'inbox' ? 'Нет предложений, ожидающих ответа' : 'Предложений пока нет'}</Text>;
            return list.map(renderCard);
          })()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  tabActive: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary, flex: 1 },
  badge: { fontSize: 12, fontWeight: '700' },
  cardTopic: { fontSize: 13, color: c.textSecondary },
  cardTime: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  historyToggle: { fontSize: 12, fontWeight: '600', color: c.accent, marginTop: 2 },
  history: { borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, gap: 3, marginTop: 2 },
  historyLine: { fontSize: 12, color: c.textMuted },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btnPrimary: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryWide: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnSecondary: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  btnDanger: { borderWidth: 1, borderColor: c.danger, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  btnDangerText: { fontSize: 13, fontWeight: '600', color: c.danger },
  accepted: { fontSize: 12, fontWeight: '600', color: c.success, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.surface },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, marginBottom: 6 },
  pickActive: { borderColor: c.accent, backgroundColor: c.accentLight },
  pickName: { fontSize: 14, color: c.textPrimary },
  hint: { fontSize: 13, color: c.textMuted },
  emptyList: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 40 },
});
