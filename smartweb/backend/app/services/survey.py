"""Конфиг онбординг-опросника — единый источник вопросов и вариантов.

Список редактируется здесь, а не в компонентах: фронт (веб) забирает его через
GET /api/survey/config и рисует карточки. Ключи (key) стабильны — по ним ответы
сохраняются в БД, поэтому их нельзя переименовывать задним числом, а тексты
(label) можно менять свободно.

type:
  "single" — можно выбрать один вариант
  "multi"  — можно выбрать несколько
"""

SURVEY_QUESTIONS = [
    {
        "key": "usage",
        "title": "Как вы планируете использовать OneOnOne?",
        "subtitle": "Можно выбрать несколько вариантов",
        "type": "multi",
        "options": [
            {"key": "meetings", "label": "Проводить встречи 1-на-1"},
            {"key": "tasks", "label": "Ставить и отслеживать задачи"},
            {"key": "goals", "label": "Вести цели и OKR"},
            {"key": "development", "label": "Развивать команду"},
            {"key": "mood", "label": "Следить за настроением и рисками"},
            {"key": "ai", "label": "Использовать AI-ассистента"},
        ],
    },
    {
        "key": "role",
        "title": "Какая у вас роль?",
        "subtitle": "Выберите один вариант",
        "type": "single",
        "options": [
            {"key": "team_lead", "label": "Руководитель команды"},
            {"key": "hr", "label": "HR или People Partner"},
            {"key": "founder", "label": "Руководитель компании"},
            {"key": "specialist", "label": "Специалист"},
        ],
    },
    {
        "key": "team_size",
        "title": "Какой размер вашей команды?",
        "subtitle": "Выберите один вариант",
        "type": "single",
        "options": [
            {"key": "1_5", "label": "До 5 человек"},
            {"key": "6_30", "label": "6-30 человек"},
            {"key": "31_100", "label": "31-100 человек"},
            {"key": "100_plus", "label": "Больше 100 человек"},
        ],
    },
    {
        "key": "priorities",
        "title": "Что для вас сейчас важнее всего?",
        "subtitle": "Можно выбрать несколько вариантов",
        "type": "multi",
        "options": [
            {"key": "regularity", "label": "Регулярность встреч"},
            {"key": "transparency", "label": "Прозрачность задач"},
            {"key": "wellbeing", "label": "Настроение и риск выгорания"},
            {"key": "growth", "label": "Рост и развитие сотрудников"},
            {"key": "time_saving", "label": "Экономия времени на рутине"},
        ],
    },
]

# Индекс для валидации ответов: { question_key: {"type", set(option_keys)} }.
_INDEX = {
    q["key"]: {"type": q["type"], "options": {o["key"] for o in q["options"]}}
    for q in SURVEY_QUESTIONS
}


def sanitize_answers(raw: dict) -> dict:
    """Оставить только известные вопросы и варианты; для single — не более одного.

    Защищает БД от произвольных ключей с клиента: неизвестное отбрасывается,
    порядок вариантов внутри вопроса сохраняется по конфигу.
    """
    if not isinstance(raw, dict):
        return {}
    out = {}
    for qkey, meta in _INDEX.items():
        picked = raw.get(qkey)
        if picked is None:
            continue
        if not isinstance(picked, (list, tuple)):
            picked = [picked]
        valid = [str(o) for o in picked if str(o) in meta["options"]]
        if meta["type"] == "single":
            valid = valid[:1]
        if valid:
            out[qkey] = valid
    return out
