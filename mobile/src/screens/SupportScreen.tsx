import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import {
  createSupportTicket, assistantChat, getUserTickets, userSendMessage, userReadReply,
} from '../lib/api';
import { useTheme } from '../context/theme';
import { Avatar } from '../components/Avatar';
import type { AppColors } from '../constants/colors';

type Tab = 'pit' | 'ticket';
interface Message { role: 'user' | 'assistant'; content: string; }

const PIT_STARTERS = [
  'Как начать работу с платформой?',
  'Как пригласить участника в команду?',
  'Как провести первую встречу?',
  'Как посмотреть аналитику?',
];

export default function SupportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pit');

  // ── Пит chat ──
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Привет! Я Пит — ваш AI-ассистент в OneOnOne. Помогу с вопросами о 1-on-1 встречах, задачах и командном управлении. Спрашивайте!' },
  ]);
  const [pitInput, setPitInput] = useState('');
  const [pitLoading, setPitLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendPit = async (text?: string) => {
    const content = (text ?? pitInput).trim();
    if (!content || pitLoading) return;
    setPitInput('');
    const newMsgs: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMsgs);
    setPitLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const context = user ? `Пользователь: ${user.name || user.email}` : '';
      const res = await assistantChat(newMsgs, context) as any;
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply ?? 'Нет ответа' }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Произошла ошибка. Попробуйте ещё раз.' }]);
    } finally { setPitLoading(false); }
  };

  // ── Support tickets ──
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ticketLoading, setTicketLoading] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef<ScrollView>(null);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUserTickets(user.id);
      setTickets(data ?? []);
    } catch { setTickets([]); }
  }, [user]);

  useEffect(() => {
    if (tab === 'ticket') {
      setTicketsLoading(true);
      loadTickets().finally(() => setTicketsLoading(false));
    }
  }, [tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTickets();
    if (selectedTicket) {
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) setSelectedTicket(updated);
    }
    setRefreshing(false);
  };

  const handleOpenTicket = async (ticket: any) => {
    setSelectedTicket(ticket);
    if (ticket.has_unread_reply) {
      userReadReply(ticket.id).catch(() => {});
    }
    setTimeout(() => threadRef.current?.scrollToEnd({ animated: false }), 100);
  };

  const handleReply = async () => {
    if (!replyText.trim() || replying || !selectedTicket || !user) return;
    setReplying(true);
    try {
      const updated = await userSendMessage(selectedTicket.id, replyText.trim());
      setReplyText('');
      // Refresh ticket data
      const data = await getUserTickets(user.id);
      setTickets(data ?? []);
      const refreshed = (data ?? []).find((t: any) => t.id === selectedTicket.id);
      if (refreshed) {
        setSelectedTicket(refreshed);
        setTimeout(() => threadRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      setError('Ошибка отправки');
    } finally { setReplying(false); }
  };

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !body.trim()) { setError('Заполните тему и содержание'); return; }
    if (!user) return;
    setTicketLoading(true); setError('');
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), body: body.trim() });
      setSubject(''); setBody('');
      setShowNewTicket(false);
      const data = await getUserTickets(user.id);
      setTickets(data ?? []);
    } catch {
      setError('Ошибка при отправке. Попробуйте ещё раз.');
    } finally { setTicketLoading(false); }
  };

  const statusLabel: Record<string, string> = {
    open: 'Открыто',
    in_progress: 'В работе',
    closed: 'Закрыто',
  };
  const statusColor: Record<string, string> = {
    open: '#f59e0b',
    in_progress: colors.accent,
    closed: colors.textMuted,
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        {(selectedTicket || showNewTicket) && tab === 'ticket' ? (
          <TouchableOpacity onPress={() => { setSelectedTicket(null); setShowNewTicket(false); setError(''); }} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : router.canGoBack() ? (
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>
          {selectedTicket ? selectedTicket.subject : showNewTicket ? 'Новое обращение' : 'Поддержка'}
        </Text>
      </View>

      {/* Tabs */}
      {!selectedTicket && !showNewTicket && (
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'pit' && styles.tabActive]} onPress={() => setTab('pit')}>
            <Ionicons name="sparkles-outline" size={15} color={tab === 'pit' ? colors.accent : colors.textMuted} />
            <Text style={[styles.tabText, tab === 'pit' && styles.tabTextActive]}>Спросить Пита</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'ticket' && styles.tabActive]} onPress={() => setTab('ticket')}>
            <Ionicons name="mail-outline" size={15} color={tab === 'ticket' ? colors.accent : colors.textMuted} />
            <Text style={[styles.tabText, tab === 'ticket' && styles.tabTextActive]}>Поддержка</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Пит tab ── */}
      {tab === 'pit' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            ref={scrollRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="always"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.map((msg, i) => (
              <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
                {msg.role === 'assistant' && (
                  <View style={styles.pitAvatar}>
                    <Text style={{ fontSize: 12 }}>🤖</Text>
                  </View>
                )}
                <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextUser]}>
                  {msg.content}
                </Text>
              </View>
            ))}
            {pitLoading && (
              <View style={[styles.bubble, styles.bubbleAI]}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            )}
            {messages.length === 1 && (
              <View style={styles.starters}>
                {PIT_STARTERS.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.starterChip} onPress={() => sendPit(s)}>
                    <Text style={styles.starterText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              value={pitInput}
              onChangeText={setPitInput}
              placeholder="Спросите Пита..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!pitInput.trim() || pitLoading) && styles.sendBtnDisabled]}
              onPress={() => sendPit()}
              disabled={!pitInput.trim() || pitLoading}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── Ticket tab ── */}
      {tab === 'ticket' && !selectedTicket && !showNewTicket && (
        <View style={{ flex: 1 }}>
          {ticketsLoading ? (
            <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
              <TouchableOpacity style={styles.newTicketBtn} onPress={() => { setShowNewTicket(true); setError(''); }}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.newTicketBtnText}>Новое обращение</Text>
              </TouchableOpacity>

              {tickets.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Нет обращений</Text>
                  <Text style={styles.emptySubText}>Создайте обращение, если нужна помощь</Text>
                </View>
              ) : (
                tickets.map(ticket => (
                  <TouchableOpacity key={ticket.id} style={styles.ticketCard} onPress={() => handleOpenTicket(ticket)} activeOpacity={0.8}>
                    <View style={styles.ticketTop}>
                      <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                      {ticket.has_unread_reply && <View style={styles.unreadDot} />}
                    </View>
                    <View style={styles.ticketMeta}>
                      <Text style={[styles.ticketStatus, { color: statusColor[ticket.status] ?? colors.textMuted }]}>
                        {statusLabel[ticket.status] ?? ticket.status}
                      </Text>
                      <Text style={styles.ticketDate}>
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString('ru-RU') : ''}
                      </Text>
                    </View>
                    {ticket.messages?.length > 0 && (
                      <Text style={styles.ticketPreview} numberOfLines={1}>
                        {ticket.messages[ticket.messages.length - 1]?.body ?? ''}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Ticket thread ── */}
      {tab === 'ticket' && selectedTicket && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={threadRef}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: false })}
          >
            {(selectedTicket.messages ?? []).map((msg: any, i: number) => {
              const isUser = msg.sender === 'user';
              return (
                <View key={i} style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
                  {!isUser && (
                    <View style={styles.supportAvatar}>
                      <Ionicons name="headset-outline" size={14} color={colors.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.body}</Text>
                    {msg.created_at && (
                      <Text style={[styles.msgTime, isUser && { color: 'rgba(255,255,255,0.6)' }]}>
                        {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          {selectedTicket.status !== 'closed' && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.chatInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Ваш ответ..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!replyText.trim() || replying) && styles.sendBtnDisabled]}
                onPress={handleReply}
                disabled={!replyText.trim() || replying}
                activeOpacity={0.7}
              >
                {replying ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          )}
          {selectedTicket.status === 'closed' && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>Обращение закрыто</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── New ticket form ── */}
      {tab === 'ticket' && showNewTicket && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
            <View style={styles.form}>
              {user && (
                <View style={styles.userChip}>
                  <Avatar name={user.name} imageUrl={user.avatar} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                </View>
              )}
              <View style={styles.field}>
                <Text style={styles.label}>Тема</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Кратко опишите суть"
                  placeholderTextColor={colors.textMuted}
                  value={subject}
                  onChangeText={v => { setSubject(v); setError(''); }}
                  maxLength={300}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Содержание</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Подробно опишите вашу проблему или вопрос..."
                  placeholderTextColor={colors.textMuted}
                  value={body}
                  onChangeText={v => { setBody(v); setError(''); }}
                  multiline textAlignVertical="top"
                />
              </View>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.submitBtn, (ticketLoading || !subject.trim() || !body.trim()) && styles.btnDisabled]}
                onPress={handleSubmitTicket}
                disabled={ticketLoading || !subject.trim() || !body.trim()}
              >
                <Text style={styles.submitBtnText}>{ticketLoading ? 'Отправка...' : 'Отправить обращение'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary, flex: 1 },

  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 8,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  tabActive: { borderColor: c.accent, backgroundColor: c.accentLight },
  tabText: { fontSize: 13, fontWeight: '500', color: c.textMuted },
  tabTextActive: { color: c.accent, fontWeight: '600' },

  chatScroll: { flex: 1 },
  chatContent: { padding: 16, gap: 10, flexGrow: 1 },
  threadContent: { padding: 16, gap: 10, flexGrow: 1 },
  bubble: {
    maxWidth: '85%', borderRadius: 16, padding: 12,
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: c.accent, borderBottomRightRadius: 4 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  pitAvatar: {
    width: 22, height: 22, borderRadius: 6, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  supportAvatar: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: c.textPrimary, flex: 1 },
  bubbleTextUser: { color: '#fff' },
  msgTime: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  starters: { gap: 8, marginTop: 8 },
  starterChip: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12,
  },
  starterText: { fontSize: 13, color: c.textPrimary },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface,
  },
  chatInput: {
    flex: 1, fontSize: 15, color: c.textPrimary,
    backgroundColor: c.bg, borderRadius: 20,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: c.border },

  content: { padding: 16, gap: 16, paddingBottom: 40 },
  newTicketBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16,
    justifyContent: 'center',
  },
  newTicketBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  ticketCard: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14, gap: 6,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: c.textPrimary, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  ticketMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketStatus: { fontSize: 12, fontWeight: '600' },
  ticketDate: { fontSize: 12, color: c.textMuted },
  ticketPreview: { fontSize: 13, color: c.textSecondary },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: c.textPrimary },
  emptySubText: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },

  closedBanner: {
    padding: 12, backgroundColor: c.surface2, borderTopWidth: 1, borderTopColor: c.border,
    alignItems: 'center',
  },
  closedText: { fontSize: 14, color: c.textMuted },

  form: { gap: 16 },
  userChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 12,
  },
  userName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  userEmail: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.surface,
  },
  textarea: { minHeight: 120, paddingTop: 12 },
  errorBox: { backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 12 },
  errorText: { fontSize: 13, color: c.danger },
  submitBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
});
