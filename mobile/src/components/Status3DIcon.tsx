import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type TaskStatus = 'in_progress' | 'blocked' | 'review' | 'done';

/*
 * 3D-иконка статуса задачи для приложения. Без SVG/gradient-библиотек (их нет в
 * зависимостях) и без emoji: объёмность собирается из ядра RN — приподнятый
 * круг с тенью (elevation/shadow), светлый блик сверху-слева и глиф Ionicons.
 * Цвета подобраны как «светлый верх / насыщенный низ», что читается как сфера.
 */
const CONF: Record<TaskStatus, { main: string; dark: string; icon: keyof typeof Ionicons.glyphMap }> = {
  in_progress: { main: '#3b82f6', dark: '#1e40af', icon: 'time' },
  blocked:     { main: '#ef4444', dark: '#991b1b', icon: 'close' },
  review:      { main: '#f59e0b', dark: '#92400e', icon: 'ellipse' },
  done:        { main: '#22c55e', dark: '#15803d', icon: 'checkmark' },
};

export function Status3DIcon({ status, size = 22 }: { status: TaskStatus; size?: number }) {
  const c = CONF[status] || CONF.in_progress;
  const r = size / 2;
  return (
    <View
      style={[
        styles.sphere,
        {
          width: size, height: size, borderRadius: r,
          backgroundColor: c.main, borderColor: c.dark,
          shadowColor: c.dark,
        },
      ]}
    >
      {/* Блик сверху-слева для объёма */}
      <View
        style={{
          position: 'absolute', top: size * 0.14, left: size * 0.16,
          width: size * 0.36, height: size * 0.26, borderRadius: size * 0.2,
          backgroundColor: 'rgba(255,255,255,0.55)',
        }}
      />
      <Ionicons name={c.icon} size={Math.round(size * 0.56)} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  sphere: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5,
    // Приподнятость (Android + iOS)
    elevation: 3,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 1.5,
  },
});
