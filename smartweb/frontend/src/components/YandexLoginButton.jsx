import { useState } from 'react'
import Spinner from '../lib/Spinner'
import { getYandexAuthUrl } from '../api/client'

/*
 * Кнопка «Войти с Яндекс ID» по брендовым гайдлайнам Yandex ID (официальная
 * формулировка; сокращать «Яндекс ID» нельзя).
 *
 * Разрешённые варианты оформления: фирменный красный (основной), чёрный и
 * белый — задаются классами .btn-yandex* в styles/index.css. Логотип-бейдж,
 * его пропорции, радиус и защитное поле не меняются. Геометрия и состояния
 * наведения/нажатия берутся из общего класса .btn, поэтому кнопка совпадает по
 * высоте, скруглению и поведению с основной кнопкой входа на этой же странице.
 *
 * Клик получает URL страницы согласия у бэкенда (там же выпускается CSRF-state)
 * и уводит браузер на Яндекс. Возврат — на /auth/yandex/callback.
 */
const VARIANT_CLASS = {
  red: '',
  black: 'btn-yandex-black',
  white: 'btn-yandex-white',
}

export default function YandexLoginButton({ variant = 'red', onError, disabled = false }) {
  const [loading, setLoading] = useState(false)

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
      aria-busy={loading || undefined}
      className={`btn btn-yandex ${VARIANT_CLASS[variant] || ''}`.trim()}
      style={{
        // Та же высота, ширина и кегль, что у основной кнопки входа на этой
        // странице. Защитное поле вокруг логотипа — gap 10 плюс отступ 20 до
        // края кнопки (не меньше половины высоты бейджа).
        width: '100%',
        minHeight: 44,
        padding: '0 20px',
        fontSize: 15,
        gap: 10,
      }}
    >
      <span className="btn-yandex-badge" aria-hidden="true">Я</span>
      {loading ? (<><Spinner /> Открываем Яндекс ID...</>) : 'Войти с Яндекс ID'}
    </button>
  )
}
