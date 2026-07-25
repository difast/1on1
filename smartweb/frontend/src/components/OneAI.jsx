import { useState, useEffect, useCallback } from 'react'
import Spinner from '../lib/Spinner'
import EmptyState from './EmptyState'
import { toast } from '../lib/ui'
import { getOneAiSections, oneAiQuery, getTeams, getTeam } from '../api/client'

// ONE AI — стратегический AI-центр. Отдельная поверхность от Пита: разделы,
// глубокий аналитический ответ. Данные и права — общий AI-слой (бэкенд).

const SECTION_HINT = {
  team_analysis: 'Проблемы, риски и вовлечённость команды за период.',
  employee_analysis: 'Эффективность и динамика конкретного сотрудника.',
  feedback_prep: 'Черновик обратной связи по задачам, встречам, целям и развитию.',
  manager_recommendations: 'Рекомендации по управлению командой и процессам.',
  one_on_one_prep: 'Темы и вопросы к встрече 1-на-1.',
  mood_analysis: 'Динамика настроения и вовлечённости, тревожные сигналы.',
  goals_analysis: 'Прогресс целей, риски срыва, декомпозиция.',
  self_analysis: 'Личная эффективность: что получается, что улучшить.',
  development_analysis: 'Рекомендации по развитию навыков и плану.',
  knowledge_search: 'Поиск и суммаризация материалов базы знаний.',
  auto_reports: 'Периодический отчёт по команде: метрики и изменения.',
}
const NEEDS_MEMBER = ['employee_analysis', 'feedback_prep']

export default function OneAI({ user }) {
  const meId = user.id
  const [sections, setSections] = useState(null)
  const [active, setActive] = useState(null)
  const [members, setMembers] = useState([])
  const [targetUser, setTargetUser] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)   // { reply, based_on }

  useEffect(() => {
    getOneAiSections(meId).then(r => {
      const secs = r.data?.sections || []
      setSections(secs)
      if (secs.length) setActive(secs[0].key)
    }).catch(() => setSections([]))
  }, [meId])

  // Участники команд тимлида — для разделов про конкретного сотрудника.
  const loadMembers = useCallback(async () => {
    try {
      const { data: teams } = await getTeams()
      const mine = (teams || []).filter(t => t.team_lead_id === meId)
      const all = []
      for (const t of mine) {
        try { const { data } = await getTeam(t.id); (data.members || []).forEach(m => { if (m.user_id !== meId) all.push({ id: m.user_id, name: m.user_name || `Участник #${m.user_id}` }) }) }
        catch { /* ignore */ }
      }
      // uniq
      const seen = new Set(); setMembers(all.filter(m => !seen.has(m.id) && seen.add(m.id)))
    } catch { setMembers([]) }
  }, [meId])
  useEffect(() => { if (sections && sections.some(s => NEEDS_MEMBER.includes(s.key))) loadMembers() }, [sections, loadMembers])

  const run = async () => {
    if (NEEDS_MEMBER.includes(active) && !targetUser) { toast('Выберите сотрудника', 'error'); return }
    setLoading(true); setResult(null)
    try {
      const { data } = await oneAiQuery({
        actor_id: meId, section: active,
        target_user_id: NEEDS_MEMBER.includes(active) && targetUser ? Number(targetUser) : undefined,
        message: message.trim() || undefined,
      })
      setResult(data)
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail?.code === 'feature_locked') { setResult({ locked: true, message: detail.message }) }
      else toast(typeof detail === 'string' ? detail : 'ONE AI недоступен', 'error')
    } finally { setLoading(false) }
  }

  if (sections === null) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Разделы */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220, flex: '0 0 230px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Разделы ONE AI</p>
        {sections.map(s => (
          <button key={s.key} onClick={() => { setActive(s.key); setResult(null); setMessage('') }}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${active === s.key ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: active === s.key ? 'var(--color-accent-bg, #eff6ff)' : 'var(--color-surface)',
              color: active === s.key ? 'var(--color-accent)' : 'var(--color-text-primary)',
              fontWeight: 600, fontSize: 14,
            }}>{s.title}</button>
        ))}
      </div>

      {/* Рабочая область */}
      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {active && (
          <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>{sections.find(s => s.key === active)?.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{SECTION_HINT[active]}</p>
            </div>
            {NEEDS_MEMBER.includes(active) && (
              <select className="input" value={targetUser} onChange={e => setTargetUser(e.target.value)}>
                <option value="">Выберите сотрудника…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <textarea className="input" rows={2} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Уточните запрос (необязательно): например, за последний месяц" style={{ resize: 'vertical' }} />
            <div>
              <button className="btn btn-accent" onClick={run} disabled={loading}>{loading ? 'ONE AI анализирует…' : 'Запросить анализ'}</button>
            </div>
          </div>
        )}

        {loading && <div style={{ padding: 30, textAlign: 'center' }}><Spinner /></div>}

        {result?.locked && (
          <div className="card" style={{ padding: 18 }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{result.message}</p>
          </div>
        )}

        {result && !result.locked && (
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.reply}</p>
            {result.based_on && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 14, borderTop: '1px solid var(--gray-100)', paddingTop: 10 }}>
                Основано на данных: {result.based_on.facts
                  ? `задач ${result.based_on.facts.tasks_total ?? '—'}, встреч ${result.based_on.facts.meetings_total ?? '—'}, целей ${result.based_on.facts.goals_total ?? '—'}`
                  : result.based_on.members != null ? `${result.based_on.members} участников команды` : 'агрегаты по вашим данным'}
              </p>
            )}
          </div>
        )}

        {!result && !loading && (
          <EmptyState title="ONE AI готов к анализу" desc="Выберите раздел и запросите развёрнутый анализ по вашим данным." />
        )}
      </div>
    </div>
  )
}
