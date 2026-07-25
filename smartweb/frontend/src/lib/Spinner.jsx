// Единый индикатор загрузки — тот самый крутящийся кружок, что используется на
// странице авторизации (кнопки «Входим…», «Отправляем…»). Вынесен в общий модуль,
// чтобы весь интерфейс (веб и админка) переиспользовал ОДИН компонент, а не плодил
// собственные варианты. Использует глобальный keyframe `spin` из styles/index.css.
//
// Вариант по умолчанию — светлый (белый) кружок для кнопок с акцентным фоном,
// как на кнопках авторизации. Проп `tone="accent"` даёт синий кружок на светлом
// фоне (для вторичных кнопок и инлайновых мест).
export default function Spinner({ size = 16, tone = 'light', style }) {
  const isLight = tone === 'light'
  return (
    <span
      role="status"
      aria-label="Загрузка"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid ${isLight ? 'rgba(255,255,255,0.45)' : 'var(--blue-100)'}`,
        borderTopColor: isLight ? '#fff' : 'var(--color-accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
