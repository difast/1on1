import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useAuth } from '../context/auth';
import { getMeetings, requestMeeting, getTeams, getTeam } from '../lib/api';
import { colors } from '../constants/colors';
import { MeetingItem } from '../components/MeetingItem';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';

export default function MemberMeetingsScreen() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTopic, setMeetingTopic] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['45%', '75%'], []);

  const findTeamId = useCallback(async () => {
    try {
      const allTeams = await getTeams() as any[];
      for (const t of allTeams) {
        try {
          const detail = await getTeam(t.id) as any;
          if ((detail.members || []).some((m: any) => m.user_id === user!.id)) {
            setTeamId(t.id);
            return;
          }
        } catch {}
      }
    } catch {}
  }, [user]);

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getMeetings({ member_id: user!.id }) as any[];
      setMeetings(data || []);
    } catch { setMeetings([]); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    findTeamId();
    loadMeetings();
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMeetings();
    setRefreshing(false);
  };

  const handleRequest = async () => {
    if (!meetingDate) return;
    setFormLoading(true);
    try {
      await requestMeeting({
        team_id: teamId,
        member_id: user!.id,
        scheduled_date: meetingDate,
        topic: meetingTopic.trim() || undefined,
      });
      setMeetingDate(''); setMeetingTopic('');
      bottomSheetRef.current?.close();
      await loadMeetings();
    } catch {} finally { setFormLoading(false); }
  };

  const now = new Date();
  const upcoming = meetings
    .filter(m => new Date(m.scheduled_date) >= now && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  const past = meetings
    .filter(m => new Date(m.scheduled_date) < now || m.status === 'completed')
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

  if (loading) return <Spinner />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Встречи</Text>
        <TouchableOpacity
          style={styles.requestBtn}
          onPress={() => bottomSheetRef.current?.expand()}
        >
          <Text style={styles.requestBtnText}>+ Запросить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {meetings.length === 0 && (
          <EmptyState icon="📅" title="Нет встреч" description="Запросите первую встречу с тимлидом" />
        )}

        {upcoming.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Предстоящие</Text>
            {upcoming.map(m => <MeetingItem key={m.id} meeting={m} />)}
          </View>
        )}

        {past.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Прошедшие</Text>
            {past.map(m => <MeetingItem key={m.id} meeting={m} />)}
          </View>
        )}
      </ScrollView>

      {/* Request meeting sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.gray300 }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Запросить встречу</Text>

          <Text style={styles.sheetLabel}>Дата и время (ГГГГ-ММ-ДД ЧЧ:ММ)</Text>
          <BottomSheetTextInput
            style={styles.sheetInput}
            value={meetingDate}
            onChangeText={setMeetingDate}
            placeholder="2025-12-31 14:00"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.sheetLabel}>Тема (необязательно)</Text>
          <BottomSheetTextInput
            style={[styles.sheetInput, { height: 80, textAlignVertical: 'top' }]}
            value={meetingTopic}
            onChangeText={setMeetingTopic}
            placeholder="О чём хотите поговорить?"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <View style={styles.sheetRow}>
            <TouchableOpacity
              style={[styles.sheetBtnSecondary, { flex: 1 }]}
              onPress={() => bottomSheetRef.current?.close()}
            >
              <Text style={styles.sheetBtnSecondaryText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, { flex: 1 }, formLoading && styles.btnDisabled]}
              onPress={handleRequest}
              disabled={formLoading}
            >
              <Text style={styles.sheetBtnText}>{formLoading ? 'Отправка...' : 'Запросить'}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  requestBtn: {
    backgroundColor: colors.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  requestBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  sheetContent: { padding: 20, gap: 4, paddingBottom: 40 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
  sheetLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  sheetInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.textPrimary,
    backgroundColor: colors.surface, marginBottom: 14,
  },
  sheetRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetBtn: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  sheetBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sheetBtnSecondary: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', backgroundColor: colors.surface,
  },
  sheetBtnSecondaryText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  btnDisabled: { opacity: 0.6 },
});
