/*
 * Определение почтового сервиса по домену адреса (Задача 2.3), мобильная версия.
 * Зеркалит web/src/lib/mailProviders.js. Неизвестный домен -> нейтральная
 * кнопка «Открыть почту» без ссылки (url = null).
 */
// labelKey — ключ словаря переводов: подпись кнопки берётся на месте
// показа, поэтому меняется вместе с языком интерфейса.
type Provider = { labelKey: string; url: string | null };

const PROVIDERS: Record<string, Provider> = {
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
};

const NEUTRAL: Provider = { labelKey: 'ui.otkryt_pochtu', url: null };

export function mailProviderFor(email: string): Provider {
  const domain = String(email || '').split('@')[1]?.trim().toLowerCase();
  if (!domain) return NEUTRAL;
  return PROVIDERS[domain] || NEUTRAL;
}
