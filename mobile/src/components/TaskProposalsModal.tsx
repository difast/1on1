import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { DateTimePickerField } from './DateTimePickerField';
import { getTaskProposals, createTaskProposal, acceptTaskProposal, declineTaskProposal, commentTaskProposal } from '../lib/api';

const STATUS_LABEL: Record<string, string> = { pending: 'Ожидает ответа', discussing: 'Обсуждается', accepted: 'Принято', declined: 'Отклонено' };
const ACTION_LABEL: Record<string, string> = { proposed: 'предложил(а) задачу', commented: 'написал(а)', accepted: 'принял(а)', declined: 'отклонил(а)' };
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDue = (iso?: string) => iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

/*
 * Предложения задач в приложении: отдельный от прямого создания задачи флоу с
 * подтверждением. Инициатор предлагает задачу, получатель принимает / отклоняет /
 * обсуждает. Реальная задача создаётся только после принятия — на бэкенде.
 * Отдельная сущность и от задачи, и от предложения встречи.
 */
export function TaskProposalsModal({
  visible, onClose, currentUser, contacts, teamId, onChanged, presetToUserId = null,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: { id: number };
  contacts: { user_id: number; name: string }[];
  teamId?: number | null;
  onChanged?: () => void;
  presetToUserId?: number | null;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<'inbox' | 'all' | 'new'>(presetToUserId ? 'new' : 'inbox');
  const [proposals, setProposals] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  // Форма создания
  const [toUser, setToUser] = useState<number | null>(presetToUserId ?? null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    getTaskProposals(currentUser.id).then(p => setProposals(p || [])).catch(() => setProposals([]));
  };
  useEffect(() => { if (visible) { load(); setTab(presetToUserId ? 'new' : 'inbox'); setToUser(presetToUserId ?? null); } }, [visible, currentUser.id, presetToUserId]);

  const isOpen = (p: any) => p.status === 'pending' || p.status === 'discussing';
  const canRespond = (p: any) => isOpen(p) && p.to_user_id === currentUser.id;
  const incoming = (proposals || []).filter(canRespond);
  const mine = (proposals || []).filter(p => !canRespond(p));

  const act = async (fn: (id: number, uid: number) => Promise<any>, id: number) => {
    setBusyId(id);
    try { await fn(id, currentUser.id); load(); onChanged?.(); }
    catch (err: any) { Alert.alert(t('ui.oshibka'), err?.response?.detail || t('ui.ne_udalos_vypolnit')); }
    finally { setBusyId(null); }
  };

  const sendComment = async (id: number) => {
    if (!commentText.trim()) { Alert.alert(t('ui.vvedite_soobschenie')); return; }
    setBusyId(id);
    try {
      await commentTaskProposal(id, currentUser.id, commentText.trim());
      setCommentFor(null); setCommentText(''); setExpanded(id); load(); onChanged?.();
    } catch (err: any) { Alert.alert(t('ui.oshibka'), err?.response?.detail || t('ui.ne_udalos_otpravit')); }
    finally { setBusyId(null); }
  };

  const submitNew = async () => {
    if (!toUser) { Alert.alert(t('ui.vyberite_poluchatelya')); return; }
    if (!title.trim()) { Alert.alert(t('ui.ukazhite_nazvanie_zadachi')); return; }
    setCreating(true);
    try {
      await createTaskProposal({ from_user_id: currentUser.id, to_user_id: toUser, title: title.trim(), description: desc.trim() || null, due_date: due || null, team_id: teamId ?? null });
      setTitle(''); setDesc(''); setDue(''); if (!presetToUserId) setToUser(null);
      setTab('all'); load(); onChanged?.();
    } catch (err: any) { Alert.alert(t('ui.oshibka'), err?.response?.detail || t('ui.ne_udalos_otpravit_predlozhenie')); }
    finally { setCreating(false); }
  };

  const renderCard = (p: any) => {
    const respond = canRespond(p);
    const badgeColor = p.status === 'accepted' ? colors.success : p.status === 'declined' ? colors.danger : p.status === 'discussing' ? colors.accent : colors.warning;
    return (
      <View key={p.id} style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>
            {p.from_user_id === currentUser.id ? `Вы -> ${p.to_user_name || t('ui.uchastnik')}` : `${p.from_user_name || t('ui.uchastnik')} -> вам`}
          </Text>
          <Text style={[styles.badge, { color: badgeColor }]}>{respond ? t('ui.vash_hod') : (STATUS_LABEL[p.status] || p.status)}</Text>
        </View>
        <Text style={styles.taskTitle}>{p.title}</Text>
        {!!p.description && <Text style={styles.cardTopic}>{p.description}</Text>}
        {!!p.due_date && <Text style={styles.cardTime}>Срок: {fmtDue(p.due_date)}</Text>}

        {p.events?.length > 1 && (
          <TouchableOpacity onPress={() => setExpanded(expanded === p.id ? null : p.id)}>
            <Text style={styles.historyToggle}>{expanded === p.id ? t('ui.skryt_obsuzhdenie') : t('ui.obsuzhdenie_2', { v1: p.events.length })}</Text>
          </TouchableOpacity>
        )}
        {expanded === p.id && (
          <View style={styles.history}>
            {p.events.map((e: any) => (
              <View key={e.id}>
                <Text style={styles.historyLine}>
                  <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{e.actor_name || t('ui.uchastnik')}</Text> {ACTION_LABEL[e.action] || e.action} · {fmt(e.created_at)}
                </Text>
                {!!e.note && <Text style={styles.historyNote}>{e.note}</Text>}
              </View>
            ))}
          </View>
        )}

        {isOpen(p) && (p.from_user_id === currentUser.id || p.to_user_id === currentUser.id) && (commentFor === p.id ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={commentText} onChangeText={setCommentText} placeholder={t('ui.soobschenie_po_zadache')} placeholderTextColor={colors.textMuted} multiline />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} disabled={busyId === p.id} onPress={() => sendComment(p.id)}>
                {busyId === p.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>{t('ui.otpravit')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => { setCommentFor(null); setCommentText(''); }}>
                <Text style={styles.btnSecondaryText}>{t('ui.otmena')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            {respond && (
              <TouchableOpacity style={styles.btnPrimary} disabled={busyId === p.id} onPress={() => act(acceptTaskProposal, p.id)}>
                <Text style={styles.btnPrimaryText}>{t('ui.prinyat')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnSecondary} disabled={busyId === p.id} onPress={() => { setCommentFor(p.id); setCommentText(''); }}>
              <Text style={styles.btnSecondaryText}>{t('ui.obsudit')}</Text>
            </TouchableOpacity>
            {respond && (
              <TouchableOpacity style={styles.btnDanger} disabled={busyId === p.id} onPress={() => act(declineTaskProposal, p.id)}>
                <Text style={styles.btnDangerText}>{t('ui.otklonit')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {p.status === 'accepted' && <Text style={styles.accepted}>Задача создана и назначена на {p.to_user_name || 'получателя'}</Text>}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('ui.predlozheniya_zadach')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {([['inbox', `Входящие${incoming.length ? ` (${incoming.length})` : ''}`], ['all', t('common.all')], ['new', t('common.create')]] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {tab === 'new' ? (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={styles.label}>{t('ui.komu')}</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {contacts.map(c => (
                    <TouchableOpacity key={c.user_id} style={[styles.pick, toUser === c.user_id && styles.pickActive]} onPress={() => setToUser(c.user_id)}>
                      <Text style={styles.pickName}>{c.name}</Text>
                      {toUser === c.user_id && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  ))}
                  {contacts.length === 0 && <Text style={styles.hint}>{t('ui.net_dostupnyh_uchastnikov')}</Text>}
                </ScrollView>
              </View>
              <View>
                <Text style={styles.label}>{t('ui.nazvanie_zadachi')}</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('ui.chto_nuzhno_sdelat')} placeholderTextColor={colors.textMuted} />
              </View>
              <View>
                <Text style={styles.label}>{t('ui.opisanie')}</Text>
                <TextInput style={[styles.input, { minHeight: 70 }]} value={desc} onChangeText={setDesc} placeholder={t('ui.podrobnosti_neobyazatelno')} placeholderTextColor={colors.textMuted} multiline />
              </View>
              <View>
                <Text style={styles.label}>{t('ui.srok')}</Text>
                <DateTimePickerField value={due} onChange={setDue} placeholder={t('ui.vyberite_srok')} />
              </View>
              <TouchableOpacity style={styles.btnPrimaryWide} disabled={creating} onPress={submitNew}>
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>{t('ui.otpravit_predlozhenie')}</Text>}
              </TouchableOpacity>
            </View>
          ) : proposals === null ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : (() => {
            const list = tab === 'inbox' ? incoming : mine;
            if (list.length === 0) return <Text style={styles.emptyList}>{tab === 'inbox' ? t('ui.net_predlozheniy_ozhidayuschih_otveta') : t('ui.predlozheniy_poka_net')}</Text>;
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
  cardTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  badge: { fontSize: 12, fontWeight: '700' },
  cardTopic: { fontSize: 13, color: c.textSecondary },
  cardTime: { fontSize: 12, color: c.textMuted },
  historyToggle: { fontSize: 12, fontWeight: '600', color: c.accent, marginTop: 2 },
  history: { borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, gap: 4, marginTop: 2 },
  historyLine: { fontSize: 12, color: c.textMuted },
  historyNote: { fontSize: 13, color: c.textPrimary, marginTop: 1 },
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
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.surface, textAlignVertical: 'top' },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, marginBottom: 6 },
  pickActive: { borderColor: c.accent, backgroundColor: c.accentLight },
  pickName: { fontSize: 14, color: c.textPrimary },
  hint: { fontSize: 13, color: c.textMuted },
  emptyList: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 40 },
});
