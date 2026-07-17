// Лёгкий i18n без сторонних зависимостей (чтобы уезжало по OTA, без пересборки).
// Три локали: ru (основная), en, kz (частичная — недостающие ключи падают на ru).
// Язык по умолчанию — из системной локали устройства (Intl), затем — сохранённый
// выбор пользователя (AsyncStorage). Хранилище — модульное, подписка через
// useSyncExternalStore, поэтому не нужен провайдер в корне приложения.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type Lang = 'ru' | 'en' | 'kz';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'kz', label: 'Қазақша' },
];

const STORAGE_KEY = 'app_lang';

const DICT: Record<Lang, Record<string, string>> = {
  ru: {
    'profile.title': 'Профиль',
    'settings.title': 'Настройки',
    'settings.changePassword': 'Сменить пароль',
    'settings.darkTheme': 'Тёмная тема',
    'settings.hints': 'Подсказки Пита',
    'settings.linkTelegram': 'Привязать Telegram',
    'settings.language': 'Язык',
    'help.title': 'Помощь',
    'help.analytics': 'Аналитика',
    'help.notifications': 'Уведомления',
    'help.assistant': 'Пит',
    'help.support': 'Поддержка',
    'help.documents': 'Документы',
    'account.logout': 'Выйти',
    'account.delete': 'Удалить аккаунт',
    'account.deleting': 'Удаление...',
    'role.title': 'Роль',
    'role.lead': 'Тимлид',
    'role.member': 'Участник команды',
  },
  en: {
    'profile.title': 'Profile',
    'settings.title': 'Settings',
    'settings.changePassword': 'Change password',
    'settings.darkTheme': 'Dark theme',
    'settings.hints': 'Pit hints',
    'settings.linkTelegram': 'Link Telegram',
    'settings.language': 'Language',
    'help.title': 'Help',
    'help.analytics': 'Analytics',
    'help.notifications': 'Notifications',
    'help.assistant': 'Pit',
    'help.support': 'Support',
    'help.documents': 'Documents',
    'account.logout': 'Log out',
    'account.delete': 'Delete account',
    'account.deleting': 'Deleting...',
    'role.title': 'Role',
    'role.lead': 'Team lead',
    'role.member': 'Team member',
  },
  kz: {
    'profile.title': 'Профиль',
    'settings.title': 'Баптаулар',
    'settings.changePassword': 'Құпиясөзді өзгерту',
    'settings.darkTheme': 'Қараңғы тақырып',
    'settings.hints': 'Пит кеңестері',
    'settings.linkTelegram': 'Telegram байланыстыру',
    'settings.language': 'Тіл',
    'help.title': 'Көмек',
    'help.support': 'Қолдау',
    'help.documents': 'Құжаттар',
    'account.logout': 'Шығу',
    'account.delete': 'Аккаунтты жою',
    'role.title': 'Рөл',
    'role.lead': 'Тимлид',
    'role.member': 'Қатысушы',
  },
};

function detect(): Lang {
  try {
    const loc = (Intl as any)?.DateTimeFormat?.().resolvedOptions?.().locale?.toLowerCase() || '';
    if (loc.startsWith('kk') || loc.startsWith('kz')) return 'kz';
    if (loc.startsWith('en')) return 'en';
    if (loc.startsWith('ru')) return 'ru';
  } catch {
    /* no-op */
  }
  return 'ru';
}

let current: Lang = detect();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Асинхронно подхватываем сохранённый выбор.
AsyncStorage.getItem(STORAGE_KEY)
  .then((v) => {
    if (v === 'ru' || v === 'en' || v === 'kz') {
      current = v;
      emit();
    }
  })
  .catch(() => {});

export function getLang(): Lang {
  return current;
}

export function setLang(code: Lang): void {
  if (code === current) return;
  current = code;
  AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  emit();
}

export function translate(key: string, lang: Lang = current): string {
  return DICT[lang]?.[key] ?? DICT.ru[key] ?? key;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return {
    lang,
    setLang,
    t: (key: string) => translate(key, lang),
  };
}
