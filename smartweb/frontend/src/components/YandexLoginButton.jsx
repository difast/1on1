import { useState } from 'react'
import { getYandexAuthUrl } from '../api/client'

/*
 * Кнопка «Войти с Яндекс ID» по брендовым гайдлайнам Yandex ID (официальная
 * формулировка; сокращать «Яндекс ID» нельзя).
 *
 * Разрешённые варианты оформления: фирменный красный (#FC3F1D, основной),
 * чёрный и белый. Логотип-бейдж всегда контрастен фону, вокруг него сохраняется
 * защитное поле, пропорции и радиус скругления не меняются. Текст — из
 * разрешённых формулировок; сокращать «Яндекс ID» нельзя.
 *
 * Клик получает URL страницы согласия у бэкенда (там же выпускается CSRF-state)
 * и уводит браузер на Яндекс. Возврат — на /auth/yandex/callback.
 */
const BRAND = {
  red:   { bg: '#FC3F1D', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#FC3F1D' },
  black: { bg: '#000000', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#000000' },
  white: { bg: '#FFFFFF', text: '#000000', border: '#DCDEE0',     badgeBg: '#FC3F1D', badgeFg: '#FFFFFF' },
}

export default function YandexLoginButton({ variant = 'red', onError, disabled = false }) {
  const [loading, setLoading] = useState(false)
  const c = BRAND[variant] || BRAND.red

  const start = async () => {
    if (loading || disabled) return
    setLoading(true)
    try {
      const { data } = await getYandexAuthUrl()
      if (!data?.url) throw new Error('no url')
      window.location.href = data.url
    } catch (err) {
      setLoading(false)
      const detail = err?.response?.data?.detail
      onError?.(detail?.message || (typeof detail === 'string' ? detail : 'Не удалось открыть вход через Яндекс ID'))
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading || disabled}
      aria-label="Войти с Яндекс ID"
      style={{
        width: '100%',
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,                       // защитное поле у логотипа
        padding: '0 16px',
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.text,
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        fontWeight: 500,
        lineHeight: '20px',
        cursor: loading || disabled ? 'default' : 'pointer',
        opacity: loading || disabled ? 0.7 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Логотип-бейдж Яндекса: фирменная «Я» в круге, пропорции не меняем */}
      <span
        aria-hidden="true"
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: c.badgeBg, color: c.badgeFg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, lineHeight: 1,
          fontFamily: "'YS Text', Arial, sans-serif",
          flexShrink: 0,
        }}
      >
        Я
      </span>
      {loading ? 'Открываем Яндекс ID...' : 'Войти с Яндекс ID'}
    </button>
  )
}
