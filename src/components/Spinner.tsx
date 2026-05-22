import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

export function Spinner({
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]); size = 'large' }: { size?: 'small' | 'large' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size={size} color={colors.accent} />
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
});
