import { useState, useEffect, useCallback, useRef } from 'react'
import Spinner from '../lib/Spinner'
import EmptyState from './EmptyState'
import { toast } from '../lib/ui'
import { fmtDate } from '../lib/datetime'
import {
  createGoal, getGoals, getTeamGoals, getTeamSharedGoals, getGoal, updateGoal, deleteGoal, addGoalComment,
} from '../api/client'

// ── справочники статусов ─────────────────────────────────────────────────────
// Русские подписи и мягкая цветовая индикация. Риск подсвечивается информативно
// (янтарный), а не тревожно (красный оставлен только для «не достигнута»).
export const GOAL_STATUS_LABEL = {
  not_started: 'Не начата',
  in_progress: 'В работе',
  at_risk: 'Под риском',
  achieved: 'Достигнута',
  failed: 'Не достигнута',
}
const STATUS_COLOR = {
  not_started: { bg: 'var(--gray-100)', fg: 'var(--color-text-secondary)', bd: 'var(--gray-200)' },
  in_progress: { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  at_risk: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  achieved: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  failed: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)', bd: '#fca5a5' },
}
// Сотрудник управляет открытыми статусами вручную; «достигнута»/«не достигнута»
// — это завершение периода, тоже доступно, но связано с прогрессом на бэкенде.
const SELECTABLE_STATUSES = ['not_started', 'in_progress', 'at_risk', 'achieved', 'failed']
const OPEN_STATUSES = ['not_started', 'in_progress', 'at_risk']

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.not_started
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, whiteSpace: 'nowrap',
    }}>{GOAL_STATUS_LABEL[status] || status}</span>
  )
}

function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0))
  const color = v >= 100 ? 'var(--color-success)' : v > 0 ? 'var(--color-accent)' : 'var(--gray-300)'
  return (
    <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ width: `${v}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .2s' }} />
    </div>
  )
}

// ── работа с кварталами (период цели) ────────────────────────────────────────
const ROMAN = ['I', 'II', 'III', 'IV']
export function quarterOptions() {
  const now = new Date()
  const y = now.getFullYear()
  const curQ = Math.floor(now.getMonth() / 3) // 0..3
  const opts = []
  // текущий + 3 следующих квартала
  for (let i = 0; i < 4; i++) {
    let q = curQ + i, year = y
    while (q > 3) { q -= 4; year += 1 }
    const start = new Date(Date.UTC(year, q * 3, 1))
    const end = new Date(Date.UTC(year, q * 3 + 3, 0, 23, 59, 59))
    opts.push({
      value: `${year}-Q${q + 1}`,
      label: `${ROMAN[q]} квартал ${year}`,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
    })
  }
  return opts
}

function periodText(g) {
  if (g.period_label) return g.period_label
  if (g.period_end) return `до ${fmtDate(g.period_end)}`
  return 'Без срока'
}

// ── ветка обсуждения цели ────────────────────────────────────────────────────
export function CommentThread({ goal, meId, onSend, canFeedback }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState('comment')
  const [rating, setRating] = useState('')
  const [sending, setSending] = useState(false)
  const comments = goal.comments || []

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      await onSend({ body, kind, rating: kind === 'feedback' && rating ? Number(rating) : undefined })
      setText(''); setRating(''); setKind('comment')
    } finally { setSending(false) }
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {comments.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Обсуждения пока нет.</p>
        )}
        {comments.map(c => {
          const mine = c.author_id === meId
          const isFeedback = c.kind === 'feedback'
          return (
            <div key={c.id} style={{
              alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%',
              background: isFeedback ? '#f5f3ff' : (mine ? 'var(--color-accent-bg, #eff6ff)' : 'var(--gray-50, #f9fafb)'),
              border: `1px solid ${isFeedback ? '#ddd6fe' : 'var(--gray-200)'}`,
              borderRadius: 10, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.author_name || 'Участник'}</span>
                {isFeedback && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', borderRadius: 6, padding: '1px 6px' }}>Итоговая оценка</span>
                )}
                {isFeedback && c.rating != null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{c.rating}/5</span>
                )}
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</p>
              {c.created_at && <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>{fmtDate(c.created_at)}</p>}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {canFeedback && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={kind === 'comment'} onChange={() => setKind('comment')} /> Комментарий
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={kind === 'feedback'} onChange={() => setKind('feedback')} /> Итоговая оценка
            </label>
            {kind === 'feedback' && (
              <select value={rating} onChange={e => setRating(e.target.value)} className="input" style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                <option value="">Оценка</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}/5</option>)}
              </select>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={kind === 'feedback' ? 'Итоговая обратная связь по цели…' : 'Написать комментарий…'}
            style={{ flex: 1 }}
          />
          <button className="btn btn-accent btn-sm" onClick={submit} disabled={sending || !text.trim()}>
            {sending ? '…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── карточка цели (режим сотрудника — с редактированием) ─────────────────────
function OwnGoalCard({ goal, meId, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [progress, setProgress] = useState(goal.progress)
  const [saving, setSaving] = useState(false)
  const c = STATUS_COLOR[goal.status] || STATUS_COLOR.not_started

  useEffect(() => { setProgress(goal.progress) }, [goal.progress])

  const patch = async (payload) => {
    setSaving(true)
    try {
      const { data } = await updateGoal(goal.id, { actor_id: meId, ...payload })
      onChanged(data)
    } catch (e) {
      toast(e?.response?.data?.detail || 'Не удалось сохранить', 'error')
      setProgress(goal.progress)
    } finally { setSaving(false) }
  }

  const suggestDiffers = goal.suggested_status && goal.suggested_status !== goal.status
  const suggestOpen = OPEN_STATUSES.includes(goal.suggested_status)

  const remove = async () => {
    if (!window.confirm('Удалить эту цель?')) return
    try { await deleteGoal(goal.id, meId); onChanged(null, goal.id) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось удалить', 'error') }
  }

  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${c.fg}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{goal.title}</h4>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{periodText(goal)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StatusBadge status={goal.status} />
          {goal.stagnant && OPEN_STATUSES.includes(goal.status) && (
            <span title={`Прогресс не обновлялся ${goal.days_since_progress} дн.`} style={{
              fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb',
              border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px',
            }}>Давно без обновлений</span>
          )}
        </div>
      </div>

      {goal.description && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{goal.description}</p>
      )}

      {/* Прогресс — основное регулярное действие сотрудника */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ProgressBar value={progress} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', width: 42, textAlign: 'right' }}>{progress}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <input
          type="range" min={0} max={100} step={5} value={progress}
          onChange={e => setProgress(Number(e.target.value))}
          onMouseUp={e => Number(e.target.value) !== goal.progress && patch({ progress: Number(e.target.value) })}
          onTouchEnd={e => progress !== goal.progress && patch({ progress })}
          disabled={saving}
          style={{ flex: 1, minWidth: 140, accentColor: 'var(--color-accent)' }}
        />
        <select
          value={goal.status} disabled={saving}
          onChange={e => patch({ status: e.target.value })}
          className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
        >
          {SELECTABLE_STATUSES.map(s => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {/* Информативная подсказка статуса — финальное решение за сотрудником */}
      {suggestDiffers && suggestOpen && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>По прогрессу и сроку статус ближе к «{GOAL_STATUS_LABEL[goal.suggested_status]}».</span>
          <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: 12 }} disabled={saving}
            onClick={() => patch({ status: goal.suggested_status })}>
            Применить
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <button onClick={() => setExpanded(v => !v)} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0 }}>
          Обсуждение{goal.comments?.length ? ` (${goal.comments.length})` : ''}
        </button>
        <button onClick={remove} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, marginLeft: 'auto' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--color-danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}>Удалить</button>
      </div>

      {expanded && (
        <CommentThread goal={goal} meId={meId} canFeedback={false}
          onSend={async (payload) => {
            const { data } = await addGoalComment(goal.id, { actor_id: meId, ...payload })
            onChanged(data)
          }} />
      )}
    </div>
  )
}

// ── переиспользуемая форма создания цели (личная / командная) ───────────────
export function GoalForm({ onCreate, onCancel, submitLabel = 'Создать цель', placeholder }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const qOpts = useRef(quarterOptions()).current
  const [period, setPeriod] = useState(qOpts[0].value)
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!title.trim()) { toast('Укажите название цели', 'error'); return }
    setCreating(true)
    try {
      const opt = qOpts.find(o => o.value === period) || qOpts[0]
      await onCreate({
        title: title.trim(), description: desc.trim() || null,
        period_label: opt.label, period_start: opt.period_start, period_end: opt.period_end,
      })
      setTitle(''); setDesc(''); setPeriod(qOpts[0].value)
    } catch (e) {
      toast(e?.response?.data?.detail || 'Не удалось создать цель', 'error')
    } finally { setCreating(false) }
  }

  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Название цели</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={placeholder || 'Например: Запустить онбординг новых сотрудников'} style={{ marginTop: 4 }} />
      </div>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Ожидаемый результат</label>
        <textarea className="input" value={desc} onChange={e => setDesc(e.target.value)} rows={3}
          placeholder="Как поймём, что цель достигнута — измеримый результат" style={{ marginTop: 4, resize: 'vertical' }} />
      </div>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Период</label>
        <select className="input" value={period} onChange={e => setPeriod(e.target.value)} style={{ marginTop: 4 }}>
          {qOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Отмена</button>
        <button className="btn btn-accent btn-sm" onClick={submit} disabled={creating}>{creating ? 'Создаём…' : submitLabel}</button>
      </div>
    </div>
  )
}

// ── командная цель глазами сотрудника (только чтение + обсуждение) ────────────
function TeamGoalCard({ goal, meId, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const c = STATUS_COLOR[goal.status] || STATUS_COLOR.not_started
  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${c.fg}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{goal.title}</h4>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{periodText(goal)} · ведёт тимлид</p>
        </div>
        <StatusBadge status={goal.status} />
      </div>
      {goal.description && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{goal.description}</p>
      )}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ProgressBar value={goal.progress} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', width: 42, textAlign: 'right' }}>{goal.progress}%</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setExpanded(v => !v)} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0 }}>
          Обсуждение{goal.comments?.length ? ` (${goal.comments.length})` : ''}
        </button>
      </div>
      {expanded && (
        <CommentThread goal={goal} meId={meId} canFeedback={false}
          onSend={async (payload) => {
            const { data } = await addGoalComment(goal.id, { actor_id: meId, ...payload })
            onChanged(data)
          }} />
      )}
    </div>
  )
}

// ── сотрудник: список своих целей + создание ─────────────────────────────────
export function GoalsMember({ user, teamId }) {
  const meId = user.id
  const [goals, setGoals] = useState(null)
  const [teamGoals, setTeamGoals] = useState([])
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try { const { data } = await getGoals(meId, meId); setGoals(data || []) }
    catch { setGoals([]) }
  }, [meId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!teamId) { setTeamGoals([]); return }
    getTeamSharedGoals(teamId, meId).then(r => setTeamGoals(r.data || [])).catch(() => setTeamGoals([]))
  }, [teamId, meId])

  const applyChange = (updated, removedId) => {
    setGoals(prev => {
      if (removedId) return (prev || []).filter(g => g.id !== removedId)
      if (!updated) return prev
      return (prev || []).map(g => g.id === updated.id ? updated : g)
    })
  }
  const applyTeamChange = (updated) => setTeamGoals(prev => prev.map(g => g.id === updated.id ? updated : g))

  if (goals === null) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  const active = goals.filter(g => OPEN_STATUSES.includes(g.status))
  const history = goals.filter(g => !OPEN_STATUSES.includes(g.status))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Командные цели — ставит тимлид, сотрудник видит и участвует в обсуждении */}
      {teamGoals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>Цели команды</h3>
          {teamGoals.map(g => <TeamGoalCard key={g.id} goal={g} meId={meId} onChanged={applyTeamChange} />)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Ставьте личные цели на квартал и регулярно отмечайте прогресс. Тимлид видит ваши цели и может оставить обратную связь.
        </p>
        {!showForm && <button className="btn btn-accent btn-sm" style={{ flexShrink: 0 }} onClick={() => setShowForm(true)}>+ Новая цель</button>}
      </div>

      {showForm && (
        <GoalForm
          onCancel={() => setShowForm(false)}
          onCreate={async (payload) => {
            const { data } = await createGoal({ user_id: meId, ...payload })
            setGoals(prev => [data, ...(prev || [])])
            setShowForm(false)
            toast('Цель создана', 'success')
          }}
        />
      )}

      {goals.length === 0 && !showForm && teamGoals.length === 0 && (
        <EmptyState title="Целей пока нет" desc="Создайте первую цель на текущий квартал и отслеживайте прогресс." />
      )}

      {active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>Мои цели</h3>
          {active.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} onChanged={applyChange} />)}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)' }}>История</h3>
          {history.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} onChanged={applyChange} />)}
        </div>
      )}
    </div>
  )
}

// ── карточка цели в сводном виде тимлида (только чтение + обсуждение) ─────────
function LeadGoalCard({ goal, meId, onCommented }) {
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const c = STATUS_COLOR[goal.status] || STATUS_COLOR.not_started

  // Сводный вид приходит без веток обсуждения (экономно). При первом раскрытии
  // подгружаем полную цель с комментариями/оценками.
  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && !loaded) {
      setLoaded(true)
      try { const { data } = await getGoal(goal.id, meId); onCommented(data) }
      catch { /* доступ проверяется на бэкенде */ }
    }
  }
  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${c.fg}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{goal.title}</p>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{periodText(goal)}</p>
        </div>
        <StatusBadge status={goal.status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <ProgressBar value={goal.progress} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', width: 38, textAlign: 'right' }}>{goal.progress}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {goal.stagnant && OPEN_STATUSES.includes(goal.status) && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px' }}>
            Без обновлений {goal.days_since_progress} дн.
          </span>
        )}
        <button onClick={toggle} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: 0, marginLeft: 'auto' }}>
          Комментарии и оценка{goal.comments?.length ? ` (${goal.comments.length})` : ''}
        </button>
      </div>
      {expanded && (
        <CommentThread goal={goal} meId={meId} canFeedback
          onSend={async (payload) => {
            const { data } = await addGoalComment(goal.id, { actor_id: meId, ...payload })
            onCommented(data)
          }} />
      )}
    </div>
  )
}

// ── тимлид: сводный вид команды ──────────────────────────────────────────────
export function GoalsLead({ user, teams, selectedTeamId, onSelectTeam }) {
  const meId = user.id
  const myTeams = (teams || []).filter(t => t.team_lead_id === meId)
  const [teamId, setTeamId] = useState(selectedTeamId || myTeams[0]?.id || null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [teamGoals, setTeamGoals] = useState([])
  const [showTeamForm, setShowTeamForm] = useState(false)

  useEffect(() => { if (selectedTeamId) setTeamId(selectedTeamId) }, [selectedTeamId])
  useEffect(() => { if (!teamId && myTeams[0]?.id) setTeamId(myTeams[0].id) }, [myTeams, teamId])

  const load = useCallback(async () => {
    if (!teamId) { setData(null); return }
    setLoading(true)
    try { const { data } = await getTeamGoals(teamId, meId); setData(data) }
    catch (e) { toast(e?.response?.data?.detail || 'Не удалось загрузить цели команды', 'error'); setData(null) }
    finally { setLoading(false) }
  }, [teamId, meId])
  useEffect(() => { load() }, [load])

  const loadTeamGoals = useCallback(async () => {
    if (!teamId) { setTeamGoals([]); return }
    try { const { data } = await getTeamSharedGoals(teamId, meId); setTeamGoals(data || []) }
    catch { setTeamGoals([]) }
  }, [teamId, meId])
  useEffect(() => { loadTeamGoals() }, [loadTeamGoals])

  // Командную цель ведёт тимлид (он владелец) — те же карточки с редактированием.
  const applyTeamChange = (updated, removedId) => {
    setTeamGoals(prev => {
      if (removedId) return prev.filter(g => g.id !== removedId)
      if (!updated) return prev
      return prev.map(g => g.id === updated.id ? updated : g)
    })
  }

  // Локально подменяем цель после комментария/оценки без полной перезагрузки.
  const patchGoal = (updated) => {
    setData(prev => prev && ({
      ...prev,
      members: prev.members.map(m => ({
        ...m, goals: m.goals.map(g => g.id === updated.id ? { ...g, ...updated } : g),
      })),
    }))
  }

  const members = data?.members || []
  const totalGoals = members.reduce((n, m) => n + m.goals.length, 0)
  const atRisk = members.reduce((n, m) => n + m.goals.filter(g => g.status === 'at_risk' || (g.stagnant && OPEN_STATUSES.includes(g.status))).length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            Командные цели ставите и ведёте вы, их видит вся команда. Личные цели сотрудников вы не редактируете — оставляете комментарии и итоговую оценку.
          </p>
          {totalGoals > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Всего целей: {totalGoals}{atRisk > 0 && <> · <span style={{ color: '#b45309', fontWeight: 600 }}>требуют внимания: {atRisk}</span></>}
            </p>
          )}
        </div>
        {myTeams.length > 1 && (
          <select className="input" value={teamId || ''} onChange={e => { const v = Number(e.target.value); setTeamId(v); onSelectTeam?.(v) }} style={{ width: 'auto' }}>
            {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Командные цели: ставит и ведёт тимлид, видит вся команда */}
      {teamId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>Цели команды</h3>
            {!showTeamForm && <button className="btn btn-accent btn-sm" onClick={() => setShowTeamForm(true)}>+ Командная цель</button>}
          </div>
          {showTeamForm && (
            <GoalForm
              submitLabel="Создать командную цель"
              placeholder="Например: Сократить время ответа клиенту до 2 часов"
              onCancel={() => setShowTeamForm(false)}
              onCreate={async (payload) => {
                const { data } = await createGoal({ user_id: meId, scope: 'team', team_id: teamId, ...payload })
                setTeamGoals(prev => [data, ...prev])
                setShowTeamForm(false)
                toast('Командная цель создана', 'success')
              }}
            />
          )}
          {teamGoals.length === 0 && !showTeamForm && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Командных целей пока нет. Поставьте цель на команду — её увидят все участники.
            </p>
          )}
          {teamGoals.map(g => <OwnGoalCard key={g.id} goal={g} meId={meId} onChanged={applyTeamChange} />)}
        </div>
      )}

      <div style={{ height: 1, background: 'var(--gray-100)', margin: '4px 0' }} />
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>Личные цели сотрудников</h3>

      {loading && <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>}

      {!loading && members.length === 0 && (
        <EmptyState title="В команде пока нет целей" desc="Как только сотрудники создадут личные цели, они появятся здесь со статусами и прогрессом." />
      )}

      {!loading && members.map(m => (
        <div key={m.user_id} className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-bg, #eff6ff)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {(m.user_name || '?').slice(0, 1).toUpperCase()}
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{m.user_name}</h4>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>{m.goals.length ? `${m.goals.length} цел.` : 'нет целей'}</span>
          </div>
          {m.goals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Сотрудник ещё не поставил цели.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {m.goals.map(g => <LeadGoalCard key={g.id} goal={g} meId={meId} onCommented={patchGoal} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default GoalsMember
