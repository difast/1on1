import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]); icon, title, description, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {children}
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: c.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
