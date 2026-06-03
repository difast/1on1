import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { createSupportTicket, assistantChat } from '../lib/api';
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
      const context = user ? `Пользователь: ${(user as any).user_metadata?.name || user.email}` : '';
      const res = await assistantChat(newMsgs.filter(m => m.role === 'user' || m.role === 'assistant'), context) as any;
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply ?? 'Нет ответа' }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Произошла ошибка. Попробуйте ещё раз.' }]);
    } finally { setPitLoading(false); }
  };

  // ── Ticket ──
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ticketLoading, setTicketLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !body.trim()) { setError('Заполните тему и содержание'); return; }
    if (!user) return;
    setTicketLoading(true); setError('');
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), body: body.trim() });
      setSent(true);
    } catch {
      setError('Ошибка при отправке. Попробуйте ещё раз.');
    } finally { setTicketLoading(false); }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Поддержка</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'pit' && styles.tabActive]} onPress={() => setTab('pit')}>
          <Ionicons name="sparkles-outline" size={15} color={tab === 'pit' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'pit' && styles.tabTextActive]}>Спросить Пита</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'ticket' && styles.tabActive]} onPress={() => setTab('ticket')}>
          <Ionicons name="mail-outline" size={15} color={tab === 'ticket' ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, tab === 'ticket' && styles.tabTextActive]}>Написать в поддержку</Text>
        </TouchableOpacity>
      </View>

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
      {tab === 'ticket' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
            {sent ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={36} color="#fff" />
                </View>
                <Text style={styles.successTitle}>Обращение отправлено</Text>
                <Text style={styles.successDesc}>Мы рассмотрим ваш запрос и ответим.</Text>
                <TouchableOpacity style={styles.newBtn} onPress={() => { setSent(false); setSubject(''); setBody(''); }}>
                  <Text style={styles.newBtnText}>Новое обращение</Text>
                </TouchableOpacity>
              </View>
            ) : (
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
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },

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
  bubbleText: { fontSize: 14, lineHeight: 20, color: c.textPrimary, flex: 1 },
  bubbleTextUser: { color: '#fff' },
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
  successWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  successIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
  successDesc: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },
  newBtn: { marginTop: 8, backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  newBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
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
