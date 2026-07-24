/*
 * Единая карта маршрутизации уведомлений (Задача 2).
 *
 * Тип уведомления -> канонический раздел. Один источник истины для всех
 * поверхностей (дашборд участника и тимлида), чтобы клик по уведомлению вёл в
 * правильный раздел, а не в общий список. Каждая поверхность переводит
 * канонический раздел в своё действие (вкладка/модалка). Тот же подход, что
 * уже применялся для dev-уведомлений в модуле «Развитие», распространён на все
 * типы.
 */
export function notificationSection(type) {
  if (['new_task', 'task_update', 'task_assignee_added', 'task_assignee_removed',
       'overdue_alert', 'tasks'].includes(type)) return 'tasks'
  if (type === 'task_proposal') return 'task_proposal'
  if (type === 'meeting_proposal') return 'meeting_proposal'
  if (['meetings', 'meeting_scheduled', 'meeting_confirmed', 'meeting_request',
       'meeting_requested', 'meeting_declined', 'meeting_reminder'].includes(type)) return 'meetings'
  if (['goals', 'goal_comment', 'goal_feedback'].includes(type)) return 'goals'
  if (['development', 'dev_direction_assigned', 'dev_feedback', 'dev_level_reached',
       'dev_step_due'].includes(type)) return 'development'
  if (type === 'mood_reminder') return 'mood'
  if (['mood_summary', 'burnout_alert'].includes(type)) return 'analytics'
  // broadcast / call_started / прочее — без перехода (обрабатывается отдельно).
  return 'none'
}
