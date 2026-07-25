/*
 * Мягкие тарифные уведомления (Задача 3).
 *
 * Бэкенд на недоступную по тарифу функцию отвечает 402 со структурированным
 * detail: { code: 'feature_locked', feature, feature_label, message,
 *           min_plan, min_plan_name, trial_locked?, coming_soon? }.
 * min_plan — МИНИМАЛЬНЫЙ тариф, на котором функция появляется (Start / Team /
 * Business / Enterprise); сообщение бэкенда уже называет его явно.
 * Здесь — распознавание такого ответа и единый текст, чтобы вместо технической
 * ошибки показать понятное сообщение со ссылкой на тарифы.
 */

// Вернуть { feature, feature_label, message, min_plan, ... } если ошибка —
// тарифное ограничение, иначе null.
export function parseFeatureLock(err) {
  const detail = err?.response?.data?.detail
  if (detail && typeof detail === 'object' && detail.code === 'feature_locked') {
    return {
      feature: detail.feature,
      feature_label: detail.feature_label || 'Эта функция',
      min_plan: detail.min_plan || null,
      min_plan_name: detail.min_plan_name || null,
      trial_locked: !!detail.trial_locked,
      coming_soon: !!detail.coming_soon,
      message: detail.message || featureLockMessage(detail.feature_label, detail.min_plan_name),
    }
  }
  return null
}

// Нейтральный текст со ссылкой-подсказкой (используется, когда нет message).
// Если известен минимальный тариф — называем его, а не «другой тариф».
export function featureLockMessage(featureLabel, minPlanName) {
  const label = featureLabel || 'Эта функция'
  if (minPlanName) {
    return `Функция «${label}» доступна на тарифе ${minPlanName}. Повысьте тариф, чтобы использовать её.`
  }
  return `Функция «${label}» доступна на другом тарифе. Повысьте тариф, чтобы использовать её.`
}

// Открыть страницу тарифов («Мой тариф») — тот же путь, что из лендинга.
// По умолчанию ведём на Team: самый частый минимальный тариф для платных функций.
export function openPricing(plan = 'team') {
  window.location.href = `/?upgrade=1&plan=${plan}`
}
