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
}

export function parseFeatureLock(err: any): FeatureLock | null {
  const detail = err?.response?.data?.detail ?? err?.response?.detail;
  if (detail && typeof detail === 'object' && detail.code === 'feature_locked') {
    return {
      feature: detail.feature,
      feature_label: detail.feature_label || 'Эта функция',
      message: detail.message ||
        `Функция «${detail.feature_label || 'Эта функция'}» доступна на другом тарифе.`,
    };
  }
  return null;
}

// Тарифы в приложении недоступны (по таблице) — ведём на веб-версию тарифов.
const WEB_PRICING_URL = 'https://app.oneononehq.com/?upgrade=1';

export function openPricing() {
  Linking.openURL(WEB_PRICING_URL).catch(() => {});
}
