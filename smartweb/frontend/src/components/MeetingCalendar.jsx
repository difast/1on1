import { useState } from 'react'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTH_FULL  = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

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

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7 // Monday=0
  const days = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, 1 - startDow + i)
    days.push({ date: d, inMonth: false })
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), inMonth: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - startDow - daysInMonth + 1)
    days.push({ date: d, inMonth: false })
  }
  return days
}

export default function MeetingCalendar({ meetings, renderCard }) {
  const [viewMode, setViewMode] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(null)

  const now = new Date()
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  // ── WEEK VIEW data ──
  const weekStart = getMonday(weekOffset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })
  const meetingsByDay = days.map(day =>
    meetings.filter(m => sameDay(new Date(m.scheduled_date), day))
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  )
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

  // ── MONTH VIEW data ──
  const monthGrid = getMonthGrid(monthYear.year, monthYear.month)
  const monthMeetingsByDay = (day) =>
    meetings.filter(m => sameDay(new Date(m.scheduled_date), day))
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  const monthVisibleMeetings = selectedDay
    ? meetings.filter(m => sameDay(new Date(m.scheduled_date), selectedDay))
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
    : []

  const goMonthPrev = () => {
    setMonthYear(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
    setSelectedDay(null)
  }
  const goMonthNext = () => {
    setMonthYear(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })
    setSelectedDay(null)
  }
  const goMonthToday = () => {
    setMonthYear({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedDay(null)
  }
  const isCurrentMonthAndYear = monthYear.year === now.getFullYear() && monthYear.month === now.getMonth()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => { setViewMode('week'); setSelectedDay(null) }}
          className={viewMode === 'week' ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
          style={{ fontSize: 12 }}
        >Неделя</button>
        <button
          onClick={() => { setViewMode('month'); setSelectedDay(null) }}
          className={viewMode === 'month' ? 'btn btn-accent btn-sm' : 'btn btn-secondary btn-sm'}
          style={{ fontSize: 12 }}
        >Месяц</button>
      </div>

      {viewMode === 'week' && (<>
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
                  borderRadius: 3, opacity: w.count === 0 ? 0.25 : 1, alignSelf: 'flex-end',
                  transition: 'height 0.3s', position: 'relative',
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
            <button onClick={() => { setWeekOffset(o => o - 1); setSelectedDay(null) }} className="btn btn-secondary btn-sm" style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>‹</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{weekLabel}</span>
              {weekOffset !== 0 && (
                <button onClick={() => { setWeekOffset(0); setSelectedDay(null) }} className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>Сегодня</button>
              )}
            </div>
            <button onClick={() => { setWeekOffset(o => o + 1); setSelectedDay(null) }} className="btn btn-secondary btn-sm" style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {days.map((day, i) => {
              const dm = meetingsByDay[i]
              const isToday = sameDay(day, today)
              const isSel = selectedDay && sameDay(day, selectedDay)
              const isPast = day < today && !isToday
              return (
                <button key={i} onClick={() => setSelectedDay(isSel ? null : day)} style={{
                  padding: '7px 4px', borderRadius: 'var(--radius-sm)', textAlign: 'center', cursor: 'pointer',
                  background: isSel ? 'var(--color-accent)' : isToday ? 'var(--blue-50)' : 'transparent',
                  border: isToday && !isSel ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                  opacity: isPast ? 0.65 : 1, transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isSel ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>{DAY_NAMES[i]}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isSel ? '#fff' : isToday ? 'var(--color-accent)' : 'var(--color-text-primary)', lineHeight: 1.1 }}>{day.getDate()}</span>
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

        {visibleMeetings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="label">
              {selectedDay ? `${selectedDay.getDate()} ${MONTH_SHORT[selectedDay.getMonth()]}` : 'Встречи на этой неделе'}
            </p>
            {visibleMeetings.map(m => renderCard(m))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
            {selectedDay ? 'Встреч в этот день нет' : 'На этой неделе встреч нет'}
          </div>
        )}
      </>)}

      {viewMode === 'month' && (<>
        {/* Month nav */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={goMonthPrev} className="btn btn-secondary btn-sm" style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>‹</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {MONTH_FULL[monthYear.month]} {monthYear.year}
              </span>
              {!isCurrentMonthAndYear && (
                <button onClick={goMonthToday} className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>Сегодня</button>
              )}
            </div>
            <button onClick={goMonthNext} className="btn btn-secondary btn-sm" style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>›</button>
          </div>

          {/* Day name headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {monthGrid.map(({ date, inMonth }, idx) => {
              const dm = monthMeetingsByDay(date)
              const isToday = sameDay(date, today)
              const isSel = selectedDay && sameDay(date, selectedDay)
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(isSel ? null : date)}
                  style={{
                    padding: '6px 2px', borderRadius: 'var(--radius-sm)', textAlign: 'center', cursor: 'pointer',
                    background: isSel ? 'var(--color-accent)' : isToday ? 'var(--blue-50)' : 'transparent',
                    border: isToday && !isSel ? '2px solid var(--color-accent)' : '1px solid transparent',
                    opacity: inMonth ? 1 : 0.3, transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 44,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: isToday || isSel ? 700 : 400, color: isSel ? '#fff' : isToday ? 'var(--color-accent)' : 'var(--color-text-primary)', lineHeight: 1.2 }}>
                    {date.getDate()}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, minHeight: 8 }}>
                    {dm.slice(0, 3).map((_, j) => (
                      <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,0.85)' : 'var(--color-accent)' }} />
                    ))}
                    {dm.length > 3 && <span style={{ fontSize: 8, color: isSel ? '#fff' : 'var(--color-accent)', fontWeight: 700, lineHeight: 1 }}>+{dm.length - 3}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected day meetings */}
        {selectedDay && (
          monthVisibleMeetings.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="label">{selectedDay.getDate()} {MONTH_SHORT[selectedDay.getMonth()]}</p>
              {monthVisibleMeetings.map(m => renderCard(m))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: 14 }}>
              Встреч в этот день нет
            </div>
          )
        )}
        {!selectedDay && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
            Нажмите на день, чтобы увидеть встречи
          </div>
        )}
      </>)}
    </div>
  )
}
