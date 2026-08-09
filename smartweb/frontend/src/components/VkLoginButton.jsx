import { useTranslation } from 'react-i18next'

/*
 * Вход через VK ID — пока ВИЗУАЛЬНАЯ ЗАГЛУШКА. Реальная OAuth-интеграция —
 * отдельная будущая задача. Иконка присутствует в общем ряду соц-входа, чтобы
 * пользователь видел планируемый способ, но помечена как «скоро» (приглушение +
 * бейдж-часики) и по клику сообщает «Скоро будет доступно» — не ведёт в никуда
 * молча и не выглядит как рабочая кнопка.
 *
 * Вёрстка уже финальная: когда появится реальная логика, достаточно заменить
 * обработчик onClick на запуск OAuth (по аналогии с YandexLoginButton) и снять
 * флаг `soon` — переделывать разметку/стили не потребуется.
 */
const VkMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M13.16 16.66c-5.48 0-8.86-3.76-9-10.02h2.75c.1 4.6 2.13 6.55 3.74 6.95V6.64h2.59v3.97c1.59-.17 3.26-1.97 3.82-3.97h2.59c-.43 2.47-2.23 4.27-3.52 5.02 1.29.6 3.34 2.17 4.12 5h-2.85c-.61-1.9-2.13-3.36-4.15-3.56v3.56h-.31z"
      fill="#FFFFFF"
    />
  </svg>
)

// Часики-бейдж «скоро».
const SoonBadge = () => (
  <span className="social-soon-badge" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--color-text-muted)" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

export default function VkLoginButton({ onSoon }) {
  const { t } = useTranslation()

  const handleClick = () => {
    // Пока способа нет — показываем понятное сообщение «скоро».
    onSoon?.(t('auth.vkSoon'))
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${t('auth.vk')} — ${t('auth.soon')}`}
      title={`${t('auth.vk')} — ${t('auth.soon')}`}
      aria-disabled="true"
      className="social-icon social-icon-vk social-icon-soon"
    >
      <VkMark />
      <SoonBadge />
    </button>
  )
}
