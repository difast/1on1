import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { getUnreadCount } from '../lib/api';
import { useTheme } from '../context/theme';

export function NotificationBell() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const fetchCount = () => {
    if (!user) return;
    getUnreadCount(user.id)
      .then((r: any) => setUnread(r.unread_count ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={() => router.push('/(tabs)/notifications')}
      activeOpacity={0.7}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});
