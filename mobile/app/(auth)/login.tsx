import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/auth';
import { useTheme } from '../../src/context/theme';
import type { AppColors } from '../../src/constants/colors';
import { mailProviderFor } from '../../src/lib/mailProviders';
import { useI18n, translate } from '../../src/lib/i18n';
import YandexLoginButton from '../../src/components/YandexLoginButton';
import VkLoginButton from '../../src/components/VkLoginButton';
import TelegramLoginButton from '../../src/components/TelegramLoginButton';
import { yandexAuthConfig, vkAuthConfig, telegramConfig, authAdminLogin } from '../../src/lib/api';

type Mode = 'login' | 'register' | 'forgot' | 'forgot_sent' | 'admin' | 'confirm_sent';

// Кода администратора в приложении нет: его проверяет бэкенд по переменной
// окружения ADMIN_PASSWORD. Любая константа здесь лежала бы в открытом виде
// внутри APK и извлекалась бы из него распаковкой.

// Бэкенд отдаёт понятные русские сообщения в detail — показываем как есть.
function translateError(msg: any): string {
  return typeof msg === 'string' ? msg : translate('labels.somethingWentWrong');
}

function passwordProblem(pw: string): string {
  if ((pw || '').length < 8) return translate('validation.passwordShort');
  if (!/[A-Za-zА-Яа-я]/.test(pw) || !/\d/.test(pw)) return translate('validation.passwordWeak');
  return '';
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session, user, loading: authLoading, enterAdmin, profileError, retryProfile, signOut, signIn, signUp, forgotPassword, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Блокировка входа до подтверждения почты (Задача 2.4): показываем кнопку
  // повторной отправки письма прямо под ошибкой.
  const [needConfirm, setNeedConfirm] = useState(false);
  const [resendState, setResendState] = useState<'' | 'sending' | 'sent'>('');
  // Вход через Yandex ID — дополнительный способ рядом с email/паролем.
  // Кнопку показываем, только если способ настроен на бэкенде.
  const [yandexEnabled, setYandexEnabled] = useState(false);
  // Вход через VK ID — рабочая иконка в том же ряду. redirectUrl — веб-адрес
  // моста (/auth/vk/callback), который приложение открывает с platform=mobile.
  const [vkEnabled, setVkEnabled] = useState(false);
  const [vkRedirect, setVkRedirect] = useState('');
  // Вход через Telegram — иконка в том же ряду. loginUrl — веб-мост
  // (/auth/telegram/callback), который приложение открывает с platform=mobile.
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgLoginUrl, setTgLoginUrl] = useState('');
  const submittingRef = useRef(false);

  React.useEffect(() => {
    yandexAuthConfig().then(r => setYandexEnabled(!!r?.enabled)).catch(() => setYandexEnabled(false));
    vkAuthConfig().then(r => { setVkEnabled(!!r?.enabled); setVkRedirect(r?.redirect_url || ''); })
      .catch(() => { setVkEnabled(false); setVkRedirect(''); });
    telegramConfig().then(r => { setTgEnabled(!!r?.enabled && !!r?.login_url); setTgLoginUrl(r?.login_url || ''); })
      .catch(() => { setTgEnabled(false); setTgLoginUrl(''); });
  }, []);

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
          {t('auth.serverUnavailable')}
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
            {authLoading ? t('common.loading') : t('common.retry')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={signOut}>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('menu.logout')}</Text>
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
    setError(''); setNeedConfirm(false); setResendState('');
    if (!email.trim()) { setError(t('ui.vvedite_email')); return; }
    submittingRef.current = true;
    setLoading(true);
    try {
      await signIn(email, password);
      // На успехе _layout уводит на нужный экран; спиннер держим до навигации.
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.response?.detail;
      // Вход заблокирован до подтверждения почты (общий бэкенд): code
      // 'email_unconfirmed'. Показываем понятное сообщение + повторная отправка.
      if (detail && typeof detail === 'object' && detail.code === 'email_unconfirmed') {
        setNeedConfirm(true);
        setError(detail.message || t('validation.emailUnconfirmed'));
      } else {
        setError(translateError(typeof detail === 'string' ? detail : t('auth.yandexFailedTitle')));
      }
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendState === 'sending') return;
    setResendState('sending');
    try { await resendConfirmation(email); setResendState('sent'); }
    catch { setResendState(''); }
  };

  const handleRegister = async () => {
    if (submittingRef.current) return;
    setError('');
    if (!email.trim()) { setError(t('ui.vvedite_email')); return; }
    if (password !== confirmPassword) { setError(t('validation.passwordMismatch')); return; }
    const pw = passwordProblem(password);
    if (pw) { setError(pw); return; }
    submittingRef.current = true;
    setLoading(true);
    try {
      // Регистрация НЕ входит в кабинет: показываем экран подтверждения почты.
      // Войти можно только после перехода по ссылке из письма.
      await signUp(email, password);
      setMode('confirm_sent');
    } catch (err: any) {
      setError(translateError(err?.response?.data?.detail ?? err?.response?.detail ?? t('ui.ne_udalos_zaregistrirovatsya')));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const openMailApp = () => {
    const p = mailProviderFor(email);
    if (p.url) Linking.openURL(p.url).catch(() => {});
  };

  const handleForgot = async () => {
    setError('');
    if (!email.trim()) { setError(t('ui.vvedite_email')); return; }
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch { /* не раскрываем наличие аккаунта */ }
    finally { setLoading(false); setMode('forgot_sent'); }
  };

  const handleAdminLogin = async () => {
    setError('');
    const code = adminCode.trim();
    if (!code) { setError(t('ui.nevernyy_kod_administratora')); return; }
    setLoading(true);
    try {
      await authAdminLogin(code);
      await enterAdmin();
    } catch (e: any) {
      const detail = e?.response?.detail;
      setError(e?.response?.status === 503 && typeof detail === 'string'
        ? detail : t('ui.nevernyy_kod_administratora'));
    } finally { setLoading(false); }
  };

  if (mode === 'confirm_sent') {
    const provider = mailProviderFor(email);
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        {/* Брендовый акцент экрана — крупная надпись заглавными буквами */}
        <Text style={styles.brand}>ONEON<Text style={styles.logoAccent}>ONE</Text></Text>
        <View style={styles.emailIconWrap}>
          <Ionicons name="mail-outline" size={28} color={colors.accent} />
        </View>
        <Text style={styles.emailTitle}>{t('auth.confirmTitle')}</Text>
        <Text style={styles.emailDesc}>{t('ui.registraciya_zavershena_my_otpravili_pismo_so')}</Text>
        <Text style={styles.emailAddress}>{email}</Text>
        <Text style={styles.emailHint}>{t('auth.confirmHint')}</Text>
        <View style={{ flexDirection: 'row', gap: 10, width: '100%', maxWidth: 400 }}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, { flex: 0 }]}
            onPress={() => { setMode('login'); setError(''); setPassword(''); setConfirmPassword(''); setNeedConfirm(true); }}
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>{t('ui.voyti')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { flex: 1 }, !provider.url && styles.btnDisabled]}
            onPress={openMailApp}
            disabled={!provider.url}
          >
            <Text style={styles.btnText}>{t(provider.labelKey)}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'forgot_sent') {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <View style={styles.emailIconWrap}>
          <Ionicons name="mail-outline" size={28} color={colors.accent} />
        </View>
        <Text style={styles.emailTitle}>{t('auth.checkEmailTitle')}</Text>
        <Text style={styles.emailDesc}>{t('ui.esli_dlya_etogo_adresa_est_akkaunt')}</Text>
        <Text style={styles.emailAddress}>{email}</Text>
        <Text style={styles.emailHint}>{t('ui.otkroyte_ssylku_iz_pisma_i_zadayte')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => { setMode('login'); setError(''); }}>
          <Text style={styles.btnText}>{t('auth.backToLogin')}</Text>
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
              <Text style={styles.logoSub}>{t('auth.resetTitle')}</Text>
            </View>
            <View style={styles.card}>
              <Text style={[styles.label, { marginBottom: 12 }]}>
                {t('auth.resetHint')}
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  placeholder={t('auth.emailPlaceholder')}
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
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>{t('auth.resetSubmit')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.backLink} onPress={() => { setMode('login'); setError(''); }}>
                <Text style={styles.backLinkText}>{t('auth.resetBack')}</Text>
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
              <Text style={styles.logoSub}>{t('ui.panel_administratora')}</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.adminHeader}>
                <View style={styles.adminIconWrap}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
                </View>
                <Text style={styles.adminTitle}>{t('auth.adminLogin')}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('ui.kod_administratora')}</Text>
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
                <Text style={styles.btnText}>{t('ui.voyti')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backLink}
                onPress={() => { setMode('login'); setError(''); setAdminCode(''); }}
              >
                <Text style={styles.backLinkText}>{t('ui.nazad')}</Text>
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
            <Text style={styles.logoSub}>{t('auth.tagline')}</Text>
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
                    {tab === 'login' ? t('auth.tabLogin') : t('auth.tabRegister')}
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
              <Text style={styles.label}>{t('auth.password')}</Text>
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
              <Text style={styles.label}>{t('auth.repeatPassword')}</Text>
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

            {/* Ошибка входа/регистрации. При блокировке из-за неподтверждённой
                почты — кнопка повторной отправки письма (Задача 2.4). */}
            {error ? (
              <View style={[styles.errorBox, needConfirm && styles.warnBox]}>
                <Text style={[styles.errorText, needConfirm && styles.warnText]}>{error}</Text>
              </View>
            ) : null}
            {needConfirm ? (
              resendState === 'sent' ? (
                <Text style={[styles.warnText, { marginBottom: 12 }]}>{t('auth.resendSent')}</Text>
              ) : (
                <TouchableOpacity style={{ marginBottom: 12 }} onPress={handleResend} disabled={resendState === 'sending'}>
                  <Text style={[styles.adminLinkText, { color: colors.accent, fontWeight: '600' }]}>
                    {resendState === 'sending' ? t('common.sending') : t('auth.resendEmail')}
                  </Text>
                </TouchableOpacity>
              )
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
                : <Text style={styles.btnText}>{mode === 'login' ? `${t('auth.submitLogin')} →` : `${t('auth.submitRegister')} →`}</Text>}
            </TouchableOpacity>

            {/* Соц-вход компактными иконками в ряду с подписью «Войти через» —
                единый визуальный язык с веб-версией. Порядок как на вебе:
                Яндекс ID → Telegram → VK ID. Дополняют email/пароль, не заменяют
                его; каждая иконка показывается только если способ включён на
                бэкенде. */}
            {(yandexEnabled || tgEnabled || vkEnabled) && (
              <View style={{ marginTop: 16 }}>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>{t('auth.loginWith')}</Text>
                  <View style={styles.dividerLine} />
                </View>
                <View style={styles.socialRow}>
                  {yandexEnabled && <YandexLoginButton compact onError={setError} />}
                  {tgEnabled && <TelegramLoginButton loginUrl={tgLoginUrl} onError={setError} />}
                  {vkEnabled && <VkLoginButton redirectUrl={vkRedirect} onError={setError} />}
                </View>
              </View>
            )}

            {/* Ниже кнопок входа: восстановление пароля и админ-вход */}
            {mode === 'login' && (
              <TouchableOpacity
                style={{ alignItems: 'center', marginTop: 16 }}
                onPress={() => { setMode('forgot'); setError(''); }}
              >
                <Text style={styles.adminLinkText}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>
            )}

            {/* Вход для администратора — служебный, обособлен от обычного входа:
                увеличенный отступ и тонкий разделитель сверху, мельче кегль и
                приглушённее цвет, чтобы не смотрелся как равнозначный способ
                входа для обычного пользователя. */}
            <View style={styles.adminSep}>
              <TouchableOpacity
                onPress={() => { setMode('admin'); setError(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.adminSepText}>{t('auth.adminLogin')}</Text>
              </TouchableOpacity>
            </View>
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
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: 1.5, color: c.textPrimary, marginBottom: 20 },

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
  btnSecondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, paddingHorizontal: 22 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  warnBox: { backgroundColor: '#fff8ed', borderColor: '#fcd9a5' },
  warnText: { fontSize: 13, color: '#7c4a03' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dividerText: { fontSize: 12, color: c.textMuted },
  // Подпись «Войти через» над рядом иконок соц-входа.
  dividerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: c.textMuted, textTransform: 'uppercase' },
  // Ряд компактных иконок соц-входа: единые размеры и отступы.
  socialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },

  adminLink: { alignItems: 'center', marginTop: 18 },
  adminLinkText: { fontSize: 12, color: c.textMuted },
  // Обособление служебного «Вход для администратора».
  adminSep: {
    alignItems: 'center', marginTop: 24, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  adminSepText: { fontSize: 11, color: c.textMuted, opacity: 0.7, letterSpacing: 0.3 },

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
