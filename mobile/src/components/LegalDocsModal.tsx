import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import { LEGAL_DOCS, type LegalBlock } from '../lib/legalDocs';
import type { AppColors } from '../constants/colors';

export function LegalDocsModal({ visible, initialKey, onClose }: {
  visible: boolean;
  initialKey?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [active, setActive] = useState(initialKey || LEGAL_DOCS[0].key);
  const doc = LEGAL_DOCS.find(d => d.key === active) || LEGAL_DOCS[0];

  const renderBlock = (b: LegalBlock, i: number) => {
    if (b.t === 'h') return <Text key={i} style={styles.h}>{b.text}</Text>;
    if (b.t === 'p') return <Text key={i} style={styles.p}>{b.text}</Text>;
    if (b.t === 'ul') return (
      <View key={i} style={styles.ul}>
        {(b.items || []).map((it, j) => (
          <View key={j} style={styles.li}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.liText}>{it}</Text>
          </View>
        ))}
      </View>
    );
    if (b.t === 'table') return (
      <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            {(b.head || []).map((c, j) => <Text key={j} style={[styles.cell, styles.cellHead]}>{c}</Text>)}
          </View>
          {(b.rows || []).map((row, r) => (
            <View key={r} style={styles.tr}>
              {row.map((c, j) => <Text key={j} style={styles.cell}>{c}</Text>)}
            </View>
          ))}
        </View>
      </ScrollView>
    );
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Документы</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {LEGAL_DOCS.map(d => (
              <TouchableOpacity
                key={d.key}
                style={[styles.tab, active === d.key && styles.tabActive]}
                onPress={() => setActive(d.key)}
              >
                <Text style={[styles.tabText, active === d.key && styles.tabTextActive]}>{d.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.docTitle}>{doc.title}</Text>
          {!!doc.subtitle && <Text style={styles.docSub}>{doc.subtitle}</Text>}
          {doc.blocks.map(renderBlock)}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surface },
  tabsWrap: { borderBottomWidth: 1, borderBottomColor: c.border },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  tabActive: { backgroundColor: c.accent, borderColor: c.accent },
  tabText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: 18 },
  docTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
  docSub: { fontSize: 12, color: c.textMuted, marginTop: 4, marginBottom: 12 },
  h: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginTop: 18, marginBottom: 6 },
  p: { fontSize: 14, lineHeight: 21, color: c.textSecondary, marginVertical: 5 },
  ul: { marginVertical: 6, gap: 5 },
  li: { flexDirection: 'row', gap: 8, paddingRight: 6 },
  bullet: { fontSize: 14, color: c.accent, lineHeight: 21 },
  liText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.textSecondary },
  tableScroll: { marginVertical: 10 },
  table: { borderWidth: 1, borderColor: c.border, borderRadius: 8, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  trHead: { backgroundColor: c.accentLight },
  cell: { width: 130, padding: 8, fontSize: 12, color: c.textSecondary, borderWidth: 0.5, borderColor: c.border, lineHeight: 17 },
  cellHead: { fontWeight: '700', color: c.textPrimary },
});
