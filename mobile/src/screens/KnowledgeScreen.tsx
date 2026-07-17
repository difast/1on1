// База знаний (просмотр и чтение). Редактирование — на вебе/в админке.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { getKnowledgeArticles } from '../lib/api';

type Status = 'loading' | 'error' | 'ready';

export default function KnowledgeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [articles, setArticles] = useState<any[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getKnowledgeArticles();
        if (!alive) return;
        setArticles(Array.isArray(res) ? res : []);
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>База знаний</Text>
        <View style={{ width: 24 }} />
      </View>

      {status === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>}
      {status === 'error' && <View style={styles.center}><Text style={styles.muted}>Не удалось загрузить. Попробуйте позже.</Text></View>}

      {status === 'ready' && (
        <ScrollView contentContainerStyle={styles.content}>
          {articles.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="book-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.muted, { marginTop: 12, textAlign: 'center' }]}>Статей пока нет.</Text>
            </View>
          ) : (
            articles.map((a) => {
              const open = openId === a.id;
              return (
                <View key={a.id} style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardHead}
                    activeOpacity={0.7}
                    onPress={() => setOpenId(open ? null : a.id)}
                  >
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  {open ? <Text style={styles.cardBody}>{a.content || ''}</Text> : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { width: 24, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { fontSize: 14, color: c.textMuted },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.textPrimary },
  cardBody: { fontSize: 14, color: c.textSecondary, lineHeight: 21, paddingBottom: 16 },
});
