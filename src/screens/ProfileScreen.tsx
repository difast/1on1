import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/auth';
import { updateUser } from '../lib/api';
import { colors } from '../constants/colors';
import { Avatar } from '../components/Avatar';

export default function ProfileScreen() {
  const { user, setUser, signOut, activeRole, hasBothRoles, setActiveRole, addSecondaryRole, addTeamLeadRole } = useAuth();

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

  const handleLogout = () => {
    Alert.alert(
      'Выйти',
      'Вы уверены что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: signOut },
      ]
    );
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

  if (!user) return null;

  const currentRole = activeRole ?? user.role;
  const roleLabel = currentRole === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник команды';
  const otherRoleLabel = currentRole === 'team_lead' ? '🧑‍💻 Участник команды' : '👔 Тимлид';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Профиль</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Выйти</Text>
        </TouchableOpacity>
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
              <Text style={styles.avatarOverlayText}>{uploadingAvatar ? '...' : '📷'}</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>{roleLabel}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>

        {/* Role management */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Роль</Text>
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
              {[
                { icon: '💼', label: 'Должность', value: user.title },
                { icon: '✈️', label: 'Telegram', value: user.telegram },
                { icon: '🔗', label: 'LinkedIn', value: user.linkedin },
                { icon: '⌨️', label: 'GitHub', value: user.github },
              ].map(f => (
                <View key={f.label} style={styles.infoRow}>
                  <Text style={styles.infoIcon}>{f.icon}</Text>
                  <View>
                    <Text style={styles.infoLabel}>{f.label}</Text>
                    <Text style={[styles.infoValue, !f.value && styles.infoEmpty]}>
                      {f.value || 'не указано'}
                    </Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  logoutBtnText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: 16 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarOverlay: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  avatarOverlayText: { fontSize: 12 },
  name: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginTop: 12 },
  role: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 4 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 14,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoIcon: { fontSize: 16, marginTop: 2 },
  infoLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 14, color: colors.textPrimary },
  infoEmpty: { color: colors.textMuted, fontStyle: 'italic' },

  editBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 4,
    backgroundColor: colors.surface2,
  },
  editBtnText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },

  field: { marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.textPrimary, backgroundColor: colors.surface,
  },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  addRoleHeader: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 12 },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  roleValue: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  switchBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface2 },
  switchBtnText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },

  errorBox: {
    backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorText: { fontSize: 14, color: colors.danger },
  cancelBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
});
