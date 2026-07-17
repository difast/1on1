// Обёртки над Telegram WebApp SDK (window.Telegram.WebApp). Все вызовы
// безопасны вне Telegram (возвращают заглушки), чтобы код не падал в обычном вебе.
export function webApp() {
  return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null
}

export function isTelegram() {
  const w = webApp()
  return !!(w && w.initData)
}

export function initData() {
  const w = webApp()
  return (w && w.initData) || ''
}

// ready + expand: сообщаем Telegram, что приложение готово, и разворачиваем на всю высоту.
export function initViewport() {
  const w = webApp()
  if (!w) return
  try { w.ready() } catch {}
  try { w.expand() } catch {}
}

// Синхронизация темы Telegram с нашими CSS-переменными (themeParams).
export function applyTheme() {
  const w = webApp()
  if (!w || !w.themeParams) return
  const p = w.themeParams
  const root = document.documentElement
  const set = (name, val) => { if (val) root.style.setProperty(name, val) }
  set('--tg-bg', p.bg_color)
  set('--tg-text', p.text_color)
  set('--tg-hint', p.hint_color)
  set('--tg-link', p.link_color)
  set('--tg-button', p.button_color)
  set('--tg-button-text', p.button_text_color)
  // Тёмная/светлая — по colorScheme Telegram.
  if (w.colorScheme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

// Haptic feedback на значимых действиях.
export function haptic(type = 'impact', style = 'medium') {
  const w = webApp()
  if (!w || !w.HapticFeedback) return
  try {
    if (type === 'notification') w.HapticFeedback.notificationOccurred(style)  // success|error|warning
    else if (type === 'selection') w.HapticFeedback.selectionChanged()
    else w.HapticFeedback.impactOccurred(style)  // light|medium|heavy
  } catch {}
}

// MainButton — главное действие экрана. onClick заменяется атомарно.
export function mainButton({ text, onClick, visible = true, progress = false }) {
  const w = webApp()
  if (!w || !w.MainButton) return () => {}
  const mb = w.MainButton
  try {
    if (text) mb.setText(text)
    mb._cb && mb.offClick(mb._cb)
    if (onClick) { mb.onClick(onClick); mb._cb = onClick }
    progress ? mb.showProgress() : mb.hideProgress()
    visible ? mb.show() : mb.hide()
  } catch {}
  return () => { try { onClick && mb.offClick(onClick); mb.hide() } catch {} }
}

// BackButton — системная кнопка «назад» вместо кастомной.
export function backButton({ onClick, visible = true }) {
  const w = webApp()
  if (!w || !w.BackButton) return () => {}
  const bb = w.BackButton
  try {
    bb._cb && bb.offClick(bb._cb)
    if (onClick) { bb.onClick(onClick); bb._cb = onClick }
    visible ? bb.show() : bb.hide()
  } catch {}
  return () => { try { onClick && bb.offClick(onClick); bb.hide() } catch {} }
}
