import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../src/context/auth';
import { createUser, joinTeam, updateUser } from '../src/lib/api';
import { colors } from '../src/constants/colors';

export default function OnboardingScreen() {
  const { session, user, setUser } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'team_lead' | 'member' | ''>('');
  const [createdUser, setCreatedUser] = useState<any>(null);

  // Step 2 fields
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [telegram, setTelegram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 3 photo
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  if (!session) return <Redirect href="/(auth)/login" />;
  if (user?.role) return <Redirect href="/(tabs)" />;

  const email = session.user.email!;

  const handleProfileSubmit = async () => {
    if (!name.trim()) { setError('Укажите имя'); return; }
    setError('');
    setLoading(true);
    try {
      const payload: any = {
        name: name.trim(),
        email,
        role,
        title: title.trim() || undefined,
        telegram: telegram.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        github: github.trim() || undefined,
      };
      const newUser = await createUser(payload) as any;

      if (role === 'member' && inviteCode.trim()) {
        try { await joinTeam({ invite_code: inviteCode.trim(), user_id: newUser.id }); } catch {}
      }

      setCreatedUser(newUser);
      setStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async () => {
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
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
      const b64 = result.assets[0].base64;
      if (b64) setAvatarBase64(`data:image/jpeg;base64,${b64}`);
    }
  };

  const handlePhotoSave = async () => {
    if (!avatarBase64 || !createdUser) { finish(createdUser); return; }
    setPhotoLoading(true);
    try {
      await updateUser(createdUser.id, { avatar: avatarBase64 });
      finish({ ...createdUser, avatar: avatarBase64 });
    } catch {
      finish(createdUser);
    } finally {
      setPhotoLoading(false);
    }
  };

  const finish = (u: any) => {
    setUser(u);
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.root}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>
            OneOn<Text style={styles.logoAccent}>One</Text>
          </Text>
        </View>

        {/* Step 1: Role */}
        {step === 1 && (
          <View style={{ width: '100%', maxWidth: 400 }}>
            <Text style={styles.stepTitle}>Кто вы?</Text>
            {[
              { r: 'team_lead', icon: '👔', title: 'Тимлид', desc: 'Управляю командой, провожу 1-on-1 встречи' },
              { r: 'member', icon: '🧑‍💻', title: 'Участник команды', desc: 'Являюсь частью команды, участвую в 1-on-1 встречах' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.r}
                style={styles.roleCard}
                onPress={() => { setRole(opt.r as any); setStep(2); }}
              >
                <Text style={styles.roleIcon}>{opt.icon}</Text>
                <Text style={styles.roleTitle}>{opt.title}</Text>
                <Text style={styles.roleDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Step 2: Profile */}
        {step === 2 && (
          <View style={[styles.card, { width: '100%', maxWidth: 400 }]}>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Назад</Text>
            </TouchableOpacity>
            <Text style={styles.stepHeader}>
              {role === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник команды'}
            </Text>
            <Text style={styles.stepSub}>Расскажите немного о себе</Text>

            {[
              { label: 'Имя *', value: name, setter: setName, placeholder: 'Иван Иванов' },
              { label: 'Должность', value: title, setter: setTitle, placeholder: 'Senior Engineer' },
              { label: 'Telegram', value: telegram, setter: setTelegram, placeholder: '@username' },
              { label: 'LinkedIn', value: linkedin, setter: setLinkedin, placeholder: 'linkedin.com/in/username' },
              { label: 'GitHub', value: github, setter: setGithub, placeholder: 'github.com/username' },
            ].map(f => (
              <View key={f.label} style={styles.field}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={f.value}
                  onChangeText={f.setter}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            ))}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, { opacity: 0.6 }]}
                value={email}
                editable={false}
              />
            </View>

            {role === 'member' && (
              <View style={styles.field}>
                <Text style={styles.label}>Код приглашения</Text>
                <TextInput
                  style={styles.input}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="ABC123"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
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
              onPress={handleProfileSubmit}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Сохранение...' : 'Далее →'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Photo */}
        {step === 3 && (
          <View style={[styles.card, { width: '100%', maxWidth: 400, alignItems: 'center' }]}>
            <Text style={styles.stepHeader}>Фото профиля</Text>
            <Text style={styles.stepSub}>Помогает коллегам узнать вас. Можно пропустить.</Text>

            <TouchableOpacity onPress={pickPhoto} style={styles.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase() || '?'}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={pickPhoto} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryText}>
                {avatarUri ? 'Выбрать другое' : 'Выбрать фото'}
              </Text>
            </TouchableOpacity>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={() => finish(createdUser)}
                disabled={photoLoading}
              >
                <Text style={styles.btnGhostText}>Пропустить</Text>
              </TouchableOpacity>
              {avatarUri && (
                <TouchableOpacity
                  style={[styles.btn, { flex: 1 }]}
                  onPress={handlePhotoSave}
                  disabled={photoLoading}
                >
                  <Text style={styles.btnText}>{photoLoading ? 'Сохранение...' : 'Сохранить'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
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
    gap: 16,
  },
  logoWrap: { alignItems: 'center', marginBottom: 8 },
  logo: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  logoAccent: { color: colors.accent },

  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },

  roleCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 12,
  },
  roleIcon: { fontSize: 28, marginBottom: 8 },
  roleTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  roleDesc: { fontSize: 14, color: colors.textSecondary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  backBtn: { marginBottom: 14 },
  backBtnText: { fontSize: 14, color: colors.textSecondary },
  stepHeader: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stepSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 18 },

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

  btnSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: colors.surface,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },

  btnGhost: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnGhostText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },

  avatarWrap: { marginVertical: 16 },
  avatarImg: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '700', color: colors.accent },

  row: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
