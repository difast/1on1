import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { getNotifications, markRead, markAllRead } from '../lib/api';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';

const TYPE_ICON: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  broadcast:          { name: 'megaphone-outline',     color: '#ef4444' },
  meeting_scheduled:  { name: 'calendar-outline',      color: '#0061ff' },
  meeting_confirmed:  { name: 'checkmark-circle-outline', color: '#10b981' },
  meeting_requested:  { name: 'calendar-outline',      color: '#f59e0b' },
  meeting_declined:   { name: 'close-circle-outline',  color: '#ef4444' },
  call_started:       { name: 'videocam-outline',      color: '#0061ff' },
  new_task:           { name: 'checkbox-outline',      color: '#4f46e5' },
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotifications(user.id) as any[];
      setNotifications(data || []);
    } catch { setNotifications([]); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleMarkRead = async (id: number) => {
    markRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    try {
      await markAllRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {} finally { setMarkingAll(false); }
  };

  const goToProfile = () => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(tabs)/profile' as any);
  };

  // Open the screen a notification refers to, based on its type/payload.
  const handlePress = (n: any) => {
    if (!n.read) handleMarkRead(n.id);
    const data = n.data ?? {};
    const type: string = n.type ?? '';
    if (type === 'call_started' && data.room_url) {
      Linking.openURL(data.room_url).catch(() => {});
      return;
    }
    if (type.startsWith('meeting') && data.meeting_id) {
      router.push({ pathname: '/meeting-detail', params: { id: String(data.meeting_id) } } as any);
      return;
    }
    if ((type === 'new_task' || type === 'task_assigned')) {
      router.navigate('/(tabs)/tasks' as any);
      return;
    }
    // broadcast / generic — no destination, just mark read
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <View style={styles.header}><Text style={styles.headerTitle}>Уведомления</Text></View>
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={goToProfile} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Уведомления{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markingAll} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>{markingAll ? '...' : 'Прочитать все'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : { paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Нет уведомлений</Text>
          </View>
        }
        renderItem={({ item: n }) => {
          const isBroadcast = n.is_broadcast;
          const isUnread = !n.read;
          const meta = TYPE_ICON[n.type] ?? { name: 'notifications-outline' as keyof typeof Ionicons.glyphMap, color: colors.textMuted };
          const isRead = !isUnread && !isBroadcast;
          return (
            <TouchableOpacity
              onPress={() => handlePress(n)}
              activeOpacity={0.7}
              style={[
                styles.item,
                isUnread && styles.itemUnread,
                isBroadcast && styles.itemBroadcast,
                isRead && styles.itemRead,
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: meta.color + '18' }]}>
                <Ionicons name={meta.name} size={20} color={meta.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {isBroadcast && (
                  <View style={styles.broadcastBadge}>
                    <Text style={styles.broadcastBadgeText}>ОБЪЯВЛЕНИЕ</Text>
                  </View>
                )}
                <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={2}>{n.title}</Text>
                {n.body ? <Text style={styles.body} numberOfLines={2}>{n.body}</Text> : null}
                <Text style={styles.time}>
                  {new Date(n.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {isUnread
                ? <View style={[styles.dot, { backgroundColor: isBroadcast ? '#ef4444' : colors.accent }]} />
                : <Ionicons name="checkmark-circle" size={18} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: c.textPrimary, textAlign: 'left' },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  markAllText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },

  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.border,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  itemUnread: { backgroundColor: '#eef4ff', borderLeftColor: c.accent },
  itemBroadcast: { backgroundColor: '#fff5f5', borderLeftColor: '#ef4444' },
  itemRead: { backgroundColor: '#f0fdf4', borderLeftColor: '#10b981' },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 14, fontWeight: '500', color: c.textPrimary, lineHeight: 20 },
  titleUnread: { fontWeight: '700' },
  body: { fontSize: 12, color: c.textSecondary, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  broadcastBadge: {
    alignSelf: 'flex-start', backgroundColor: '#ef4444',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4,
  },
  broadcastBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
  emptyContainer: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: c.textMuted },
});
