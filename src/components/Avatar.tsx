import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

interface AvatarProps {
  name?: string;
  imageUrl?: string;
  size?: number;
}

export function Avatar({ name, imageUrl, size = 40 }: AvatarProps) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const fontSize = size * 0.4;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        !imageUrl && styles.fallback,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    backgroundColor: colors.accentLight,
  },
  initial: {
    color: colors.accent,
    fontWeight: '700',
  },
});
