import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth';
import { getMeetings, endCall } from '../lib/api';

export function CallBanner() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [meeting, setMeeting] = useState<any>(null);
  const [ending, setEnding] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user) { setMeeting(null); return; }
    let alive = true;
    const poll = async () => {
      try {
        // A call is "actually ongoing" only while a meeting is in_progress.
        // Both the lead and the member see it (we check both roles).
        const [asMember, asLead] = await Promise.all([
          getMeetings({ member_id: user.id, status: 'in_progress' }).catch(() => []),
          getMeetings({ team_lead_id: user.id, status: 'in_progress' }).catch(() => []),
        ]) as [any[], any[]];
        const active = [...(asMember || []), ...(asLead || [])]
          .filter(m => m.jitsi_room_url)
          .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())[0] ?? null;
        if (alive) setMeeting(active);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, [user?.id]);

  useEffect(() => {
    Animated.timing(opacity, { toValue: meeting ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [meeting]);

  if (!meeting) return null;

  const roomUrl = meeting.jitsi_room_url;

  const handleJoin = async () => {
    if (roomUrl) { try { await Linking.openURL(roomUrl); } catch {} }
  };

  const handleEnd = async () => {
    setEnding(true);
    try { await endCall(meeting.id); } catch {}
    setMeeting(null);
    setEnding(false);
  };

  return (
    <Animated.View style={[styles.wrap, { paddingTop: insets.top, opacity }]}>
      <View style={styles.banner}>
        <View style={styles.iconWrap}>
          <Ionicons name="videocam" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Идёт созвон</Text>
          <Text style={styles.sub} numberOfLines={1}>Нажмите «Войти», чтобы присоединиться</Text>
        </View>
        <TouchableOpacity style={styles.joinBtn} onPress={handleJoin}>
          <Text style={styles.joinText}>Войти</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endBtn} onPress={handleEnd} disabled={ending}>
          <Text style={styles.endText}>{ending ? '...' : 'Завершить'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#0061ff' },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  joinBtn: {
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0,
  },
  joinText: { fontSize: 13, fontWeight: '700', color: '#0061ff' },
  endBtn: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  endText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
