"""Обработка текста, приходящего от модели.

Две задачи:

1. Убрать markdown-разметку. Клиенты (веб, приложение, Mini App, бот) выводят
   ответ обычным текстом, парсера markdown ни у одного из них нет, поэтому
   символы `*`, `#`, `` ` `` и подобные попадали в интерфейс как есть и
   засоряли ответ. Разметку запрещаем в промпте, а здесь подчищаем остатки:
   модель не всегда следует инструкции буквально.

2. Разобрать структурированный ответ ONE AI. Модель возвращает JSON с резюме,
   наблюдениями и действиями — интерфейс рисует это своими средствами
   (акцентная карточка, заголовки блоков), а не сырыми символами разметки.
"""
import json
import re

# Заголовки вида "## Заголовок" и "### Заголовок" в начале строки.
_HEADING = re.compile(r'^\s{0,3}#{1,6}\s*', re.M)
# Маркеры списка: "* ", "- ", "+ " в начале строки -> единый символ.
_BULLET = re.compile(r'^(\s*)[*+\-]\s+', re.M)
# Жирный/курсив: **текст**, __текст__, *текст*, _текст_.
_BOLD = re.compile(r'(\*\*|__)(.+?)\1', re.S)
_ITALIC = re.compile(r'(?<![\w*_])([*_])(?!\s)(.+?)(?<!\s)\1(?![\w*_])', re.S)
# Инлайн-код и блоки кода.
_FENCE = re.compile(r'```[a-zA-Z0-9]*\n?')
_CODE = re.compile(r'`([^`]+)`')
# Ссылки [текст](url) -> "текст (url)".
_LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
# Горизонтальные линии.
_HR = re.compile(r'^\s*([-*_])\1{2,}\s*$', re.M)


def strip_markdown(text: str | None) -> str:
    """Привести ответ модели к чистому тексту без разметочных символов."""
    if not text:
        return ""
    s = str(text)
    s = _FENCE.sub('', s)
    s = _LINK.sub(r'\1 (\2)', s)
    s = _BOLD.sub(r'\2', s)
    s = _ITALIC.sub(r'\2', s)
    s = _CODE.sub(r'\1', s)
    s = _HR.sub('', s)
    s = _HEADING.sub('', s)
    s = _BULLET.sub(r'\1• ', s)
    # Не больше одной пустой строки подряд и без хвостовых пробелов.
    s = re.sub(r'[ \t]+\n', '\n', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


def _clean_list(items, limit: int, key: str | None = None) -> list:
    out = []
    for it in (items or [])[:limit]:
        if key:
            title = strip_markdown(str(it.get('title', '')))[:80] if isinstance(it, dict) else ''
            text = strip_markdown(str(it.get('text', ''))) if isinstance(it, dict) else strip_markdown(str(it))
            if title or text:
                out.append({"title": title, "text": text})
        else:
            # Ведущий маркер убираем: список рисует интерфейс своими средствами.
            v = re.sub(r'^\s*[•\-*]\s*', '', strip_markdown(str(it)))
            if v:
                out.append(v)
    return out


def parse_oneai(reply: str | None) -> dict:
    """Разобрать ответ ONE AI в структуру для интерфейса.

    Ожидается JSON вида {summary, insights:[{title,text}], actions:[...]}.
    Модель может вернуть его в блоке кода или дописать текст вокруг — вырезаем
    первый JSON-объект. Если разобрать не удалось, отдаём обычный текст: раздел
    продолжает работать, просто без визуальной структуры."""
    raw = (reply or "").strip()
    data = None
    if raw:
        candidate = raw
        fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.S)
        if fence:
            candidate = fence.group(1)
        else:
            first, last = candidate.find('{'), candidate.rfind('}')
            if first != -1 and last > first:
                candidate = candidate[first:last + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = None

    if not data:
        return {"summary": "", "insights": [], "actions": [], "text": strip_markdown(raw)}

    return {
        "summary": strip_markdown(str(data.get("summary") or ""))[:400],
        "insights": _clean_list(data.get("insights"), 5, key="title"),
        "actions": _clean_list(data.get("actions"), 5),
        "text": "",
    }
