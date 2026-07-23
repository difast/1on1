/*
 * Мягкие тарифные уведомления (Задача 3).
 *
 * Бэкенд на недоступную по тарифу функцию отвечает 402 со структурированным
 * detail: { code: 'feature_locked', feature, feature_label, message }.
 * Здесь — распознавание такого ответа и единый текст, чтобы вместо технической
 * ошибки показать понятное сообщение со ссылкой на тарифы.
 */

// Вернуть { feature, feature_label, message } если ошибка — тарифное
// ограничение, иначе null.
export function parseFeatureLock(err) {
  const detail = err?.response?.data?.detail
  if (detail && typeof detail === 'object' && detail.code === 'feature_locked') {
    return {
      feature: detail.feature,
      feature_label: detail.feature_label || 'Эта функция',
      message: detail.message ||
        `Функция «${detail.feature_label || 'Эта функция'}» доступна на другом тарифе.`,
    }
  }
  return null
}

// Нейтральный текст со ссылкой-подсказкой (используется, когда нет message).
export function featureLockMessage(featureLabel) {
  return `Функция «${featureLabel}» доступна на другом тарифе. ` +
    `Повысьте тариф, чтобы использовать ${String(featureLabel).toLowerCase()}.`
}

// Открыть страницу тарифов («Мой тариф») — тот же путь, что из лендинга.
export function openPricing(plan = 'team') {
  window.location.href = `/?upgrade=1&plan=${plan}`
}
