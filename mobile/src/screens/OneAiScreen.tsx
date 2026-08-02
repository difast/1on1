// ONE AI: стратегический AI-центр. Нативный экран. Отдельная поверхность от
// Пита; данные и права — общий AI-слой на бэкенде.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { getOneAiSections, oneAiQuery, getTeams, getTeam, type OneAiSection } from '../lib/api';

import { useI18n } from '../lib/i18n';
// Подсказка раздела — из словаря по идентификатору раздела.
const sectionHint = (t: (k: string) => string, id: string) => t(`oneaiSections.${id}`);
const NEEDS_MEMBER = ['employee_analysis', 'feedback_prep'];

export default function OneAiScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const router = useRouter();
  const meId = user?.id as number;

  const [sections, setSections] = useState<OneAiSection[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ reply: string; structured?: { summary: string; insights: { title: string; text: string }[]; actions: string[]; text: string }; based_on: any } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  useEffect(() => {
    getOneAiSections(meId).then(r => {
      const secs = r.sections || [];
      setSections(secs);
      if (secs.length) setActive(secs[0].key);
    }).catch(() => setSections([]));
  }, [meId]);

  const loadMembers = useCallback(async () => {
    try {
      const teams = await getTeams();
      const mine = (teams || []).filter((t: any) => t.team_lead_id === meId);
      const all: { id: number; name: string }[] = [];
      for (const t of mine) {
        try { const d: any = await getTeam(t.id); (d.members || []).forEach((m: any) => { if (m.user_id !== meId) all.push({ id: m.user_id, name: m.user_name || `Участник #${m.user_id}` }); }); } catch {}
      }
      const seen = new Set<number>();
      setMembers(all.filter(m => (seen.has(m.id) ? false : seen.add(m.id))));
    } catch { setMembers([]); }
  }, [meId]);
  useEffect(() => { if (sections && sections.some(s => NEEDS_MEMBER.includes(s.key))) loadMembers(); }, [sections, loadMembers]);

  const run = async () => {
    if (!active) return;
    if (NEEDS_MEMBER.includes(active) && !target) { Alert.alert(t('ui.vyberite_sotrudnika')); return; }
    setLoading(true); setResult(null); setLocked(null);
    try {
      const d = await oneAiQuery({
        actor_id: meId, section: active,
        target_user_id: NEEDS_MEMBER.includes(active) && target ? target : undefined,
        message: message.trim() || undefined,
      });
      setResult(d);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.response?.detail;
      if (detail?.code === 'feature_locked') setLocked(detail.message);
      else Alert.alert(t('ui.one_ai_nedostupen'), typeof detail === 'string' ? detail : t('ui.poprobuyte_pozzhe'));
    } finally { setLoading(false); }
  };

  const basedOnText = (b: any) => {
    if (!b) return '';
    if (b.facts) return t('labels.basedOnFacts', { v1: b.facts.tasks_total ?? '—', v2: b.facts.meetings_total ?? '—', v3: b.facts.goals_total ?? '—' });
    if (b.members != null) return t('ui.uchastnikov_komandy', { v1: b.members });
    return t('ui.agregaty_po_vashim_dannym');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ONE AI</Text>
        <View style={{ width: 28 }} />
      </View>

      {sections === null ? <Spinner /> : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>{t('ui.strategicheskiy_ai_analiz_po_vashim_dannym')}</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sections.map(s => (
              <TouchableOpacity key={s.key} onPress={() => { setActive(s.key); setResult(null); setLocked(null); setMessage(''); }}
                style={[styles.secChip, active === s.key && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
                <Text style={[styles.secChipText, active === s.key && { color: colors.accent }]}>{s.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {active && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{sections.find(s => s.key === active)?.title}</Text>
              <Text style={styles.muted}>{sectionHint(t, active)}</Text>
              {NEEDS_MEMBER.includes(active) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {members.length === 0 && <Text style={styles.muted}>{t('ui.net_uchastnikov_dlya_vybora')}</Text>}
                  {members.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setTarget(m.id)} style={[styles.secChip, target === m.id && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
                      <Text style={[styles.secChipText, target === m.id && { color: colors.accent }]}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput style={styles.input} placeholder={t('ui.utochnite_zapros_neobyazatelno')} placeholderTextColor={colors.textMuted} value={message} onChangeText={setMessage} multiline />
              <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.6 }]} onPress={run} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{t('ui.zaprosit_analiz')}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {locked && <View style={styles.card}><Text style={styles.body}>{locked}</Text></View>}

          {result && (
            <View style={styles.card}>
              {/* Структуру рисует интерфейс: акцентная карточка с главным выводом,
                  блоки наблюдений и нумерованный список действий. Разметочных
                  символов в тексте нет — сервер отдаёт разобранную структуру. */}
              {result.structured?.summary ? (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>{t('oneai.summary')}</Text>
                  <Text style={styles.summaryText}>{result.structured.summary}</Text>
                </View>
              ) : null}

              {(result.structured?.insights ?? []).map((ins: any, i: number) => (
                <View key={i} style={{ marginBottom: 12 }}>
                  <Text style={styles.insightTitle}>{ins.title}</Text>
                  <Text style={styles.insightText}>{ins.text}</Text>
                </View>
              ))}

              {(result.structured?.actions ?? []).length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 }}>
                  <Text style={styles.summaryLabel}>{t('oneai.actions')}</Text>
                  {(result.structured?.actions ?? []).map((a: string, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <Text style={styles.actionNum}>{i + 1}</Text>
                      <Text style={[styles.body, { flex: 1 }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!result.structured?.summary && !(result.structured?.insights ?? []).length && (
                <Text style={styles.body}>{result.structured?.text || result.reply}</Text>
              )}

              {result.based_on && <Text style={[styles.muted, { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }]}>{t('labels.basedOn')}: {basedOnText(result.based_on)}</Text>}
            </View>
          )}

          {!result && !loading && !locked && (
            <EmptyState icon="sparkles-outline" title={t('ui.one_ai_gotov_k_analizu')} description={t('ui.vyberite_razdel_i_zaprosite_razvernutyy_analiz')} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 14, paddingBottom: 100 },
  intro: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
  secChip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.surface },
  secChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
  muted: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
  body: { fontSize: 14, color: c.textPrimary, lineHeight: 21 },
  summaryBox: { backgroundColor: c.accentLight, borderWidth: 1, borderColor: c.accent, borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.accent, marginBottom: 6 },
  summaryText: { fontSize: 15, fontWeight: '600', color: c.textPrimary, lineHeight: 22 },
  insightTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 3 },
  insightText: { fontSize: 13.5, color: c.textSecondary, lineHeight: 20 },
  actionNum: { fontSize: 14, fontWeight: '700', color: c.accent },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg, minHeight: 44, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: c.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
