import { useState, useEffect, useRef } from 'react'
import { getLeadAnalytics, getTeamMoodSummary, getTeamCheckins } from '../api/client'
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
  useEffect(() => { const t = setTimeout(() => setVis(true), delay); return () => clearTimeout(t) }, [delay])
  const reasons = []
  if (s.warning_flags.includes('no_meeting_14_days')) reasons.push(`${s.days_since_last ?? '14+'} дн. без встречи`)
  if (s.warning_flags.includes('mood_declining')) reasons.push('Настроение падает')
  if (s.warning_flags.includes('many_incomplete_tasks')) reasons.push(`${s.open_tasks} незакрытых задач`)
  const isUrgent = s.days_since_last >= 21 || s.warning_flags.length >= 2
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {reasons.map((r, i) => <span key={i} className={`badge ${isUrgent ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 11 }}>{r}</span>)}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LeadAnalytics({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTeamIdx, setSelectedTeamIdx] = useState(0)
  const [moodByTeam, setMoodByTeam] = useState({})
  const [checkinsByTeam, setCheckinsByTeam] = useState({})

  useEffect(() => {
    setLoading(true)
    getLeadAnalytics(user.id)
      .then(r => {
        setData(r.data)
        r.data.teams.forEach(t => {
          getTeamMoodSummary(t.team_id)
            .then(mr => setMoodByTeam(prev => ({ ...prev, [t.team_id]: mr.data })))
            .catch(() => {})
          getTeamCheckins(t.team_id, 7)
            .then(cr => setCheckinsByTeam(prev => ({ ...prev, [t.team_id]: cr.data })))
            .catch(() => {})
        })
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [user.id])

  const exportExcel = (team, members, mood) => {
    const XLSX = XLSXStyle
    const wb = XLSX.utils.book_new()

    // ── Style helpers ──────────────────────────────────────────────────────────
    const hdr = (color = '1E3A5F') => ({
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: color } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { bottom: { style: 'thin', color: { rgb: 'CCCCCC' } } },
    })
    const cell = (align = 'left', bold = false) => ({
      font: { sz: 10, bold },
      alignment: { horizontal: align, vertical: 'center' },
      border: { bottom: { style: 'hair', color: { rgb: 'E0E0E0' } } },
    })
    const riskCell = () => ({
      font: { sz: 10, bold: true, color: { rgb: 'C0392B' } },
      fill: { fgColor: { rgb: 'FDEDED' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'hair', color: { rgb: 'E0E0E0' } } },
    })
    const okCell = () => ({
      font: { sz: 10, color: { rgb: '1A6B3C' } },
      fill: { fgColor: { rgb: 'E9F7EF' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'hair', color: { rgb: 'E0E0E0' } } },
    })
    const altRow = (isAlt) => isAlt ? { fill: { fgColor: { rgb: 'F7F9FC' } } } : {}
    const makeCell = (v, s) => ({ v, s })

    // ── Sheet 1: Обзор команды ─────────────────────────────────────────────────
    const today = new Date().toLocaleDateString('ru-RU')
    const ms = members

    const s1Headers = [
      'Участник', 'Встреч за 30 дн', 'Всего встреч', 'Последняя встреча',
      'Дней с последней', 'Ср. интервал (дн)', 'Задачи выполнено %',
      'Открытых задач', 'Инициировал лид', 'Инициировал сотр.', 'Статус',
    ]
    const s1Rows = [s1Headers.map(h => makeCell(h, hdr()))]
    ms.forEach((s, i) => {
      const isRisk = s.warning_flags && s.warning_flags.length > 0
      const alt = altRow(i % 2 === 1)
      s1Rows.push([
        makeCell(s.member_name, { ...cell('left', true), ...alt }),
        makeCell(s.meetings_last_30 ?? s.meetings_last_30_days ?? 0, { ...cell('center'), ...alt }),
        makeCell(s.total_meetings ?? 0, { ...cell('center'), ...alt }),
        makeCell(s.last_meeting_date || '—', { ...cell('center'), ...alt }),
        makeCell(s.days_since_last ?? '—', { ...cell('center'), ...alt }),
        makeCell(s.avg_interval_days ?? '—', { ...cell('center'), ...alt }),
        makeCell(s.task_completion_pct != null ? s.task_completion_pct + '%' : '—', { ...cell('center'), ...alt }),
        makeCell(s.open_tasks ?? 0, { ...cell('center'), ...alt }),
        makeCell(s.lead_initiated ?? 0, { ...cell('center'), ...alt }),
        makeCell(s.member_initiated ?? 0, { ...cell('center'), ...alt }),
        makeCell(isRisk ? 'Риск' : 'Норма', isRisk ? riskCell() : okCell()),
      ])
    })
    const ws1 = XLSX.utils.aoa_to_sheet(s1Rows.map(r => r.map(c => c.v)))
    s1Rows.forEach((row, ri) => row.forEach((c, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri, c: ci })
      if (!ws1[addr]) ws1[addr] = {}
      ws1[addr].s = c.s
    }))
    ws1['!cols'] = [22, 16, 14, 18, 16, 18, 20, 16, 16, 18, 10].map(w => ({ wch: w }))
    ws1['!rows'] = [{ hpt: 30 }]
    // Title row above headers
    const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 })
    XLSX.utils.sheet_add_aoa(ws1, [[`Аналитика команды: ${team.team_name} | ${today}`]], { origin: 'A1' })
    ws1['A1'].s = { font: { bold: true, sz: 13, color: { rgb: '1E3A5F' } }, alignment: { horizontal: 'left' } }
    XLSX.utils.sheet_add_aoa(ws1, [s1Headers], { origin: 'A2' })
    s1Headers.forEach((h, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 1, c: ci })
      ws1[addr] = { v: h, s: hdr() }
    })
    ms.forEach((s, i) => {
      const isRisk = s.warning_flags && s.warning_flags.length > 0
      const alt = altRow(i % 2 === 1)
      const rowVals = [
        s.member_name,
        s.meetings_last_30 ?? s.meetings_last_30_days ?? 0,
        s.total_meetings ?? 0,
        s.last_meeting_date || '—',
        s.days_since_last ?? '—',
        s.avg_interval_days ?? '—',
        s.task_completion_pct != null ? s.task_completion_pct + '%' : '—',
        s.open_tasks ?? 0,
        s.lead_initiated ?? 0,
        s.member_initiated ?? 0,
        isRisk ? 'Риск' : 'Норма',
      ]
      const styles = [
        { ...cell('left', true), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        { ...cell('center'), ...alt },
        isRisk ? riskCell() : okCell(),
      ]
      rowVals.forEach((v, ci) => {
        const addr = XLSX.utils.encode_cell({ r: i + 2, c: ci })
        ws1[addr] = { v, s: styles[ci] }
      })
    })
    const ref = ws1['!ref']
    ws1['!ref'] = `A1:K${ms.length + 2}`
    XLSX.utils.book_append_sheet(wb, ws1, 'Обзор')

    // ── Sheet 2: Зона риска ────────────────────────────────────────────────────
    const atRisk = ms.filter(s => s.warning_flags && s.warning_flags.length > 0)
    const ws2 = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws2, [['Участники в зоне риска']], { origin: 'A1' })
    ws2['A1'] = { v: 'Участники в зоне риска', s: { font: { bold: true, sz: 13, color: { rgb: 'C0392B' } } } }
    const riskHeaders = ['Участник', 'Флаги риска', 'Дней с последней встречи', 'Открытых задач', 'Задачи %']
    riskHeaders.forEach((h, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 1, c: ci })
      ws2[addr] = { v: h, s: hdr('C0392B') }
    })
    if (atRisk.length === 0) {
      ws2['A3'] = { v: 'Нет участников в зоне риска', s: { font: { color: { rgb: '1A6B3C' }, italic: true } } }
    } else {
      atRisk.forEach((s, i) => {
        const flags = (s.warning_flags || []).join('; ')
        const rowVals = [s.member_name, flags, s.days_since_last ?? '—', s.open_tasks ?? 0, s.task_completion_pct != null ? s.task_completion_pct + '%' : '—']
        rowVals.forEach((v, ci) => {
          const addr = XLSX.utils.encode_cell({ r: i + 2, c: ci })
          ws2[addr] = { v, s: i === 0 ? riskCell() : { ...cell('left'), fill: { fgColor: { rgb: 'FFF5F5' } } } }
        })
      })
    }
    ws2['!cols'] = [22, 40, 22, 16, 14].map(w => ({ wch: w }))
    ws2['!ref'] = `A1:E${Math.max(atRisk.length + 2, 3)}`
    XLSX.utils.book_append_sheet(wb, ws2, 'Зона риска')

    // ── Sheet 3: Настроение команды ────────────────────────────────────────────
    const ws3 = XLSX.utils.aoa_to_sheet([])
    ws3['A1'] = { v: 'Настроение команды (последние 7 дней)', s: { font: { bold: true, sz: 13, color: { rgb: '1E3A5F' } } } }
    const moodDays = mood?.days ?? []
    const moodWeeks = mood?.weeks ?? []
    ws3['A2'] = { v: 'По дням', s: hdr('2980B9') }
    ws3['B2'] = { v: 'Ср. балл (1–5)', s: hdr('2980B9') }
    ws3['C2'] = { v: 'Ответов', s: hdr('2980B9') }
    moodDays.forEach((d, i) => {
      ws3[XLSX.utils.encode_cell({ r: i + 2, c: 0 })] = { v: d.day, s: cell('center') }
      ws3[XLSX.utils.encode_cell({ r: i + 2, c: 1 })] = { v: d.avg ?? '—', s: cell('center') }
      ws3[XLSX.utils.encode_cell({ r: i + 2, c: 2 })] = { v: d.count, s: cell('center') }
    })
    const weekStart = moodDays.length + 4
    ws3[XLSX.utils.encode_cell({ r: weekStart - 1, c: 0 })] = { v: 'По неделям (12 нед.)', s: hdr('2980B9') }
    ws3[XLSX.utils.encode_cell({ r: weekStart - 1, c: 1 })] = { v: 'Ср. балл', s: hdr('2980B9') }
    ws3[XLSX.utils.encode_cell({ r: weekStart - 1, c: 2 })] = { v: 'Ответов', s: hdr('2980B9') }
    moodWeeks.forEach((w, i) => {
      ws3[XLSX.utils.encode_cell({ r: weekStart + i, c: 0 })] = { v: w.week, s: cell('center') }
      ws3[XLSX.utils.encode_cell({ r: weekStart + i, c: 1 })] = { v: w.avg ?? '—', s: cell('center') }
      ws3[XLSX.utils.encode_cell({ r: weekStart + i, c: 2 })] = { v: w.count, s: cell('center') }
    })
    if (mood?.recent_summaries?.length) {
      const sumStart = weekStart + moodWeeks.length + 2
      ws3[XLSX.utils.encode_cell({ r: sumStart, c: 0 })] = { v: 'Последние AI-резюме опросов', s: { font: { bold: true, sz: 11, color: { rgb: '1E3A5F' } } } }
      mood.recent_summaries.forEach((s, i) => {
        ws3[XLSX.utils.encode_cell({ r: sumStart + 1 + i, c: 0 })] = { v: s, s: cell('left') }
      })
    }
    ws3['!cols'] = [18, 16, 12].map(w => ({ wch: w }))
    ws3['!ref'] = `A1:C${weekStart + moodWeeks.length + 10}`
    XLSX.utils.book_append_sheet(wb, ws3, 'Настроение')

    // ── Write file ─────────────────────────────────────────────────────────────
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${team.team_name}_аналитика.xlsx`
    a.click()
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div className="spinner" />
    </div>
  )
  if (!data?.teams?.length) return (
    <div className="empty-state">
      <div className="empty-icon">◎</div>
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

  // Mood line chart points (weekly)
  const moodLinePoints = mood?.weeks?.map(w => ({ label: w.week, y: w.avg })) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1000 }}>
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
        <button
          onClick={() => exportExcel(team, team.member_stats, moodByTeam[team.team_id])}
          style={{ alignSelf: 'center', marginLeft: 'auto', fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >↓ Экспорт Excel</button>
      </div>

      {/* Heatmap + Mood line */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
              Настроение команды
            </p>
            {mood?.overall_avg && (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                ср. {mood.overall_avg}/5 · {mood.total} отзывов
              </span>
            )}
          </div>
          {moodLinePoints.length >= 2
            ? <LineChart points={moodLinePoints} color="#8b5cf6" height={100} />
            : <p style={{ fontSize: 13, color: 'var(--color-text-muted)', paddingTop: 20 }}>Нет данных по настроению — участники ещё не заполняли опросник</p>}
          {mood?.recent_summaries?.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Последние темы (анонимно)</p>
              {mood.recent_summaries.map((s, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>«{s}»</p>
              ))}
            </div>
          )}
        </div>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
            )}
          </div>
        )
      })()}
    </div>
  )
}
