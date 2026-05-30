import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/auth';
import { useTheme } from '../src/context/theme';
import type { AppColors } from '../src/constants/colors';

export default function RoleSelectScreen() {
  const { setActiveRole, signOut } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

        {([
          { role: 'team_lead', icon: 'briefcase-outline', title: 'Тимлид', desc: 'Управление командой и 1-on-1 встречами' },
          { role: 'member', icon: 'person-outline', title: 'Участник команды', desc: 'Участие во встречах и задачах команды' },
        ] as const).map(opt => (
          <TouchableOpacity key={opt.role} style={styles.card} onPress={() => choose(opt.role)}>
            <View style={styles.cardIconWrap}>
              <Ionicons name={opt.icon} size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{opt.title}</Text>
              <Text style={styles.cardDesc}>{opt.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.backBtn} onPress={async () => { await signOut(); router.replace('/(auth)/login'); }}>
          <Ionicons name="arrow-back-outline" size={16} color={colors.textMuted} />
          <Text style={styles.backText}>Вернуться к входу</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  sub: { fontSize: 14, color: c.textSecondary, marginBottom: 32, lineHeight: 20 },

  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: c.textSecondary },

  backBtn: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  backText: { fontSize: 14, color: c.textMuted },
});
