import { useState, useEffect, useRef } from 'react'
import { getLeadAnalytics, getTeamMoodSummary, getTeamCheckins, getMeetings, pitChat, getMyMoodSeries } from '../api/client'
import { useIsTelegram } from '../lib/surface'
import XLSXStyle from 'xlsx-js-style'

// ─── Animated number counter ──────────────────────────────────────────────────
function AnimNum({ value, suffix = '', duration = 900 }) {
  const [disp, setDisp] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    const target = value ?? 0
    if (target === 0) { setDisp(0); return }
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisp(Number.isInteger(target) ? Math.round(eased * target) : +(eased * target).toFixed(1))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [value, duration])
  return <>{disp}{suffix}</>
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ value, suffix, label, accent, danger, warning, icon, delay = 0 }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t) }, [delay])
  const color = danger ? 'var(--color-danger)' : warning ? '#f59e0b' : accent ? 'var(--color-accent)' : 'var(--color-text-primary)'
  return (
    <div className="stat-card" style={{
      flex: 1, minWidth: 140, opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(12px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginBottom: 12, opacity: 0.8 }} />
      <p style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-1px', lineHeight: 1 }}>
        {value !== null && value !== undefined ? <AnimNum value={value} suffix={suffix} /> : '—'}
      </p>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 6 }}>{label}</p>
    </div>
  )
}

// ─── Heatmap (GitHub-style, weekly) ──────────────────────────────────────────
function Heatmap({ weeks }) {
  const max = Math.max(...weeks.map(w => w.count), 1)
  const getColor = (count) => {
    if (count === 0) return 'var(--gray-200)'
    const pct = count / max
    if (pct < 0.25) return '#bfdbfe'
    if (pct < 0.5)  return '#60a5fa'
    if (pct < 0.75) return '#2563eb'
    return '#1d4ed8'
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {weeks.map((w, i) => (
          <div
            key={i}
            title={`${w.week}: ${w.count} встр.`}
            style={{
              width: 28, height: 28, borderRadius: 5,
              background: getColor(w.count),
              transition: `background 0.3s ease ${i * 30}ms`,
              cursor: 'default',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{weeks[0]?.week}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{weeks[weeks.length - 1]?.week}</span>
      </div>
    </div>
  )
}

// ─── SVG line chart ───────────────────────────────────────────────────────────
function LineChart({ points, color = 'var(--color-accent)', yMin = 1, yMax = 5, height = 90 }) {
  const [animated, setAnimated] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(t) }, [])

  const W = 500, H = height
  const valid = points.filter(p => p.y !== null && p.y !== undefined)
  if (valid.length < 2) return (
    <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Недостаточно данных</p>
    </div>
  )

  const xs = points.map((_, i) => (i / (points.length - 1)) * (W - 40) + 20)
  const toY = (v) => v === null ? null : H - 10 - ((v - yMin) / (yMax - yMin)) * (H - 20)

  const coords = points.map((p, i) => ({ x: xs[i], y: toY(p.y) }))
  const pathParts = []
  let inGap = true
  coords.forEach((c, i) => {
    if (c.y === null) { inGap = true; return }
    pathParts.push(inGap ? `M ${c.x} ${c.y}` : `L ${c.x} ${c.y}`)
    inGap = false
  })
  const d = pathParts.join(' ')

  // Fill area under line
  const fillPts = coords.filter(c => c.y !== null)
  const fillD = fillPts.length > 0
    ? `M ${fillPts[0].x} ${H} L ${fillPts[0].x} ${fillPts[0].y} ${fillPts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')} L ${fillPts[fillPts.length - 1].x} ${H} Z`
    : ''

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Y gridlines */}
      {[1, 2, 3, 4, 5].map(v => {
        const y = toY(v)
        return <line key={v} x1={20} x2={W - 20} y1={y} y2={y} stroke="var(--color-border)" strokeWidth="0.8" strokeDasharray="3 4" />
      })}
      {/* Fill */}
      {fillD && <path d={fillD} fill="url(#lineGrad)" />}
      {/* Line */}
      <path
        d={d}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: animated ? 'none' : '1000',
          strokeDashoffset: animated ? 0 : 1000,
          transition: 'stroke-dashoffset 1.2s ease',
        }}
      />
      {/* Dots */}
      {coords.map((c, i) => c.y !== null && (
        <circle key={i} cx={c.x} cy={c.y} r="4" fill={color} stroke="var(--color-surface)" strokeWidth="2"
          style={{ opacity: animated ? 1 : 0, transition: `opacity 0.3s ease ${i * 80 + 400}ms` }} />
      ))}
      {/* X labels */}
      {points.map((p, i) => (i % Math.ceil(points.length / 6) === 0 || i === points.length - 1) && (
        <text key={i} x={xs[i]} y={H + 2} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--color-text-muted)' }}>
          {p.label}
        </text>
      ))}
    </svg>
  )
}

// ─── Member table row ─────────────────────────────────────────────────────────
const MOOD_SCORE = { great: 4, good: 3, neutral: 2, bad: 1 }

function moodTrend(trend) {
  if (!trend || trend.length < 2) return null
  const vals = trend.map(m => MOOD_SCORE[m.mood] || 0)
  const last = vals[vals.length - 1], first = vals[0]
  if (last < first - 0.5) return { arrow: '↓', color: 'var(--color-danger)' }
  if (last > first + 0.5) return { arrow: '↑', color: 'var(--color-success)' }
  return { arrow: '→', color: 'var(--color-text-muted)' }
}

function memberStatus(s) {
  const nFlags = s.warning_flags.length
  if (nFlags === 0 && (s.days_since_last === null || s.days_since_last < 10)) return { label: 'ОК', cls: 'badge-green' }
  if (nFlags >= 2 || (s.days_since_last !== null && s.days_since_last >= 14)) return { label: 'Срочно', cls: 'badge-red' }
  return { label: 'Скоро', cls: 'badge-amber' }
}

function MemberRow({ s, delay }) {
  const [vis, setVis] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t) }, [delay])
  const trend = moodTrend(s.mood_trend)
  const status = memberStatus(s)
  return (
    <tr style={{
      opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateX(-10px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="avatar avatar-sm avatar-accent">{s.name.charAt(0).toUpperCase()}</div>
          {s.name}
        </div>
      </td>
      <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'center', color: s.days_since_last >= 14 ? 'var(--color-danger)' : 'var(--color-text-primary)', fontWeight: s.days_since_last >= 14 ? 700 : 400 }}>
        {s.days_since_last !== null ? `${s.days_since_last} дн.` : '—'}
      </td>
      <td style={{ padding: '11px 14px', fontSize: 13, textAlign: 'center', color: 'var(--color-text-primary)' }}>
        {s.meetings_last_30}
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        {trend ? <span style={{ fontSize: 16, fontWeight: 700, color: trend.color }}>{trend.arrow}</span> : <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>}
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        {s.task_completion_pct !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--gray-200)', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${s.task_completion_pct}%`,
                background: s.task_completion_pct >= 70 ? 'var(--color-success)' : s.task_completion_pct >= 40 ? 'var(--color-accent)' : 'var(--color-danger)',
                transition: 'width 0.6s var(--ease-spring)',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{s.task_completion_pct}%</span>
          </div>
        ) : <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>—</span>}
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <span className={`badge ${status.cls}`} style={{ fontSize: 11 }}>{status.label}</span>
      </td>
    </tr>
  )
}

// ─── Risk card ────────────────────────────────────────────────────────────────
function RiskCard({ s, delay }) {
  const [vis, setVis] = useState(false)
  const [advice, setAdvice] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t) }, [delay])
  const reasons = []
  if (s.warning_flags.includes('no_meeting_14_days')) reasons.push(`${s.days_since_last ?? '14+'} дн. без встречи`)
  if (s.warning_flags.includes('mood_declining')) reasons.push('Настроение падает')
  if (s.warning_flags.includes('many_incomplete_tasks')) reasons.push(`${s.open_tasks} незакрытых задач`)
  const isUrgent = s.days_since_last >= 21 || s.warning_flags.length >= 2

  const getAdvice = async () => {
    if (advice) { setAdvice(''); return }
    setLoading(true)
    try {
      const prompt = `Тимлид видит сигнал риска по участнику "${s.name}": ${reasons.join(', ') || 'риск выгорания'}. `
        + `Дай 3 коротких конкретных совета, как помочь участнику и снизить риск выгорания. Только пункты, без вступления.`
      const { data } = await pitChat([{ role: 'user', content: prompt }])
      setAdvice(data.reply || 'Не удалось получить совет.')
    } catch { setAdvice('Не удалось получить совет. Попробуйте позже.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: isUrgent ? 'var(--color-danger-bg)' : '#fffbeb',
      border: `1.5px solid ${isUrgent ? '#fca5a5' : '#fde68a'}`,
      opacity: vis ? 1 : 0, transform: vis ? 'none' : 'scale(0.96)',
      transition: 'opacity 0.35s ease, transform 0.35s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: isUrgent ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{s.name}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {reasons.map((r, i) => <span key={i} className={`badge ${isUrgent ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 11 }}>{r}</span>)}
      </div>
      <button
        onClick={getAdvice}
        disabled={loading}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, color: 'var(--color-accent)',
          background: 'var(--color-accent-light, #eef2ff)', border: '1px solid var(--color-accent)',
          borderRadius: 8, padding: '7px 12px',
        }}
      >
        {advice ? 'Скрыть совет' : loading ? 'AI думает…' : 'Совет от AI'}
      </button>
      {advice && (
        <div style={{ marginTop: 10, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
          {advice}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LeadAnalytics({ user }) {
  // Mini App: только сводка (StatCards), без графиков и экспорта (таблица).
  const isTg = useIsTelegram()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeamIdx, setSelectedTeamIdx] = useState(0)
  const [moodByTeam, setMoodByTeam] = useState({})
  const [checkinsByTeam, setCheckinsByTeam] = useState({})
  // Личный график настроения самого тимлида (27.2) — отдельно от анонимной
  // командной статистики. Тимлид — тоже пользователь, видит только свои отметки.
  const [myMood, setMyMood] = useState(null)
  const [myMoodLoading, setMyMoodLoading] = useState(false)
  // Повестка в аналитике: агрегируем данные, введённые при планировании встреч,
  // чтобы поле повестки работало дальше (а не жило только в карточке встречи).
  // Считаем на фронте из списка встреч руководителя — без изменения бэкенда.
  const [agendaByTeam, setAgendaByTeam] = useState({})

  useEffect(() => {
    getMeetings({ team_lead_id: user.id })
      .then(r => {
        const now = new Date()
        const map = {}
        for (const m of r.data || []) {
          if (new Date(m.scheduled_date) > now) continue
          if (['cancelled', 'declined', 'requested'].includes(m.status)) continue
          const e = map[m.team_id] || (map[m.team_id] = { total: 0, withAgenda: 0, topics: [] })
          e.total += 1
          const agenda = (m.agenda || '').trim()
          if (agenda) {
            e.withAgenda += 1
            const first = agenda.split('\n')[0].replace(/^[-*•\s]+/, '').trim()
            if (first && !e.topics.includes(first)) e.topics.push(first)
          }
        }
        setAgendaByTeam(map)
      })
      .catch(() => {})
  }, [user.id])

  const loadMoodForTeam = (teamId) => {
    getTeamMoodSummary(teamId)
      .then(mr => setMoodByTeam(prev => ({ ...prev, [teamId]: mr.data })))
      .catch(() => {})
    getTeamCheckins(teamId, 7)
      .then(cr => setCheckinsByTeam(prev => ({ ...prev, [teamId]: cr.data })))
      .catch(() => {})
  }

  const loadLead = () => {
    getLeadAnalytics(user.id)
      .then(r => {
        setData(r.data)
        r.data.teams.forEach(t => loadMoodForTeam(t.team_id))
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const loadMyMood = (teamId) => {
    setMyMoodLoading(true)
    getMyMoodSeries(user.id, { period: 'month', teamId })
      .then(r => setMyMood(r.data))
      .catch(() => setMyMood(null))
      .finally(() => setMyMoodLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    loadLead()
  }, [user.id])

  // Личный ряд настроения тимлида грузим для выбранной команды (для часового пояса).
  useEffect(() => {
    const t = data?.teams?.[selectedTeamIdx]
    if (t) loadMyMood(t.team_id)
  }, [data, selectedTeamIdx, user.id])

  // Реактивное обновление после любого чек-ина (свой или командный): обновляем
  // анонимную командную сводку выбранной команды и личный график тимлида, без
  // ручного обновления страницы.
  useEffect(() => {
    const onMood = () => {
      const t = data?.teams?.[selectedTeamIdx]
      if (t) { loadMoodForTeam(t.team_id); loadMyMood(t.team_id) }
    }
    window.addEventListener('mood-updated', onMood)
    return () => window.removeEventListener('mood-updated', onMood)
  }, [data, selectedTeamIdx, user.id])

  const exportExcel = (team, members, mood, checkins) => {
    const XLSX = XLSXStyle
    const wb = XLSX.utils.book_new()
    const today = new Date().toLocaleDateString('ru-RU')
    const nowStr = new Date().toLocaleString('ru-RU')

    // ─────────────────────────────────────────────────────────────────────────
    // STYLE PALETTE
    // ─────────────────────────────────────────────────────────────────────────
    const NAVY   = '0F2443'
    const BLUE   = '1D4ED8'
    const ACCENT = '3B82F6'
    const TEAL   = '0D9488'
    const RED    = 'DC2626'
    const AMBER  = 'D97706'
    const GREEN  = '16A34A'
    const LIGHT  = 'EFF6FF'
    const SILVER = 'F1F5F9'
    const WHITE  = 'FFFFFF'
    // Единая гарнитура на весь файл — задаём явно, без смешения шрифтов.
    const FONT   = 'Calibri'

    const brd = (color = 'CBD5E1') => ({
      top:    { style: 'thin', color: { rgb: color } },
      bottom: { style: 'thin', color: { rgb: color } },
      left:   { style: 'thin', color: { rgb: color } },
      right:  { style: 'thin', color: { rgb: color } },
    })
    const brdB = (color = 'CBD5E1') => ({ bottom: { style: 'thin', color: { rgb: color } } })

    const S = {
      // Cover branding cells
      coverBrand: { font: { bold: true, sz: 28, color: { rgb: WHITE }, name: 'Calibri' }, fill: { fgColor: { rgb: NAVY } }, alignment: { horizontal: 'center', vertical: 'center' } },
      coverSub:   { font: { sz: 12, color: { rgb: 'BFD4F2' }, italic: true }, fill: { fgColor: { rgb: NAVY } }, alignment: { horizontal: 'center', vertical: 'center' } },
      coverTeam:  { font: { bold: true, sz: 18, color: { rgb: NAVY } }, fill: { fgColor: { rgb: LIGHT } }, alignment: { horizontal: 'center', vertical: 'center' } },
      coverDate:  { font: { sz: 11, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: LIGHT } }, alignment: { horizontal: 'center', vertical: 'center' } },
      coverKpiLbl:{ font: { bold: true, sz: 10, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: SILVER } }, alignment: { horizontal: 'center', vertical: 'center' } },
      coverKpiVal:{ font: { bold: true, sz: 20, color: { rgb: NAVY } }, fill: { fgColor: { rgb: WHITE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },

      // Section headers (dark navy band)
      secHdr: (bg = NAVY) => ({
        font: { bold: true, sz: 11, color: { rgb: WHITE }, name: 'Calibri' },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: brd(bg),
      }),
      // Sub-header (blue band)
      subHdr: (bg = BLUE) => ({
        font: { bold: true, sz: 10, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: brd(bg),
      }),
      // Normal data cell
      data: (align = 'center', bold = false, color = '1E293B') => ({
        font: { name: FONT, sz: 10, bold, color: { rgb: color } },
        alignment: { horizontal: align, vertical: 'center' },
        border: brdB(),
      }),
      // Alternate row tint
      dataAlt: (align = 'center', bold = false) => ({
        font: { name: FONT, sz: 10, bold, color: { rgb: '1E293B' } },
        fill: { fgColor: { rgb: 'F8FAFC' } },
        alignment: { horizontal: align, vertical: 'center' },
        border: brdB(),
      }),
      // Status badges
      ok:     { font: { name: FONT, bold: true, sz: 10, color: { rgb: GREEN }  }, fill: { fgColor: { rgb: 'DCFCE7' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd('BBF7D0') },
      warn:   { font: { name: FONT, bold: true, sz: 10, color: { rgb: AMBER }  }, fill: { fgColor: { rgb: 'FEF9C3' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd('FDE68A') },
      danger: { font: { name: FONT, bold: true, sz: 10, color: { rgb: RED }    }, fill: { fgColor: { rgb: 'FEE2E2' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd('FECACA') },
      urgent: { font: { name: FONT, bold: true, sz: 10, color: { rgb: WHITE }  }, fill: { fgColor: { rgb: RED }    }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd(RED) },
      // Member card title
      cardName: { font: { name: FONT, bold: true, sz: 12, color: { rgb: WHITE } }, fill: { fgColor: { rgb: BLUE } }, alignment: { horizontal: 'left', vertical: 'center' }, border: brd(BLUE) },
      cardRole: { font: { name: FONT, italic: true, sz: 10, color: { rgb: 'BFD4F2' } }, fill: { fgColor: { rgb: BLUE } }, alignment: { horizontal: 'left', vertical: 'center' }, border: brd(BLUE) },
      cardLbl:  { font: { name: FONT, sz: 9, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: SILVER } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },
      cardVal:  { font: { name: FONT, bold: true, sz: 12, color: { rgb: NAVY }  }, fill: { fgColor: { rgb: WHITE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },
      cardValG: { font: { name: FONT, bold: true, sz: 12, color: { rgb: GREEN }  }, fill: { fgColor: { rgb: 'DCFCE7' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },
      cardValR: { font: { name: FONT, bold: true, sz: 12, color: { rgb: RED }    }, fill: { fgColor: { rgb: 'FEE2E2' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },
      cardValA: { font: { name: FONT, bold: true, sz: 12, color: { rgb: AMBER }  }, fill: { fgColor: { rgb: 'FEF9C3' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brd() },
      moodCell: { font: { name: FONT, sz: 10, color: { rgb: '1E293B' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brdB() },
    }

    // Helper: set cell (text/number)
    const sc = (ws, r, c, v, s) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      ws[addr] = { v: v ?? '', s }
    }
    // Helper: numeric cell with explicit number format (e.g. z='0.0%' → проценты
    // хранятся как настоящие числа 0..1, а не как текст "70%", поэтому Excel
    // умеет их сортировать, усреднять и пересчитывать.
    const scN = (ws, r, c, num, s, z) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      ws[addr] = { v: num, t: 'n', z, s }
    }
    // Helper: formula cell. Итоги/средние считаются формулой ВНУТРИ файла
    // (SUM/AVERAGE), чтобы при правке данных пользователем всё пересчитывалось,
    // а не оставалось статичным числом с бэкенда.
    const scF = (ws, r, c, formula, s, z) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      ws[addr] = { t: 'n', f: formula, s, ...(z ? { z } : {}) }
    }
    // Helper: включить автофильтр на диапазон таблицы (шапка + строки данных),
    // чтобы пользователь сразу мог сортировать и фильтровать без ручной настройки.
    const setAutoFilter = (ws, r1, c1, r2, c2) => {
      ws['!autofilter'] = { ref: `${XLSX.utils.encode_cell({ r: r1, c: c1 })}:${XLSX.utils.encode_cell({ r: r2, c: c2 })}` }
    }
    // Helper: merge
    const addMerge = (ws, rs, re, cs, ce) => {
      if (!ws['!merges']) ws['!merges'] = []
      ws['!merges'].push({ s: { r: rs, c: cs }, e: { r: re, c: ce } })
    }
    // Helper: max row/col → ref
    const setRef = (ws, maxR, maxC) => {
      ws['!ref'] = `${XLSX.utils.encode_cell({ r: 0, c: 0 })}:${XLSX.utils.encode_cell({ r: maxR, c: maxC })}`
    }

    const FLAG_RU = {
      no_meeting_14_days: (s) => `${s.days_since_last ?? '14+'} дн. без встречи`,
      mood_declining: () => 'Настроение падает',
      many_incomplete_tasks: (s) => `${s.open_tasks} незакрытых задач`,
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 0 — ОБЛОЖКА (Cover / Logo)
    // ─────────────────────────────────────────────────────────────────────────
    const ws0 = {}
    ws0['!cols'] = [4, 22, 22, 22, 22, 22, 4].map(w => ({ wch: w }))
    ws0['!rows'] = [
      { hpt: 8 }, { hpt: 50 }, { hpt: 22 }, { hpt: 40 }, { hpt: 22 },
      { hpt: 8 }, { hpt: 26 }, { hpt: 44 }, { hpt: 8 },
      { hpt: 26 }, { hpt: 44 }, { hpt: 8 },
    ]

    // Brand stripe (rows 1–2, cols 1–5)
    for (let ci = 0; ci <= 6; ci++) {
      sc(ws0, 0, ci, '', { fill: { fgColor: { rgb: NAVY } } })
      sc(ws0, 1, ci, '', S.coverBrand)
      sc(ws0, 2, ci, '', S.coverSub)
    }
    sc(ws0, 1, 1, 'OneOnOne', S.coverBrand)
    addMerge(ws0, 1, 1, 1, 5)
    sc(ws0, 2, 1, 'Платформа эффективных 1-on-1 встреч', S.coverSub)
    addMerge(ws0, 2, 2, 1, 5)

    // Team block (rows 3–4)
    for (let ci = 0; ci <= 6; ci++) {
      sc(ws0, 3, ci, '', { fill: { fgColor: { rgb: LIGHT } } })
      sc(ws0, 4, ci, '', { fill: { fgColor: { rgb: LIGHT } } })
    }
    sc(ws0, 3, 1, `Команда: ${team.team_name}`, S.coverTeam)
    addMerge(ws0, 3, 3, 1, 5)
    sc(ws0, 4, 1, `Отчёт сформирован: ${nowStr}`, S.coverDate)
    addMerge(ws0, 4, 4, 1, 5)

    // Spacer
    for (let ci = 0; ci <= 6; ci++) sc(ws0, 5, ci, '', {})

    // KPI row 1 labels — Встречи | Участников | В зоне риска | Ср. интервал
    const ms = members
    const intervals = ms.map(s => s.avg_interval_days).filter(Boolean)
    const teamAvgInt = intervals.length ? +(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1) : null
    const teamMtg30 = ms.reduce((a, s) => a + (s.meetings_last_30 || 0), 0)
    const taskPcts  = ms.map(s => s.task_completion_pct).filter(v => v != null)
    const teamTaskP = taskPcts.length ? Math.round(taskPcts.reduce((a, b) => a + b, 0) / taskPcts.length) : null
    const atRiskCnt = (team.at_risk_members || []).length

    const kpi1 = [
      ['Встреч за 30 дн', teamMtg30],
      ['Всего встреч', team.total_meetings ?? 0],
      ['Участников', ms.length],
      ['В зоне риска', atRiskCnt],
    ]
    const kpi2 = [
      ['Ср. интервал (дн)', teamAvgInt ?? '—'],
      ['Выполнено задач', teamTaskP != null ? teamTaskP + '%' : '—'],
      ['Настроение ср.', mood?.overall_avg ? mood.overall_avg + '/5' : '—'],
      ['Всего опросов', mood?.total ?? 0],
    ]
    kpi1.forEach(([lbl, val], ci) => {
      sc(ws0, 6, ci + 1, lbl, S.coverKpiLbl)
      sc(ws0, 7, ci + 1, val, S.coverKpiVal)
    })
    kpi2.forEach(([lbl, val], ci) => {
      sc(ws0, 9, ci + 1, lbl, S.coverKpiLbl)
      sc(ws0, 10, ci + 1, val, S.coverKpiVal)
    })

    ws0['!rows'].push({ hpt: 20 })
    const noteRow = 12
    sc(ws0, noteRow, 1, 'Листы отчёта: Обложка, Сводка, Карточки, Риски, Активность', {
      font: { italic: true, sz: 9, color: { rgb: '94A3B8' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    })
    addMerge(ws0, noteRow, noteRow, 1, 5)

    setRef(ws0, noteRow, 6)
    XLSX.utils.book_append_sheet(wb, ws0, 'Обложка')

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 1 — СВОДКА (Team overview table)
    // ─────────────────────────────────────────────────────────────────────────
    const ws1 = {}
    ws1['!cols'] = [28, 14, 14, 14, 16, 16, 16, 16, 14, 14, 12].map(w => ({ wch: w }))

    const HDR1 = [
      'Участник', 'Встреч 30дн', 'Встреч 90дн', 'Всего встреч',
      'Без встречи (дн)', 'Ср. интервал (дн)', '% задач', 'Откр. задач',
      'Вып. задач', 'Всего задач', 'Статус',
    ]
    // Title
    sc(ws1, 0, 0, `Сводная таблица — ${team.team_name}`, { font: { bold: true, sz: 14, color: { rgb: NAVY } }, alignment: { horizontal: 'left', vertical: 'center' } })
    addMerge(ws1, 0, 0, 0, HDR1.length - 1)
    sc(ws1, 1, 0, `Дата: ${today} · Участников: ${ms.length} · В зоне риска: ${atRiskCnt}`, { font: { sz: 10, color: { rgb: '64748B' } }, alignment: { horizontal: 'left', vertical: 'center' } })
    addMerge(ws1, 1, 1, 0, HDR1.length - 1)

    HDR1.forEach((h, ci) => sc(ws1, 2, ci, h, S.secHdr()))
    ws1['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 28 }]

    // Данные пишем по колонкам, чтобы числа оставались числами (сортируются
    // и усредняются), а процент задач хранился как доля 0..1 с форматом 0.0%.
    ms.forEach((s, i) => {
      const isRisk = s.warning_flags && s.warning_flags.length > 0
      const flags = s.warning_flags || []
      const isUrgent = s.days_since_last >= 21 || flags.length >= 2
      const st = isUrgent ? S.urgent : isRisk ? S.danger : S.ok
      const a = i % 2 === 1 ? 'dataAlt' : 'data'
      const row = i + 3
      sc(ws1, row, 0, s.name, S[a]('left', true))
      sc(ws1, row, 1, s.meetings_last_30 ?? 0, S[a]('center'))
      sc(ws1, row, 2, s.meetings_last_90 ?? 0, S[a]('center'))
      sc(ws1, row, 3, s.total_meetings ?? 0, S[a]('center'))
      sc(ws1, row, 4, s.days_since_last ?? '—', S[a]('center'))
      sc(ws1, row, 5, s.avg_interval_days ?? '—', S[a]('center'))
      if (s.task_completion_pct != null) scN(ws1, row, 6, s.task_completion_pct / 100, S[a]('center'), '0.0%')
      else sc(ws1, row, 6, '—', S[a]('center'))
      sc(ws1, row, 7, s.open_tasks ?? 0, S[a]('center'))
      sc(ws1, row, 8, s.completed_tasks ?? 0, S[a]('center'))
      sc(ws1, row, 9, s.total_tasks ?? 0, S[a]('center'))
      sc(ws1, row, 10, isUrgent ? 'Срочно' : isRisk ? 'Риск' : 'ОК', st)
      ws1['!rows'].push({ hpt: 22 })
    })

    // Строка ИТОГО/СРЕДНЕЕ — формулами внутри файла (SUM/AVERAGE), чтобы при
    // правке данных пользователем пересчёт происходил в Excel, а не оставался
    // статичным числом. AVERAGE обёрнут в IFERROR на случай пустого столбца.
    const footRow = ms.length + 3
    const rng = (c) => `${XLSX.utils.encode_cell({ r: 3, c })}:${XLSX.utils.encode_cell({ r: footRow - 1, c })}`
    sc(ws1, footRow, 0, 'ИТОГО / СРЕДНЕЕ', S.subHdr(TEAL))
    scF(ws1, footRow, 1, `SUM(${rng(1)})`, S.subHdr(TEAL))
    scF(ws1, footRow, 2, `SUM(${rng(2)})`, S.subHdr(TEAL))
    scF(ws1, footRow, 3, `SUM(${rng(3)})`, S.subHdr(TEAL))
    scF(ws1, footRow, 4, `IFERROR(AVERAGE(${rng(4)}),"—")`, S.subHdr(TEAL), '0.0')
    scF(ws1, footRow, 5, `IFERROR(AVERAGE(${rng(5)}),"—")`, S.subHdr(TEAL), '0.0')
    scF(ws1, footRow, 6, `IFERROR(AVERAGE(${rng(6)}),"—")`, S.subHdr(TEAL), '0.0%')
    scF(ws1, footRow, 7, `SUM(${rng(7)})`, S.subHdr(TEAL))
    scF(ws1, footRow, 8, `SUM(${rng(8)})`, S.subHdr(TEAL))
    scF(ws1, footRow, 9, `SUM(${rng(9)})`, S.subHdr(TEAL))
    sc(ws1, footRow, 10, `${atRiskCnt} риск`, S.subHdr(TEAL))
    ws1['!rows'].push({ hpt: 24 })

    // Автофильтр на шапку + строки данных (строку ИТОГО не включаем).
    if (ms.length > 0) setAutoFilter(ws1, 2, 0, footRow - 1, HDR1.length - 1)
    setRef(ws1, footRow, HDR1.length - 1)
    XLSX.utils.book_append_sheet(wb, ws1, 'Сводка')

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 2 — КАРТОЧКИ УЧАСТНИКОВ (per-member detail cards)
    // ─────────────────────────────────────────────────────────────────────────
    const ws2 = {}
    ws2['!cols'] = [24, 14, 14, 14, 14, 14, 14, 14].map(w => ({ wch: w }))
    ws2['!rows'] = []
    ws2['!merges'] = []

    let curRow = 0
    // Sheet title
    sc(ws2, curRow, 0, `Карточки участников — ${team.team_name}`, { font: { bold: true, sz: 14, color: { rgb: NAVY } }, alignment: { horizontal: 'left', vertical: 'center' } })
    addMerge(ws2, curRow, curRow, 0, 7)
    ws2['!rows'].push({ hpt: 28 })
    curRow++
    sc(ws2, curRow, 0, `Каждая карточка — полная аналитика по одному участнику`, { font: { sz: 10, italic: true, color: { rgb: '94A3B8' } }, alignment: { horizontal: 'left' } })
    addMerge(ws2, curRow, curRow, 0, 7)
    ws2['!rows'].push({ hpt: 16 })
    curRow++

    ms.forEach((s) => {
      const flags = s.warning_flags || []
      const isRisk = flags.length > 0
      const isUrgent = s.days_since_last >= 21 || flags.length >= 2
      const statusTxt = isUrgent ? 'СРОЧНО' : isRisk ? 'РИСК' : 'ОК'

      // Spacer
      ws2['!rows'].push({ hpt: 6 })
      curRow++

      // ── Name row
      sc(ws2, curRow, 0, s.name, S.cardName)
      addMerge(ws2, curRow, curRow, 0, 5)
      sc(ws2, curRow, 6, s.role || 'member', S.cardRole)
      sc(ws2, curRow, 7, statusTxt, isUrgent ? S.urgent : isRisk ? S.danger : S.ok)
      ws2['!rows'].push({ hpt: 26 })
      curRow++

      // ── KPI labels row
      const kpiLbls = ['Встреч 30дн', 'Встреч 90дн', 'Всего встреч', 'Без встречи', 'Ср. интервал', '% задач', 'Откр. задач']
      kpiLbls.forEach((l, ci) => sc(ws2, curRow, ci + 1, l, S.cardLbl))
      sc(ws2, curRow, 0, 'Показатель', S.cardLbl)
      ws2['!rows'].push({ hpt: 20 })
      curRow++

      // ── KPI values row
      const kpiVals = [
        s.meetings_last_30 ?? 0,
        s.meetings_last_90 ?? 0,
        s.total_meetings ?? 0,
        s.days_since_last != null ? s.days_since_last + ' дн.' : '—',
        s.avg_interval_days != null ? s.avg_interval_days + ' дн.' : '—',
        s.task_completion_pct != null ? s.task_completion_pct + '%' : '—',
        s.open_tasks ?? 0,
      ]
      sc(ws2, curRow, 0, 'Значение', S.cardLbl)
      kpiVals.forEach((v, ci) => {
        let st = S.cardVal
        if (ci === 3 && s.days_since_last >= 14) st = S.cardValR
        if (ci === 3 && s.days_since_last != null && s.days_since_last < 7) st = S.cardValG
        if (ci === 5 && s.task_completion_pct != null) {
          st = s.task_completion_pct >= 70 ? S.cardValG : s.task_completion_pct < 40 ? S.cardValR : S.cardValA
        }
        if (ci === 6 && s.open_tasks >= 5) st = S.cardValR
        sc(ws2, curRow, ci + 1, v, st)
      })
      ws2['!rows'].push({ hpt: 30 })
      curRow++

      // ── Tasks detail row
      sc(ws2, curRow, 0, 'Задачи', S.cardLbl)
      sc(ws2, curRow, 1, `Выполнено: ${s.completed_tasks ?? 0}`, S.data('center'))
      sc(ws2, curRow, 2, `Открыто: ${s.open_tasks ?? 0}`, S.data('center'))
      sc(ws2, curRow, 3, `Всего: ${s.total_tasks ?? 0}`, S.data('center'))
      ws2['!rows'].push({ hpt: 18 })
      curRow++

      // ── Mood trend row
      if (s.mood_trend && s.mood_trend.length > 0) {
        sc(ws2, curRow, 0, 'Настроение (последние)', S.cardLbl)
        s.mood_trend.slice(0, 7).forEach((m, ci) => {
          sc(ws2, curRow, ci + 1, m.label || m.mood || '', S.moodCell)
        })
        ws2['!rows'].push({ hpt: 22 })
        curRow++
      }

      // ── Warning flags row
      if (flags.length > 0) {
        sc(ws2, curRow, 0, 'Флаги риска', { ...S.cardLbl, fill: { fgColor: { rgb: 'FEE2E2' } } })
        const flagStr = flags.map(f => FLAG_RU[f]?.(s) || f).join(', ')
        sc(ws2, curRow, 1, flagStr, { font: { sz: 10, bold: true, color: { rgb: RED } }, fill: { fgColor: { rgb: 'FEE2E2' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: brdB('FECACA') })
        addMerge(ws2, curRow, curRow, 1, 7)
        ws2['!rows'].push({ hpt: 18 })
        curRow++
      }
    })

    setRef(ws2, curRow, 7)
    XLSX.utils.book_append_sheet(wb, ws2, 'Карточки')

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 3 — РИСКИ & СИГНАЛЫ
    // ─────────────────────────────────────────────────────────────────────────
    const ws3 = {}
    ws3['!cols'] = [26, 18, 16, 16, 16, 40].map(w => ({ wch: w }))
    ws3['!rows'] = []
    ws3['!merges'] = []
    let r3 = 0

    sc(ws3, r3, 0, 'Зоны риска & Сигналы тревоги', { font: { bold: true, sz: 14, color: { rgb: RED } }, alignment: { horizontal: 'left', vertical: 'center' } })
    addMerge(ws3, r3, r3, 0, 5)
    ws3['!rows'].push({ hpt: 28 })
    r3++

    // ── At-risk members
    sc(ws3, r3, 0, 'УЧАСТНИКИ В ЗОНЕ РИСКА', S.secHdr(RED))
    addMerge(ws3, r3, r3, 0, 5)
    ws3['!rows'].push({ hpt: 24 })
    r3++

    const rHdrs = ['Участник', 'Дней без встречи', 'Открытых задач', '% задач', 'Срочность', 'Причины']
    const riskHdrRow = r3
    rHdrs.forEach((h, ci) => sc(ws3, r3, ci, h, S.subHdr(RED)))
    ws3['!rows'].push({ hpt: 22 })
    r3++

    const atRisk = (team.at_risk_members || [])
    if (atRisk.length === 0) {
      sc(ws3, r3, 0, 'Нет участников в зоне риска — всё в порядке!', { font: { sz: 11, color: { rgb: GREEN }, bold: true }, fill: { fgColor: { rgb: 'DCFCE7' } }, alignment: { horizontal: 'left', vertical: 'center' } })
      addMerge(ws3, r3, r3, 0, 5)
      ws3['!rows'].push({ hpt: 22 })
      r3++
    } else {
      atRisk.forEach((s, i) => {
        const flags = s.warning_flags || []
        const isUrgent = s.days_since_last >= 21 || flags.length >= 2
        const reasons = flags.map(f => FLAG_RU[f]?.(s) || f).join(', ')
        const a = i % 2 ? S.dataAlt : S.data
        sc(ws3, r3, 0, s.name, { ...a('left', true), ...(isUrgent ? { fill: { fgColor: { rgb: 'FFF1F2' } } } : {}) })
        sc(ws3, r3, 1, s.days_since_last != null ? s.days_since_last + ' дн.' : '—', isUrgent ? S.urgent : S.danger)
        sc(ws3, r3, 2, s.open_tasks ?? 0, a('center'))
        sc(ws3, r3, 3, s.task_completion_pct != null ? s.task_completion_pct + '%' : '—', a('center'))
        sc(ws3, r3, 4, isUrgent ? 'СРОЧНО' : 'РИСК', isUrgent ? S.urgent : S.danger)
        sc(ws3, r3, 5, reasons, { font: { sz: 10, color: { rgb: RED } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: brdB() })
        ws3['!rows'].push({ hpt: 22 })
        r3++
      })
    }

    // Автофильтр на таблицу зон риска (шапка + строки участников).
    if (atRisk.length > 0) setAutoFilter(ws3, riskHdrRow, 0, riskHdrRow + atRisk.length, 5)

    // ── Warning signals
    r3++
    sc(ws3, r3, 0, 'ВСЕ СИГНАЛЫ ПРЕДУПРЕЖДЕНИЙ', S.secHdr(AMBER))
    addMerge(ws3, r3, r3, 0, 5)
    ws3['!rows'].push({ hpt: 24 })
    r3++

    const sigHdrs = ['Тип сигнала', 'Участник', 'Детали', '', '', '']
    sigHdrs.forEach((h, ci) => sc(ws3, r3, ci, h, S.subHdr(AMBER)))
    ws3['!rows'].push({ hpt: 22 })
    r3++

    const sigTypeRu = {
      no_meeting_14_days: 'Долго без встречи',
      mood_declining: 'Настроение ухудшается',
      many_incomplete_tasks: 'Много незакрытых задач',
    }
    const signals = team.warning_signals || []
    if (signals.length === 0) {
      sc(ws3, r3, 0, 'Нет активных сигналов', { font: { sz: 11, color: { rgb: GREEN } }, alignment: { horizontal: 'left' } })
      addMerge(ws3, r3, r3, 0, 5)
      ws3['!rows'].push({ hpt: 20 })
      r3++
    } else {
      signals.forEach((sig, i) => {
        const detail = sig.days != null ? `${sig.days} дн.` : sig.count != null ? `${sig.count} задач` : ''
        const a = i % 2 ? S.dataAlt : S.data
        sc(ws3, r3, 0, sigTypeRu[sig.type] || sig.type, { ...a('left'), font: { sz: 10, bold: true, color: { rgb: AMBER } } })
        sc(ws3, r3, 1, sig.member_name || '', a('left', true))
        sc(ws3, r3, 2, detail, a('center'))
        sc(ws3, r3, 3, '', a('center'))
        sc(ws3, r3, 4, '', a('center'))
        sc(ws3, r3, 5, '', a('left'))
        ws3['!rows'].push({ hpt: 20 })
        r3++
      })
    }

    setRef(ws3, r3, 5)
    XLSX.utils.book_append_sheet(wb, ws3, 'Риски')

    // ─────────────────────────────────────────────────────────────────────────
    // SHEET 4 — НАСТРОЕНИЕ & АКТИВНОСТЬ
    // ─────────────────────────────────────────────────────────────────────────
    const ws4 = {}
    ws4['!cols'] = [18, 15, 12, 6, 12, 15, 12].map(w => ({ wch: w }))
    ws4['!rows'] = []
    ws4['!merges'] = []
    let r4 = 0

    sc(ws4, r4, 0, 'Настроение & Активность — ' + team.team_name, { font: { bold: true, sz: 14, color: { rgb: NAVY } }, alignment: { horizontal: 'left' } })
    addMerge(ws4, r4, r4, 0, 6)
    ws4['!rows'].push({ hpt: 28 })
    r4++

    // ── Mood summary stats
    if (mood) {
      sc(ws4, r4, 0, 'ИТОГИ НАСТРОЕНИЯ', S.secHdr(TEAL))
      addMerge(ws4, r4, r4, 0, 2)
      ws4['!rows'].push({ hpt: 22 })
      r4++
      const moodKpi = [
        ['Общий средний балл', mood.overall_avg != null ? mood.overall_avg + '/5' : '—'],
        ['Всего ответов', mood.total ?? 0],
        ['Последних резюме', (mood.recent_summaries || []).length],
      ]
      moodKpi.forEach(([l, v]) => {
        sc(ws4, r4, 0, l, S.data('left', true))
        sc(ws4, r4, 1, v, S.cardVal)
        ws4['!rows'].push({ hpt: 20 })
        r4++
      })
      r4++

      // ── Mood by day
      sc(ws4, r4, 0, 'НАСТРОЕНИЕ ПО ДНЯМ (7 дней)', S.subHdr(TEAL))
      sc(ws4, r4, 1, 'Ср. балл (1–5)', S.subHdr(TEAL))
      sc(ws4, r4, 2, 'Ответов', S.subHdr(TEAL))
      ws4['!rows'].push({ hpt: 22 })
      r4++;
      (mood.days || []).forEach((d, i) => {
        const moodColor = d.avg == null ? '94A3B8' : d.avg >= 4 ? GREEN : d.avg >= 3 ? TEAL : d.avg >= 2 ? AMBER : RED
        sc(ws4, r4, 0, d.day, S.data('center'))
        sc(ws4, r4, 1, d.avg ?? '—', { font: { bold: true, sz: 11, color: { rgb: moodColor } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brdB() })
        sc(ws4, r4, 2, d.count, S.data('center'))
        ws4['!rows'].push({ hpt: 20 })
        r4++
      })
      r4++

      // ── Mood by week
      sc(ws4, r4, 0, 'НАСТРОЕНИЕ ПО НЕДЕЛЯМ (12 нед.)', S.subHdr(TEAL))
      sc(ws4, r4, 1, 'Ср. балл', S.subHdr(TEAL))
      sc(ws4, r4, 2, 'Ответов', S.subHdr(TEAL))
      ws4['!rows'].push({ hpt: 22 })
      r4++;
      (mood.weeks || []).forEach((w, i) => {
        const moodColor = w.avg == null ? '94A3B8' : w.avg >= 4 ? GREEN : w.avg >= 3 ? TEAL : w.avg >= 2 ? AMBER : RED
        sc(ws4, r4, 0, w.week, S.data('center'))
        sc(ws4, r4, 1, w.avg ?? '—', { font: { bold: true, sz: 11, color: { rgb: moodColor } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brdB() })
        sc(ws4, r4, 2, w.count, S.data('center'))
        ws4['!rows'].push({ hpt: 18 })
        r4++
      })
      r4++

      // ── Recent AI summaries
      if ((mood.recent_summaries || []).length > 0) {
        sc(ws4, r4, 0, 'AI-РЕЗЮМЕ ОПРОСОВ (последние)', S.subHdr(ACCENT))
        addMerge(ws4, r4, r4, 0, 6)
        ws4['!rows'].push({ hpt: 22 })
        r4++
        mood.recent_summaries.forEach((s, i) => {
          sc(ws4, r4, 0, `${i + 1}.`, S.data('center'))
          sc(ws4, r4, 1, s, { font: { sz: 10, italic: true, color: { rgb: '334155' } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: brdB() })
          addMerge(ws4, r4, r4, 1, 6)
          ws4['!rows'].push({ hpt: 22 })
          r4++
        })
        r4++
      }
    }

    // ── Hour distribution
    const hourDist = team.patterns?.hour_distribution || {}
    const hourEntries = Object.entries(hourDist).map(([h, c]) => ({ hour: parseInt(h), count: c })).sort((a, b) => a.hour - b.hour)
    if (hourEntries.length > 0) {
      sc(ws4, r4, 0, 'РАСПРЕДЕЛЕНИЕ ВСТРЕЧ ПО ЧАСАМ', S.secHdr(NAVY))
      addMerge(ws4, r4, r4, 0, 6)
      ws4['!rows'].push({ hpt: 24 })
      r4++
      sc(ws4, r4, 0, 'Час', S.subHdr())
      sc(ws4, r4, 1, 'Кол-во встреч', S.subHdr())
      ws4['!rows'].push({ hpt: 22 })
      r4++
      const maxHour = Math.max(...hourEntries.map(e => e.count), 1)
      hourEntries.forEach(e => {
        const pct = e.count / maxHour
        const barColor = pct >= 0.75 ? BLUE : pct >= 0.5 ? ACCENT : pct >= 0.25 ? '93C5FD' : 'DBEAFE'
        sc(ws4, r4, 0, `${e.hour}:00`, S.data('center'))
        sc(ws4, r4, 1, e.count, { font: { bold: true, sz: 10, color: { rgb: WHITE } }, fill: { fgColor: { rgb: barColor } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brdB() })
        ws4['!rows'].push({ hpt: 18 })
        r4++
      })
      r4++
    }

    // ── Weekly meetings heatmap data
    const weekData = team.meetings_per_week || []
    if (weekData.length > 0) {
      sc(ws4, r4, 0, 'АКТИВНОСТЬ ПО НЕДЕЛЯМ', S.secHdr(NAVY))
      addMerge(ws4, r4, r4, 0, 6)
      ws4['!rows'].push({ hpt: 24 })
      r4++
      sc(ws4, r4, 0, 'Неделя', S.subHdr())
      sc(ws4, r4, 1, 'Встреч', S.subHdr())
      ws4['!rows'].push({ hpt: 22 })
      r4++
      const maxW = Math.max(...weekData.map(w => w.count), 1)
      weekData.forEach(w => {
        const pct = w.count / maxW
        const barColor = pct >= 0.75 ? BLUE : pct >= 0.5 ? ACCENT : pct >= 0.25 ? '93C5FD' : w.count > 0 ? 'DBEAFE' : 'F1F5F9'
        sc(ws4, r4, 0, w.week, S.data('center'))
        sc(ws4, r4, 1, w.count, { font: { bold: w.count > 0, sz: 10, color: { rgb: w.count > 0 ? WHITE : '94A3B8' } }, fill: { fgColor: { rgb: barColor } }, alignment: { horizontal: 'center', vertical: 'center' }, border: brdB() })
        ws4['!rows'].push({ hpt: 18 })
        r4++
      })
    }

    // ── Checkins (if provided)
    if (checkins && checkins.length > 0) {
      r4++
      sc(ws4, r4, 0, 'ПРИХОД / УХОД (последние данные)', S.secHdr(TEAL))
      addMerge(ws4, r4, r4, 0, 6)
      ws4['!rows'].push({ hpt: 24 })
      r4++
      const cHdrs = ['Участник', 'Пришёл', 'Ушёл', 'Продолжительность', '', '', '']
      cHdrs.forEach((h, ci) => sc(ws4, r4, ci, h, S.subHdr(TEAL)))
      ws4['!rows'].push({ hpt: 22 })
      r4++
      const memberMap = Object.fromEntries(ms.map(s => [s.user_id, s.name]))
      const fmt = dt => dt ? new Date(dt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'
      const dur = (a, l) => {
        if (!a || !l) return '—'
        const m = Math.round((new Date(l) - new Date(a)) / 60000)
        return `${Math.floor(m / 60)}ч ${m % 60}м`
      }
      checkins.forEach((c, i) => {
        const a = i % 2 ? S.dataAlt : S.data
        sc(ws4, r4, 0, memberMap[c.user_id] || `#${c.user_id}`, a('left', true))
        sc(ws4, r4, 1, fmt(c.arrived_at), { ...a('center'), font: { sz: 10, color: { rgb: GREEN } } })
        sc(ws4, r4, 2, fmt(c.left_at), a('center'))
        sc(ws4, r4, 3, dur(c.arrived_at, c.left_at), a('center'))
        ws4['!rows'].push({ hpt: 20 })
        r4++
      })
    }

    setRef(ws4, r4, 6)
    XLSX.utils.book_append_sheet(wb, ws4, 'Активность')

    // ─────────────────────────────────────────────────────────────────────────
    // WRITE
    // ─────────────────────────────────────────────────────────────────────────
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    // Осмысленное имя: продукт + команда + ISO-дата выгрузки.
    const isoDate = new Date().toISOString().slice(0, 10)
    const safeTeam = (team.team_name || 'team').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-')
    a.download = `OneOnOne_${safeTeam}_${isoDate}.xlsx`
    a.click()
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div className="spinner" />
    </div>
  )
  if (!data?.teams?.length) return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8l1.6-3.2A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.8 1.1L20 8"/><path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M4 8h5l1 2h4l1-2h5"/></svg></div>
      <p className="empty-title">Нет данных для аналитики</p>
      <p className="empty-desc">Данные появятся после проведения встреч</p>
    </div>
  )

  const team = data.teams[selectedTeamIdx]
  const mood = moodByTeam[team.team_id]

  // Compute team-level aggregates from member_stats
  const ms = team.member_stats
  const intervals = ms.map(s => s.avg_interval_days).filter(Boolean)
  const teamAvgInterval = intervals.length ? +(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1) : null
  const teamMeetings30 = ms.reduce((a, s) => a + (s.meetings_last_30 || 0), 0)
  const taskPcts = ms.map(s => s.task_completion_pct).filter(v => v !== null)
  const teamTaskPct = taskPcts.length ? Math.round(taskPcts.reduce((a, b) => a + b, 0) / taskPcts.length) : null
  const atRiskCount = team.at_risk_members.length

  // Покрытие повестками: доля прошедших встреч, к которым руководитель составил
  // повестку, и последние темы — данные из поля повестки, а не повторный ввод.
  const agendaInfo = agendaByTeam[team.team_id]
  const agendaPct = agendaInfo && agendaInfo.total
    ? Math.round(agendaInfo.withAgenda / agendaInfo.total * 100)
    : null
  const agendaTopics = (agendaInfo?.topics || []).slice(-5).reverse()

  // Mood line chart points (weekly)
  const moodLinePoints = mood?.weeks?.map(w => ({ label: w.week, y: w.avg })) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1000, width: '100%' }}>
      {/* Team tabs */}
      {data.teams.length > 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {data.teams.map((t, i) => (
            <button key={t.team_id} onClick={() => setSelectedTeamIdx(i)}
              className={i === selectedTeamIdx ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}>
              {t.team_name}
            </button>
          ))}
        </div>
      )}

      {/* 4 Top stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <StatCard value={teamAvgInterval} suffix=" дн." label="Ср. интервал встреч" delay={0} />
        <StatCard value={teamMeetings30} label="Встреч за 30 дней" accent delay={100} />
        <StatCard value={teamTaskPct} suffix="%" label="Задач выполнено" accent={teamTaskPct >= 70} warning={teamTaskPct < 40 && teamTaskPct !== null} delay={200} />
        <StatCard value={atRiskCount} label="В зоне риска" danger={atRiskCount > 0} delay={300} />
        <StatCard value={agendaPct} suffix="%" label="Встреч с повесткой" accent={agendaPct !== null && agendaPct >= 70} warning={agendaPct !== null && agendaPct < 40} delay={350} />
        {/* Экспорт Excel недоступен в Mini App (таблица) */}
        {!isTg && (
          <button
            onClick={() => exportExcel(team, team.member_stats, moodByTeam[team.team_id], checkinsByTeam[team.team_id] || [])}
            style={{ alignSelf: 'center', marginLeft: 'auto', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >↓ Экспорт Excel</button>
        )}
      </div>

      {/* Ниже — графики и подробные таблицы: в Mini App показываем только сводку
          из StatCards выше, всё остальное скрыто (таблица разделения). */}
      {!isTg && (<>

      {/* Последние темы повесток — повестка встреч, собранная в аналитике */}
      {agendaTopics.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Последние темы повесток
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {agendaTopics.map((t, i) => (
              <span key={i} style={{ fontSize: 13, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '4px 12px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap + Mood line */}
      <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            Активность встреч по неделям
          </p>
          <Heatmap weeks={team.meetings_per_week} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }}>
            {['', '#bfdbfe', '#60a5fa', '#2563eb', '#1d4ed8'].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: i === 0 ? 'var(--gray-200)' : c }} />
                {i === 0 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>0</span>}
                {i === 4 && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>много</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Анонимная командная статистика настроения (13.5): при недостатке
            заполнивших (ниже порога) статистика скрывается — только сообщение. */}
        <div className="card" style={{ padding: '18px 20px', borderTop: '3px solid #3B6EF0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
              Настроение команды
            </p>
            <span className="badge badge-blue" style={{ fontSize: 10 }}>анонимно</span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Обобщённая статистика без привязки к участникам · опрос и быстрая оценка (единая шкала 1–5)
          </p>
          {!mood ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><div className="spinner" /></div>
          ) : mood.insufficient ? (
            <div style={{ background: 'var(--color-bg)', border: '1px dashed var(--color-border)', borderRadius: 10, padding: '16px 18px' }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                {mood.message || `Недостаточно данных для анонимной статистики (нужно от ${mood.threshold} ответов).`}
              </p>
              {mood.share_pct != null && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  Сегодня заполнили: {mood.filled}{mood.team_size ? ` из ${mood.team_size}` : ''}
                </p>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{mood.avg}/5</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>средний балл сегодня</p>
                </div>
                {mood.delta_prev != null && (
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: mood.delta_prev > 0 ? 'var(--color-success)' : mood.delta_prev < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                      {mood.delta_prev > 0 ? '+' : ''}{mood.delta_prev}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>к прошлому дню</p>
                  </div>
                )}
                {mood.share_pct != null && (
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>{mood.share_pct}%</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>заполнили ({mood.filled}{mood.team_size ? `/${mood.team_size}` : ''})</p>
                  </div>
                )}
              </div>
              {/* Распределение баллов сегодня */}
              {mood.distribution && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Распределение сегодня</p>
                  {(() => {
                    const dist = mood.distribution
                    const maxC = Math.max(...Object.values(dist), 1)
                    const LBL = { '1': 'Плохо', '2': 'Ниже сред.', '3': 'Нормально', '4': 'Хорошо', '5': 'Отлично' }
                    const COL = { '1': '#ef4444', '2': '#f59e0b', '3': '#eab308', '4': '#84cc16', '5': '#22c55e' }
                    return ['5', '4', '3', '2', '1'].map(k => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 74 }}>{LBL[k]}</span>
                        <div style={{ flex: 1, height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(dist[k] / maxC) * 100}%`, background: COL[k], borderRadius: 4, transition: 'width 0.6s var(--ease-spring)' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, width: 20, textAlign: 'right' }}>{dist[k]}</span>
                      </div>
                    ))
                  })()}
                </div>
              )}
              {moodLinePoints.filter(p => p.y != null).length >= 2 && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Динамика по неделям</p>
                  <LineChart points={moodLinePoints} color="#3B6EF0" height={90} />
                </>
              )}
              {mood.recent_summaries?.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Последние темы (анонимно)</p>
                  {mood.recent_summaries.map((s, i) => (
                    <p key={i} style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>«{s}»</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Личный график настроения тимлида (27.2) — визуально отделён от анонимной
          командной статистики: это личные отметки самого тимлида, не команда. */}
      <div className="card" style={{ padding: '18px 20px', borderTop: '3px solid #0D9488' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>Моё настроение (чек-ины)</p>
          <span className="badge badge-green" style={{ fontSize: 10 }}>личное</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>Только ваши отметки за 30 дней</p>
        {myMoodLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><div className="spinner" /></div>
        ) : (() => {
          const s = myMood?.series || []
          if (s.length === 0) return (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Вы ещё не отмечали настроение. График появится сразу после первой отметки.
            </p>
          )
          // Непрерывная ось: пропущенные дни — разрыв (null), не ноль.
          const byDate = {}; s.forEach(p => { byDate[p.date] = p.score })
          const pts = []
          const start = new Date(myMood.start + 'T00:00:00'), end = new Date(myMood.end + 'T00:00:00')
          for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            const iso = dt.toISOString().slice(0, 10)
            pts.push({ label: `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`, y: iso in byDate ? byDate[iso] : null })
          }
          const valid = pts.filter(p => p.y != null)
          if (valid.length < 2) return (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Есть отметка ({valid.length}). График продолжит строиться с каждым днём.
            </p>
          )
          return <LineChart points={pts} color="#0D9488" height={90} />
        })()}
      </div>

      {/* Risk zone */}
      {team.at_risk_members.length > 0 && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            Зоны риска
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {team.at_risk_members.map((s, i) => <RiskCard key={s.user_id} s={s} delay={i * 80} />)}
          </div>
        </div>
      )}

      {/* Member table */}
      <div className="card" style={{ padding: '18px 20px', overflow: 'hidden' }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>
          По каждому участнику
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                {['Участник', 'Без встречи', 'За месяц', 'Настроение', '% задач', 'Статус'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h === 'Участник' ? 'left' : 'center' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ms.map((s, i) => <MemberRow key={s.user_id} s={s} delay={i * 60} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hour distribution */}
      {(() => {
        const hourEntries = Object.entries(team.patterns.hour_distribution || {})
          .map(([h, c]) => ({ hour: `${h}:00`, count: c }))
          .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
        if (!hourEntries.length) return null
        const maxH = Math.max(...hourEntries.map(e => e.count), 1)
        return (
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Распределение встреч по времени</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
              {hourEntries.map((e, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                  {e.count > 0 && <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{e.count}</span>}
                  <div style={{
                    width: '100%',
                    height: `${Math.max((e.count / maxH) * 44, e.count > 0 ? 3 : 0)}px`,
                    background: 'var(--color-accent)', borderRadius: '4px 4px 0 0', opacity: e.count > 0 ? 0.8 : 0.15,
                    transition: `height 0.5s var(--ease-spring) ${i * 20}ms`,
                  }} />
                  <span style={{ fontSize: 8, color: 'var(--color-text-muted)' }}>{e.hour}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Checkins */}
      {(() => {
        const checkins = checkinsByTeam[team.team_id] || []
        const memberMap = Object.fromEntries(team.member_stats.map(s => [s.user_id, s.member_name]))
        const today = new Date().toISOString().slice(0, 10)
        const todayCheckins = checkins.filter(c => c.date === today)
        if (!todayCheckins.length && checkins.length === 0) return null
        const fmt = dt => dt ? new Date(dt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'
        const dur = (a, l) => {
          if (!a || !l) return '—'
          const m = Math.round((new Date(l) - new Date(a)) / 60000)
          return `${Math.floor(m / 60)}ч ${m % 60}м`
        }
        return (
          <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', marginBottom: 14 }}>Приход / уход сегодня</p>
            {todayCheckins.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Никто ещё не отметился сегодня</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 360 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Участник', 'Пришёл', 'Ушёл', 'В офисе'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todayCheckins.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{memberMap[c.user_id] || `#${c.user_id}`}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--color-success)' }}>{fmt(c.arrived_at)}</td>
                      <td style={{ padding: '10px 12px', color: c.left_at ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>{fmt(c.left_at)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {!c.left_at
                          ? <span className="badge badge-green" style={{ fontSize: 11 }}>Онлайн</span>
                          : <span style={{ color: 'var(--color-text-secondary)' }}>{dur(c.arrived_at, c.left_at)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )
      })()}
      </>)}
    </div>
  )
}
