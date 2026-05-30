import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import { getNotifications, markRead } from '../lib/api';

export function CallBanner() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [callNotif, setCallNotif] = useState<any>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const notifs = await getNotifications(user.id) as any[];
        const active = notifs.find(n => n.type === 'call_started' && !n.read);
        setCallNotif(active ?? null);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: callNotif ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [callNotif]);

  if (!callNotif) return null;

  const roomUrl = callNotif.data?.room_url;

  const handleJoin = async () => {
    markRead(callNotif.id).catch(() => {});
    setCallNotif(null);
    if (roomUrl) {
      try { await Linking.openURL(roomUrl); } catch {}
    }
  };

  const handleDismiss = () => {
    markRead(callNotif.id).catch(() => {});
    setCallNotif(null);
  };

  return (
    <Animated.View style={[styles.banner, { opacity }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="videocam" size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{callNotif.title?.replace('📹 ', '') ?? 'Идёт созвон'}</Text>
        <Text style={styles.sub}>Нажмите Войти чтобы присоединиться</Text>
      </View>
      {roomUrl && (
        <TouchableOpacity style={styles.joinBtn} onPress={handleJoin}>
          <Text style={styles.joinText}>Войти</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0061ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  joinBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  joinText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  closeBtn: { padding: 4 },
});
