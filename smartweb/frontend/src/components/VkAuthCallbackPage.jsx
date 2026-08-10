import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setToken } from '../lib/auth'
import { getVkAuthConfig, completeVkAuth } from '../api/client'
import { renderVkOneTap } from '../lib/vkid'

/*
 * Страница /auth/vk/callback — зарегистрированный redirect URI приложения VK ID.
 *
 * Две роли:
 *  1) Мост для мобильного приложения. Приложение открывает этот адрес во
 *     встроенном браузере с меткой ?platform=mobile. Здесь монтируется виджет
 *     VK ID (One Tap + QR); при успехе code/device_id уходят на бэкенд
 *     (POST /auth/vk/callback, обмен по client_secret), а бэкенд возвращает наш
 *     JWT и адрес возврата в приложение. Страница перебрасывает результат в
 *     приложение по его схеме oneonone://auth/vk/callback?token=...&status=...
 *  2) Резервный веб-поток: если VK когда-то вернётся сюда полноценным
 *     редиректом с ?code=&device_id= (не Callback-режим), обмениваем код и,
 *     в зависимости от метки платформы, либо входим в вебе, либо уводим в
 *     приложение.
 *
 * Основной веб-вход через VK ID идёт НЕ здесь, а в модалке на странице входа
 * (VkLoginButton): там виджет работает в responseMode Callback без редиректа.
 */
export default function VkAuthCallbackPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('loading')  // loading | widget | toApp | error
  const [message, setMessage] = useState('')
  const [appLink, setAppLink] = useState('')
  const containerRef = useRef(null)
  const doneRef = useRef(false)

  const params = new URLSearchParams(window.location.search)
  const isMobile = (params.get('platform') || '') === 'mobile'
  const urlCode = params.get('code')
  const urlDeviceId = params.get('device_id')
  const providerError = params.get('error')

  // ВАЖНО. В веб-потоке One Tap (responseMode Callback) VK ID SDK сам грузит наш
  // redirectUrl (/auth/vk/callback?code=...) в СВОЁМ iframe и читает код прямо
  // из его URL (адрес того же домена). Если бы наш SPA в этом iframe отработал
  // как обычно — сделал POST на бэкенд (израсходовав одноразовый код) и ушёл на
  // '/', — SDK не успел бы прочитать код и падал бы с «timeout / не загрузился
  // iframe». Поэтому внутри iframe НИЧЕГО не делаем: пусть родительское окно
  // (его SDK) само завершит вход. Наша логика нужна только на верхнем уровне —
  // это мостовой поток приложения и резервный редирект.
  const inFrame = (() => { try { return window.self !== window.top } catch { return true } })()

  // Отправка code/device_id на бэкенд и обработка ответа (общий код для обоих
  // сценариев). Для мобильного — переброс в приложение по deep-link с токеном.
  const finish = async (payload) => {
    try {
      const { data } = await completeVkAuth({
        ...payload,
        platform: isMobile ? 'mobile' : 'web',
      })
      if (isMobile) {
        const base = data?.mobile_redirect || 'oneonone://auth/vk/callback'
        const target = `${base}?token=${encodeURIComponent(data?.token || '')}&status=${encodeURIComponent(data?.status || '')}`
        setAppLink(target); setStatus('toApp')
        window.location.href = target
        return
      }
      if (data?.token) setToken(data.token)
      if (data?.user) localStorage.setItem('smart_user', JSON.stringify(data.user))
      window.location.replace('/')
    } catch (err) {
      const detail = err?.response?.data?.detail
      setStatus('error')
      setMessage(detail?.message || (typeof detail === 'string' ? detail : t('auth.vkFailed')))
    }
  }

  useEffect(() => {
    if (inFrame) return  // внутри iframe VK ID SDK — не мешаем ему читать код
    if (doneRef.current) return
    if (providerError) { doneRef.current = true; setStatus('error'); setMessage(t('auth.vkFailed')); return }

    // Резервный редирект-поток: код уже в URL (обмен сделает бэкенд).
    if (urlCode && urlDeviceId) { doneRef.current = true; finish({ code: urlCode, device_id: urlDeviceId }); return }

    // Мостовой поток приложения: монтируем виджет и ждём LOGIN_SUCCESS.
    if (isMobile) {
      doneRef.current = true
      getVkAuthConfig()
        .then(({ data }) => {
          if (!data?.enabled) { setStatus('error'); setMessage(t('auth.vkFailed')); return }
          setStatus('widget')
          // Контейнер появляется в разметке при status==='widget'; ждём кадр.
          requestAnimationFrame(() => {
            if (!containerRef.current) return
            renderVkOneTap(
              containerRef.current,
              { appId: data.app_id, redirectUrl: data.redirect_url, scope: data.scope, idDomain: data.id_domain },
              (res) => finish(res),  // res = { access_token, user_id } — обмен уже сделан на клиенте
              () => { setStatus('error'); setMessage(t('auth.vkFailed')) },
            ).catch(() => { setStatus('error'); setMessage(t('auth.vkFailed')) })
          })
        })
        .catch(() => { setStatus('error'); setMessage(t('auth.vkFailed')) })
      return
    }

    // Ни кода, ни мобильной метки — открыли адрес напрямую. Возвращаем на вход.
    setStatus('error'); setMessage(t('auth.missingParams'))
  }, [])

  // Внутри iframe VK ID SDK не рисуем свой UI и ничего не делаем — отдаём
  // управление родительскому окну, которое само прочитает код и завершит вход.
  if (inFrame) return null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'var(--font-sans)' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 28, textAlign: 'center' }}>
        <span className="logo" style={{ fontSize: 24 }}>OneOn<span className="accent">One</span></span>
        <div style={{ marginTop: 22 }}>
          {status === 'loading' && (
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('auth.yandexFinishing')}</p>
          )}
          {status === 'widget' && (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>{t('auth.vk')}</p>
              <div ref={containerRef} className="vk-widget-slot" />
            </>
          )}
          {status === 'toApp' && (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>{t('auth.yandexReturningToApp')}</p>
              <a href={appLink} className="btn btn-accent" style={{ width: '100%', display: 'inline-block' }}>
                {t('auth.yandexOpenApp')}
              </a>
            </>
          )}
          {status === 'error' && (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>{t('auth.yandexFailedTitle')}</h2>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>{message}</p>
              <button onClick={() => { window.location.href = '/' }} className="btn btn-accent" style={{ width: '100%' }}>
                {t('auth.backToLogin')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
