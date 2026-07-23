import { useRef, useLayoutEffect, useCallback } from 'react'

/*
 * Умный автоскролл для списков/чатов, куда снизу добавляются новые элементы
 * (сообщения Пита, чат поддержки, повестка). Задача:
 *   - если пользователь и так у нижнего края — плавно доскроллить к новому
 *     элементу, чтобы он не остался вне видимой области;
 *   - если пользователь специально прокрутил вверх (читает историю) — НЕ
 *     выдёргивать его обратно вниз при каждом новом элементе.
 *
 * Использование:
 *   const { scrollRef, bottomRef, onScroll } = useStickyScroll([deps])
 *   <div ref={scrollRef} onScroll={onScroll} style={{ overflowY: 'auto' }}>
 *     ...items...
 *     <div ref={bottomRef} />
 *   </div>
 *
 * `deps` — то, при изменении чего появляется новый элемент (например, число
 * сообщений и флаг загрузки). Решение «скроллить или нет» принимается ДО того,
 * как DOM обновит высоту: смотрим позицию скролла с прошлого кадра.
 */
export default function useStickyScroll(deps = [], threshold = 80) {
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  // По умолчанию считаем, что пользователь у нижнего края (свежий список).
  const atBottomRef = useRef(true)

  const computeAtBottom = useCallback((el) => {
    if (!el) return true
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance <= threshold
  }, [threshold])

  const onScroll = useCallback((e) => {
    atBottomRef.current = computeAtBottom(e.currentTarget)
  }, [computeAtBottom])

  // useLayoutEffect: реагируем на добавление элемента синхронно, до отрисовки,
  // чтобы плавно доскроллить, только если пользователь был у края.
  useLayoutEffect(() => {
    if (!atBottomRef.current) return
    const target = bottomRef.current
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'end' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { scrollRef, bottomRef, onScroll }
}
