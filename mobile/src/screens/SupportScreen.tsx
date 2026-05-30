import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { createSupportTicket } from '../lib/api';
import { useTheme } from '../context/theme';
import { Avatar } from '../components/Avatar';
import type { AppColors } from '../constants/colors';

export default function SupportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) { setError('Заполните тему и содержание'); return; }
    if (!user) return;
    setLoading(true); setError('');
    try {
      await createSupportTicket({ user_id: user.id, subject: subject.trim(), body: body.trim() });
      setSent(true);
    } catch {
      setError('Ошибка при отправке. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSent(false);
    setSubject('');
    setBody('');
    setError('');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Поддержка</Text>
        <Text style={styles.headerSub}>Вопрос, предложение или проблема</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {sent ? (
            <View style={styles.successWrap}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={36} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Обращение отправлено</Text>
              <Text style={styles.successDesc}>
                Мы рассмотрим ваш запрос и свяжемся при необходимости.
              </Text>
              <TouchableOpacity style={styles.newBtn} onPress={handleReset}>
                <Text style={styles.newBtnText}>Новое обращение</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              {/* User chip */}
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
                <Text style={styles.label}>Тема обращения</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Кратко опишите суть вопроса"
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
                  placeholder="Подробно опишите вашу проблему, предложение или вопрос..."
                  placeholderTextColor={colors.textMuted}
                  value={body}
                  onChangeText={v => { setBody(v); setError(''); }}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.submitBtn, (loading || !subject.trim() || !body.trim()) && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={loading || !subject.trim() || !body.trim()}
              >
                <Text style={styles.submitBtnText}>{loading ? 'Отправка...' : 'Отправить обращение'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Info cards */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Чем мы поможем</Text>
            {[
              { icon: 'bug-outline' as const, title: 'Технические проблемы', desc: 'Ошибки, сбои, некорректная работа' },
              { icon: 'bulb-outline' as const, title: 'Предложения', desc: 'Идеи по улучшению сервиса' },
              { icon: 'help-circle-outline' as const, title: 'Вопросы', desc: 'Как пользоваться функциями' },
            ].map(item => (
              <View key={item.title} style={styles.infoCard}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name={item.icon} size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoCardTitle}>{item.title}</Text>
                  <Text style={styles.infoCardDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  headerSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },

  content: { padding: 16, gap: 20, paddingBottom: 40 },

  successWrap: {
    alignItems: 'center', paddingVertical: 48, gap: 12,
  },
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#16a34a', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  successTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
  successDesc: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  newBtn: {
    marginTop: 8, backgroundColor: c.accent, borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 12,
  },
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

  errorBox: {
    backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 12,
  },
  errorText: { fontSize: 13, color: c.danger },

  submitBtn: {
    backgroundColor: c.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },

  infoSection: { gap: 8 },
  infoTitle: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border, padding: 14,
  },
  infoIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  infoCardTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  infoCardDesc: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
});
