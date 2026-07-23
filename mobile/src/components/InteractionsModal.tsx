import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import {
  getInteractions, createInteraction, acceptInteraction, declineInteraction, replyInteraction, closeInteraction,
} from '../lib/api';

const TYPE_LABEL: Record<string, string> = {
  collab_proposal: 'Совместная работа', help_offer: 'Предложение помощи',
  consultation: 'Консультация', discussion: 'Обсуждение', recommendation: 'Рекомендация',
};
const STATUS_LABEL: Record<string, string> = { sent: 'Отправлено', accepted: 'Принято', declined: 'Отклонено', completed: 'Завершено', closed: 'Закрыто' };
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/*
 * Единая лента взаимодействий в приложении (блок 39): совместная работа, помощь,
 * консультации, обсуждения, рекомендации. Структурные записи со статусом, не чат.
 */
export function InteractionsModal({
  visible, onClose, currentUser, contacts, tasks, teamId, onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  currentUser: { id: number };
  contacts: { user_id: number; name: string }[];
  tasks?: { id: number; title: string }[];
  teamId?: number | null;
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'inbox' | 'all' | 'new'>('inbox');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const [ntype, setNtype] = useState('collab_proposal');
  const [toUser, setToUser] = useState<number | null>(null);
  const [participants, setParticipants] = useState<number[]>([]);
  const [subjectUser, setSubjectUser] = useState<number | null>(null);
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [format, setFormat] = useState<'text' | 'call'>('text');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => getInteractions(currentUser.id).then(i => setItems(i || [])).catch(() => setItems([]));
  useEffect(() => { if (visible) load(); }, [visible, currentUser.id]);

  const awaitingMe = (it: any) => it.status === 'sent' && it.to_user_id === currentUser.id && it.type !== 'recommendation';
  const incoming = (items || []).filter(awaitingMe);
  const all = items || [];

  const act = async (fn: (id: number, uid: number, ...a: any[]) => Promise<any>, id: number, ...args: any[]) => {
    setBusyId(id);
    try { await fn(id, currentUser.id, ...args); load(); onChanged?.(); }
    catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось выполнить'); }
    finally { setBusyId(null); }
  };

  const doReply = async (id: number) => {
    if (!replyText.trim()) return;
    setBusyId(id);
    try { await replyInteraction(id, currentUser.id, replyText.trim()); setReplyFor(null); setReplyText(''); load(); onChanged?.(); }
    catch { Alert.alert('Ошибка', 'Не удалось отправить'); }
    finally { setBusyId(null); }
  };

  const canReply = (it: any) => ['discussion', 'consultation'].includes(it.type) &&
    (it.from_user_id === currentUser.id || it.to_user_id === currentUser.id || (it.participants || []).some((p: any) => p.user_id === currentUser.id));

  const submitNew = async () => {
    if (ntype === 'recommendation' && !subjectUser) { Alert.alert('Выберите, кого рекомендуете'); return; }
    if (ntype === 'discussion' && participants.length === 0) { Alert.alert('Выберите участников'); return; }
    if (['collab_proposal', 'help_offer', 'consultation'].includes(ntype) && !toUser) { Alert.alert('Выберите получателя'); return; }
    if (!topic.trim()) { Alert.alert('Укажите тему'); return; }
    setCreating(true);
    try {
      await createInteraction({
        type: ntype, from_user_id: currentUser.id, team_id: teamId ?? null,
        to_user_id: ['collab_proposal', 'help_offer', 'consultation', 'recommendation'].includes(ntype) ? toUser : null,
        participant_ids: ntype === 'discussion' ? participants : null,
        subject_user_id: ntype === 'recommendation' ? subjectUser : null,
        task_id: ['collab_proposal', 'help_offer'].includes(ntype) ? taskId : null,
        topic: topic.trim(), context: context.trim() || null,
        desired_format: ntype === 'consultation' ? format : null,
      });
      setTopic(''); setContext(''); setToUser(null); setParticipants([]); setSubjectUser(null); setTaskId(null);
      setTab('all'); load(); onChanged?.();
    } catch (err: any) { Alert.alert('Ошибка', err?.response?.detail || 'Не удалось создать'); }
    finally { setCreating(false); }
  };

  const renderCard = (it: any) => (
    <View key={it.id} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.typeLabel}>{TYPE_LABEL[it.type] || it.type}</Text>
          <Text style={styles.cardTitle}>{it.topic || '(без темы)'}</Text>
          <Text style={styles.cardMeta}>
            {it.from_user_id === currentUser.id ? `Вы -> ${it.to_user_name || it.subject_user_name || 'обсуждение'}` : `${it.from_user_name || 'Участник'} -> вам`}
          </Text>
          {!!it.context && <Text style={styles.cardContext}>{it.context}</Text>}
          {!!it.desired_format && <Text style={styles.cardMeta}>Формат: {it.desired_format === 'call' ? 'созвон' : 'письменный ответ'}</Text>}
          {!!it.outcome && <Text style={[styles.cardMeta, { color: colors.success }]}>Итог: {it.outcome}</Text>}
        </View>
        <Text style={styles.badge}>{awaitingMe(it) ? 'Ваш ход' : (STATUS_LABEL[it.status] || it.status)}</Text>
      </View>

      {it.replies?.length > 0 && (
        <TouchableOpacity onPress={() => setExpanded(expanded === it.id ? null : it.id)}>
          <Text style={styles.link}>{expanded === it.id ? 'Скрыть ответы' : `Ответы (${it.replies.length})`}</Text>
        </TouchableOpacity>
      )}
      {expanded === it.id && (it.replies || []).map((r: any) => (
        <View key={r.id} style={styles.reply}>
          <Text style={styles.replyAuthor}>{r.author_name || 'Участник'} · {fmt(r.created_at)}</Text>
          <Text style={styles.replyBody}>{r.body}</Text>
        </View>
      ))}

      {awaitingMe(it) && it.type !== 'discussion' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnPrimary} disabled={busyId === it.id} onPress={() => act(acceptInteraction, it.id)}>
            <Text style={styles.btnPrimaryText}>Принять</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnDanger} disabled={busyId === it.id} onPress={() => act(declineInteraction, it.id)}>
            <Text style={styles.btnDangerText}>Отклонить</Text>
          </TouchableOpacity>
        </View>
      )}

      {canReply(it) && it.status !== 'declined' && (replyFor === it.id ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <TextInput style={styles.input} value={replyText} onChangeText={setReplyText} placeholder="Ваш ответ..." placeholderTextColor={colors.textMuted} multiline />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => { setReplyFor(null); setReplyText(''); }}><Text style={styles.btnSecondaryText}>Отмена</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} disabled={busyId === it.id} onPress={() => doReply(it.id)}>
              {busyId === it.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Ответить</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => { setReplyFor(it.id); setReplyText(''); }}><Text style={styles.btnSecondaryText}>Ответить</Text></TouchableOpacity>
          {it.type === 'discussion' && it.from_user_id === currentUser.id && it.status !== 'completed' && (
            <TouchableOpacity style={styles.btnPrimary} disabled={busyId === it.id} onPress={() => act(closeInteraction, it.id, 'decision')}>
              <Text style={styles.btnPrimaryText}>Решение принято</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );

  const needsRecipient = ['collab_proposal', 'help_offer', 'consultation'].includes(ntype);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Взаимодействия</Text>
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
            <View style={{ gap: 12 }}>
              <Text style={styles.label}>Тип</Text>
              <View style={{ gap: 6 }}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <TouchableOpacity key={k} style={[styles.pick, ntype === k && styles.pickActive]} onPress={() => setNtype(k)}>
                    <Text style={styles.pickName}>{v}</Text>
                    {ntype === k && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                ))}
              </View>

              {needsRecipient && (
                <>
                  <Text style={styles.label}>Получатель</Text>
                  {contacts.map(c => (
                    <TouchableOpacity key={c.user_id} style={[styles.pick, toUser === c.user_id && styles.pickActive]} onPress={() => setToUser(c.user_id)}>
                      <Text style={styles.pickName}>{c.name}</Text>{toUser === c.user_id && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {ntype === 'recommendation' && (
                <>
                  <Text style={styles.label}>Кого рекомендуете (эксперт)</Text>
                  {contacts.map(c => (
                    <TouchableOpacity key={c.user_id} style={[styles.pick, subjectUser === c.user_id && styles.pickActive]} onPress={() => setSubjectUser(c.user_id)}>
                      <Text style={styles.pickName}>{c.name}</Text>{subjectUser === c.user_id && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {ntype === 'discussion' && (
                <>
                  <Text style={styles.label}>Участники обсуждения</Text>
                  {contacts.map(c => {
                    const on = participants.includes(c.user_id);
                    return (
                      <TouchableOpacity key={c.user_id} style={[styles.pick, on && styles.pickActive]} onPress={() => setParticipants(p => on ? p.filter(x => x !== c.user_id) : [...p, c.user_id])}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.accent : colors.textMuted} />
                        <Text style={[styles.pickName, { marginLeft: 8 }]}>{c.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
              {['collab_proposal', 'help_offer'].includes(ntype) && (tasks || []).length > 0 && (
                <>
                  <Text style={styles.label}>Связать с задачей</Text>
                  {(tasks || []).map(t => (
                    <TouchableOpacity key={t.id} style={[styles.pick, taskId === t.id && styles.pickActive]} onPress={() => setTaskId(taskId === t.id ? null : t.id)}>
                      <Text style={styles.pickName}>{t.title}</Text>{taskId === t.id && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {ntype === 'consultation' && (
                <>
                  <Text style={styles.label}>Формат</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[styles.pick, { flex: 1 }, format === 'text' && styles.pickActive]} onPress={() => setFormat('text')}><Text style={styles.pickName}>Письменно</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.pick, { flex: 1 }, format === 'call' && styles.pickActive]} onPress={() => setFormat('call')}><Text style={styles.pickName}>Созвон</Text></TouchableOpacity>
                  </View>
                </>
              )}

              <Text style={styles.label}>Тема</Text>
              <TextInput style={styles.input} value={topic} onChangeText={setTopic} placeholder="Кратко о сути" placeholderTextColor={colors.textMuted} />
              <Text style={styles.label}>Контекст (необязательно)</Text>
              <TextInput style={[styles.input, { minHeight: 70 }]} value={context} onChangeText={setContext} placeholder="Подробности" placeholderTextColor={colors.textMuted} multiline />

              <TouchableOpacity style={styles.btnPrimaryWide} disabled={creating} onPress={submitNew}>
                {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Создать</Text>}
              </TouchableOpacity>
            </View>
          ) : items === null ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : (() => {
            const list = tab === 'inbox' ? incoming : all;
            if (list.length === 0) return <Text style={styles.empty}>{tab === 'inbox' ? 'Нет входящих, ожидающих ответа' : 'Взаимодействий пока нет'}</Text>;
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
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  typeLabel: { fontSize: 10, fontWeight: '700', color: c.accent, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginTop: 2 },
  cardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  cardContext: { fontSize: 13, color: c.textSecondary, marginTop: 3 },
  badge: { fontSize: 12, fontWeight: '700', color: c.warning },
  link: { fontSize: 12, fontWeight: '600', color: c.accent, marginTop: 2 },
  reply: { borderLeftWidth: 2, borderLeftColor: c.border, paddingLeft: 10, marginTop: 2 },
  replyAuthor: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
  replyBody: { fontSize: 13, color: c.textPrimary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btnPrimary: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryWide: { backgroundColor: c.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnSecondary: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  btnDanger: { borderWidth: 1, borderColor: c.danger, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  btnDangerText: { fontSize: 13, fontWeight: '600', color: c.danger },
  label: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.surface },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  pickActive: { borderColor: c.accent, backgroundColor: c.accentLight },
  pickName: { fontSize: 14, color: c.textPrimary },
  empty: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingVertical: 40 },
});
