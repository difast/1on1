import { useState, useEffect, useCallback } from 'react'
import Spinner from '../lib/Spinner'
import EmptyState from './EmptyState'
import { toast } from '../lib/ui'
import { fmtDate } from '../lib/datetime'
import { CommentThread, GoalForm } from './Goals'
import {
  getDevelopment, getSkills, addUserSkill, updateUserSkill, deleteUserSkill,
  createDevStep, updateDevStep, deleteDevStep, addDevStepComment,
  createDevRecommendation, aiDevRecommendation, actOnDevRecommendation,
  getTeamDevelopment, createGoal, updateGoal, addGoalComment,
} from '../api/client'

// ── конфигурация (повторяет серверную из app/models/development.py) ───────────
export const SKILL_LEVELS = { 1: 'Новичок', 2: 'Базовый', 3: 'Уверенный', 4: 'Продвинутый', 5: 'Эксперт' }
const LEVELS = [1, 2, 3, 4, 5]
const CATEGORY_LABEL = {
  technical: 'Технические', product: 'Продуктовые',
  communication: 'Коммуникационные', management: 'Управленческие',
}
const CATEGORIES = ['technical', 'product', 'communication', 'management']
const STEP_STATUS = {
  not_started: { label: 'Не начат', bg: 'var(--gray-100)', fg: 'var(--color-text-secondary)', bd: 'var(--gray-200)' },
  in_progress: { label: 'В работе', bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  done: { label: 'Выполнен', bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  cancelled: { label: 'Отменён', bg: 'var(--gray-100)', fg: 'var(--color-text-muted)', bd: 'var(--gray-200)' },
}
const STEP_OPEN = ['not_started', 'in_progress']

// ── графическая шкала уровня (без эмодзи): заполненные и целевые деления ───────
function LevelScale({ current, desired }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {LEVELS.map(l => {
        const filled = l <= current
        const isTarget = desired && l === desired
        return (
          <div key={l} title={SKILL_LEVELS[l]} style={{
            width: 16, height: 8, borderRadius: 2,
            background: filled ? 'var(--color-accent)' : 'var(--gray-200)',
            outline: isTarget ? '2px solid var(--color-success)' : 'none', outlineOffset: 1,
          }} />
        )
      })}
    </div>
  )
}

function StepStatusBadge({ status }) {
  const c = STEP_STATUS[status] || STEP_STATUS.not_started
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, whiteSpace: 'nowrap' }}>{c.label}</span>
  )
}

function toDateInput(iso) {
  if (!iso) return ''
  try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
}

// ── навык сотрудника (просмотр/редактирование) ───────────────────────────────
function SkillRow({ us, meId, readOnly, onChanged, onRemoved }) {
  const [showHist, setShowHist] = useState(false)
  const [saving, setSaving] = useState(false)

  const patch = async (payload) => {
    setSaving(true)
    try { const { data } = await updateUserSkill(us.id, { actor_id: meId, ...payload }); onChanged(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось сохранить', 'error') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm('Удалить навык?')) return
    try { await deleteUserSkill(us.id, meId); onRemoved(us.id) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось удалить', 'error') }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{us.skill_name}</h4>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--gray-100)', borderRadius: 6, padding: '1px 8px' }}>{CATEGORY_LABEL[us.category] || us.category}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <LevelScale current={us.current_level} desired={us.desired_level} />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {us.current_level_label}{us.desired_level ? ` → ${us.desired_level_label}` : ''}
            </span>
            {us.gap > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 8px' }}>разрыв {us.gap}</span>
            )}
          </div>
          {us.target_date && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>Срок: {fmtDate(us.target_date)}</p>}
        </div>
        {!readOnly && (
          <button onClick={remove} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>Удалить</button>
        )}
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Текущий
            <select className="input" disabled={saving} value={us.current_level} onChange={e => patch({ current_level: Number(e.target.value) })} style={{ marginLeft: 6, width: 'auto', padding: '3px 6px', fontSize: 12 }}>
              {LEVELS.map(l => <option key={l} value={l}>{l} · {SKILL_LEVELS[l]}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Желаемый
            <select className="input" disabled={saving} value={us.desired_level || ''} onChange={e => patch({ desired_level: e.target.value ? Number(e.target.value) : 0 })} style={{ marginLeft: 6, width: 'auto', padding: '3px 6px', fontSize: 12 }}>
              <option value="">—</option>
              {LEVELS.map(l => <option key={l} value={l}>{l} · {SKILL_LEVELS[l]}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Срок
            <input type="date" className="input" disabled={saving} value={toDateInput(us.target_date)} onChange={e => patch({ target_date: e.target.value ? new Date(e.target.value).toISOString() : null })} style={{ marginLeft: 6, width: 'auto', padding: '3px 6px', fontSize: 12 }} />
          </label>
        </div>
      )}

      {us.history?.length > 1 && (
        <button onClick={() => setShowHist(v => !v)} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0, marginTop: 10 }}>
          История уровня ({us.history.length})
        </button>
      )}
      {showHist && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {us.history.map(h => (
            <div key={h.id} style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', gap: 10 }}>
              <span style={{ fontWeight: 600 }}>{h.level_label}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{fmtDate(h.changed_at)}</span>
              {h.note && <span style={{ color: 'var(--color-text-muted)' }}>· {h.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── шаг плана развития ───────────────────────────────────────────────────────
function StepCard({ step, meId, readOnly, canFeedback, onChanged, onRemoved }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const linked = !!step.goal_id

  const patch = async (payload) => {
    setSaving(true)
    try { const { data } = await updateDevStep(step.id, { actor_id: meId, ...payload }); onChanged(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось сохранить', 'error') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm('Удалить шаг?')) return
    try { await deleteDevStep(step.id, meId); onRemoved(step.id) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось удалить', 'error') }
  }

  return (
    <div className="card" style={{ padding: 14, borderLeft: `3px solid ${(STEP_STATUS[step.status] || STEP_STATUS.not_started).fg}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{step.title}</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {step.skill_name && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--gray-100)', borderRadius: 6, padding: '1px 8px' }}>Навык: {step.skill_name}</span>}
            {step.goal_title && <span style={{ fontSize: 11, color: '#1d4ed8', background: '#eff6ff', borderRadius: 6, padding: '1px 8px' }}>Цель: {step.goal_title}</span>}
            {step.assigned_by_lead && <span style={{ fontSize: 11, color: '#7c3aed', background: '#ede9fe', borderRadius: 6, padding: '1px 8px' }}>Назначено руководителем</span>}
            {step.overdue && <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 8px' }}>Просрочен</span>}
          </div>
        </div>
        <StepStatusBadge status={step.status} />
      </div>
      {step.description && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{step.description}</p>}
      {step.due_date && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>Срок: {fmtDate(step.due_date)}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
          <div style={{ width: `${step.progress}%`, height: '100%', background: step.progress >= 100 ? 'var(--color-success)' : 'var(--color-accent)', borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', width: 42, textAlign: 'right' }}>{step.progress}%</span>
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <input type="range" min={0} max={100} step={10} value={step.progress} disabled={saving}
            onChange={e => patch({ progress: Number(e.target.value) })}
            style={{ flex: 1, minWidth: 140, accentColor: 'var(--color-accent)' }} />
          {!linked ? (
            <select className="input" value={step.status} disabled={saving} onChange={e => patch({ status: e.target.value })} style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}>
              {Object.keys(STEP_STATUS).map(s => <option key={s} value={s}>{STEP_STATUS[s].label}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>статус ведётся связанной целью</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <button onClick={() => setExpanded(v => !v)} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0 }}>
          Обсуждение{step.comments?.length ? ` (${step.comments.length})` : ''}
        </button>
        {!readOnly && <button onClick={remove} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>Удалить</button>}
      </div>
      {expanded && (
        <CommentThread goal={step} meId={meId} canFeedback={canFeedback}
          onSend={async (payload) => { const { data } = await addDevStepComment(step.id, { actor_id: meId, ...payload }); onChanged(data) }} />
      )}
    </div>
  )
}

// ── рекомендация ─────────────────────────────────────────────────────────────
function RecommendationCard({ rec, meId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const act = async (action) => {
    setBusy(true)
    try { const { data } = await actOnDevRecommendation(rec.id, { actor_id: meId, action }); onChanged(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось', 'error') }
    finally { setBusy(false) }
  }
  const done = rec.status !== 'new'
  return (
    <div className="card" style={{ padding: 14, opacity: done ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', borderRadius: 6, padding: '1px 8px' }}>{rec.source_label}</span>
        {rec.skill_name && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{rec.skill_name}</span>}
        {rec.target_level && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>цель: {SKILL_LEVELS[rec.target_level]}</span>}
      </div>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>{rec.title}</h4>
      {rec.body && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{rec.body}</p>}
      {done ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{rec.status === 'accepted' ? 'Принято — добавлено в план' : 'Отклонено'}</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-accent btn-sm" disabled={busy} onClick={() => act('accept')}>Принять и добавить в план</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act('dismiss')}>Отклонить</button>
        </div>
      )}
    </div>
  )
}

// ── добавление навыка ────────────────────────────────────────────────────────
function AddSkillForm({ meId, dict, onAdded, onCancel }) {
  const [skillId, setSkillId] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('technical')
  const [current, setCurrent] = useState(2)
  const [desired, setDesired] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!skillId && !name.trim()) { toast('Выберите или введите навык', 'error'); return }
    setSaving(true)
    try {
      const { data } = await addUserSkill({
        actor_id: meId, user_id: meId,
        skill_id: skillId ? Number(skillId) : undefined,
        skill_name: skillId ? undefined : name.trim(), category,
        current_level: Number(current), desired_level: desired ? Number(desired) : undefined,
      })
      onAdded(data)
    } catch (e) { toast(e?.response?.data?.detail || 'Не удалось добавить', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Навык из справочника</label>
        <select className="input" value={skillId} onChange={e => setSkillId(e.target.value)} style={{ marginTop: 4 }}>
          <option value="">— новый навык —</option>
          {dict.map(s => <option key={s.id} value={s.id}>{s.name} ({CATEGORY_LABEL[s.category] || s.category})</option>)}
        </select>
      </div>
      {!skillId && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Название навыка" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} />
          <select className="input" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 'auto' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Текущий уровень
          <select className="input" value={current} onChange={e => setCurrent(e.target.value)} style={{ marginLeft: 6, width: 'auto' }}>
            {LEVELS.map(l => <option key={l} value={l}>{l} · {SKILL_LEVELS[l]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Желаемый
          <select className="input" value={desired} onChange={e => setDesired(e.target.value)} style={{ marginLeft: 6, width: 'auto' }}>
            <option value="">—</option>
            {LEVELS.map(l => <option key={l} value={l}>{l} · {SKILL_LEVELS[l]}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Отмена</button>
        <button className="btn btn-accent btn-sm" onClick={submit} disabled={saving}>{saving ? 'Добавляем…' : 'Добавить навык'}</button>
      </div>
    </div>
  )
}

// ── добавление шага ──────────────────────────────────────────────────────────
function AddStepForm({ meId, userId, skills, onAdded, onCancel }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [skillId, setSkillId] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!title.trim()) { toast('Укажите название шага', 'error'); return }
    setSaving(true)
    try {
      const { data } = await createDevStep({
        actor_id: meId, user_id: userId, title: title.trim(), description: desc.trim() || null,
        skill_id: skillId ? Number(skillId) : undefined, due_date: due ? new Date(due).toISOString() : undefined,
      })
      onAdded(data)
    } catch (e) { toast(e?.response?.data?.detail || 'Не удалось добавить', 'error') }
    finally { setSaving(false) }
  }
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input className="input" placeholder="Название шага" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="input" placeholder="Описание (необязательно)" rows={2} value={desc} onChange={e => setDesc(e.target.value)} style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="input" value={skillId} onChange={e => setSkillId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          <option value="">Навык (необязательно)</option>
          {skills.map(s => <option key={s.id} value={s.skill_id}>{s.skill_name}</option>)}
        </select>
        <input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Отмена</button>
        <button className="btn btn-accent btn-sm" onClick={submit} disabled={saving}>{saving ? 'Добавляем…' : 'Добавить шаг'}</button>
      </div>
    </div>
  )
}

// ══ Сотрудник ═════════════════════════════════════════════════════════════════
export function DevelopmentMember({ user }) {
  const meId = user.id
  const [dev, setDev] = useState(null)
  const [dict, setDict] = useState([])
  const [showSkill, setShowSkill] = useState(false)
  const [showStep, setShowStep] = useState(false)
  const [showLearn, setShowLearn] = useState(false)
  const [learnSkill, setLearnSkill] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const load = useCallback(async () => {
    try { const { data } = await getDevelopment(meId, meId); setDev(data) }
    catch { setDev({ skills: [], steps: [], recommendations: [], learning_goals: [], plan_progress: 0 }) }
  }, [meId])
  useEffect(() => { load() }, [load])
  useEffect(() => { getSkills(undefined, meId).then(r => setDict(r.data || [])).catch(() => setDict([])) }, [meId])

  const upSkill = (u, removedId) => setDev(d => ({ ...d, skills: removedId ? d.skills.filter(s => s.id !== removedId) : d.skills.map(s => s.id === u.id ? u : s) }))
  const upStep = (u, removedId) => setDev(d => ({ ...d, steps: removedId ? d.steps.filter(s => s.id !== removedId) : d.steps.map(s => s.id === u.id ? u : s), plan_progress: d.plan_progress }))
  const upRec = (u) => setDev(d => ({ ...d, recommendations: d.recommendations.map(r => r.id === u.id ? u : r) }))

  const askAi = async () => {
    setAiBusy(true)
    try { const { data } = await aiDevRecommendation(meId, meId); setDev(d => ({ ...d, recommendations: [data, ...d.recommendations] })); toast('Пит добавил рекомендацию', 'success') }
    catch (e) {
      const detail = e?.response?.data?.detail
      if (detail?.code === 'feature_locked') toast(detail.message, 'info')
      else toast(detail || 'Пит недоступен', 'error')
    } finally { setAiBusy(false) }
  }

  if (dev === null) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  const openRecs = dev.recommendations.filter(r => r.status === 'new')
  const learning = dev.learning_goals || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
        Ваш путь развития: навыки с уровнями, индивидуальный план и рекомендации. Тимлид видит ваше развитие и может назначить направление роста.
      </p>

      {/* Навыки */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>Навыки</h3>
          {!showSkill && <button className="btn btn-accent btn-sm" onClick={() => setShowSkill(true)}>+ Навык</button>}
        </div>
        {showSkill && <AddSkillForm meId={meId} dict={dict} onCancel={() => setShowSkill(false)} onAdded={(s) => { setDev(d => ({ ...d, skills: [...d.skills, s] })); setShowSkill(false) }} />}
        {dev.skills.length === 0 && !showSkill && <EmptyState title="Навыки не заданы" desc="Добавьте навык и укажите текущий и желаемый уровень." />}
        {dev.skills.map(s => <SkillRow key={s.id} us={s} meId={meId} onChanged={upSkill} onRemoved={(id) => upSkill(null, id)} />)}
      </section>

      {/* План развития */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>План развития
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginLeft: 8 }}>прогресс {dev.plan_progress}%</span>
          </h3>
          {!showStep && <button className="btn btn-accent btn-sm" onClick={() => setShowStep(true)}>+ Шаг</button>}
        </div>
        {showStep && <AddStepForm meId={meId} userId={meId} skills={dev.skills} onCancel={() => setShowStep(false)} onAdded={(s) => { setDev(d => ({ ...d, steps: [s, ...d.steps] })); setShowStep(false) }} />}
        {dev.steps.length === 0 && !showStep && <EmptyState title="План пуст" desc="Добавьте первый шаг развития — свяжите его с навыком и сроком." />}
        {dev.steps.map(s => <StepCard key={s.id} step={s} meId={meId} canFeedback={false} onChanged={upStep} onRemoved={(id) => upStep(null, id)} />)}
      </section>

      {/* Рекомендации */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>Рекомендации</h3>
          <button className="btn btn-secondary btn-sm" disabled={aiBusy} onClick={askAi}>{aiBusy ? 'Пит думает…' : 'Спросить Пита'}</button>
        </div>
        {openRecs.length === 0 && <EmptyState title="Рекомендаций нет" desc="Задайте желаемые уровни навыков — появятся рекомендации по разрыву." />}
        {openRecs.map(r => <RecommendationCard key={r.id} rec={r} meId={meId} onChanged={upRec} />)}
      </section>

      {/* Учебные цели (единая модель с вкладкой «Цели») */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>Учебные цели</h3>
          {!showLearn && <button className="btn btn-accent btn-sm" onClick={() => setShowLearn(true)}>+ Учебная цель</button>}
        </div>
        {showLearn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Связанный навык
              <select className="input" value={learnSkill} onChange={e => setLearnSkill(e.target.value)} style={{ marginLeft: 6, width: 'auto' }}>
                <option value="">— нет —</option>
                {dev.skills.map(s => <option key={s.id} value={s.skill_id}>{s.skill_name}</option>)}
              </select>
            </label>
            <GoalForm submitLabel="Создать учебную цель" placeholder="Например: Пройти курс по системному дизайну"
              onCancel={() => { setShowLearn(false); setLearnSkill('') }}
              onCreate={async (payload) => {
                const { data } = await createGoal({ user_id: meId, goal_kind: 'learning', skill_id: learnSkill ? Number(learnSkill) : undefined, ...payload })
                setDev(d => ({ ...d, learning_goals: [data, ...(d.learning_goals || [])] }))
                setShowLearn(false); setLearnSkill(''); toast('Учебная цель создана — видна и во вкладке «Цели»', 'success')
              }} />
          </div>
        )}
        {learning.length === 0 && !showLearn && <EmptyState title="Учебных целей нет" desc="Создайте учебную цель — она появится и во вкладке «Цели»." />}
        {learning.map(g => (
          <div key={g.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{g.title}</h4>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{g.progress}%</span>
            </div>
            {g.skill_name && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>Навык: {g.skill_name} · период: {g.period_label || '—'}</p>}
            <div style={{ marginTop: 8, height: 8, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${g.progress}%`, height: '100%', background: g.progress >= 100 ? 'var(--color-success)' : 'var(--color-accent)' }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>Прогресс и статус ведутся во вкладке «Цели».</p>
          </div>
        ))}
      </section>
    </div>
  )
}

// ── карточка сотрудника в обзоре тимлида ─────────────────────────────────────
function TeamMemberRow({ m, meId, onOpen }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-bg, #eff6ff)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
          {(m.user_name || '?').slice(0, 1).toUpperCase()}
        </div>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{m.user_name}</h4>
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onOpen(m.user_id)}>Открыть развитие</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--gray-100)', borderRadius: 6, padding: '3px 10px' }}>Навыков: {m.skills.length}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--gray-100)', borderRadius: 6, padding: '3px 10px' }}>План: {m.plan_progress}%</span>
        {!m.has_active_plan && <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 10px' }}>Нет активного плана</span>}
        {m.overdue_steps > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-danger)', background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px' }}>Просрочено: {m.overdue_steps}</span>}
        {m.gaps > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--gray-100)', borderRadius: 6, padding: '3px 10px' }}>Разрывов: {m.gaps}</span>}
      </div>
    </div>
  )
}

// ── назначение направления роста тимлидом ────────────────────────────────────
function AssignDirection({ meId, userId, skills, onDone }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [skillId, setSkillId] = useState('')
  const [level, setLevel] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!title.trim()) { toast('Укажите направление', 'error'); return }
    setSaving(true)
    try {
      await createDevRecommendation({
        actor_id: meId, user_id: userId, title: title.trim(), body: body.trim() || null,
        skill_id: skillId ? Number(skillId) : undefined, target_level: level ? Number(level) : undefined,
        target_date: due ? new Date(due).toISOString() : undefined,
      })
      toast('Направление назначено — сотрудник получит уведомление', 'success')
      setTitle(''); setBody(''); setSkillId(''); setLevel(''); setDue(''); setOpen(false); onDone?.()
    } catch (e) { toast(e?.response?.data?.detail || 'Не удалось назначить', 'error') }
    finally { setSaving(false) }
  }
  if (!open) return <button className="btn btn-accent btn-sm" onClick={() => setOpen(true)}>Назначить направление роста</button>
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input className="input" placeholder="Направление роста" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea className="input" placeholder="Комментарий (необязательно)" rows={2} value={body} onChange={e => setBody(e.target.value)} style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="input" value={skillId} onChange={e => setSkillId(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
          <option value="">Навык (необязательно)</option>
          {skills.map(s => <option key={s.id} value={s.skill_id}>{s.skill_name}</option>)}
        </select>
        <select className="input" value={level} onChange={e => setLevel(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Целевой уровень</option>
          {LEVELS.map(l => <option key={l} value={l}>{l} · {SKILL_LEVELS[l]}</option>)}
        </select>
        <input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Отмена</button>
        <button className="btn btn-accent btn-sm" onClick={submit} disabled={saving}>{saving ? 'Назначаем…' : 'Назначить'}</button>
      </div>
    </div>
  )
}

// ══ Тимлид ════════════════════════════════════════════════════════════════════
export function DevelopmentLead({ user, teams, selectedTeamId, onSelectTeam }) {
  const meId = user.id
  const myTeams = (teams || []).filter(t => t.team_lead_id === meId)
  const [teamId, setTeamId] = useState(selectedTeamId || myTeams[0]?.id || null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [openMember, setOpenMember] = useState(null)   // user_id
  const [memberDev, setMemberDev] = useState(null)

  useEffect(() => { if (selectedTeamId) setTeamId(selectedTeamId) }, [selectedTeamId])
  useEffect(() => { if (!teamId && myTeams[0]?.id) setTeamId(myTeams[0].id) }, [myTeams, teamId])

  const load = useCallback(async () => {
    if (!teamId) { setData(null); return }
    setLoading(true)
    try { const { data } = await getTeamDevelopment(teamId, meId); setData(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось загрузить', 'error'); setData(null) }
    finally { setLoading(false) }
  }, [teamId, meId])
  useEffect(() => { load() }, [load])

  const openMemberDev = async (uid) => {
    setOpenMember(uid); setMemberDev(null)
    try { const { data } = await getDevelopment(uid, meId); setMemberDev(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Нет доступа', 'error'); setOpenMember(null) }
  }
  const upMemberStep = (u) => setMemberDev(d => d && ({ ...d, steps: d.steps.map(s => s.id === u.id ? u : s) }))

  const members = data?.members || []

  if (openMember && memberDev) {
    const m = members.find(x => x.user_id === openMember)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <button onClick={() => { setOpenMember(null); setMemberDev(null) }} style={{ fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', alignSelf: 'flex-start', padding: 0 }}>← К обзору команды</button>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>Развитие: {m?.user_name}</h3>

        <AssignDirection meId={meId} userId={openMember} skills={memberDev.skills} onDone={load} />

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>Навыки</h4>
          {memberDev.skills.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Навыки не заданы.</p>}
          {memberDev.skills.map(s => <SkillRow key={s.id} us={s} meId={meId} readOnly onChanged={() => {}} onRemoved={() => {}} />)}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>План развития</h4>
          {memberDev.steps.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>План пуст.</p>}
          {memberDev.steps.map(s => <StepCard key={s.id} step={s} meId={meId} readOnly canFeedback onChanged={upMemberStep} onRemoved={() => {}} />)}
        </section>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Развитие команды: навыки, уровни, планы и прогресс. Откройте карточку сотрудника, чтобы назначить направление роста и оставить обратную связь по шагам.
        </p>
        {myTeams.length > 1 && (
          <select className="input" value={teamId || ''} onChange={e => { const v = Number(e.target.value); setTeamId(v); onSelectTeam?.(v) }} style={{ width: 'auto' }}>
            {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {loading && <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>}
      {!loading && members.length === 0 && <EmptyState title="В команде пока нет данных развития" desc="Как только сотрудники добавят навыки и планы, они появятся здесь." />}
      {!loading && members.map(m => <TeamMemberRow key={m.user_id} m={m} meId={meId} onOpen={openMemberDev} />)}
    </div>
  )
}

export default DevelopmentMember
