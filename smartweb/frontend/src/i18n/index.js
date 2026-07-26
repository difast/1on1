// i18n-инфраструктура. Три локали: ru (основная), en, kz.
//
// Определение языка по умолчанию — по браузеру (navigator.language /
// Accept-Language), НЕ по IP/региону: язык и регион — разные измерения.
// Политика: русский браузер -> ru, казахский (kk/kz) -> kz, любой другой -> en.
//
// Приоритет явного выбора: как только пользователь выбрал язык в переключателе,
// выбор кладётся в ОТДЕЛЬНЫЙ ключ localStorage (app_lang) и в профиль на
// бэкенде. Автоопределение с этого момента не применяется никогда — даже если
// пользователь сменил язык браузера. Поэтому детектор языка браузера читает
// только собственный кэш и НЕ пишет в ключ явного выбора.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './locales/ru.json'
import en from './locales/en.json'
import kz from './locales/kz.json'

export const SUPPORTED_LANGS = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'kz', label: 'Қазақша' },
]

export const LANG_STORAGE_KEY = 'app_lang'

/** Язык браузера -> поддерживаемая локаль. Всё, кроме ru и kk/kz, даёт en. */
export function detectBrowserLang() {
  const raw = []
  try {
    if (Array.isArray(navigator?.languages)) raw.push(...navigator.languages)
    if (navigator?.language) raw.push(navigator.language)
  } catch { /* SSR / нет navigator */ }
  for (const item of raw) {
    const tag = String(item || '').toLowerCase()
    // Казахский в BCP-47 — kk (kk-KZ); 'kz' встречается как код страны и в
    // нашем собственном хранилище, поэтому принимаем оба написания.
    if (tag.startsWith('kk') || tag.startsWith('kz')) return 'kz'
    if (tag.startsWith('ru')) return 'ru'
    if (tag.startsWith('en')) return 'en'
  }
  // Любой другой язык браузера — английский, а не русский.
  return raw.length ? 'en' : 'ru'
}

/** Явно выбранный пользователем язык (или null, если выбора ещё не было). */
export function getExplicitLang() {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY)
    return SUPPORTED_LANGS.some(l => l.code === v) ? v : null
  } catch { return null }
}

/** Сохранить явный выбор пользователя (приоритетнее автоопределения). */
export function setExplicitLang(code) {
  try { localStorage.setItem(LANG_STORAGE_KEY, code) } catch { /* приватный режим */ }
}

const initialLang = getExplicitLang() || detectBrowserLang()

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
      kz: { translation: kz },
    },
    lng: initialLang,
    supportedLngs: ['ru', 'en', 'kz'],
    fallbackLng: 'ru',            // недостающие ключи en/kz берутся из ru
    returnEmptyString: false,     // пустые заглушки тоже падают на ru
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    // Плюрализация — средствами i18next (суффиксы _one/_few/_many/_other):
    // ru даёт четыре формы, en — две, kz — одну (казахский не изменяет
    // существительное после числительного, поэтому _one и _other совпадают).
  })

export default i18n
