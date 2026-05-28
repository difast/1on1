import { useState } from 'react'

export default function QuickWidget({ nextMeeting, nextTask, onGoMeetings, onGoTasks }) {
  const [open, setOpen] = useState(false)

  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1199 }}
        />
      )}

      <div style={{
        position: 'fixed',
        right: 24,
        bottom: 32,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}>
        {open && (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            padding: '20px 20px 16px',
            width: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            {/* Next meeting */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Следующая встреча
              </p>
              {nextMeeting ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 'var(--radius-md)',
                    background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1.1 }}>
                      {new Date(nextMeeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--blue-400)' }}>
                      {new Date(nextMeeting.scheduled_date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.3 }}>
                      {fmtDate(nextMeeting.scheduled_date)}
                    </p>
                    {nextMeeting.topic && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nextMeeting.topic}
                      </p>
                    )}
                    {nextMeeting.member_name && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>с {nextMeeting.member_name}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Встреч не запланировано</p>
              )}
              <button
                onClick={() => { setOpen(false); onGoMeetings() }}
                style={{
                  marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--color-accent)',
                  background: 'var(--blue-50)', border: '1px solid var(--blue-200)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer', width: '100%',
                }}
              >
                → Встречи
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--color-border)' }} />

            {/* Next task */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Ближайшая задача
              </p>
              {nextTask ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 'var(--radius-md)',
                    background: '#fef3c7', border: '1px solid #fde68a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18,
                  }}>
                    ✓
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nextTask.title}
                    </p>
                    {nextTask.due_date && (
                      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        до {new Date(nextTask.due_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Активных задач нет</p>
              )}
              <button
                onClick={() => { setOpen(false); onGoTasks() }}
                style={{
                  marginTop: 10, fontSize: 12, fontWeight: 600, color: '#b45309',
                  background: '#fef3c7', border: '1px solid #fde68a',
                  borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer', width: '100%',
                }}
              >
                → Задачи
              </button>
            </div>
          </div>
        )}

        {/* Trigger button */}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: nextMeeting ? 'var(--color-accent)' : 'var(--color-surface)',
            color: nextMeeting ? '#fff' : 'var(--color-text-primary)',
            border: nextMeeting ? 'none' : '1px solid var(--color-border)',
            borderRadius: 32,
            padding: '10px 18px 10px 14px',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          {nextMeeting
            ? new Date(nextMeeting.scheduled_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
            : 'Следующая встреча'}
        </button>
      </div>
    </>
  )
}
