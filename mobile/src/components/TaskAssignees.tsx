import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { StatusPicker, STATUS_LABEL, TaskStatus } from './StatusPicker';
import { Status3DIcon } from './Status3DIcon';
import { updateTaskAssignee } from '../lib/api';

/*
 * Отображение участников совместной задачи в приложении: часть работы каждого,
 * его статус и сводный прогресс. Рисуется только когда у задачи есть assignees
 * (обычные задачи с одним ответственным работают как раньше — обратная
 * совместимость). Тимлид (canManageAll) меняет статус любого участника,
 * участник — только свой; остальным статус показывается только для чтения.
 */
export function TaskAssignees({
  task, currentUserId, canManageAll = false, onChanged,
}: {
  task: any;
  currentUserId: number;
  canManageAll?: boolean;
  onChanged?: (updated: any) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const assignees: any[] = task.assignees || [];
  if (assignees.length === 0) return null;
  const progress = task.progress || {
    done: assignees.filter(a => a.completed).length,
    total: assignees.length,
    percent: 0,
  };

  const change = async (assignee: any, status: TaskStatus) => {
    setBusyId(assignee.id);
    try {
      const updated = await updateTaskAssignee(assignee.id, { status });
      onChanged?.(updated);
    } catch {}
    finally { setBusyId(null); }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>Участники</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${progress.percent}%` }]} />
        </View>
        <Text style={[styles.progressText, progress.done === progress.total && { color: colors.success }]}>
          {progress.done} из {progress.total}
        </Text>
      </View>

      {assignees.map(a => {
        const mine = a.user_id === currentUserId;
        const canEdit = canManageAll || mine;
        const st = (a.status || 'in_progress') as TaskStatus;
        return (
          <View key={a.id} style={styles.assigneeRow}>
            <Status3DIcon status={st} size={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.assigneeName}>{a.user_name || `#${a.user_id}`}{mine ? ' (вы)' : ''}</Text>
              {!!a.part_description && <Text style={styles.assigneePart}>{a.part_description}</Text>}
            </View>
            {canEdit ? (
              <TouchableOpacity
                style={styles.statusBtn}
                disabled={busyId === a.id}
                onPress={() => setPickerFor(a.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.statusBtnText}>{STATUS_LABEL[st]}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.statusReadonly}>{STATUS_LABEL[st]}</Text>
            )}
            <StatusPicker
              visible={pickerFor === a.id}
              current={st}
              onSelect={(s) => change(a, s)}
              onClose={() => setPickerFor(null)}
            />
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  wrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  barTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: c.surface2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: c.success, borderRadius: 999 },
  progressText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assigneeName: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  assigneePart: { fontSize: 12, color: c.textMuted, marginTop: 1 },
  statusBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: c.bg },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  statusReadonly: { fontSize: 12, fontWeight: '600', color: c.textMuted },
});
