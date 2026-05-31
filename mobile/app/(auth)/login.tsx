import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/context/auth';
import { useTheme } from '../../src/context/theme';
import type { AppColors } from '../../src/constants/colors';

type Mode = 'login' | 'register' | 'check_email' | 'admin';

const ADMIN_PASSWORD = '1on12026';

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Неверный email или пароль';
  if (msg.includes('Email not confirmed')) return 'Сначала подтвердите email — проверьте почту';
  if (msg.includes('already registered')) return 'Этот email уже зарегистрирован';
  if (msg.includes('rate limit')) return 'Слишком много попыток, подождите немного';
  return msg;
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, enterAdmin } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (session) return null;

  const handleAdminLogin = async () => {
    setError('');
    if (adminCode !== ADMIN_PASSWORD) { setError('Неверный код администратора'); return; }
    setLoading(true);
    try {
      await enterAdmin();
    } catch {
      setError('Не удалось войти. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) { setError('Введите email'); return; }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(translateError(err.message));
    } catch {
      setError('Ошибка сети. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!email.trim()) { setError('Введите email'); return; }
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return; }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
      if (err) setError(translateError(err.message));
      else setMode('check_email');
    } catch {
      setError('Ошибка сети. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'check_email') {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <View style={styles.emailIconWrap}>
          <Ionicons name="mail-outline" size={28} color={colors.accent} />
        </View>
        <Text style={styles.emailTitle}>Проверьте почту</Text>
        <Text style={styles.emailDesc}>Мы отправили письмо на</Text>
        <Text style={styles.emailAddress}>{email}</Text>
        <Text style={styles.emailHint}>
          Перейдите по ссылке в письме, затем войдите в аккаунт.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => setMode('login')}>
          <Text style={styles.btnText}>Войти</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (mode === 'admin') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
            <View style={styles.logoWrap}>
              <Text style={styles.logo}>OneOn<Text style={styles.logoAccent}>One</Text></Text>
              <Text style={styles.logoSub}>Эффективные 1-on-1 встречи с командой</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.adminHeader}>
                <View style={styles.adminLockWrap}>
                  <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
                </View>
                <Text style={styles.adminTitle}>Вход для администратора</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Код администратора</Text>
                <TextInput
                  style={styles.input}
                  value={adminCode}
                  onChangeText={v => { setAdminCode(v); setError(''); }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  textContentType="password"
                />
              </View>
              {error ? (
                <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
              ) : null}
              <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleAdminLogin} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'Входим...' : 'Войти как администратор'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setMode('login'); setError(''); setAdminCode(''); }}
              >
                <Text style={styles.backLinkText}>← Назад к обычному входу</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
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

          {/* Всегда рендерим поле, но прячем в режиме входа — карточка не прыгает */}
          <View style={[styles.field, mode !== 'register' && styles.fieldHidden]}
            pointerEvents={mode !== 'register' ? 'none' : 'auto'}>
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

          <TouchableOpacity
            style={styles.adminLink}
            onPress={() => { setMode('admin'); setError(''); }}
          >
            <Text style={styles.adminLinkText}>Вход для администратора</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: c.bg,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 26, fontWeight: '700', color: c.textPrimary },
  logoAccent: { color: c.accent },
  logoSub: { fontSize: 14, color: c.textMuted, marginTop: 6 },

  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: c.border,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: c.surface2,
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
    backgroundColor: c.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '500', color: c.textMuted },
  tabTextActive: { color: c.textPrimary },
  fieldHidden: { opacity: 0, marginBottom: 0 },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.textPrimary,
    backgroundColor: c.surface,
  },

  errorBox: {
    backgroundColor: c.dangerBg,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: c.danger },

  btn: {
    backgroundColor: c.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  emailIcon: { fontSize: 48, marginBottom: 16 },
  emailIconWrap: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.blue200,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  adminLockWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  adminTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  backLink: { alignItems: 'center', marginTop: 12, paddingVertical: 4 },
  backLinkText: { fontSize: 13, color: c.textMuted },
  adminLink: { alignItems: 'center', marginTop: 18 },
  adminLinkText: { fontSize: 12, color: c.textMuted },
  emailTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  emailDesc: { fontSize: 14, color: c.textSecondary },
  emailAddress: { fontSize: 15, fontWeight: '600', color: c.accent, marginVertical: 4 },
  emailHint: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
});
