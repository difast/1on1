// Рендер официального виджета VK ID SDK (One Tap + QR).
//
// SDK @vkid/sdk подключён как npm-зависимость и попадает в НАШ бандл, а не
// грузится со стороннего CDN (unpkg). Раньше скрипт тянулся с unpkg.com, который
// в РФ часто недоступен/блокируется, из-за чего виджет вообще не загружался
// («Не удалось загрузить VK ID»). Теперь внешней сетевой зависимости для загрузки
// SDK нет — он отдаётся с нашего же домена вместе с приложением.
//
// Виджет сам проводит авторизацию (PKCE на клиенте) и в событии LOGIN_SUCCESS
// отдаёт одноразовый code и device_id. Мы НЕ обмениваем код в браузере: секрет
// приложения живёт только на бэкенде, поэтому code/device_id уходят на
// POST /api/auth/vk/callback, где обмен и происходит.
import * as VKID from '@vkid/sdk'

// Вытащить читаемое сообщение из ошибки VK ID SDK (форма разнится по версиям:
// { code, text }, { error, error_description }, вложенный .error, Error).
export function describeVkError(e) {
  if (!e) return ''
  if (typeof e === 'string') return e
  const parts = []
  const push = (v) => { if ((typeof v === 'string' && v) || typeof v === 'number') parts.push(String(v)) }
  push(e.error_description); push(e.error_reason); push(e.error)
  push(e.text); push(e.type); push(e.message)
  if (e.code !== undefined) push(`code=${e.code}`)
  if (e.error && typeof e.error === 'object') { push(e.error.error_description); push(e.error.error) }
  if (e.details) { try { push(JSON.stringify(e.details).slice(0, 120)) } catch { /* no-op */ } }
  if (!parts.length) { try { parts.push(JSON.stringify(e)) } catch { /* no-op */ } }
  return parts.filter(Boolean).slice(0, 3).join(' · ')
}

/*
 * Инициализировать SDK и отрисовать One Tap в контейнер.
 *   cfg: { appId, redirectUrl, scope }
 *   onCode({ code, device_id })  — успех авторизации (обмен делаем на бэке)
 *   onError(err)
 * Возвращает функция очистки (снимает виджет).
 */
export async function renderVkOneTap(container, cfg, onCode, onError) {
  const initCfg = {
    app: Number(cfg.appId),
    redirectUrl: cfg.redirectUrl,
    responseMode: VKID.ConfigResponseMode.Callback,
    source: VKID.ConfigSource.LOWCODE,
    // Скоупы: email + доступ к имени/фамилии/фото (имя/аватар VK ID отдаёт в
    // user_info по базовому доступу, отдельного скоупа не требуют).
    scope: cfg.scope || 'email',
  }
  // Домен VK ID (id.vk.ru по умолчанию у SDK). Переопределяем на тот, что задан
  // на бэкенде, чтобы виджет и серверный обмен кода были на одном домене.
  if (cfg.idDomain) initCfg.__vkidDomain = cfg.idDomain
  VKID.Config.init(initCfg)
  const oneTap = new VKID.OneTap()
  oneTap
    .render({ container, showAlternativeLogin: true })
    .on(VKID.WidgetEvents.ERROR, (e) => {
      // Логируем полную ошибку виджета VK ID — она видна в консоли и помогает
      // отличить сбой на стороне SDK/VK от ошибки нашего бэкенда.
      try { console.error('[VK ID] widget error', e) } catch { /* no-op */ }
      onError?.(e)
    })
    .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, (payload) => {
      // Обмен кода на токен делаем СРАЗУ в браузере официальным методом SDK.
      // VK ID здесь — публичный клиент с PKCE: code_verifier лежит в cookie на
      // нашем домене и серверу недоступен, поэтому обмен возможен только на
      // клиенте. Секрет приложения при этом НЕ участвует. Полученный access_token
      // уходит на наш бэкенд — он сам сходит в user_info и выдаст наш JWT.
      VKID.Auth.exchangeCode(payload.code, payload.device_id)
        .then((tokens) => {
          onCode?.({ access_token: tokens.access_token, user_id: tokens.user_id })
        })
        .catch((e) => {
          try { console.error('[VK ID] exchangeCode error', e) } catch { /* no-op */ }
          onError?.(e)
        })
    })
  return () => { try { oneTap.close?.() } catch { /* no-op */ } }
}
