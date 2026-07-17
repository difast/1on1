// Контекст «поверхности» (surface) — на каком носителе рендерится UI.
// Позволяет ОДНИМ И ТЕМ ЖЕ компонентам скрывать/показывать части интерфейса по
// таблице разделения функционала, не создавая копий. По умолчанию — обычный веб.
//
// Значения: 'web' (полный функционал) | 'telegram' (Mini App, урезанный набор).
// Мобильное приложение — отдельный RN-кодбейз, здесь не участвует.
import { createContext, useContext } from 'react'

export const SurfaceContext = createContext('web')

export function useSurface() {
  return useContext(SurfaceContext)
}

// Удобные хелперы для читаемых условий в компонентах.
export function useIsTelegram() {
  return useContext(SurfaceContext) === 'telegram'
}
