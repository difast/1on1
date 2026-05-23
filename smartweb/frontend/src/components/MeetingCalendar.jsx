import { useState } from 'react'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function getMonday(offset = 0) {
  const now = new Date()
  const dow = now.getDay() || 7
  const m = new Date(now)
  m.setHours(0, 0, 0, 0)
  m.setDate(now.getDate() - (dow - 1) + offset * 7)
  return m
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function MeetingCalendar({ meetings, renderCard }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(null)

  const weekStart = getMonday(weekOffset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const meetingsByDay = days.map(day =>
    meetings.filter(m => sameDay(new Date(m.scheduled_date), day))
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  )

  // 8 week load bars: 4 before current week, current, 3 after
  const weekLoads = Array.from({ length: 8 }, (_, i) => {
    const ws = getMonday(weekOffset - 4 + i)
    const we = new Date(ws); we.setDate(ws.getDate() + 7)
    const count = meetings.filter(m => { const d = new Date(m.scheduled_date); return d >= ws && d < we }).length
    return { count, isCurrent: i === 4 }
  })
  const maxLoad = Math.max(...weekLoads.map(w => w.count), 1)

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7)
  const visibleMeetings = selectedDay
    ? meetings.filter(m => sameDay(new Date(m.scheduled_date), selectedDay))
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
    : meetings.filter(m => { const d = new Date(m.scheduled_date); return d >= weekStart && d < weekEnd })
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))

  const weekLabel = `${days[0].getDate()} ${MONTH_SHORT[days[0].getMonth()]} — ${days[6].getDate()} ${MONTH_SHORT[days[6].getMonth()]}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Weekly load bars */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <p className="label" style={{ marginBottom: 8, fontSize: 10 }}>Нагрузка по неделям</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
          {weekLoads.map((w, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: w.count === 0 ? 3 : Math.max(5, Math.round((w.count / maxLoad) * 32)),
                background: w.isCurrent ? 'var(--color-accent)' : 'var(--blue-200)',
                borderRadius: 3,
                opacity: w.count === 0 ? 0.25 : 1,
                alignSelf: 'flex-end',
                transition: 'height 0.3s',
                position: 'relative',
              }}
              title={`${w.count} встреч`}
            >
              {w.isCurrent && w.count > 0 && (
                <span style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 9, fontWeight: 700, color: 'var(--color-accent)', whiteSpace: 'nowrap',
                }}>{w.count}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>−4 нед</span>
          <span style={{ fontSize: 9, color: 'var(--color-accent)', fontWeight: 700 }}>Текущая</span>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>+3 нед</span>
        </div>
      </div>

      {/* Week nav + day grid */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            onClick={() => { setWeekOffset(o => o - 1); setSelectedDay(null) }}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}
          >‹</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{weekLabel}</span>
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDay(null) }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: '3px 8px' }}
              >Сегодня</button>
            )}
          </div>
          <button
            onClick={() => { setWeekOffset(o => o + 1); setSelectedDay(null) }}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}
          >›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {days.map((day, i) => {
            const dm = meetingsByDay[i]
            const isToday = sameDay(day, today)
            const isSel = selectedDay && sameDay(day, selectedDay)
            const isPast = day < today && !isToday
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSel ? null : day)}
                style={{
                  padding: '7px 4px', borderRadius: 'var(--radius-sm)', textAlign: 'center', cursor: 'pointer',
                  background: isSel ? 'var(--color-accent)' : isToday ? 'var(--blue-50)' : 'transparent',
                  border: isToday && !isSel ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                  opacity: isPast ? 0.65 : 1, transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isSel ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
                  {DAY_NAMES[i]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: isSel ? '#fff' : isToday ? 'var(--color-accent)' : 'var(--color-text-primary)', lineHeight: 1.1 }}>
                  {day.getDate()}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 2, minHeight: 8 }}>
                  {dm.slice(0, 3).map((_, j) => (
                    <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,0.85)' : 'var(--color-accent)' }} />
                  ))}
                  {dm.length > 3 && <span style={{ fontSize: 8, color: isSel ? '#fff' : 'var(--color-accent)', fontWeight: 700, lineHeight: 1 }}>+{dm.length - 3}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Meeting cards for selected day / current week */}
      {visibleMeetings.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="label">
            {selectedDay
              ? `${selectedDay.getDate()} ${MONTH_SHORT[selectedDay.getMonth()]}`
              : 'Встречи на этой неделе'}
          </p>
          {visibleMeetings.map(m => renderCard(m))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
          {selectedDay ? 'Встреч в этот день нет' : 'На этой неделе встреч нет'}
        </div>
      )}
    </div>
  )
}
