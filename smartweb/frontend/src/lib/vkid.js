// Загрузка и рендер официального виджета VK ID SDK (One Tap + QR).
//
// Виджет сам проводит авторизацию (PKCE на клиенте) и в событии LOGIN_SUCCESS
// отдаёт одноразовый code и device_id. Мы НЕ обмениваем код в браузере
// (VKID.Auth.exchangeCode из примера VK не используем): секрет приложения живёт
// только на бэкенде, поэтому code/device_id уходят на POST /api/auth/vk/callback,
// где обмен и происходит.

let _sdkPromise = null

// Пиннинг мажорной версии 2.x (как в примере VK: @<3.0.0). unpkg сам резолвит
// в последнюю совместимую сборку.
const SDK_URL = 'https://unpkg.com/@vkid/sdk@2/dist-sdk/umd/index.js'

export function loadVkidSdk() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.VKIDSDK) return Promise.resolve(window.VKIDSDK)
  if (_sdkPromise) return _sdkPromise
  _sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    s.onload = () => {
      if (window.VKIDSDK) resolve(window.VKIDSDK)
      else { _sdkPromise = null; reject(new Error('vkid sdk missing after load')) }
    }
    s.onerror = () => { _sdkPromise = null; reject(new Error('vkid sdk failed to load')) }
    document.head.appendChild(s)
  })
  return _sdkPromise
}

/*
 * Инициализировать SDK и отрисовать One Tap в контейнер.
 *   cfg: { appId, redirectUrl, scope }
 *   onCode({ code, device_id })  — успех авторизации (обмен делаем на бэке)
 *   onError(err)
 * Возвращает функция очистки (снимает виджет).
 */
export async function renderVkOneTap(container, cfg, onCode, onError) {
  const VKID = await loadVkidSdk()
  VKID.Config.init({
    app: Number(cfg.appId),
    redirectUrl: cfg.redirectUrl,
    responseMode: VKID.ConfigResponseMode.Callback,
    source: VKID.ConfigSource.LOWCODE,
    // Скоупы: email + доступ к имени/фамилии/фото (имя/аватар VK ID отдаёт в
    // user_info по базовому доступу, отдельного скоупа не требуют).
    scope: cfg.scope || 'email',
  })
  const oneTap = new VKID.OneTap()
  oneTap
    .render({ container, showAlternativeLogin: true })
    .on(VKID.WidgetEvents.ERROR, (e) => onError?.(e))
    .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, (payload) => {
      onCode?.({ code: payload.code, device_id: payload.device_id })
    })
  return () => { try { oneTap.close?.() } catch { /* no-op */ } }
}
