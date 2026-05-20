import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray';

const CONFIG: Record<Variant, { bg: string; text: string }> = {
  blue: { bg: colors.accentLight, text: colors.accent },
  green: { bg: colors.successBg, text: colors.success },
  amber: { bg: colors.warningBg, text: colors.warning },
  red: { bg: colors.dangerBg, text: colors.danger },
  gray: { bg: colors.surface2, text: colors.textMuted },
};

interface StatusBadgeProps {
  label: string;
  variant: Variant;
}

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  const { bg, text } = CONFIG[variant] ?? CONFIG.gray;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
