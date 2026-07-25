import { Linking } from 'react-native';

/*
 * Мягкие тарифные уведомления в приложении.
 *
 * Бэкенд на недоступную по тарифу функцию отвечает 402 со структурированным
 * detail: { code: 'feature_locked', feature, feature_label, message }. Клиент
 * (lib/api req) кладёт тело в err.response.data. Здесь — распознавание, чтобы
 * показать понятное сообщение, а не техническую ошибку.
 */
export interface FeatureLock {
  feature: string;
  feature_label: string;
  message: string;
  min_plan: string | null;       // минимальный тариф: start | team | business | enterprise
  min_plan_name: string | null;  // как показывать пользователю: Start / Team / ...
  trial_locked: boolean;         // закрыто на время пробного периода (Team: ONE AI, Развитие)
  coming_soon: boolean;          // функция пока не работает (автотранскрипция)
}

export function parseFeatureLock(err: any): FeatureLock | null {
  const detail = err?.response?.data?.detail ?? err?.response?.detail;
  if (detail && typeof detail === 'object' && detail.code === 'feature_locked') {
    const minPlanName = detail.min_plan_name || null;
    return {
      feature: detail.feature,
      feature_label: detail.feature_label || 'Эта функция',
      min_plan: detail.min_plan || null,
      min_plan_name: minPlanName,
      trial_locked: !!detail.trial_locked,
      coming_soon: !!detail.coming_soon,
      message: detail.message || (minPlanName
        ? `Функция «${detail.feature_label || 'Эта функция'}» доступна на тарифе ${minPlanName}.`
        : `Функция «${detail.feature_label || 'Эта функция'}» доступна на другом тарифе.`),
    };
  }
  return null;
}

// Тарифы в приложении недоступны (по таблице) — ведём на веб-версию тарифов.
const WEB_PRICING_URL = 'https://app.oneononehq.com/?upgrade=1';

export function openPricing() {
  Linking.openURL(WEB_PRICING_URL).catch(() => {});
}
