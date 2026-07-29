/*
 * Определение почтового сервиса по домену адреса (Задача 2.3).
 *
 * По домену введённого email подбираем ссылку «открыть почту» и подпись кнопки
 * с названием сервиса. Неизвестный домен -> нейтральная кнопка «Открыть почту»
 * без ссылки на конкретный сервис (url = null).
 */
const PROVIDERS = {
  'gmail.com': { labelKey: 'ui.otkryt_gmail', url: 'https://mail.google.com/' },
  'googlemail.com': { labelKey: 'ui.otkryt_gmail', url: 'https://mail.google.com/' },
  'yandex.ru': { labelKey: 'ui.otkryt_yandeks_pochtu', url: 'https://mail.yandex.ru/' },
  'yandex.com': { labelKey: 'ui.otkryt_yandeks_pochtu', url: 'https://mail.yandex.ru/' },
  'ya.ru': { labelKey: 'ui.otkryt_yandeks_pochtu', url: 'https://mail.yandex.ru/' },
  'mail.ru': { labelKey: 'ui.otkryt_mail_ru', url: 'https://e.mail.ru/' },
  'bk.ru': { labelKey: 'ui.otkryt_mail_ru', url: 'https://e.mail.ru/' },
  'inbox.ru': { labelKey: 'ui.otkryt_mail_ru', url: 'https://e.mail.ru/' },
  'list.ru': { labelKey: 'ui.otkryt_mail_ru', url: 'https://e.mail.ru/' },
  'outlook.com': { labelKey: 'ui.otkryt_outlook', url: 'https://outlook.live.com/mail/' },
  'hotmail.com': { labelKey: 'ui.otkryt_outlook', url: 'https://outlook.live.com/mail/' },
  'live.com': { labelKey: 'ui.otkryt_outlook', url: 'https://outlook.live.com/mail/' },
  'icloud.com': { labelKey: 'ui.otkryt_icloud_mail', url: 'https://www.icloud.com/mail/' },
  'me.com': { labelKey: 'ui.otkryt_icloud_mail', url: 'https://www.icloud.com/mail/' },
  'proton.me': { labelKey: 'ui.otkryt_proton_mail', url: 'https://mail.proton.me/' },
  'protonmail.com': { labelKey: 'ui.otkryt_proton_mail', url: 'https://mail.proton.me/' },
}

const NEUTRAL = { labelKey: 'ui.otkryt_pochtu', url: null }

export function mailProviderFor(email) {
  const domain = String(email || '').split('@')[1]?.trim().toLowerCase()
  if (!domain) return NEUTRAL
  return PROVIDERS[domain] || NEUTRAL
}
