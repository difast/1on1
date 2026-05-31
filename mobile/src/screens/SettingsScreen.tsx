import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import { supabase } from '../lib/supabase';
import type { AppColors } from '../constants/colors';

export default function SettingsScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signOut, enterAdmin, isAdmin, exitAdmin } = useAuth();

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showAdminSection, setShowAdminSection] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [adminError, setAdminError] = useState('');

  const ADMIN_CODE = '1on12026';

  const handleAdminUnlock = async () => {
    if (adminCode !== ADMIN_CODE) { setAdminError('Неверный код'); return; }
    await enterAdmin();
    setShowAdminSection(false);
    setAdminCode('');
    setAdminError('');
  };
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const handleChangePassword = async () => {
    if (!pwdNew.trim()) { setPwdError('Введите новый пароль'); return; }
    if (pwdNew.length < 6) { setPwdError('Пароль должен быть не менее 6 символов'); return; }
    if (pwdNew !== pwdConfirm) { setPwdError('Пароли не совпадают'); return; }
    setPwdLoading(true);
    setPwdError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: pwdNew });
      if (error) { setPwdError(error.message); return; }
      setPwdSuccess('Пароль успешно изменён');
      setPwdNew(''); setPwdConfirm('');
      setTimeout(() => { setPwdSuccess(''); setShowPasswordSection(false); }, 1500);
    } catch { setPwdError('Произошла ошибка'); } finally { setPwdLoading(false); }
  };

  const handleLogout = () => {
    Alert.alert('Выйти', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Настройки</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Оформление</Text>
          <TouchableOpacity style={styles.row} onPress={toggleTheme} activeOpacity={0.7}>
            <View style={styles.rowIcon}><Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={colors.textSecondary} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{isDark ? 'Светлая тема' : 'Тёмная тема'}</Text>
              <Text style={styles.rowSub}>Сейчас: {isDark ? 'тёмная' : 'светлая'}</Text>
            </View>
            <View style={[styles.toggle, isDark && styles.toggleOn]}>
              <View style={[styles.toggleThumb, isDark && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Аккаунт</Text>

          <TouchableOpacity
            style={styles.row}
            onPress={() => { setShowPasswordSection(v => !v); setPwdError(''); setPwdSuccess(''); }}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}><Ionicons name="key-outline" size={18} color={colors.textSecondary} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Сменить пароль</Text>
            </View>
            <Ionicons name={showPasswordSection ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {showPasswordSection && (
            <View style={styles.expandedBlock}>
              {pwdSuccess ? (
                <Text style={styles.successText}>✓ {pwdSuccess}</Text>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Новый пароль"
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
                  {pwdError ? <Text style={styles.errorText}>{pwdError}</Text> : null}
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
        </View>

        {/* Help */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Поддержка</Text>
          <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Помощь', 'Обратитесь к администратору или напишите в поддержку.')} activeOpacity={0.7}>
            <View style={styles.rowIcon}><Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Помощь</Text>
              <Text style={styles.rowSub}>Справка и поддержка</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Admin */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Дополнительно</Text>
          {isAdmin ? (
            <TouchableOpacity style={styles.row} onPress={() => exitAdmin()} activeOpacity={0.7}>
              <View style={styles.rowIcon}><Ionicons name="shield-outline" size={18} color={colors.accent} /></View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Выйти из режима администратора</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.row}
                onPress={() => { setShowAdminSection(v => !v); setAdminError(''); setAdminCode(''); }}
                activeOpacity={0.7}
              >
                <View style={styles.rowIcon}><Ionicons name="shield-outline" size={18} color={colors.textSecondary} /></View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Режим администратора</Text>
                </View>
                <Ionicons name={showAdminSection ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {showAdminSection && (
                <View style={styles.expandedBlock}>
                  <TextInput
                    style={styles.input}
                    placeholder="Код администратора"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    textContentType="password"
                    value={adminCode}
                    onChangeText={v => { setAdminCode(v); setAdminError(''); }}
                  />
                  {adminError ? <Text style={styles.errorText}>{adminError}</Text> : null}
                  <TouchableOpacity style={styles.saveBtn} onPress={handleAdminUnlock}>
                    <Text style={styles.saveBtnText}>Войти как администратор</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={[styles.row, styles.rowDanger]} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.rowIcon}><Ionicons name="log-out-outline" size={18} color={colors.danger} /></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitleDanger}>Выйти</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  section: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: c.border,
  },
  rowDanger: { borderTopWidth: 0 },
  rowIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: c.textPrimary },
  rowTitleDanger: { fontSize: 15, fontWeight: '500', color: c.danger },
  rowSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  rowChevron: { fontSize: 16, color: c.textMuted },

  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: c.border, justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: c.accent },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  expandedBlock: {
    paddingHorizontal: 16, paddingBottom: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: c.border,
    paddingTop: 14,
  },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: c.textPrimary, backgroundColor: c.surface,
  },
  errorText: { fontSize: 13, color: c.danger },
  successText: { fontSize: 14, color: c.success, textAlign: 'center', paddingVertical: 8 },
  saveBtn: {
    backgroundColor: c.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
