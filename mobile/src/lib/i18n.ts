// Лёгкий i18n без сторонних зависимостей (чтобы уезжало по OTA, без пересборки).
// Три локали: ru (основная), en, kz. Словари — ТЕ ЖЕ файлы, что на вебе
// (src/i18n/locales/*.json, синхронизируются скриптом tools/sync-locales.sh),
// поэтому ключи и формулировки в приложении и в вебе совпадают.
//
// Поддерживается: вложенные ключи ('auth.submitLogin'), подстановка значений
// ({{count}}, {{name}}) и плюрализация с теми же суффиксами, что у i18next
// (_one/_few/_many/_other) — правила выбора формы свои для каждого языка.
//
// Язык: сохранённый выбор пользователя (AsyncStorage + профиль на бэкенде)
// имеет приоритет; если выбора не было — системная локаль устройства, где всё,
// кроме русского и казахского, даёт английский. Хранилище модульное, подписка
// через useSyncExternalStore, поэтому провайдер в корне приложения не нужен.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import ru from '../i18n/locales/ru.json';
import en from '../i18n/locales/en.json';
import kz from '../i18n/locales/kz.json';

export type Lang = 'ru' | 'en' | 'kz';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'kz', label: 'Қазақша' },
];

const STORAGE_KEY = 'app_lang';

type Dict = Record<string, unknown>;
const DICT: Record<Lang, Dict> = { ru, en, kz };

/** Системная локаль устройства -> поддерживаемый язык. */
function detect(): Lang {
  try {
    const loc = (Intl as any)?.DateTimeFormat?.().resolvedOptions?.().locale?.toLowerCase() || '';
    // Казахский в BCP-47 — kk (kk-KZ); 'kz' принимаем как код страны.
    if (loc.startsWith('kk') || loc.startsWith('kz')) return 'kz';
    if (loc.startsWith('ru')) return 'ru';
    // Любой другой язык устройства — английский, а не русский.
    if (loc) return 'en';
  } catch {
    /* no-op */
  }
  return 'ru';
}

let current: Lang = detect();
// Был ли язык выбран явно (пользователем или синхронизацией с профилем).
// Явный выбор автоопределение больше не перекрывает.
let explicit = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Асинхронно подхватываем сохранённый выбор.
AsyncStorage.getItem(STORAGE_KEY)
  .then((v) => {
    if (v === 'ru' || v === 'en' || v === 'kz') {
      current = v;
      explicit = true;
      emit();
    }
  })
  .catch(() => {});

export function getLang(): Lang {
  return current;
}

export function isExplicitLang(): boolean {
  return explicit;
}

export function setLang(code: Lang): void {
  explicit = true;
  if (code === current) return;
  current = code;
  AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  emit();
}

function lookup(dict: Dict, key: string): string | undefined {
  const parts = key.split('.');
  let node: unknown = dict;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Dict)[p];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Порядок форм множественного числа по правилам языка (как в i18next). */
function pluralSuffixes(lang: Lang, n: number): string[] {
  if (lang === 'ru') {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return ['_one', '_other'];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return ['_few', '_other'];
    return ['_many', '_other'];
  }
  // en: одна форма для 1, другая для остального.
  // kz: существительное после числительного не изменяется — форма одна,
  // поэтому _one и _other в казахском словаре совпадают.
  return n === 1 ? ['_one', '_other'] : ['_other', '_one'];
}

function interpolate(text: string, vars?: Record<string, unknown>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    vars[name] === undefined || vars[name] === null ? '' : String(vars[name]),
  );
}

export function translate(
  key: string,
  lang: Lang = current,
  vars?: Record<string, unknown>,
): string {
  // Недостающие ключи en/kz падают на ru — как fallbackLng на вебе.
  const dicts: Dict[] = lang === 'ru' ? [DICT.ru] : [DICT[lang], DICT.ru];
  const count = vars?.count;
  const candidates: string[] = [];
  if (typeof count === 'number') {
    for (const suf of pluralSuffixes(lang, count)) candidates.push(key + suf);
  }
  candidates.push(key);
  for (const dict of dicts) {
    for (const cand of candidates) {
      const hit = lookup(dict, cand);
      if (hit !== undefined) return interpolate(hit, vars);
    }
  }
  return key;
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
    t: (key: string, vars?: Record<string, unknown>) => translate(key, lang, vars),
  };
}
