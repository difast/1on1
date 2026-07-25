import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { updateUser, deleteUser, createSupportTicket, telegramLink, authChangePassword, authResendConfirmation } from '../lib/api';
import { getCoaching, setCoaching } from '../lib/coaching';
import { useI18n, LANGS, type Lang } from '../lib/i18n';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Avatar } from '../components/Avatar';
import { LegalDocsModal } from '../components/LegalDocsModal';

export default function ProfileScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, setUser, signOut, activeRole, hasBothRoles, setActiveRole, addSecondaryRole, addTeamLeadRole } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [showDocs, setShowDocs] = useState(false);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: user?.title ?? '',
    telegram: user?.telegram ?? '',
    linkedin: user?.linkedin ?? '',
    github: user?.github ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [showAddRole, setShowAddRole] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [addRoleLoading, setAddRoleLoading] = useState(false);
  const [addRoleError, setAddRoleError] = useState('');

  // Password change
  const [showPassword, setShowPassword] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  // Подсказки Пита (коучинг) — тумблер, как на вебе
  const [coachOn, setCoachOn] = useState(true);
  useEffect(() => { getCoaching().then(setCoachOn); }, []);
  const toggleCoach = () => { const next = !coachOn; setCoachOn(next); setCoaching(next); };

  // Язык интерфейса: применяем сохранённый выбор пользователя один раз;
  // переключение циклом ru -> en -> kz с сохранением в профиль.
  useEffect(() => {
    const pl = (user as any)?.preferred_language;
    if (pl === 'ru' || pl === 'en' || pl === 'kz') setLang(pl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cycleLang = () => {
    const order: Lang[] = ['ru', 'en', 'kz'];
    const next = order[(order.indexOf(lang) + 1) % order.length];
    setLang(next);
    if (user) updateUser(user.id, { preferred_language: next }).catch(() => {});
  };
  const langLabel = LANGS.find((l) => l.code === lang)?.label ?? 'Русский';

  // Привязка Telegram по коду из бота
  const [showTgLink, setShowTgLink] = useState(false);
  const [tgCode, setTgCode] = useState('');
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState('');
  const handleTgLink = async () => {
    if (!user) return;
    if (!tgCode.trim()) { setTgError('Введите код'); return; }
    setTgBusy(true); setTgError('');
    try {
      const res = await telegramLink(user.id, tgCode.trim());
      setUser({ ...user, ...(res.user || {}) } as any);
      setShowTgLink(false); setTgCode('');
      Alert.alert('Готово', 'Telegram привязан к аккаунту');
    } catch (err: any) {
      setTgError(err?.response?.data?.detail ?? err?.response?.detail ?? 'Не удалось привязать');
    } finally { setTgBusy(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || null,
        telegram: form.telegram.trim() || null,
        linkedin: form.linkedin.trim() || null,
        github: form.github.trim() || null,
      };
      await updateUser(user.id, payload);
      setUser({ ...user, ...payload } as any);
      setEditing(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить профиль');
    } finally { setSaving(false); }
  };

  const handleAvatarChange = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64 && user) {
      setUploadingAvatar(true);
      try {
        const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateUser(user.id, { avatar: b64 });
        setUser({ ...user, avatar: b64 });
      } catch {
        Alert.alert('Ошибка', 'Не удалось обновить фото');
      } finally { setUploadingAvatar(false); }
    }
  };


  const handleAddRole = async () => {
    setAddRoleLoading(true); setAddRoleError('');
    try {
      if (currentRole === 'member') {
        if (!newTeamName.trim()) { setAddRoleError('Введите название команды'); setAddRoleLoading(false); return; }
        await addTeamLeadRole(newTeamName.trim());
      } else {
        if (!inviteCode.trim()) { setAddRoleError('Введите код приглашения'); setAddRoleLoading(false); return; }
        await addSecondaryRole(inviteCode.trim());
      }
      setShowAddRole(false);
      setInviteCode('');
      setNewTeamName('');
    } catch (err: any) {
      setAddRoleError(err?.response?.detail ?? err?.response?.data?.detail ?? 'Ошибка. Проверьте данные и повторите.');
    } finally { setAddRoleLoading(false); }
  };

  const handleSwitchRole = async () => {
    const nextRole: 'team_lead' | 'member' = (activeRole ?? user?.role) === 'team_lead' ? 'member' : 'team_lead';
    await setActiveRole(nextRole);
  };

  const handleChangePassword = async () => {
    if (!pwdCurrent.trim()) { setPwdError('Введите текущий пароль'); return; }
    if (pwdNew.length < 8 || !/[A-Za-zА-Яа-я]/.test(pwdNew) || !/\d/.test(pwdNew)) {
      setPwdError('Пароль: минимум 8 символов, буквы и цифры'); return;
    }
    if (pwdNew !== pwdConfirm) { setPwdError('Пароли не совпадают'); return; }
    if (!user?.id) return;
    setPwdLoading(true); setPwdError('');
    try {
      await authChangePassword({ user_id: user.id, current_password: pwdCurrent, new_password: pwdNew });
      setPwdSuccess('Пароль изменён');
      setPwdCurrent(''); setPwdNew(''); setPwdConfirm('');
      setTimeout(() => { setPwdSuccess(''); setShowPassword(false); }, 1500);
    } catch (err: any) {
      setPwdError(err?.response?.data?.detail ?? err?.response?.detail ?? 'Не удалось изменить пароль');
    } finally { setPwdLoading(false); }
  };

  const [resendLoading, setResendLoading] = useState(false);
  const handleResendConfirmation = async () => {
    if (!user?.id) return;
    setResendLoading(true);
    try {
      await authResendConfirmation(user.id);
      Alert.alert('Письмо отправлено', 'Проверьте почту и перейдите по ссылке.');
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить письмо. Попробуйте позже.');
    } finally { setResendLoading(false); }
  };

  const handleLogout = () => {
    Alert.alert('Выйти', 'Вы уверены?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: signOut },
    ]);
  };

  const [deletingAccount, setDeletingAccount] = useState(false);
  const handleDeleteAccount = () => {
    Alert.alert(
      'Удалить аккаунт',
      'Это действие необратимо. Все ваши данные будут удалены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setDeletingAccount(true);
            try {
              await createSupportTicket({
                user_id: user.id,
                subject: '[SYSTEM] Удаление аккаунта',
                body: `Пользователь ${user.name} (${user.email}, id=${user.id}) запросил удаление аккаунта.`,
              }).catch(() => {});
              await deleteUser(user.id);
              await signOut();
            } catch {
              Alert.alert('Ошибка', 'Не удалось удалить аккаунт. Попробуйте позже.');
            } finally { setDeletingAccount(false); }
          },
        },
      ]
    );
  };

  if (!user) return null;

  const currentRole = activeRole ?? user.role;
  const roleLabel = currentRole === 'team_lead' ? t('role.lead') : t('role.member');
  const otherRoleLabel = currentRole === 'team_lead' ? t('role.member') : t('role.lead');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleAvatarChange} disabled={uploadingAvatar}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
            ) : (
              <Avatar name={user.name} size={88} />
            )}
            <View style={styles.avatarOverlay}>
              {uploadingAvatar
                ? <Text style={styles.avatarOverlayText}>...</Text>
                : <Ionicons name="camera" size={14} color="#fff" />}
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        {/* Role management */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('role.title')}</Text>
          <View style={styles.roleRow}>
            <Text style={styles.roleValue}>{roleLabel}</Text>
            {hasBothRoles ? (
              <TouchableOpacity style={styles.switchBtn} onPress={handleSwitchRole}>
                <Text style={styles.switchBtnText}>Переключить на {otherRoleLabel}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.switchBtn} onPress={() => { setShowAddRole(v => !v); setAddRoleError(''); }}>
                <Text style={styles.switchBtnText}>{showAddRole ? 'Отмена' : '+ Добавить роль'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {showAddRole && !hasBothRoles && (
            <View style={{ marginTop: 14 }}>
              {currentRole === 'member' ? (
                <>
                  <Text style={styles.addRoleHeader}>Добавить роль Тимлида</Text>
                  <Text style={styles.fieldLabel}>Название команды</Text>
                  <TextInput
                    style={styles.input}
                    value={newTeamName}
                    onChangeText={setNewTeamName}
                    placeholder="Например: Backend Team"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="words"
                  />
                  {addRoleError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{addRoleError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, addRoleLoading && styles.btnDisabled]}
                    onPress={handleAddRole}
                    disabled={addRoleLoading}
                  >
                    <Text style={styles.saveBtnText}>{addRoleLoading ? 'Создание...' : 'Создать команду'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.addRoleHeader}>Добавить роль Участника</Text>
                  <Text style={styles.fieldLabel}>Код приглашения</Text>
                  <TextInput
                    style={styles.input}
                    value={inviteCode}
                    onChangeText={v => setInviteCode(v.toUpperCase())}
                    placeholder="ABC123"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                  {addRoleError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{addRoleError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, addRoleLoading && styles.btnDisabled]}
                    onPress={handleAddRole}
                    disabled={addRoleLoading}
                  >
                    <Text style={styles.saveBtnText}>{addRoleLoading ? 'Присоединение...' : 'Присоединиться'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        {/* Info / Edit */}
        <View style={styles.card}>
          {!editing ? (
            <>
              {([
                { icon: 'briefcase-outline', label: 'Должность', value: user.title },
                { icon: 'paper-plane-outline', label: 'Telegram', value: user.telegram },
                { icon: 'logo-linkedin', label: 'LinkedIn', value: user.linkedin },
                { icon: 'logo-github', label: 'GitHub', value: user.github },
              ] as const).map(f => (
                <View key={f.label} style={styles.infoRow}>
                  <View style={styles.infoIconWrap}>
                    <Ionicons name={f.icon} size={18} color={colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>{f.label}</Text>
                    <Text style={[styles.infoValue, !f.value && styles.infoEmpty]}>
                      {f.value || 'не указано'}
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="create-outline" size={16} color={colors.accent} />
                <Text style={styles.editBtnText}>Редактировать</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {[
                { key: 'title', label: 'Должность', placeholder: 'Senior Engineer' },
                { key: 'telegram', label: 'Telegram', placeholder: '@username' },
                { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/username' },
                { key: 'github', label: 'GitHub', placeholder: 'github.com/username' },
              ].map(f => (
                <View key={f.key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={(form as any)[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              ))}
              <View style={styles.editRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.cancelBtnText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>{saving ? '...' : 'Сохранить'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Подтверждение почты — не блокирует продукт, нужно только для оплаты.
            Показываем лишь тем, у кого есть email и он не подтверждён. */}
        {user?.email && user?.email_confirmed === false && (
          <View style={styles.confirmEmailCard}>
            <Text style={styles.confirmEmailText}>
              Подтвердите почту — это нужно для оформления платной подписки. Мы отправили ссылку на {user.email}.
            </Text>
            <TouchableOpacity onPress={handleResendConfirmation} disabled={resendLoading} style={styles.confirmEmailBtn}>
              <Text style={styles.confirmEmailBtnText}>{resendLoading ? 'Отправляем...' : 'Отправить повторно'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Настройки: пароль + быстрые тумблеры + привязка Telegram (как в веб-меню) */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionLabel}>{t('settings.title')}</Text>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => { setShowPassword(v => !v); setPwdError(''); setPwdSuccess(''); }}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="key-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('settings.changePassword')}</Text>
            <Ionicons name={showPassword ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {showPassword && (
            <View style={styles.expandedBlock}>
              {pwdSuccess ? (
                <Text style={styles.successText}>{pwdSuccess}</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Текущий пароль"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={pwdCurrent}
                    onChangeText={v => { setPwdCurrent(v); setPwdError(''); }}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Новый пароль (минимум 8, буквы и цифры)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={pwdNew}
                    onChangeText={v => { setPwdNew(v); setPwdError(''); }}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Подтвердите пароль"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={pwdConfirm}
                    onChangeText={v => { setPwdConfirm(v); setPwdError(''); }}
                    autoCapitalize="none"
                  />
                  {pwdError ? <Text style={[styles.errorText, { marginBottom: 4 }]}>{pwdError}</Text> : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, pwdLoading && styles.btnDisabled]}
                    onPress={handleChangePassword}
                    disabled={pwdLoading}
                  >
                    <Text style={styles.saveBtnText}>{pwdLoading ? 'Сохранение...' : 'Сохранить пароль'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Тёмная тема */}
          <TouchableOpacity style={styles.menuRow} onPress={toggleTheme} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('settings.darkTheme')}</Text>
            <View style={[styles.toggle, isDark && styles.toggleOn]}>
              <View style={[styles.toggleThumb, isDark && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          {/* Подсказки Пита (коучинг) */}
          <TouchableOpacity style={styles.menuRow} onPress={toggleCoach} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('settings.hints')}</Text>
            <View style={[styles.toggle, coachOn && styles.toggleOn]}>
              <View style={[styles.toggleThumb, coachOn && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          {/* Язык интерфейса — переключение циклом */}
          <TouchableOpacity style={styles.menuRow} onPress={cycleLang} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="language-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('settings.language')}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{langLabel}</Text>
          </TouchableOpacity>

          {/* Привязать Telegram — только если ещё не привязан */}
          {!(user as any).telegram_id && (
            <>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { setShowTgLink(v => !v); setTgError(''); }}
                activeOpacity={0.7}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name="paper-plane-outline" size={18} color={colors.textSecondary} />
                </View>
                <Text style={styles.menuRowTitle}>{t('settings.linkTelegram')}</Text>
                <Ionicons name={showTgLink ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {showTgLink && (
                <View style={styles.expandedBlock}>
                  <Text style={[styles.infoLabel, { textTransform: 'none', marginBottom: 8 }]}>
                    Откройте бота в Telegram, отправьте /link и введите полученный код.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Код из бота"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    value={tgCode}
                    onChangeText={v => { setTgCode(v.toUpperCase()); setTgError(''); }}
                  />
                  {tgError ? <Text style={[styles.errorText, { marginBottom: 4 }]}>{tgError}</Text> : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, tgBusy && styles.btnDisabled]}
                    onPress={handleTgLink}
                    disabled={tgBusy}
                  >
                    <Text style={styles.saveBtnText}>{tgBusy ? 'Привязка...' : 'Привязать'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Help */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionLabel}>{t('help.title')}</Text>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/knowledge' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="book-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>База знаний</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/tariff' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>Мой тариф</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/company' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="business-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>Организация</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/goals' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>Цели</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/development' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="trending-up-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>Развитие</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/one-ai' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            </View>
            <Text style={styles.menuRowTitle}>ONE AI</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push({ pathname: '/(tabs)/analytics', params: { from: 'profile' } } as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="bar-chart-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('help.analytics')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push({ pathname: '/(tabs)/notifications', params: { from: 'profile' } } as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="notifications-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('help.notifications')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/assistant' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            </View>
            <Text style={styles.menuRowTitle}>{t('help.assistant')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push({ pathname: '/(tabs)/support', params: { from: 'profile' } } as any)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('help.support')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setShowDocs(true)}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuRowTitle}>{t('help.documents')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Logout + Delete */}
        <View style={[styles.menuSection, { marginBottom: 0 }]}>
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            </View>
            <Text style={[styles.menuRowTitle, { color: colors.danger }]}>{t('account.logout')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuRow, deletingAccount && styles.btnDisabled]}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
            disabled={deletingAccount}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <Text style={[styles.menuRowTitle, { color: colors.danger }]}>
              {deletingAccount ? t('account.deleting') : t('account.delete')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <LegalDocsModal visible={showDocs} onClose={() => setShowDocs(false)} />
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  themeToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.accentLight, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: c.accent,
  },
  themeToggleText: { fontSize: 13, fontWeight: '600', color: c.accent },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  logoutBtnText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
  content: { padding: 16, gap: 16, paddingBottom: 100 },

  avatarSection: { alignItems: 'center', paddingVertical: 16 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: c.bg,
  },
  avatarOverlayText: { fontSize: 12, color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: c.textPrimary, marginTop: 12 },
  role: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
  email: { fontSize: 13, color: c.textMuted, marginTop: 4 },

  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    gap: 14,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIconWrap: {
    width: 36, height: 36, borderRadius: 9, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 11, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 14, color: c.textPrimary },
  infoEmpty: { color: c.textMuted, fontStyle: 'italic' },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 12, marginTop: 4,
    backgroundColor: c.surface2,
  },
  editBtnText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },

  field: { marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.surface,
  },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  addRoleHeader: { fontSize: 14, fontWeight: '600', color: c.textPrimary, marginBottom: 12 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  roleValue: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
  switchBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.surface2 },
  switchBtnText: { fontSize: 12, fontWeight: '500', color: c.textSecondary },

  errorBox: {
    backgroundColor: c.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorText: { fontSize: 14, color: c.danger },
  cancelBtn: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
  saveBtn: {
    backgroundColor: c.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.6 },

  confirmEmailCard: {
    backgroundColor: '#fff8ed', borderWidth: 1, borderColor: '#fcd9a5',
    borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 14, gap: 10,
  },
  confirmEmailText: { fontSize: 13, color: '#7c4a03', lineHeight: 19 },
  confirmEmailBtn: {
    alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.blue200,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  confirmEmailBtnText: { fontSize: 13, fontWeight: '600', color: c.accent },
  menuSection: {
    backgroundColor: c.surface, borderRadius: 16,
    borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 0,
  },
  menuSectionLabel: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  menuRowDanger: { borderTopWidth: 0 },
  menuIconWrap: { width: 24, alignItems: 'center', justifyContent: 'center' },
  menuRowTitle: { flex: 1, fontSize: 15, fontWeight: '500', color: c.textPrimary },

  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: c.border, justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: c.accent },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  expandedBlock: {
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 14, gap: 10,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  successText: { fontSize: 14, color: c.success, textAlign: 'center', paddingVertical: 8 },
});
