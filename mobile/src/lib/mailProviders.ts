/*
 * Определение почтового сервиса по домену адреса (Задача 2.3), мобильная версия.
 * Зеркалит web/src/lib/mailProviders.js. Неизвестный домен -> нейтральная
 * кнопка «Открыть почту» без ссылки (url = null).
 */
type Provider = { label: string; url: string | null };

const PROVIDERS: Record<string, Provider> = {
  'gmail.com': { label: 'Открыть Gmail', url: 'https://mail.google.com/' },
  'googlemail.com': { label: 'Открыть Gmail', url: 'https://mail.google.com/' },
  'yandex.ru': { label: 'Открыть Яндекс Почту', url: 'https://mail.yandex.ru/' },
  'yandex.com': { label: 'Открыть Яндекс Почту', url: 'https://mail.yandex.ru/' },
  'ya.ru': { label: 'Открыть Яндекс Почту', url: 'https://mail.yandex.ru/' },
  'mail.ru': { label: 'Открыть Mail.ru', url: 'https://e.mail.ru/' },
  'bk.ru': { label: 'Открыть Mail.ru', url: 'https://e.mail.ru/' },
  'inbox.ru': { label: 'Открыть Mail.ru', url: 'https://e.mail.ru/' },
  'list.ru': { label: 'Открыть Mail.ru', url: 'https://e.mail.ru/' },
  'outlook.com': { label: 'Открыть Outlook', url: 'https://outlook.live.com/mail/' },
  'hotmail.com': { label: 'Открыть Outlook', url: 'https://outlook.live.com/mail/' },
  'live.com': { label: 'Открыть Outlook', url: 'https://outlook.live.com/mail/' },
  'icloud.com': { label: 'Открыть iCloud Mail', url: 'https://www.icloud.com/mail/' },
  'me.com': { label: 'Открыть iCloud Mail', url: 'https://www.icloud.com/mail/' },
  'proton.me': { label: 'Открыть Proton Mail', url: 'https://mail.proton.me/' },
  'protonmail.com': { label: 'Открыть Proton Mail', url: 'https://mail.proton.me/' },
};

const NEUTRAL: Provider = { label: 'Открыть почту', url: null };

export function mailProviderFor(email: string): Provider {
  const domain = String(email || '').split('@')[1]?.trim().toLowerCase();
  if (!domain) return NEUTRAL;
  return PROVIDERS[domain] || NEUTRAL;
}
