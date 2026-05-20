import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { colors } from '../constants/colors';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Запланирована',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
  declined: 'Отклонена',
  requested: 'Запрошена',
};

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  scheduled: 'blue',
  confirmed: 'green',
  completed: 'gray',
  cancelled: 'red',
  declined: 'red',
  requested: 'amber',
};

interface MeetingItemProps {
  meeting: any;
  subtitle?: string;
  right?: React.ReactNode;
}

export function MeetingItem({ meeting, subtitle, right }: MeetingItemProps) {
  const date = new Date(meeting.scheduled_date);
  const dayMonth = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      <View style={styles.dateBadge}>
        <Text style={styles.dateDay}>{dayMonth}</Text>
        <Text style={styles.dateTime}>{time}</Text>
      </View>

      <View style={styles.body}>
        {subtitle ? (
          <Text style={styles.title}>{subtitle}</Text>
        ) : (
          <Text style={styles.title}>
            {date.toLocaleString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        {meeting.topic ? (
          <Text style={styles.topic} numberOfLines={1}>{meeting.topic}</Text>
        ) : meeting.agenda ? (
          <Text style={styles.topic} numberOfLines={1}>{meeting.agenda}</Text>
        ) : null}
      </View>

      <View style={styles.right}>
        <StatusBadge
          label={STATUS_LABEL[meeting.status] ?? meeting.status}
          variant={STATUS_VARIANT[meeting.status] ?? 'gray'}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateBadge: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.blue50,
    borderWidth: 1,
    borderColor: colors.blue200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateDay: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    lineHeight: 14,
  },
  dateTime: {
    fontSize: 10,
    color: colors.blue400,
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  topic: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
});

// exposed for reuse
export { STATUS_LABEL, STATUS_VARIANT };
