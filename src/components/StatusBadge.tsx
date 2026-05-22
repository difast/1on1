import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray';

interface StatusBadgeProps {
  label: string;
  variant: Variant;
}

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const config = {
    blue: { bg: colors.accentLight, text: colors.accent },
    green: { bg: colors.successBg, text: colors.success },
    amber: { bg: colors.warningBg, text: colors.warning },
    red: { bg: colors.dangerBg, text: colors.danger },
    gray: { bg: colors.surface2, text: colors.textMuted },
  };

  const { bg, text } = config[variant] ?? config.gray;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
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
