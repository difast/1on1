import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/context/theme';
import type { AppColors } from '../src/constants/colors';

export default function NotFound() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name="compass-outline" size={36} color={colors.accent} />
      </View>
      <Text style={styles.title}>Страница не найдена</Text>
      <Text style={styles.desc}>Похоже, этот раздел недоступен или был перемещён.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')}>
        <Text style={styles.btnText}>На главную</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: c.accentLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
  desc: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  btn: { marginTop: 12, backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
