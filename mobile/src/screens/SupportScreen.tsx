import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/auth';
import { createSupportTicket, getUserTickets, userSendMessage, userReadReply } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Spinner } from '../components/Spinner';

type View_ = 'list' | 'new' | 'thread';

export default function SupportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [view, setView] = useState<View_>('list');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTicket, setActiveTicket] = useState<any>(null);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Thread reply
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUserTickets(user.id) as any[];
      setTickets(data || []);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openTicket = async (ticket: any) => {
    setActiveTicket(ticket);
    setView('thread');
    if (ticket.has_unread_reply) {
      userReadReply(ticket.id).catch(() => {});
      setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, has_unread_reply: false } : t));
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const handleCreate = async () => {
    if (!subject.trim() || !body.trim() || !user) return;
    setSending(true);
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), body: body.trim() });
      setSent(true);
      setTimeout(async () => {
        await load();
        setSubject(''); setBody(''); setSent(false);
        setView('list');
      }, 1800);
    } catch { Alert.alert('Ошибка', 'Не удалось отправить обращение'); }
    finally { setSending(false); }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !activeTicket) return;
    setReplying(true);
    try {
      const updated = await userSendMessage(activeTicket.id, replyText.trim()) as any;
      setActiveTicket(updated);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      setReplyText('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { Alert.alert('Ошибка', 'Не удалось отправить сообщение'); }
    finally { setReplying(false); }
  };

  const unreadCount = tickets.filter(t => t.has_unread_reply).length;

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {view !== 'list' ? (
          <TouchableOpacity onPress={() => { setView('list'); setActiveTicket(null); }} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Назад</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitle}>
            Поддержка{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        )}
        {view === 'list' && (
          <TouchableOpacity style={styles.newBtn} onPress={() => { setSent(false); setView('new'); }}>
            <Text style={styles.newBtnText}>+ Новое</Text>
          </TouchableOpacity>
        )}
        {view === 'thread' && activeTicket && (
          <Text style={styles.headerTitle} numberOfLines={1}>{activeTicket.subject}</Text>
        )}
        {view === 'new' && (
          <Text style={styles.headerTitle}>Новое обращение</Text>
        )}
      </View>

      {/* LIST */}
      {view === 'list' && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {tickets.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Обращений пока нет</Text>
              <Text style={styles.emptyDesc}>Нажмите «+ Новое» чтобы создать обращение</Text>
            </View>
          ) : tickets.map(t => (
            <TouchableOpacity key={t.id} style={styles.ticketCard} onPress={() => openTicket(t)}>
              <View style={[styles.ticketLeft, t.has_unread_reply && styles.ticketUnread]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.ticketSubject, t.has_unread_reply && styles.ticketSubjectBold]} numberOfLines={1}>{t.subject}</Text>
                <Text style={styles.ticketMeta}>{new Date(t.created_at).toLocaleDateString('ru-RU')}</Text>
              </View>
              {t.has_unread_reply && (
                <View style={styles.unreadDot} />
              )}
              <Text style={styles.ticketArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* NEW */}
      {view === 'new' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            {sent ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Text style={styles.successCheck}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Обращение отправлено</Text>
                <Text style={styles.successDesc}>Возвращаемся к списку...</Text>
              </View>
            ) : (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Тема обращения</Text>
                  <TextInput
                    style={styles.formInput}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="Кратко опишите тему"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Содержание</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextarea]}
                    value={body}
                    onChangeText={setBody}
                    placeholder="Подробно опишите вопрос или проблему..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.submitBtn, (sending || !subject.trim() || !body.trim()) && styles.submitBtnDisabled]}
                  onPress={handleCreate}
                  disabled={sending || !subject.trim() || !body.trim()}
                >
                  <Text style={styles.submitBtnText}>{sending ? 'Отправка...' : 'Отправить обращение'}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* THREAD */}
      {view === 'thread' && activeTicket && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {(activeTicket.messages || []).map((msg: any) => {
              const isAdmin = msg.sender === 'admin';
              return (
                <View key={msg.id} style={[styles.bubbleWrap, isAdmin ? styles.bubbleWrapLeft : styles.bubbleWrapRight]}>
                  <View style={[styles.bubble, isAdmin ? styles.bubbleAdmin : styles.bubbleUser]}>
                    {isAdmin && <Text style={styles.bubbleSenderLabel}>Поддержка</Text>}
                    <Text style={[styles.bubbleText, isAdmin ? styles.bubbleTextAdmin : styles.bubbleTextUser]}>{msg.body}</Text>
                    <Text style={[styles.bubbleTime, isAdmin ? styles.bubbleTimeAdmin : styles.bubbleTimeUser]}>
                      {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.replyBar}>
            <TextInput
              style={styles.replyInput}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Написать сообщение..."
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TouchableOpacity
              style={[styles.replyBtn, (!replyText.trim() || replying) && styles.replyBtnDisabled]}
              onPress={handleReply}
              disabled={!replyText.trim() || replying}
            >
              <Text style={styles.replyBtnText}>{replying ? '...' : '→'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, flex: 1 },
  backBtn: { marginRight: 12 },
  backBtnText: { fontSize: 15, fontWeight: '600', color: c.accent },
  newBtn: { backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  listContent: { padding: 16, gap: 10 },
  ticketCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    paddingVertical: 14, paddingHorizontal: 14, overflow: 'hidden',
  },
  ticketLeft: { width: 3, height: '100%', position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: 'transparent' },
  ticketUnread: { backgroundColor: '#ef4444' },
  ticketSubject: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  ticketSubjectBold: { fontWeight: '700' },
  ticketMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  ticketArrow: { fontSize: 18, color: c.textMuted },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },

  formContent: { padding: 20, gap: 4 },
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  formInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: c.textPrimary, backgroundColor: c.surface,
  },
  formTextarea: { minHeight: 120, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: c.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  successWrap: { alignItems: 'center', paddingTop: 80 },
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#86efac',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successCheck: { fontSize: 28, color: '#16a34a', fontWeight: '700' },
  successTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  successDesc: { fontSize: 14, color: c.textMuted },

  threadContent: { padding: 16, gap: 8, paddingBottom: 8 },
  bubbleWrap: { width: '100%' },
  bubbleWrapLeft: { alignItems: 'flex-start' },
  bubbleWrapRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 12 },
  bubbleAdmin: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: c.accent, borderTopRightRadius: 4 },
  bubbleSenderLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, marginBottom: 3 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAdmin: { color: c.textPrimary },
  bubbleTextUser: { color: '#fff' },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeAdmin: { color: c.textMuted, textAlign: 'left' },
  bubbleTimeUser: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },

  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: c.border,
    backgroundColor: c.surface,
  },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: c.textPrimary, backgroundColor: c.bg, maxHeight: 100,
  },
  replyBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
  },
  replyBtnDisabled: { opacity: 0.5 },
  replyBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});
