import React, { useMemo, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/theme';
import { assistantChat } from '../lib/api';
import type { AppColors } from '../constants/colors';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'Как провести эффективную 1-on-1 встречу?',
  'Как дать конструктивную обратную связь?',
  'Как помочь сотруднику с выгоранием?',
  'Как ставить цели по SMART?',
];

export default function AssistantScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const res = await assistantChat(newMessages) as any;
      const reply = res.reply ?? 'Нет ответа';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения. Попробуйте ещё раз.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {router.canGoBack() && (
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
        </View>
        <View>
          <Text style={styles.headerTitle}>AI Ассистент</Text>
          <Text style={styles.headerSub}>Советы по управлению командой</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="always"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Спросите что угодно</Text>
              <Text style={styles.emptySub}>о проведении встреч, мотивации команды, обратной связи</Text>
              <View style={styles.starters}>
                {STARTERS.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.starterChip} onPress={() => send(s)}>
                    <Text style={styles.starterText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg, i) => (
            <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
              {msg.role === 'assistant' && (
                <View style={styles.aiBubbleIcon}>
                  <Ionicons name="sparkles" size={12} color={colors.accent} />
                </View>
              )}
              <Text style={[styles.bubbleText, msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI]}>
                {msg.content}
              </Text>
            </View>
          ))}

          {loading && (
            <View style={[styles.bubble, styles.bubbleAI]}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Напишите вопрос..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 12, color: c.textSecondary, marginTop: 1 },

  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 10, flexGrow: 1 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: c.textPrimary, marginTop: 8 },
  emptySub: { fontSize: 13, color: c.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  starters: { width: '100%', gap: 8, marginTop: 16 },
  starterChip: {
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
    padding: 12,
  },
  starterText: { fontSize: 13, color: c.textPrimary },

  bubble: {
    maxWidth: '85%', borderRadius: 16, padding: 12,
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: c.accent,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border,
    borderBottomLeftRadius: 4,
  },
  aiBubbleIcon: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, flex: 1 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAI: { color: c.textPrimary },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: c.border,
    backgroundColor: c.surface,
  },
  input: {
    flex: 1, fontSize: 15, color: c.textPrimary,
    backgroundColor: c.bg, borderRadius: 20,
    borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: c.border },
});
