import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { Status3DIcon } from './Status3DIcon';

export type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: 'В работе',
  blocked: 'Заблокирована',
  review: 'На ревью',
  done: 'Готово',
};

const STATUS_ORDER: TaskStatus[] = ['in_progress', 'blocked', 'review', 'done'];

const STATUS_TINT = (c: AppColors): Record<TaskStatus, string> => ({
  in_progress: c.warning,
  blocked: c.danger,
  review: c.accent,
  done: c.success,
});

export function StatusPicker({
  visible, current, onSelect, onClose,
}: {
  visible: boolean;
  current: TaskStatus;
  onSelect: (status: TaskStatus) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tint = STATUS_TINT(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Статус задачи</Text>
          {STATUS_ORDER.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.row, current === s && styles.rowActive]}
              onPress={() => { onSelect(s); onClose(); }}
              activeOpacity={0.7}
            >
              <Status3DIcon status={s} size={24} />
              <Text style={[styles.rowText, current === s && { color: tint[s], fontWeight: '700' }]}>
                {STATUS_LABEL[s]}
              </Text>
              {current === s && <Ionicons name="checkmark" size={18} color={tint[s]} />}
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    width: '100%', maxWidth: 320, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.border,
    padding: 10, gap: 2,
  },
  title: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 13, borderRadius: 10,
  },
  rowActive: { backgroundColor: c.surface2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500', color: c.textPrimary },
});
