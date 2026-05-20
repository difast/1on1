import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/auth';
import { colors } from '../../src/constants/colors';

type Mode = 'login' | 'register' | 'check_email';

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль';
  if (msg.includes('Email not confirmed')) return 'Сначала подтвердите email — проверьте почту';
  if (msg.includes('already registered')) return 'Этот email уже зарегистрирован';
  if (msg.includes('rate limit')) return 'Слишком много попыток, подождите немного';
  return msg;
}

export default function LoginScreen() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (session) return <Redirect href="/" />;

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(translateError(err.message));
    setLoading(false);
  };

  const handleRegister = async () => {
    setError('');
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) setError(translateError(err.message));
    else setMode('check_email');
    setLoading(false);
  };

  if (mode === 'check_email') {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emailIcon}>📬</Text>
        <Text style={styles.emailTitle}>Проверьте почту</Text>
        <Text style={styles.emailDesc}>Мы отправили письмо на</Text>
        <Text style={styles.emailAddress}>{email}</Text>
        <Text style={styles.emailHint}>
          Перейдите по ссылке в письме, затем войдите в аккаунт.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => setMode('login')}>
          <Text style={styles.btnText}>Войти</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>
            OneOn<Text style={styles.logoAccent}>One</Text>
          </Text>
          <Text style={styles.logoSub}>Эффективные 1-on-1 встречи с командой</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Tabs */}
          <View style={styles.tabs}>
            {(['login', 'register'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, mode === tab && styles.tabActive]}
                onPress={() => { setMode(tab); setError(''); }}
              >
                <Text style={[styles.tabText, mode === tab && styles.tabTextActive]}>
                  {tab === 'login' ? 'Войти' : 'Зарегистрироваться'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fields */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ivan@company.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>Повторите пароль</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading
                ? (mode === 'login' ? 'Входим...' : 'Регистрируемся...')
                : (mode === 'login' ? 'Войти →' : 'Зарегистрироваться →')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  logoAccent: { color: colors.accent },
  logoSub: { fontSize: 14, color: colors.textMuted, marginTop: 6 },

  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { color: colors.textPrimary },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: colors.danger },

  btn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  emailIcon: { fontSize: 48, marginBottom: 16 },
  emailTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emailDesc: { fontSize: 14, color: colors.textSecondary },
  emailAddress: { fontSize: 15, fontWeight: '600', color: colors.accent, marginVertical: 4 },
  emailHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
});
