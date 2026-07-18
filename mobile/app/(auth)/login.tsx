import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/auth';
import { useTheme } from '../../src/context/theme';
import type { AppColors } from '../../src/constants/colors';

type Mode = 'login' | 'register' | 'forgot' | 'forgot_sent' | 'admin';

const ADMIN_CODE = '1on12026';

// Бэкенд отдаёт понятные русские сообщения в detail — показываем как есть.
function translateError(msg: any): string {
  return typeof msg === 'string' ? msg : 'Произошла ошибка';
}

function passwordProblem(pw: string): string {
  if ((pw || '').length < 8) return 'Пароль должен быть не короче 8 символов';
  if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return 'Пароль должен содержать буквы и цифры';
  return '';
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, user, loading: authLoading, enterAdmin, profileError, retryProfile, signOut, signIn, signUp, forgotPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  // Reset submitting state if session disappears (e.g. sign-out while loading)
  React.useEffect(() => {
    if (!session) {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [session]);

  // Session exists but server failed to load profile — show retry screen
  if (session && profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginTop: 16, textAlign: 'center' }}>
          Сервер недоступен
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
          {profileError}
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 }}
          onPress={retryProfile}
          disabled={authLoading}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>
            {authLoading ? 'Загрузка...' : 'Повторить'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={signOut}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show spinner while _layout navigates away after successful auth
  if (session && !profileError && (user || authLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const handleLogin = async () => {
    if (submittingRef.current) return;
    setError('');
    if (!email.trim()) { setError('Введите email'); return; }
    submittingRef.current = true;
    setLoading(true);
    try {
      await signIn(email, password);
      // На успехе _layout уводит на нужный экран; спиннер держим до навигации.
    } catch (err: any) {
      setError(translateError(err?.response?.data?.detail ?? err?.response?.detail ?? 'Не удалось войти'));
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (submittingRef.current) return;
    setError('');
    if (!email.trim()) { setError('Введите email'); return; }
    if (password !== confirmPassword) { setError('Пароли не совпадают'); return; }
    const pw = passwordProblem(password);
    if (pw) { setError(pw); return; }
    submittingRef.current = true;
    setLoading(true);
    try {
      // Регистрация сразу авторизует; роль выбирается в онбординге, куда уведёт
      // _layout. Письмо с подтверждением уходит, доступ не блокируется.
      await signUp(email, password);
    } catch (err: any) {
      setError(translateError(err?.response?.data?.detail ?? err?.response?.detail ?? 'Не удалось зарегистрироваться'));
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    setError('');
    if (!email.trim()) { setError('Введите email'); return; }
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch { /* не раскрываем наличие аккаунта */ }
    finally { setLoading(false); setMode('forgot_sent'); }
  };

  const handleAdminLogin = async () => {
    setError('');
    if (adminCode.trim() !== ADMIN_CODE) { setError('Неверный код администратора'); return; }
    await enterAdmin();
  };

  if (mode === 'forgot_sent') {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <View style={styles.emailIconWrap}>
          <Ionicons name="mail-outline" size={28} color={colors.accent} />
        </View>
        <Text style={styles.emailTitle}>Проверьте почту</Text>
        <Text style={styles.emailDesc}>Если для этого адреса есть аккаунт с паролем, мы отправили ссылку на</Text>
        <Text style={styles.emailAddress}>{email}</Text>
        <Text style={styles.emailHint}>
          Откройте ссылку из письма и задайте новый пароль. Ссылка действует 1 час.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => { setMode('login'); setError(''); }}>
          <Text style={styles.btnText}>Вернуться ко входу</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (mode === 'forgot') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always">
            <View style={styles.logoWrap}>
              <Text style={styles.logo}>OneOn<Text style={styles.logoAccent}>One</Text></Text>
              <Text style={styles.logoSub}>Сброс пароля</Text>
            </View>
            <View style={styles.card}>
              <Text style={[styles.label, { marginBottom: 12 }]}>
                Укажите email — пришлём ссылку для смены пароля.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  placeholder="ivan@company.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
              </View>
              {error ? (
                <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
              ) : null}
              <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleForgot} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Отправить ссылку</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.backLink} onPress={() => { setMode('login'); setError(''); }}>
                <Text style={styles.backLinkText}>Назад ко входу</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (mode === 'admin') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always">
            <View style={styles.logoWrap}>
              <Text style={styles.logo}>OneOn<Text style={styles.logoAccent}>One</Text></Text>
              <Text style={styles.logoSub}>Панель администратора</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.adminHeader}>
                <View style={styles.adminIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
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
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                />
              </View>
              {error ? (
                <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
              ) : null}
              <TouchableOpacity style={styles.btn} onPress={handleAdminLogin}>
                <Text style={styles.btnText}>Войти</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setMode('login'); setError(''); setAdminCode(''); }}
              >
                <Text style={styles.backLinkText}>← Назад</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="always">
          <View style={styles.logoWrap}>
            <Text style={styles.logo}>OneOn<Text style={styles.logoAccent}>One</Text></Text>
            <Text style={styles.logoSub}>Эффективные 1-on-1 встречи с командой</Text>
          </View>

          <View style={styles.card}>
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

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                placeholder="ivan@company.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Пароль</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={v => { setPassword(v); setError(''); }}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                textContentType="password"
              />
            </View>

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
                textContentType="password"
              />
            </View>

            {/* Ошибка входа/регистрации */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Backend/profile error (server down, 401, etc.) */}
            {profileError ? (
              <View style={styles.errorBox}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} />
                <Text style={[styles.errorText, { marginLeft: 6 }]}>{profileError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={mode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              activeOpacity={0.7}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.btnText}>{mode === 'login' ? 'Войти →' : 'Зарегистрироваться →'}</Text>}
            </TouchableOpacity>

            {mode === 'login' && (
              <TouchableOpacity
                style={{ alignItems: 'center', marginTop: 14 }}
                onPress={() => { setMode('forgot'); setError(''); }}
              >
                <Text style={styles.adminLinkText}>Забыли пароль?</Text>
              </TouchableOpacity>
            )}

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
    flexGrow: 1, backgroundColor: c.bg, padding: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 26, fontWeight: '700', color: c.textPrimary },
  logoAccent: { color: c.accent },
  logoSub: { fontSize: 14, color: c.textMuted, marginTop: 6 },

  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: c.surface, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: c.border,
  },

  tabs: {
    flexDirection: 'row', backgroundColor: c.surface2,
    borderRadius: 10, padding: 4, marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: {
    backgroundColor: c.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '500', color: c.textMuted },
  tabTextActive: { color: c.textPrimary },
  fieldHidden: { opacity: 0, marginBottom: 0 },

  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.surface,
  },

  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorText: { fontSize: 14, color: c.danger, flexShrink: 1 },

  btn: {
    backgroundColor: c.accent, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },

  adminLink: { alignItems: 'center', marginTop: 18 },
  adminLinkText: { fontSize: 12, color: c.textMuted },

  adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  adminIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  adminTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  backLink: { alignItems: 'center', marginTop: 14, paddingVertical: 4 },
  backLinkText: { fontSize: 13, color: c.textMuted },

  emailIconWrap: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.blue200,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emailTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  emailDesc: { fontSize: 14, color: c.textSecondary },
  emailAddress: { fontSize: 15, fontWeight: '600', color: c.accent, marginVertical: 4 },
  emailHint: {
    fontSize: 13, color: c.textMuted, textAlign: 'center',
    marginBottom: 24, paddingHorizontal: 16,
  },
});
