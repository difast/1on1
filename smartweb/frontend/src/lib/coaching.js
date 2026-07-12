/*
 * Встроенный слой обучения управлению командой ("коучинг Пита").
 *
 * ЗАЧЕМ этот модуль, а не отдельный раздел "Обучение" в навигации:
 * позиционирование продукта — органайзер 1-на-1 встреч. Обучение менеджменту
 * должно помогать руководителю ПРЯМО В МОМЕНТЕ подготовки к встрече, а не жить
 * в параллельном образовательном модуле, за которым надо специально ходить.
 * Поэтому подсказки рождаются из реальных данных участника (статус каденции,
 * просроченные задачи, отсутствие истории встреч) и показываются у конкретного
 * поля повестки — там, где руководитель как раз думает, о чём говорить.
 *
 * Слой полностью опционален: если руководитель выключил подсказки в настройках,
 * продукт остаётся обычным органайзером встреч. Никаких эмодзи в текстах —
 * тон делового ассистента, а не развлекательного бота.
 */

const key = (userId) => `pit_coaching_${userId || 'anon'}`

// По умолчанию подсказки включены: для нового руководителя это и есть основная
// ценность "обучения в потоке". Тот, кому это мешает, выключает один раз — выбор
// запоминается пер-пользовательно, как и тема оформления.
export function coachingEnabled(userId) {
  try {
    const v = localStorage.getItem(key(userId))
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function setCoaching(userId, on) {
  try {
    localStorage.setItem(key(userId), on ? '1' : '0')
  } catch {}
  // Оповещаем открытые экраны, чтобы подсказки появлялись/исчезали сразу,
  // без перезагрузки страницы.
  try {
    window.dispatchEvent(new CustomEvent('pit-coaching-changed', { detail: { userId, on } }))
  } catch {}
}

function daysBetween(dateStr) {
  if (!dateStr) return null
  const diff = (Date.now() - new Date(dateStr).getTime()) / 86400000
  return Math.floor(diff)
}

/*
 * Возвращает контекстные подсказки к повестке конкретной встречи.
 * Каждая подсказка объясняет ПРИЧИНУ (что в данных навело на мысль) и даёт
 * готовую строку для повестки. Причина важна: руководитель учится замечать
 * сигналы сам, а не просто получает готовый ответ.
 *
 * Порядок — по убыванию значимости сигнала: сначала "нет встреч" и просрочки,
 * потом мягкие напоминания. Максимум три подсказки, чтобы не превращать поле
 * в стену текста.
 */
export function buildAgendaSuggestions({ member, tasks = [] } = {}) {
  if (!member) return []
  const out = []
  const name = (member.user_name || '').split(' ')[0] || 'участником'

  const openOverdue = (tasks || []).filter(t => {
    if (t.status === 'done' || t.completed) return false
    if (!t.due_date) return false
    return new Date(t.due_date) < new Date(new Date().toDateString())
  })

  const lastMeetingDays = daysBetween(member.last_meeting_date)
  const cadence = member.cadence_days || 14

  // 1. Первая встреча — истории ещё нет. Учим начинать 1-на-1 правильно.
  if (!member.last_meeting_date) {
    out.push({
      id: 'first-meeting',
      reason: 'Это первая встреча 1-на-1 — фундамент дальнейших отношений.',
      line: 'Договориться об ожиданиях, целях и комфортной частоте встреч',
    })
  }

  // 2. Встреча давно просрочена (красный статус или срок вышел). Сигнал риска.
  if (member.status_color === 'red' || (lastMeetingDays !== null && lastMeetingDays > cadence)) {
    out.push({
      id: 'overdue-meeting',
      reason: lastMeetingDays !== null
        ? `Последняя встреча была ${lastMeetingDays} дн. назад — дольше обычного.`
        : 'Встреч давно не было.',
      line: `Спросить, как дела и что изменилось с прошлого разговора`,
    })
  }

  // 3. Просроченные задачи — частый признак затыка, который стоит проговорить,
  //    а не давить дедлайном. Учим спрашивать про блокеры, а не про вину.
  if (openOverdue.length > 0) {
    const t = openOverdue[0]
    out.push({
      id: 'overdue-task',
      reason: openOverdue.length === 1
        ? `Задача «${(t.title || '').slice(0, 40)}» просрочена.`
        : `${openOverdue.length} задач(и) просрочено.`,
      line: `Обсудить, что мешает закрыть задачу «${(t.title || '').slice(0, 40)}», и нужна ли помощь`,
    })
  }

  // 4. Приближается срок каденции (жёлтый). Мягкое напоминание про прогресс.
  if (out.length === 0 && member.status_color === 'yellow') {
    out.push({
      id: 'progress-check',
      reason: 'Скоро плановая встреча — хороший момент свериться по прогрессу.',
      line: 'Свериться по прогрессу задач с прошлой встречи',
    })
  }

  return out.slice(0, 3)
}
