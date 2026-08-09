import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../lib/Spinner'
import { getYandexAuthUrl } from '../api/client'

/*
 * Вход «с Яндекс ID» по брендовым гайдлайнам Yandex ID (официальная
 * формулировка; сокращать «Яндекс ID» нельзя).
 *
 * Два формата:
 *  - compact (по умолчанию на странице входа) — круглая иконка в общем ряду
 *    соц-входа: фирменный красный круг с белым бейджем «Я». Логотип-бейдж, его
 *    пропорции и защитное поле сохранены с прежней растянутой кнопки, просто
 *    перенесены в компактный формат.
 *  - полноширинная кнопка (variant red/black/white) — прежнее оформление,
 *    оставлено на случай переиспользования в других местах.
 *
 * Клик получает URL страницы согласия у бэкенда (там же выпускается CSRF-state)
 * и уводит браузер на Яндекс. Возврат — на /auth/yandex/callback. Логика входа
 * в обоих форматах одна и та же — компактный вид не влияет на функциональность.
 */
const VARIANT_CLASS = {
  red: '',
  black: 'btn-yandex-black',
  white: 'btn-yandex-white',
}

export default function YandexLoginButton({ variant = 'red', onError, disabled = false, compact = false }) {
  const { t } = useTranslation()
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
      onError?.(detail?.message || (typeof detail === 'string' ? detail : t('auth.yandexOpenFailed')))
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={loading || disabled}
        aria-label={t('auth.yandex')}
        aria-busy={loading || undefined}
        title={t('auth.yandex')}
        className="social-icon social-icon-yandex"
      >
        {loading
          ? <Spinner />
          : <span className="social-badge-ya" aria-hidden="true">Я</span>}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading || disabled}
      aria-label={t('auth.yandex')}
      aria-busy={loading || undefined}
      className={`btn btn-yandex ${VARIANT_CLASS[variant] || ''}`.trim()}
      style={{
        width: '100%',
        minHeight: 44,
        padding: '0 20px',
        fontSize: 15,
        gap: 10,
      }}
    >
      <span className="btn-yandex-badge" aria-hidden="true">Я</span>
      {loading ? (<><Spinner /> {t('auth.yandexOpening')}</>) : t('auth.yandex')}
    </button>
  )
}
