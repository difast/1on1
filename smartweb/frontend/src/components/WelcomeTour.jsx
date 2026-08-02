import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useEscapeKey from '../lib/useEscapeKey'
import { updateUser } from '../api/client'

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
// Шаги тура держат только ключи словаря — тексты приходят на языке интерфейса.
const STEPS = {
  team_lead: [
    { sel: '[data-tour="views"]', titleKey: 'tour.sections', textKey: 'tour.sectionsDesc', place: 'bottom' },
    { sel: '[data-tour="pit"]', titleKey: 'tour.pit', textKey: 'tour.pitDescLead', place: 'left' },
    { sel: '[data-tour="notifications"]', titleKey: 'tour.notifications', textKey: 'tour.notificationsDescLead', place: 'bottom' },
    { sel: '[data-tour="menu"]', titleKey: 'tour.profile', textKey: 'tour.profileDescLead', place: 'bottom' },
  ],
  member: [
    { sel: '[data-tour="pit"]', titleKey: 'tour.pit', textKey: 'tour.pitDescMember', place: 'left' },
    { sel: '[data-tour="notifications"]', titleKey: 'tour.notifications', textKey: 'tour.notificationsDescMember', place: 'bottom' },
    { sel: '[data-tour="menu"]', titleKey: 'tour.profile', textKey: 'tour.profileDescMember', place: 'bottom' },
  ],
}

const PAD = 8            // отступ подсветки вокруг элемента
const TIP_W = 300        // ширина подсказки

// Позиционируем подсказку у элемента, а не по центру экрана. Сторону выбираем
// по доступному месту и прижимаем к границам вьюпорта по ОБЕИМ осям.
//
// Раньше веб-ветка считала только горизонтальный кламп, а по вертикали ставила
// координату без ограничений и полагалась на transform. Второй шаг привязан к
// плавающей кнопке Пита, которая висит внизу экрана: подсказка центрировалась
// по ней и уезжала за нижнюю границу — кнопки «Далее» и «Пропустить» были
// недоступны. Порог выбора стороны тоже был жёстким числом (150), меньше
// реальной высоты окна, поэтому «снизу» выбиралось там, где места не хватало.
//
// Теперь та же численная логика, что уже применялась для Mini App, работает
// везде, а вместо оценки высоты используется реально измеренная (tipH).
function placeTip(rect, prefer, vw, vh, tipW, tipH) {
  const M = 12                       // отступ от краёв экрана
  const GAP = 12                     // зазор между элементом и подсказкой
  const width = Math.min(tipW, vw - M * 2)
  const below = vh - rect.bottom, above = rect.top

  let place = prefer
  // Сторону меняем, сравнивая с ФАКТИЧЕСКОЙ высотой подсказки, а не с догадкой.
  if (place === 'bottom' && below < tipH + GAP && above > below) place = 'top'
  if (place === 'top' && above < tipH + GAP && below > above) place = 'bottom'
  if (place === 'left' && rect.left < width + GAP * 2) place = below >= above ? 'bottom' : 'top'

  let top, left
  if (place === 'left') {
    top = rect.top + rect.height / 2 - tipH / 2
    left = rect.left - width - GAP - 4
  } else if (place === 'top') {
    top = rect.top - tipH - GAP
    left = rect.left + rect.width / 2 - width / 2
  } else {
    top = rect.bottom + GAP
    left = rect.left + rect.width / 2 - width / 2
  }

  // Кламп по обеим осям: подсказка всегда целиком в пределах вьюпорта.
  left = Math.max(M, Math.min(left, vw - width - M))
  top = Math.max(M, Math.min(top, Math.max(M, vh - tipH - M)))
  return { place, top, left, width }
}

export default function WelcomeTour({ currentUser }) {
  const { t } = useTranslation()
  const role = currentUser?.role === 'team_lead' ? 'team_lead' : 'member'
  const key = currentUser?.id ? `tour_done_${currentUser.id}` : null

  // Список шагов, чьи якоря реально присутствуют в DOM. Считаем один раз при
  // старте, чтобы прогресс ("Шаг 2 из 3") был честным.
  const [resolved, setResolved] = useState([])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [open, setOpen] = useState(false)
  // Реальные размеры подсказки и вьюпорта: позиция считается по ним, а не по
  // зашитым числам, поэтому окно не уезжает за край на любом разрешении.
  const tipRef = useRef(null)
  const [tipH, setTipH] = useState(210)
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? 1024 : window.innerWidth,
    h: typeof window === 'undefined' ? 768 : window.innerHeight,
  }))

  const finish = useCallback(() => {
    try { if (key) localStorage.setItem(key, '1') } catch {}
    // Флаг общий для аккаунта: сохраняем в профиль, чтобы гид не повторялся на
    // другой платформе (веб <-> Telegram Mini App).
    if (currentUser?.id && !currentUser.onboarding_tour_done) {
      updateUser(currentUser.id, { onboarding_tour_done: true }).catch(() => {})
    }
    setOpen(false)
  }, [key, currentUser?.id, currentUser?.onboarding_tour_done])

  // Старт: только если тур ещё не пройден. Проверяем и профиль (общий флаг), и
  // localStorage (быстрый кэш этого браузера). Небольшая задержка — ждём, пока
  // дашборд смонтирует свои якоря (вкладки разделов и т.п.).
  useEffect(() => {
    if (!key) return
    let done = currentUser?.onboarding_tour_done === true
    try { if (!done) done = localStorage.getItem(key) === '1' } catch {}
    if (done) return
    // Опрашиваем DOM несколько раз (~до 6 c), а не один раз: сразу после
    // регистрации дашборд с медленным бэкендом (холодный старт) может ещё не
    // смонтировать якоря к первой проверке — раньше тур в этом случае молча не
    // появлялся. Открываем, как только появился хотя бы один якорь шага.
    let tries = 0
    let timer
    const attempt = () => {
      const steps = (STEPS[role] || []).filter(s => document.querySelector(s.sel))
      if (steps.length > 0) {
        setResolved(steps)
        setI(0)
        setOpen(true)
        return
      }
      if (++tries < 14) timer = setTimeout(attempt, 400)
    }
    timer = setTimeout(attempt, 500)
    return () => clearTimeout(timer)
  }, [key, role])

  // Пересчитываем прямоугольник подсветки при смене шага, скролле и ресайзе.
  useLayoutEffect(() => {
    if (!open || !resolved[i]) return
    const measure = () => {
      const el = document.querySelector(resolved[i].sel)
      if (el) setRect(el.getBoundingClientRect())
    }
    const onResize = () => { setVp({ w: window.innerWidth, h: window.innerHeight }); measure() }
    measure()
    onResize()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, i, resolved])

  // Высоту берём после отрисовки: у шагов разной длины текста она разная, а от
  // неё зависит и выбор стороны, и вертикальный кламп.
  useLayoutEffect(() => {
    if (!open || !tipRef.current) return
    const h = tipRef.current.getBoundingClientRect().height
    if (h && Math.abs(h - tipH) > 1) setTipH(h)
  }, [open, i, rect, tipH])

  useEscapeKey(finish, open)
  if (!open || !resolved[i] || !rect) return null

  const total = resolved.length
  const last = i === total - 1
  const step = resolved[i]
  const tip = placeTip(rect, step.place || 'bottom', vp.w, vp.h, TIP_W, tipH)

  return (
    <div role="dialog" aria-modal="true" aria-label={t('ui.znakomstvo_s_produktom')}
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
      <div ref={tipRef} style={{
        position: 'fixed', top: tip.top, left: tip.left, width: tip.width,
        // Ограничение по высоте — на всех поверхностях, а не только в Mini App:
        // на низком окне браузера подсказка иначе вылезала за нижний край.
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: 'var(--color-surface)', color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border)', borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: '16px 18px',
        animation: 'popIn 0.2s var(--ease-spring, ease)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>
          Шаг {i + 1} из {total}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{t(step.titleKey)}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, margin: '0 0 16px' }}>{t(step.textKey)}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={finish} className="btn btn-secondary btn-sm">{t('ui.propustit')}</button>
          <button onClick={() => last ? finish() : setI(i + 1)} className="btn btn-accent btn-sm" style={{ fontWeight: 700 }}>
            {last ? t('common.done') : t('common.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
