// i18n-инфраструктура (Этап 6). Три локали: ru (основная, реальный текст),
// en и kz (заготовки — часть переведена, остальное падает на ru через
// fallbackLng). ПОЛНЫЙ перевод — отдельная задача; здесь только техническая
// готовность переключаться между языками централизованно (один файл на язык).
//
// Определение языка по умолчанию — по браузеру (navigator.language /
// Accept-Language), НЕ по IP/региону: язык и регион — разные измерения.
// После ручного выбора язык сохраняется (в профиль пользователя + localStorage),
// чтобы не определять заново при следующем визите.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ru from './locales/ru.json'
import en from './locales/en.json'
import kz from './locales/kz.json'

export const SUPPORTED_LANGS = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'kz', label: 'Қазақша' },
]

export const LANG_STORAGE_KEY = 'app_lang'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
      kz: { translation: kz },
    },
    supportedLngs: ['ru', 'en', 'kz'],
    fallbackLng: 'ru',            // недостающие ключи en/kz берутся из ru
    returnEmptyString: false,     // пустые заглушки kz тоже падают на ru
    nonExplicitSupportedLngs: true, // 'en-US' -> 'en'
    interpolation: { escapeValue: false },
    detection: {
      // Порядок: ручной выбор (localStorage) -> язык браузера.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

export default i18n
