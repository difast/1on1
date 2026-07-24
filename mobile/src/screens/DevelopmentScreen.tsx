// Развитие: навыки, уровни, план развития, рекомендации. Нативный экран,
// логика повторяет веб-модуль; права проверяются на бэкенде. Переиспользует
// Thread и GoalForm из экрана «Цели».
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/auth';
import { useTheme } from '../context/theme';
import type { AppColors } from '../constants/colors';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { Thread, GoalForm } from './GoalsScreen';
import {
  getDevelopment, getSkills, addUserSkill, updateUserSkill, deleteUserSkill,
  createDevStep, updateDevStep, deleteDevStep, addDevStepComment,
  createDevRecommendation, aiDevRecommendation, actOnDevRecommendation,
  getTeamDevelopment, getTeams, createGoal,
  type Development, type DevSkill, type DevStep, type DevRecommendation, type TeamDevelopment,
} from '../lib/api';

export const SKILL_LEVELS: Record<number, string> = { 1: 'Новичок', 2: 'Базовый', 3: 'Уверенный', 4: 'Продвинутый', 5: 'Эксперт' };
const LEVELS = [1, 2, 3, 4, 5];
const CATEGORY_LABEL: Record<string, string> = { technical: 'Технические', product: 'Продуктовые', communication: 'Коммуникационные', management: 'Управленческие' };
const CATEGORIES = ['technical', 'product', 'communication', 'management'];
const STEP_STATUS_LABEL: Record<string, string> = { not_started: 'Не начат', in_progress: 'В работе', done: 'Выполнен', cancelled: 'Отменён' };
const STEP_OPEN = ['not_started', 'in_progress'];

function stepColor(c: AppColors, status: string) {
  if (status === 'done') return c.success;
  if (status === 'in_progress') return c.accent;
  if (status === 'cancelled') return c.textMuted;
  return c.textSecondary;
}

function LevelScale({ current, desired, colors }: { current: number; desired?: number | null; colors: AppColors }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {LEVELS.map(l => (
        <View key={l} style={{
          width: 18, height: 8, borderRadius: 2,
          backgroundColor: l <= current ? colors.accent : colors.surface2,
          borderWidth: desired && l === desired ? 1.5 : 0, borderColor: colors.success,
        }} />
      ))}
    </View>
  );
}

// ── навык сотрудника ─────────────────────────────────────────────────────────
function SkillRow({ us, meId, colors, readOnly, onChanged, onRemoved }: {
  us: DevSkill; meId: number; colors: AppColors; readOnly?: boolean;
  onChanged: (s: DevSkill) => void; onRemoved: (id: number) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [saving, setSaving] = useState(false);
  const patch = async (payload: any) => {
    setSaving(true);
    try { const s = await updateUserSkill(us.id, { actor_id: meId, ...payload }); onChanged(s); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
    finally { setSaving(false); }
  };
  const remove = () => Alert.alert('Удалить навык?', undefined, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: async () => { try { await deleteUserSkill(us.id, meId); onRemoved(us.id); } catch {} } },
  ]);
  const stepLevel = (d: number) => patch({ current_level: Math.max(1, Math.min(5, us.current_level + d)) });

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.title}>{us.skill_name}</Text>
            <Text style={styles.chip}>{CATEGORY_LABEL[us.category] || us.category}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <LevelScale current={us.current_level} desired={us.desired_level} colors={colors} />
            <Text style={styles.muted}>{us.current_level_label}{us.desired_level ? ` → ${us.desired_level_label}` : ''}</Text>
          </View>
          {us.gap > 0 && <Text style={[styles.warnChip, { marginTop: 6 }]}>разрыв {us.gap}</Text>}
          {us.target_date && <Text style={[styles.muted, { marginTop: 6 }]}>Срок: {new Date(us.target_date).toLocaleDateString('ru-RU')}</Text>}
        </View>
        {!readOnly && <TouchableOpacity onPress={remove}><Text style={styles.removeLink}>Удалить</Text></TouchableOpacity>}
      </View>
      {!readOnly && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.muted}>Текущий уровень</Text>
            <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => stepLevel(-1)}><Ionicons name="remove" size={16} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={styles.levelNum}>{us.current_level}</Text>
            <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => stepLevel(1)}><Ionicons name="add" size={16} color={colors.textPrimary} /></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Text style={styles.muted}>Желаемый</Text>
            {[0, ...LEVELS].map(l => (
              <TouchableOpacity key={l} disabled={saving} onPress={() => patch({ desired_level: l })}
                style={[styles.levelChip, (us.desired_level || 0) === l && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
                <Text style={[styles.levelChipText, (us.desired_level || 0) === l && { color: colors.accent }]}>{l === 0 ? '—' : l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── шаг плана ────────────────────────────────────────────────────────────────
function StepCard({ step, meId, colors, readOnly, canFeedback, onChanged, onRemoved }: {
  step: DevStep; meId: number; colors: AppColors; readOnly?: boolean; canFeedback?: boolean;
  onChanged: (s: DevStep) => void; onRemoved: (id: number) => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const linked = !!step.goal_id;
  const patch = async (payload: any) => {
    setSaving(true);
    try { const s = await updateDevStep(step.id, { actor_id: meId, ...payload }); onChanged(s); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
    finally { setSaving(false); }
  };
  const setProgress = (p: number) => patch({ progress: Math.max(0, Math.min(100, p)) });
  const remove = () => Alert.alert('Удалить шаг?', undefined, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: async () => { try { await deleteDevStep(step.id, meId); onRemoved(step.id); } catch {} } },
  ]);

  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: stepColor(colors, step.status) }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[styles.title, { flex: 1 }]}>{step.title}</Text>
        <Text style={[styles.badge, { color: stepColor(colors, step.status) }]}>{STEP_STATUS_LABEL[step.status]}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {step.skill_name && <Text style={styles.chip}>Навык: {step.skill_name}</Text>}
        {step.goal_title && <Text style={[styles.chip, { color: colors.accent }]}>Цель: {step.goal_title}</Text>}
        {step.assigned_by_lead && <Text style={[styles.chip, { color: '#7c3aed' }]}>Назначено руководителем</Text>}
        {step.overdue && <Text style={styles.warnChip}>Просрочен</Text>}
      </View>
      {!!step.description && <Text style={[styles.muted, { marginTop: 6 }]}>{step.description}</Text>}
      {step.due_date && <Text style={[styles.muted, { marginTop: 4 }]}>Срок: {new Date(step.due_date).toLocaleDateString('ru-RU')}</Text>}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1, height: 8, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
          <View style={{ width: `${step.progress}%`, height: '100%', backgroundColor: step.progress >= 100 ? colors.success : colors.accent }} />
        </View>
        <Text style={styles.pct}>{step.progress}%</Text>
      </View>
      {!readOnly && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => setProgress(step.progress - 10)}><Ionicons name="remove" size={16} color={colors.textPrimary} /></TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'center' }}>
            {[0, 50, 100].map(p => (
              <TouchableOpacity key={p} disabled={saving} onPress={() => setProgress(p)} style={[styles.levelChip, step.progress === p && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
                <Text style={[styles.levelChipText, step.progress === p && { color: colors.accent }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.stepBtn} disabled={saving} onPress={() => setProgress(step.progress + 10)}><Ionicons name="add" size={16} color={colors.textPrimary} /></TouchableOpacity>
        </View>
      )}
      {!readOnly && linked && <Text style={[styles.muted, { marginTop: 6 }]}>Статус ведётся связанной целью.</Text>}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <TouchableOpacity onPress={() => setExpanded(v => !v)}><Text style={styles.link}>Обсуждение{step.comments?.length ? ` (${step.comments.length})` : ''}</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        {!readOnly && <TouchableOpacity onPress={remove}><Text style={styles.removeLink}>Удалить</Text></TouchableOpacity>}
      </View>
      {expanded && (
        <Thread comments={step.comments || []} meId={meId} colors={colors} canFeedback={!!canFeedback}
          onSend={async (p) => { const s = await addDevStepComment(step.id, { actor_id: meId, ...p }); onChanged(s); }} />
      )}
    </View>
  );
}

// ── рекомендация ─────────────────────────────────────────────────────────────
function RecCard({ rec, meId, colors, onChanged }: { rec: DevRecommendation; meId: number; colors: AppColors; onChanged: (r: DevRecommendation) => void }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const act = async (action: string) => {
    setBusy(true);
    try { const r = await actOnDevRecommendation(rec.id, { actor_id: meId, action }); onChanged(r); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
    finally { setBusy(false); }
  };
  return (
    <View style={[styles.card, { opacity: rec.status !== 'new' ? 0.7 : 1 }]}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <Text style={[styles.chip, { color: '#7c3aed' }]}>{rec.source_label}</Text>
        {rec.skill_name && <Text style={styles.muted}>{rec.skill_name}</Text>}
        {!!rec.target_level && <Text style={styles.muted}>цель: {SKILL_LEVELS[rec.target_level]}</Text>}
      </View>
      <Text style={styles.title}>{rec.title}</Text>
      {!!rec.body && <Text style={[styles.muted, { marginTop: 4 }]}>{rec.body}</Text>}
      {rec.status !== 'new' ? (
        <Text style={[styles.muted, { marginTop: 8 }]}>{rec.status === 'accepted' ? 'Принято — добавлено в план' : 'Отклонено'}</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={styles.primaryBtnSm} disabled={busy} onPress={() => act('accept')}><Text style={styles.primaryBtnSmText}>Принять</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtnSm} disabled={busy} onPress={() => act('dismiss')}><Text style={styles.secondaryBtnSmText}>Отклонить</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── экран сотрудника ─────────────────────────────────────────────────────────
function MemberDevelopment({ meId, colors }: { meId: number; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [dev, setDev] = useState<Development | null>(null);
  const [dict, setDict] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showSkill, setShowSkill] = useState(false);
  const [showStep, setShowStep] = useState(false);
  const [showLearn, setShowLearn] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  // add skill form
  const [sName, setSName] = useState(''); const [sCat, setSCat] = useState('technical');
  const [sCur, setSCur] = useState(2); const [sDes, setSDes] = useState(0);
  // add step form
  const [stTitle, setStTitle] = useState(''); const [stSkill, setStSkill] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { const d = await getDevelopment(meId, meId); setDev(d); } catch { setDev({ user_id: meId, skills: [], steps: [], recommendations: [], learning_goals: [], plan_progress: 0 }); }
    try { const dd = await getSkills(undefined, meId); setDict(dd || []); } catch { setDict([]); }
  }, [meId]);
  useEffect(() => { load(); }, [load]);

  const upSkill = (s: DevSkill, removed?: number) => setDev(d => d && ({ ...d, skills: removed ? d.skills.filter(x => x.id !== removed) : d.skills.map(x => x.id === s.id ? s : x) }));
  const upStep = (s: DevStep, removed?: number) => setDev(d => d && ({ ...d, steps: removed ? d.steps.filter(x => x.id !== removed) : d.steps.map(x => x.id === s.id ? s : x) }));
  const upRec = (r: DevRecommendation) => setDev(d => d && ({ ...d, recommendations: d.recommendations.map(x => x.id === r.id ? r : x) }));

  const addSkill = async () => {
    if (!sName.trim()) { Alert.alert('Укажите навык'); return; }
    try {
      const s = await addUserSkill({ actor_id: meId, user_id: meId, skill_name: sName.trim(), category: sCat, current_level: sCur, desired_level: sDes || undefined });
      setDev(d => d && ({ ...d, skills: [...d.skills, s] })); setShowSkill(false); setSName(''); setSDes(0); setSCur(2);
    } catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
  };
  const addStep = async () => {
    if (!stTitle.trim()) { Alert.alert('Укажите название шага'); return; }
    try {
      const s = await createDevStep({ actor_id: meId, user_id: meId, title: stTitle.trim(), skill_id: stSkill || undefined });
      setDev(d => d && ({ ...d, steps: [s, ...d.steps] })); setShowStep(false); setStTitle(''); setStSkill(null);
    } catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
  };
  const askAi = async () => {
    setAiBusy(true);
    try { const r = await aiDevRecommendation(meId, meId); setDev(d => d && ({ ...d, recommendations: [r, ...d.recommendations] })); }
    catch (e: any) {
      const detail = e?.response?.data?.detail || e?.response?.detail;
      if (detail?.code === 'feature_locked') Alert.alert('Функция недоступна', detail.message);
      else Alert.alert('Пит недоступен', typeof detail === 'string' ? detail : 'Попробуйте позже');
    } finally { setAiBusy(false); }
  };

  if (dev === null) return <Spinner />;
  const openRecs = dev.recommendations.filter(r => r.status === 'new');

  return (
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}>
      <Text style={styles.intro}>Ваш путь развития: навыки с уровнями, план и рекомендации. Тимлид видит развитие и может назначить направление роста.</Text>

      {/* Навыки */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Навыки</Text>
        {!showSkill && <TouchableOpacity onPress={() => setShowSkill(true)}><Text style={styles.link}>+ Навык</Text></TouchableOpacity>}
      </View>
      {showSkill && (
        <View style={styles.formCard}>
          <TextInput style={styles.input} placeholder="Название навыка" placeholderTextColor={colors.textMuted} value={sName} onChangeText={setSName} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(c => (
              <TouchableOpacity key={c} onPress={() => setSCat(c)} style={[styles.levelChip, sCat === c && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}>
                <Text style={[styles.levelChipText, sCat === c && { color: colors.accent }]}>{CATEGORY_LABEL[c]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.muted}>Текущий</Text>
            {LEVELS.map(l => <TouchableOpacity key={l} onPress={() => setSCur(l)} style={[styles.levelChip, sCur === l && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, sCur === l && { color: colors.accent }]}>{l}</Text></TouchableOpacity>)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.muted}>Желаемый</Text>
            {[0, ...LEVELS].map(l => <TouchableOpacity key={l} onPress={() => setSDes(l)} style={[styles.levelChip, sDes === l && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, sDes === l && { color: colors.accent }]}>{l === 0 ? '—' : l}</Text></TouchableOpacity>)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowSkill(false)}><Text style={styles.secondaryBtnText}>Отмена</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={addSkill}><Text style={styles.primaryBtnText}>Добавить</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {dev.skills.length === 0 && !showSkill && <EmptyState icon="ribbon-outline" title="Навыки не заданы" description="Добавьте навык и укажите уровни." />}
      {dev.skills.map(s => <SkillRow key={s.id} us={s} meId={meId} colors={colors} onChanged={upSkill} onRemoved={(id) => upSkill(s, id)} />)}

      {/* План */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>План развития · {dev.plan_progress}%</Text>
        {!showStep && <TouchableOpacity onPress={() => setShowStep(true)}><Text style={styles.link}>+ Шаг</Text></TouchableOpacity>}
      </View>
      {showStep && (
        <View style={styles.formCard}>
          <TextInput style={styles.input} placeholder="Название шага" placeholderTextColor={colors.textMuted} value={stTitle} onChangeText={setStTitle} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <TouchableOpacity onPress={() => setStSkill(null)} style={[styles.levelChip, stSkill === null && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, stSkill === null && { color: colors.accent }]}>Без навыка</Text></TouchableOpacity>
            {dev.skills.map(s => <TouchableOpacity key={s.id} onPress={() => setStSkill(s.skill_id)} style={[styles.levelChip, stSkill === s.skill_id && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, stSkill === s.skill_id && { color: colors.accent }]}>{s.skill_name}</Text></TouchableOpacity>)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowStep(false)}><Text style={styles.secondaryBtnText}>Отмена</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={addStep}><Text style={styles.primaryBtnText}>Добавить</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {dev.steps.length === 0 && !showStep && <EmptyState icon="footsteps-outline" title="План пуст" description="Добавьте первый шаг развития." />}
      {dev.steps.map(s => <StepCard key={s.id} step={s} meId={meId} colors={colors} canFeedback={false} onChanged={upStep} onRemoved={(id) => upStep(s, id)} />)}

      {/* Рекомендации */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Рекомендации</Text>
        <TouchableOpacity disabled={aiBusy} onPress={askAi}><Text style={styles.link}>{aiBusy ? 'Пит думает…' : 'Спросить Пита'}</Text></TouchableOpacity>
      </View>
      {openRecs.length === 0 && <EmptyState icon="bulb-outline" title="Рекомендаций нет" description="Задайте желаемые уровни — появятся рекомендации по разрыву." />}
      {openRecs.map(r => <RecCard key={r.id} rec={r} meId={meId} colors={colors} onChanged={upRec} />)}

      {/* Учебные цели (единая модель с «Целями») */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Учебные цели</Text>
        {!showLearn && <TouchableOpacity onPress={() => setShowLearn(true)}><Text style={styles.link}>+ Учебная цель</Text></TouchableOpacity>}
      </View>
      {showLearn && (
        <GoalForm colors={colors} submitLabel="Создать учебную цель" titlePlaceholder="Например: Пройти курс по системному дизайну"
          onCancel={() => setShowLearn(false)}
          onCreate={async (p) => {
            const g = await createGoal({ user_id: meId, goal_kind: 'learning', ...p } as any);
            setDev(d => d && ({ ...d, learning_goals: [g, ...(d.learning_goals || [])] })); setShowLearn(false);
          }} />
      )}
      {(dev.learning_goals || []).length === 0 && !showLearn && <EmptyState icon="school-outline" title="Учебных целей нет" description="Создайте учебную цель — она появится и во вкладке «Цели»." />}
      {(dev.learning_goals || []).map(g => (
        <View key={g.id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[styles.title, { flex: 1 }]}>{g.title}</Text>
            <Text style={styles.pct}>{g.progress}%</Text>
          </View>
          <View style={{ marginTop: 8, height: 8, backgroundColor: colors.surface2, borderRadius: 999, overflow: 'hidden' }}>
            <View style={{ width: `${g.progress}%`, height: '100%', backgroundColor: g.progress >= 100 ? colors.success : colors.accent }} />
          </View>
          <Text style={[styles.muted, { marginTop: 6 }]}>Прогресс и статус ведутся во вкладке «Цели».</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ── экран тимлида ────────────────────────────────────────────────────────────
function LeadDevelopment({ meId, colors }: { meId: number; colors: AppColors }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [data, setData] = useState<TeamDevelopment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [memberDev, setMemberDev] = useState<Development | null>(null);
  // assign direction
  const [asgTitle, setAsgTitle] = useState(''); const [asgLevel, setAsgLevel] = useState(0); const [asgSkill, setAsgSkill] = useState<number | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  useEffect(() => {
    getTeams().then((all: any[]) => { const mine = (all || []).filter(t => t.team_lead_id === meId); setTeams(mine); setTeamId(prev => prev ?? (mine[0]?.id ?? null)); }).catch(() => setTeams([]));
  }, [meId]);

  const load = useCallback(async () => {
    if (!teamId) { setData(null); setLoading(false); return; }
    setLoading(true);
    try { const d = await getTeamDevelopment(teamId, meId); setData(d); }
    catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); setData(null); }
    finally { setLoading(false); }
  }, [teamId, meId]);
  useEffect(() => { load(); }, [load]);

  const openMember = async (uid: number) => {
    setOpenUid(uid); setMemberDev(null); setShowAssign(false);
    try { const d = await getDevelopment(uid, meId); setMemberDev(d); } catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Нет доступа'); setOpenUid(null); }
  };
  const upMemberStep = (s: DevStep) => setMemberDev(d => d && ({ ...d, steps: d.steps.map(x => x.id === s.id ? s : x) }));

  const assign = async () => {
    if (!asgTitle.trim() || !openUid) { Alert.alert('Укажите направление'); return; }
    try {
      await createDevRecommendation({ actor_id: meId, user_id: openUid, title: asgTitle.trim(), skill_id: asgSkill || undefined, target_level: asgLevel || undefined });
      Alert.alert('Готово', 'Направление назначено — сотрудник получит уведомление');
      setAsgTitle(''); setAsgLevel(0); setAsgSkill(null); setShowAssign(false); load();
    } catch (e: any) { Alert.alert('Ошибка', e?.response?.detail || 'Не удалось'); }
  };

  const members = data?.members || [];

  if (openUid && memberDev) {
    const m = members.find(x => x.user_id === openUid);
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => { setOpenUid(null); setMemberDev(null); }}><Text style={styles.link}>← К обзору команды</Text></TouchableOpacity>
        <Text style={[styles.sectionTitle, { fontSize: 16, marginTop: 8 }]}>Развитие: {m?.user_name}</Text>

        {!showAssign ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAssign(true)}><Text style={styles.primaryBtnText}>Назначить направление роста</Text></TouchableOpacity>
        ) : (
          <View style={styles.formCard}>
            <TextInput style={styles.input} placeholder="Направление роста" placeholderTextColor={colors.textMuted} value={asgTitle} onChangeText={setAsgTitle} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Text style={styles.muted}>Навык</Text>
              <TouchableOpacity onPress={() => setAsgSkill(null)} style={[styles.levelChip, asgSkill === null && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, asgSkill === null && { color: colors.accent }]}>—</Text></TouchableOpacity>
              {memberDev.skills.map(s => <TouchableOpacity key={s.id} onPress={() => setAsgSkill(s.skill_id)} style={[styles.levelChip, asgSkill === s.skill_id && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, asgSkill === s.skill_id && { color: colors.accent }]}>{s.skill_name}</Text></TouchableOpacity>)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Text style={styles.muted}>Целевой уровень</Text>
              {[0, ...LEVELS].map(l => <TouchableOpacity key={l} onPress={() => setAsgLevel(l)} style={[styles.levelChip, asgLevel === l && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, asgLevel === l && { color: colors.accent }]}>{l === 0 ? '—' : l}</Text></TouchableOpacity>)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowAssign(false)}><Text style={styles.secondaryBtnText}>Отмена</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={assign}><Text style={styles.primaryBtnText}>Назначить</Text></TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Навыки</Text>
        {memberDev.skills.length === 0 && <Text style={styles.muted}>Навыки не заданы.</Text>}
        {memberDev.skills.map(s => <SkillRow key={s.id} us={s} meId={meId} colors={colors} readOnly onChanged={() => {}} onRemoved={() => {}} />)}

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>План развития</Text>
        {memberDev.steps.length === 0 && <Text style={styles.muted}>План пуст.</Text>}
        {memberDev.steps.map(s => <StepCard key={s.id} step={s} meId={meId} colors={colors} readOnly canFeedback onChanged={upMemberStep} onRemoved={() => {}} />)}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} />}>
      <Text style={styles.intro}>Развитие команды: навыки, планы и прогресс. Откройте карточку сотрудника, чтобы назначить направление роста и оставить обратную связь по шагам.</Text>
      {teams.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {teams.map(t => <TouchableOpacity key={t.id} onPress={() => setTeamId(t.id)} style={[styles.levelChip, teamId === t.id && { backgroundColor: colors.accentLight, borderColor: colors.accent }]}><Text style={[styles.levelChipText, teamId === t.id && { color: colors.accent }]}>{t.name}</Text></TouchableOpacity>)}
        </View>
      )}
      {loading && <Spinner />}
      {!loading && members.length === 0 && <EmptyState icon="people-outline" title="Нет данных развития" description="Как только сотрудники добавят навыки и планы, они появятся здесь." />}
      {!loading && members.map(m => (
        <View key={m.user_id} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(m.user_name || '?').slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.title}>{m.user_name}</Text>
            <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => openMember(m.user_id)}><Text style={styles.link}>Открыть</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <Text style={styles.chip}>Навыков: {m.skills.length}</Text>
            <Text style={styles.chip}>План: {m.plan_progress}%</Text>
            {!m.has_active_plan && <Text style={styles.warnChip}>Нет активного плана</Text>}
            {m.overdue_steps > 0 && <Text style={[styles.warnChip, { color: colors.danger }]}>Просрочено: {m.overdue_steps}</Text>}
            {m.gaps > 0 && <Text style={styles.chip}>Разрывов: {m.gaps}</Text>}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── корневой экран ───────────────────────────────────────────────────────────
export default function DevelopmentScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, activeRole } = useAuth();
  const router = useRouter();
  const isLead = (activeRole ?? user?.role) === 'team_lead';
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={{ width: 28 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isLead ? 'Развитие команды' : 'Развитие'}</Text>
        <View style={{ width: 28 }} />
      </View>
      {user && (isLead ? <LeadDevelopment meId={user.id} colors={colors} /> : <MemberDevelopment meId={user.id} colors={colors} />)}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  intro: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 },
  formCard: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 10 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, fontSize: 14, color: c.textPrimary, backgroundColor: c.bg },
  title: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  muted: { fontSize: 12, color: c.textMuted },
  chip: { fontSize: 11, color: c.textSecondary, backgroundColor: c.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  warnChip: { fontSize: 11, fontWeight: '600', color: c.warning, backgroundColor: c.warningBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  badge: { fontSize: 12, fontWeight: '600' },
  pct: { fontSize: 13, fontWeight: '700', color: c.textSecondary, width: 42, textAlign: 'right' },
  link: { fontSize: 13, fontWeight: '600', color: c.accent },
  removeLink: { fontSize: 12, color: c.textMuted },
  levelNum: { fontSize: 15, fontWeight: '700', color: c.textPrimary, minWidth: 20, textAlign: 'center' },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  levelChip: { minWidth: 34, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center', backgroundColor: c.surface },
  levelChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  primaryBtn: { flex: 1, backgroundColor: c.accent, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: c.textSecondary, fontWeight: '600', fontSize: 14 },
  primaryBtnSm: { backgroundColor: c.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  primaryBtnSmText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  secondaryBtnSm: { borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  secondaryBtnSmText: { color: c.textSecondary, fontWeight: '600', fontSize: 13 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.accentLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: c.accent },
});
