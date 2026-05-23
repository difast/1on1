import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  meetings: any[];
  subtitleFn?: (m: any) => string | null;
}

export function WeekCalendar({ meetings, subtitleFn }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 1 past week + current week + 4 future weeks = 6 weeks
  const weeks = useMemo(() => {
    const firstMon = getMonday(today);
    firstMon.setDate(firstMon.getDate() - 7);
    const result: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstMon);
        date.setDate(firstMon.getDate() + w * 7 + d);
        week.push(date);
      }
      result.push(week);
    }
    return result;
  }, [today]);

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const m of meetings) {
      const k = dateKey(new Date(m.scheduled_date));
      (map[k] = map[k] ?? []).push(m);
    }
    return map;
  }, [meetings]);

  const todayKey = dateKey(today);
  const selectedMeetings = selectedKey ? (byDate[selectedKey] ?? []) : [];

  let lastMonth = -1;

  return (
    <View style={styles.root}>
      {/* Day headers */}
      <View style={styles.dayRow}>
        {DAYS.map(d => (
          <Text key={d} style={styles.dayLabel}>{d}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => {
        const month = week[0].getMonth();
        const showMonthHeader = month !== lastMonth;
        lastMonth = month;

        return (
          <View key={wi}>
            {showMonthHeader && (
              <Text style={styles.monthLabel}>
                {MONTHS[month]} {week[0].getFullYear()}
              </Text>
            )}
            <View style={styles.dayRow}>
              {week.map((date, di) => {
                const k = dateKey(date);
                const count = byDate[k]?.length ?? 0;
                const isToday = k === todayKey;
                const isSel = k === selectedKey;
                const isPast = date < today;

                return (
                  <TouchableOpacity
                    key={di}
                    style={[
                      styles.cell,
                      isToday && styles.cellToday,
                      isSel && styles.cellSelected,
                    ]}
                    onPress={() => setSelectedKey(isSel ? null : k)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.cellText,
                      isPast && !isToday && styles.cellPastText,
                      isToday && styles.cellTodayText,
                      isSel && styles.cellSelectedText,
                    ]}>
                      {date.getDate()}
                    </Text>
                    {count > 0 && (
                      <View style={[styles.dot, isSel && styles.dotSelected]}>
                        {count > 1 && <Text style={styles.dotCount}>{count}</Text>}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* Selected day panel */}
      {selectedKey && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {new Date(selectedKey + 'T12:00:00').toLocaleDateString('ru-RU', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </Text>
          {selectedMeetings.length === 0 ? (
            <Text style={styles.panelEmpty}>Нет встреч</Text>
          ) : (
            selectedMeetings.map(m => {
              const sub = subtitleFn?.(m);
              return (
                <View key={m.id} style={styles.panelItem}>
                  <Text style={styles.panelTime}>
                    {new Date(m.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    {sub ? <Text style={styles.panelSub}>{sub}</Text> : null}
                    {m.topic ? <Text style={styles.panelTopic} numberOfLines={2}>{m.topic}</Text> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { gap: 0 },
  monthLabel: {
    fontSize: 12, fontWeight: '700', color: c.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 12, paddingBottom: 4,
  },
  dayRow: { flexDirection: 'row' },
  dayLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: c.textMuted,
    paddingBottom: 6,
  },
  cell: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: 8, minHeight: 40,
  },
  cellToday: { backgroundColor: c.accentLight },
  cellSelected: { backgroundColor: c.accent },
  cellText: { fontSize: 14, fontWeight: '500', color: c.textPrimary },
  cellPastText: { color: c.textMuted },
  cellTodayText: { color: c.accent, fontWeight: '700' },
  cellSelectedText: { color: '#fff', fontWeight: '700' },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: c.accent, marginTop: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dotSelected: { backgroundColor: 'rgba(255,255,255,0.8)' },
  dotCount: { fontSize: 8, color: c.accent, fontWeight: '700' },

  panel: {
    marginTop: 12,
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 8,
  },
  panelTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
  panelEmpty: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
  panelItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  panelTime: { fontSize: 13, fontWeight: '600', color: c.accent, width: 42 },
  panelSub: { fontSize: 13, fontWeight: '500', color: c.textPrimary },
  panelTopic: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
});
