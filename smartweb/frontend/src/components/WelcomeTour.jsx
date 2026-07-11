import { useState } from 'react'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * First-run product tour — a short (3 steps) centered-modal sequence, shown
 * once per user after they reach the app. WHY a modal carousel and not
 * positioned coach-marks: coach-marks are fragile (break when layout shifts,
 * hard on mobile). A modal sequence reliably orients a new user to the 3 key
 * areas in < 90s and is fully skippable, so power users aren't blocked.
 */
const STEPS = {
  team_lead: [
    { title: 'Команды', text: 'Создайте команду и пригласите участников по коду — это ваше рабочее пространство.' },
    { title: 'Встречи 1-на-1', text: 'Планируйте регулярные встречи, ведите повестку и заметки по каждому участнику.' },
    { title: 'Пит и аналитика', text: 'AI-ассистент Пит помогает по задачам и встречам, а аналитика показывает динамику команды.' },
  ],
  member: [
    { title: 'Ваша команда', text: 'Присоединитесь к команде по коду от тимлида и следите за встречами и задачами.' },
    { title: 'Встречи и задачи', text: 'Готовьтесь к встречам 1-на-1, ведите заметки и отмечайте выполнение задач.' },
    { title: 'AI-ассистент Пит', text: 'Спросите Пита о задачах, встречах и команде — он рядом в любой момент.' },
  ],
}

export default function WelcomeTour({ currentUser }) {
  const role = currentUser?.role === 'team_lead' ? 'team_lead' : 'member'
  const key = currentUser?.id ? `tour_done_${currentUser.id}` : null
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(() => {
    if (!key) return false
    try { return localStorage.getItem(key) !== '1' } catch { return false }
  })
  const finish = () => {
    try { if (key) localStorage.setItem(key, '1') } catch {}
    setOpen(false)
  }
  useEscapeKey(finish, open)
  if (!open) return null

  const steps = STEPS[role]
  const step = steps[i]
  const last = i === steps.length - 1

  return (
    <div className="overlay-center" role="dialog" aria-modal="true" aria-label="Знакомство с продуктом" onClick={finish} style={{ zIndex: 9700 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }} aria-hidden="true">
          {steps.map((_, s) => (
            <span key={s} style={{ height: 4, flex: 1, borderRadius: 99, background: s <= i ? 'var(--color-accent)' : 'var(--color-surface-2)', transition: 'background 0.2s' }} />
          ))}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{step.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>{step.text}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={finish} className="btn btn-secondary btn-sm">Пропустить</button>
          <button onClick={() => last ? finish() : setI(i + 1)} className="btn btn-accent btn-sm" style={{ fontWeight: 700 }}>
            {last ? 'Начать' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  )
}
