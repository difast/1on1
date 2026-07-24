import { useEffect, useRef } from 'react'

/*
 * Централизованное управление открытыми оверлеями (Задача 1).
 *
 * Общее правило: одновременно открыт только ОДИН оверлей (выпадающее меню,
 * всплывающая панель, окно Пита и т.п.). При открытии любого оверлея все
 * остальные автоматически закрываются. Реализовано через единый канал событий
 * 'overlay-open' с ID активного оверлея — не через точечные проверки в каждом
 * компоненте, поэтому правило одинаково действует и для будущих окон: любому
 * новому оверлею достаточно подключить хук useExclusiveOverlay.
 *
 * Закрытие по клику вне окна (mousedown-listener в компонентах) остаётся как
 * есть — этот механизм добавляется ПОВЕРХ, а не заменяет его.
 */

export function announceOverlayOpen(id) {
  try { window.dispatchEvent(new CustomEvent('overlay-open', { detail: { id } })) } catch { /* SSR/no-window */ }
}

/**
 * Подключить оверлей к общему механизму взаимного исключения.
 * @param {string} id — уникальный идентификатор оверлея
 * @param {boolean} isOpen — открыт ли он сейчас
 * @param {() => void} onClose — как его закрыть
 */
export function useExclusiveOverlay(id, isOpen, onClose) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // При открытии — объявляем себя активным (это закроет остальные).
  useEffect(() => {
    if (isOpen) announceOverlayOpen(id)
  }, [isOpen, id])

  // Если открылся другой оверлей — закрываем себя.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.id !== id) closeRef.current?.()
    }
    window.addEventListener('overlay-open', handler)
    return () => window.removeEventListener('overlay-open', handler)
  }, [id])
}
