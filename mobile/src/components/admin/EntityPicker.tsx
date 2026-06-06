import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/theme';
import type { AppColors } from '../../constants/colors';

export interface PickItem { id: number; label: string; sub?: string; }

/** A "select by name" field with a searchable modal list — replaces raw ID typing. */
export function EntityPicker({
  label, placeholder, valueId, items, onSelect, emptyText,
}: {
  label: string;
  placeholder: string;
  valueId: number | null;
  items: PickItem[];
  onSelect: (id: number) => void;
  emptyText?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = items.find(i => i.id === valueId);
  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? items.filter(i => String(i.id) === ql || (i.label + ' ' + (i.sub || '')).toLowerCase().includes(ql))
    : items;

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => { setOpen(true); setQ(''); }} activeOpacity={0.7}>
        <Text style={[styles.fieldText, !sel && { color: colors.textMuted }]} numberOfLines={1}>
          {sel ? `${sel.label}  ·  ID ${sel.id}` : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.search}
                value={q}
                onChangeText={setQ}
                placeholder="Поиск по имени или ID"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={i => String(i.id)}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.empty}>{emptyText || 'Ничего не найдено'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, item.id === valueId && styles.rowActive]}
                  onPress={() => { onSelect(item.id); setOpen(false); }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text>
                    {!!item.sub && <Text style={styles.rowSub} numberOfLines={1}>{item.sub}</Text>}
                  </View>
                  <Text style={styles.rowId}>ID {item.id}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.surface,
  },
  fieldText: { flex: 1, fontSize: 15, color: c.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8, backgroundColor: c.bg },
  search: { flex: 1, paddingVertical: 9, fontSize: 14, color: c.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10 },
  rowActive: { backgroundColor: c.accentLight },
  rowLabel: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  rowSub: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  rowId: { fontSize: 11, fontWeight: '700', color: c.textMuted },
  empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 24 },
});
