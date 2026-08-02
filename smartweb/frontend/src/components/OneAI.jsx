import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../lib/Spinner'
import EmptyState from './EmptyState'
import { toast } from '../lib/ui'
import { getOneAiSections, oneAiQuery, getTeams, getTeam } from '../api/client'

// ONE AI — стратегический AI-центр. Отдельная поверхность от Пита: разделы,
// глубокий аналитический ответ. Данные и права — общий AI-слой (бэкенд).

// Подсказка раздела — из словаря по идентификатору раздела.
const sectionHint = (t, id) => t(`oneaiSections.${id}`, { defaultValue: '' })
const NEEDS_MEMBER = ['employee_analysis', 'feedback_prep']

export default function OneAI({ user }) {
  const { t } = useTranslation()
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
    if (NEEDS_MEMBER.includes(active) && !targetUser) { toast(t('ui.vyberite_sotrudnika'), 'error'); return }
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
      else toast(typeof detail === 'string' ? detail : t('ui.one_ai_nedostupen'), 'error')
    } finally { setLoading(false) }
  }

  if (sections === null) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Разделы */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220, flex: '0 0 230px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('ui.razdely_one_ai')}</p>
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
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>{sectionHint(t, active)}</p>
            </div>
            {NEEDS_MEMBER.includes(active) && (
              <select className="input" value={targetUser} onChange={e => setTargetUser(e.target.value)}>
                <option value="">{t('ui.vyberite_sotrudnika_2')}</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <textarea className="input" rows={2} value={message} onChange={e => setMessage(e.target.value)}
              placeholder={t('ui.utochnite_zapros_neobyazatelno_naprimer_za_pos')} style={{ resize: 'vertical' }} />
            <div>
              <button className="btn btn-accent" onClick={run} disabled={loading}>{loading ? t('ui.one_ai_analiziruet') : t('ui.zaprosit_analiz')}</button>
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
            {/* Структуру рисует интерфейс: акцентная карточка с главным выводом,
                блоки наблюдений и список действий. Сырых символов разметки в
                тексте нет — модель отвечает без markdown, остатки чистит сервер.
                Если структуру разобрать не удалось, показываем обычный текст. */}
            {result.structured?.summary ? (
              <div style={{
                background: 'var(--color-accent-bg, rgba(10,108,255,.08))',
                border: '1px solid var(--color-accent-border, rgba(10,108,255,.22))',
                borderRadius: 12, padding: '14px 16px', marginBottom: 18,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-accent)', marginBottom: 6 }}>
                  {t('oneai.summary')}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
                  {result.structured.summary}
                </p>
              </div>
            ) : null}

            {result.structured?.insights?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                {result.structured.insights.map((ins, i) => (
                  <div key={i}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>{ins.title}</h4>
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: 0 }}>{ins.text}</p>
                  </div>
                ))}
              </div>
            )}

            {result.structured?.actions?.length > 0 && (
              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  {t('oneai.actions')}
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}>
                  {result.structured.actions.map((a, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.55, color: 'var(--color-text-primary)' }}>
                      <span style={{ color: 'var(--color-accent)', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!result.structured?.summary && !result.structured?.insights?.length && (
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.structured?.text || result.reply}</p>
            )}
            {result.based_on && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 14, borderTop: '1px solid var(--gray-100)', paddingTop: 10 }}>
                {t('labels.basedOn')}: {result.based_on.facts
                  ? t('labels.basedOnFacts', {
                      v1: result.based_on.facts.tasks_total ?? '—',
                      v2: result.based_on.facts.meetings_total ?? '—',
                      v3: result.based_on.facts.goals_total ?? '—',
                    })
                  : result.based_on.members != null ? t('labels.basedOnMembers', { v1: result.based_on.members }) : t('ui.agregaty_po_vashim_dannym')}
              </p>
            )}
          </div>
        )}

        {!result && !loading && (
          <EmptyState title={t('ui.one_ai_gotov_k_analizu')} desc={t('ui.vyberite_razdel_i_zaprosite_razvernutyy_analiz')} />
        )}
      </div>
    </div>
  )
}
