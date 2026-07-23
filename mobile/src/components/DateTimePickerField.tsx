import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const pad = (n: number) => String(n).padStart(2, '0');
// Monday-first weekday index (0=Mon … 6=Sun)
const wd = (d: Date) => (d.getDay() + 6) % 7;
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function formatValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * Pure-JS date + time picker (no native module).
 * Renders a tappable field; tapping opens a calendar where weekends are
 * highlighted, plus hour/minute selection. Emits a local "YYYY-MM-DDTHH:mm".
 */
export function DateTimePickerField({
  value, onChange, placeholder = 'Выберите дату и время', minToday = true,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  minToday?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const initial = value && !isNaN(new Date(value).getTime()) ? new Date(value) : null;
  const [viewMonth, setViewMonth] = useState(() => {
    const base = initial ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date | null>(initial);
  const [hour, setHour] = useState(initial ? initial.getHours() : 10);
  const [minute, setMinute] = useState(initial ? initial.getMinutes() - (initial.getMinutes() % 5) : 0);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const grid = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const lead = wd(first);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const commit = (day: Date | null, h: number, m: number) => {
    if (!day) return;
    const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(h)}:${pad(m)}`;
    onChange(iso);
    setOpen(false);
  };

  const confirm = () => commit(selected, hour, minute);

  // Автозакрытие (Задача 1): минуты — самый мелкий шаг выбора времени, поэтому их
  // выбор считаем завершением выбора времени и закрываем календарь без «Готово»,
  // но только когда день уже выбран (иначе выбор ещё не завершён). Выбор часа
  // календарь НЕ закрывает — иначе минуты не успеть указать (преждевременно).
  const selectMinute = (m: number) => {
    setMinute(m);
    if (selected) commit(selected, hour, m);
  };

  const shiftMonth = (delta: number) =>
    setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.fieldText, !value && { color: colors.textMuted }]}>
          {value ? formatValue(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {/* Month header */}
            <View style={styles.monthRow}>
              <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</Text>
              <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Weekday header */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text key={w} style={[styles.weekday, i >= 5 && styles.weekendText]}>{w}</Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.grid}>
              {grid.map((d, i) => {
                if (!d) return <View key={i} style={styles.cell} />;
                const disabled = minToday && d < today;
                const isSel = selected && sameDay(d, selected);
                const weekend = isWeekend(d);
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.cell}
                    disabled={disabled}
                    onPress={() => setSelected(d)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.dayInner,
                      weekend && styles.dayWeekend,
                      isSel && styles.daySelected,
                    ]}>
                      <Text style={[
                        styles.dayText,
                        weekend && styles.weekendText,
                        disabled && styles.dayDisabled,
                        isSel && styles.daySelectedText,
                      ]}>{d.getDate()}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Time */}
            <Text style={styles.timeLabel}>Время</Text>
            <View style={styles.timeRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
                {Array.from({ length: 24 }, (_, h) => (
                  <TouchableOpacity key={h} onPress={() => setHour(h)} style={[styles.timeChip, hour === h && styles.timeChipActive]}>
                    <Text style={[styles.timeChipText, hour === h && styles.timeChipTextActive]}>{pad(h)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.timeRow}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <TouchableOpacity key={m} onPress={() => selectMinute(m)} style={[styles.minChip, minute === m && styles.timeChipActive]}>
                  <Text style={[styles.timeChipText, minute === m && styles.timeChipTextActive]}>{pad(m)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setOpen(false)}>
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, !selected && styles.btnDisabled]}
                onPress={confirm}
                disabled={!selected}
              >
                <Text style={styles.confirmText}>
                  {selected ? `${selected.getDate()} ${MONTHS[selected.getMonth()].toLowerCase().slice(0, 3)}, ${pad(hour)}:${pad(minute)}` : 'Готово'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: c.bg,
  },
  fieldText: { flex: 1, fontSize: 14, color: c.textPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: {
    width: '100%', maxWidth: 360, backgroundColor: c.surface,
    borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 },
  monthTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: c.textMuted, paddingVertical: 4 },
  weekendText: { color: '#ef4444' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayInner: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayWeekend: { backgroundColor: '#ef444411' },
  daySelected: { backgroundColor: c.accent },
  dayText: { fontSize: 14, color: c.textPrimary },
  dayDisabled: { color: c.border },
  daySelectedText: { color: '#fff', fontWeight: '700' },
  timeLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  timeScroll: { gap: 6, paddingRight: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  minChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg },
  timeChipActive: { backgroundColor: c.accent, borderColor: c.accent },
  timeChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  timeChipTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  confirmBtn: { flex: 2, backgroundColor: c.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
});
