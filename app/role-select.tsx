import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/auth';
import { colors } from '../src/constants/colors';

export default function RoleSelectScreen() {
  const { setActiveRole, signOut } = useAuth();
  const router = useRouter();

  const choose = async (role: 'team_lead' | 'member') => {
    await setActiveRole(role);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.title}>Войти как</Text>
        <Text style={styles.sub}>У вас есть обе роли. Выберите, в каком режиме работать сейчас.</Text>

        {[
          { role: 'team_lead' as const, icon: '👔', title: 'Тимлид', desc: 'Управление командой и 1-on-1 встречами' },
          { role: 'member' as const, icon: '🧑‍💻', title: 'Участник команды', desc: 'Участие во встречах и задачах команды' },
        ].map(opt => (
          <TouchableOpacity key={opt.role} style={styles.card} onPress={() => choose(opt.role)}>
            <Text style={styles.cardIcon}>{opt.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{opt.title}</Text>
              <Text style={styles.cardDesc}>{opt.desc}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  sub: { fontSize: 14, color: colors.textSecondary, marginBottom: 32, lineHeight: 20 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  cardIcon: { fontSize: 28 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: colors.textSecondary },
  arrow: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },

  signOutBtn: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  signOutText: { fontSize: 14, color: colors.textMuted },
});
