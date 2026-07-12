import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import useEscapeKey from '../lib/useEscapeKey'

/*
 * Первый запуск: контекстный тур в формате spotlight / coachmark (как в
 * Intercom Product Tours, Notion, Linear).
 *
 * ПОЧЕМУ spotlight, а не центрированное модальное окно: пользователь должен
 * увидеть реальные элементы интерфейса там, где встретит их в работе, а не
 * читать абстрактный текст поверх экрана. Каждый шаг затемняет всё, кроме
 * одного элемента, ставит стрелку и короткую подсказку рядом с ним. Так
 * онбординг обучает навигации, а не пересказывает её.
 *
 * Шаги привязаны к data-tour="..." на настоящих узлах DOM. Если элемента нет
 * (другая роль, узкий экран, ещё не смонтирован) — шаг пропускается, поэтому
 * тур не показывает пустых подсветок. Прогресс и пропуск обязательны на
 * каждом шаге. Показывается один раз (localStorage), полностью скипается.
 */
const STEPS = {
  team_lead: [
    { sel: '[data-tour="views"]', title: 'Разделы', text: 'Команды, встречи, задачи, заметки и аналитика — всё рабочее пространство переключается здесь.', place: 'bottom' },
    { sel: '[data-tour="pit"]', title: 'Ассистент Пит', text: 'Спросите Пита про задачи и встречи. Он же подсказывает темы, когда вы готовите повестку.', place: 'left' },
    { sel: '[data-tour="notifications"]', title: 'Уведомления', text: 'Запросы встреч, приближающиеся дедлайны и начатые звонки приходят сюда.', place: 'bottom' },
    { sel: '[data-tour="menu"]', title: 'Профиль и настройки', text: 'Тема оформления, смена пароля и переключатель подсказок Пита — в этом меню.', place: 'bottom' },
  ],
  member: [
    { sel: '[data-tour="pit"]', title: 'Ассистент Пит', text: 'Спросите Пита про свои задачи, встречи и команду — он рядом в любой момент.', place: 'left' },
    { sel: '[data-tour="notifications"]', title: 'Уведомления', text: 'Приглашения, напоминания о встречах и задачах приходят сюда.', place: 'bottom' },
    { sel: '[data-tour="menu"]', title: 'Профиль и настройки', text: 'Данные профиля, тема оформления и выход — в этом меню.', place: 'bottom' },
  ],
}

const PAD = 8            // отступ подсветки вокруг элемента
const TIP_W = 300        // ширина подсказки

// Позиционируем подсказку у элемента, а не по центру экрана. Выбираем сторону
// по доступному месту и прижимаем к границам вьюпорта.
function placeTip(rect, prefer) {
  const vw = window.innerWidth, vh = window.innerHeight
  const below = vh - rect.bottom, above = rect.top
  let place = prefer
  if (place === 'bottom' && below < 150 && above > below) place = 'top'
  if (place === 'top' && above < 150 && below > above) place = 'bottom'
  if (place === 'left' && rect.left < TIP_W + 24) place = 'bottom'

  let top, left
  if (place === 'left') {
    top = rect.top + rect.height / 2
    left = rect.left - TIP_W - 16
  } else if (place === 'top') {
    top = rect.top - 12
    left = rect.left + rect.width / 2 - TIP_W / 2
  } else { // bottom
    top = rect.bottom + 12
    left = rect.left + rect.width / 2 - TIP_W / 2
  }
  left = Math.max(12, Math.min(left, vw - TIP_W - 12))
  return { place, top, left }
}

export default function WelcomeTour({ currentUser }) {
  const role = currentUser?.role === 'team_lead' ? 'team_lead' : 'member'
  const key = currentUser?.id ? `tour_done_${currentUser.id}` : null

  // Список шагов, чьи якоря реально присутствуют в DOM. Считаем один раз при
  // старте, чтобы прогресс ("Шаг 2 из 3") был честным.
  const [resolved, setResolved] = useState([])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [open, setOpen] = useState(false)

  const finish = useCallback(() => {
    try { if (key) localStorage.setItem(key, '1') } catch {}
    setOpen(false)
  }, [key])

  // Старт: только если тур ещё не пройден. Небольшая задержка — ждём, пока
  // дашборд смонтирует свои якоря (вкладки разделов и т.п.).
  useEffect(() => {
    if (!key) return
    let done = true
    try { done = localStorage.getItem(key) === '1' } catch {}
    if (done) return
    const t = setTimeout(() => {
      const steps = (STEPS[role] || []).filter(s => document.querySelector(s.sel))
      if (steps.length === 0) return
      setResolved(steps)
      setI(0)
      setOpen(true)
    }, 600)
    return () => clearTimeout(t)
  }, [key, role])

  // Пересчитываем прямоугольник подсветки при смене шага, скролле и ресайзе.
  useLayoutEffect(() => {
    if (!open || !resolved[i]) return
    const measure = () => {
      const el = document.querySelector(resolved[i].sel)
      if (el) setRect(el.getBoundingClientRect())
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, i, resolved])

  useEscapeKey(finish, open)
  if (!open || !resolved[i] || !rect) return null

  const total = resolved.length
  const last = i === total - 1
  const step = resolved[i]
  const tip = placeTip(rect, step.place || 'bottom')

  return (
    <div role="dialog" aria-modal="true" aria-label="Знакомство с продуктом"
      style={{ position: 'fixed', inset: 0, zIndex: 9700 }}>
      {/* Подсветка: прозрачное окно + огромная тень наружу затемняет остальной экран */}
      <div style={{
        position: 'fixed',
        top: rect.top - PAD, left: rect.left - PAD,
        width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(15,23,42,0.66)',
        border: '2px solid var(--color-accent)',
        transition: 'all 0.25s var(--ease-spring, ease)',
        pointerEvents: 'none',
      }} />

      {/* Клик по затемнению не закрывает тур случайно — управление только кнопками */}
      <div style={{ position: 'fixed', inset: 0 }} onClick={e => e.stopPropagation()} />

      {/* Подсказка рядом с элементом */}
      <div style={{
        position: 'fixed', top: tip.top, left: tip.left, width: TIP_W,
        transform: tip.place === 'left' ? 'translateY(-50%)' : tip.place === 'top' ? 'translateY(-100%)' : 'none',
        background: 'var(--color-surface)', color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border)', borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: '16px 18px',
        animation: 'popIn 0.2s var(--ease-spring, ease)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>
          Шаг {i + 1} из {total}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{step.title}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '0 0 16px' }}>{step.text}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={finish} className="btn btn-secondary btn-sm">Пропустить</button>
          <button onClick={() => last ? finish() : setI(i + 1)} className="btn btn-accent btn-sm" style={{ fontWeight: 700 }}>
            {last ? 'Готово' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  )
}
