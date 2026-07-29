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
        "titleKey": "survey.q.usage.title",
        "subtitleKey": "survey.q.multiHint",
        "type": "multi",
        "options": [
            {"key": "meetings", "labelKey": "survey.o.meetings"},
            {"key": "tasks", "labelKey": "survey.o.tasks"},
            {"key": "goals", "labelKey": "survey.o.goals"},
            {"key": "development", "labelKey": "survey.o.development"},
            {"key": "mood", "labelKey": "survey.o.mood"},
            {"key": "ai", "labelKey": "survey.o.ai"},
        ],
    },
    {
        "key": "role",
        "titleKey": "survey.q.role.title",
        "subtitleKey": "survey.q.singleHint",
        "type": "single",
        "options": [
            {"key": "team_lead", "labelKey": "survey.o.teamLead"},
            {"key": "hr", "labelKey": "survey.o.hr"},
            {"key": "founder", "labelKey": "survey.o.ceo"},
            {"key": "specialist", "labelKey": "survey.o.specialist"},
        ],
    },
    {
        "key": "team_size",
        "titleKey": "survey.q.size.title",
        "subtitleKey": "survey.q.singleHint",
        "type": "single",
        "options": [
            {"key": "1_5", "labelKey": "survey.o.size5"},
            {"key": "6_30", "labelKey": "survey.o.size30"},
            {"key": "31_100", "labelKey": "survey.o.size100"},
            {"key": "100_plus", "labelKey": "survey.o.size100plus"},
        ],
    },
    {
        "key": "priorities",
        "titleKey": "survey.q.priority.title",
        "subtitleKey": "survey.q.multiHint",
        "type": "multi",
        "options": [
            {"key": "regularity", "labelKey": "survey.o.regularity"},
            {"key": "transparency", "labelKey": "survey.o.clarity"},
            {"key": "wellbeing", "labelKey": "survey.o.burnout"},
            {"key": "growth", "labelKey": "survey.o.growth"},
            {"key": "time_saving", "labelKey": "survey.o.time"},
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
