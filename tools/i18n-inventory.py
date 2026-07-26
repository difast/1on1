#!/usr/bin/env python3
"""Инвентаризация непереведённых строк (Этап 1 задачи мультиязычности).

Проходит по клиентскому коду и бэкенду, находит строковые литералы и JSX-текст
с кириллицей, которые НЕ вынесены в словари переводов, и раскладывает их по
разделам продукта. Результат — docs/i18n-inventory.md: сколько строк осталось
в каждом разделе и какие именно (первые несколько для примера).

Запуск:  python3 tools/i18n-inventory.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "smartweb", "frontend", "src")
MOBILE = os.path.join(ROOT, "mobile")
BACKEND = os.path.join(ROOT, "smartweb", "backend", "app")
LOCALES = os.path.join(WEB, "i18n", "locales")

CYR = re.compile(r"[А-Яа-яЁё]")
# Строковые литералы и текстовые узлы JSX с кириллицей.
LITERAL = re.compile(r"(['\"])((?:(?!\1)[^\\]|\\.)*?[А-Яа-яЁё](?:(?!\1)[^\\]|\\.)*?)\1")
JSX_TEXT = re.compile(r">\s*([^<>{}\n][^<>{}]*[А-Яа-яЁё][^<>{}]*?)\s*<")

# Раздел продукта -> под каким именем показывать в отчёте.
SECTIONS = [
    ("LeadDashboard", "Кабинет тимлида"),
    ("MemberDashboard", "Кабинет участника"),
    ("LeadAnalytics", "Аналитика (тимлид)"),
    ("MemberAnalytics", "Аналитика (участник)"),
    ("AdminDashboard", "Админ-панель"),
    ("Admin", "Админ-панель"),
    ("Layout", "Навигация и меню профиля"),
    ("Auth", "Авторизация"),
    ("Login", "Авторизация"),
    ("Yandex", "Авторизация"),
    ("Onboarding", "Онбординг"),
    ("Survey", "Онбординг"),
    ("Goals", "Цели"),
    ("Development", "Развитие"),
    ("Task", "Задачи"),
    ("Meeting", "Встречи"),
    ("Note", "Заметки"),
    ("Mood", "Настроение"),
    ("Checkin", "Настроение"),
    ("Pit", "Пит"),
    ("OneAi", "ONE AI"),
    ("one-ai", "ONE AI"),
    ("Assistant", "Пит"),
    ("Support", "Поддержка"),
    ("Knowledge", "База знаний"),
    ("Billing", "Тариф и оплата"),
    ("Tariff", "Тариф и оплата"),
    ("Company", "Компания"),
    ("Integration", "Интеграции"),
    ("Notification", "Уведомления"),
    ("Profile", "Профиль и настройки"),
    ("Interaction", "Взаимодействия"),
    ("Team", "Команда"),
    ("Legal", "Юридические документы"),
    ("mailer", "Письма"),
    ("telegram_bot", "Telegram-бот"),
    ("push", "Пуш-уведомления"),
]


def section_for(path: str) -> str:
    base = os.path.basename(path)
    for needle, title in SECTIONS:
        if needle.lower() in base.lower():
            return title
    return "Прочее"


BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"^\s*(//|#).*$", re.M)
PY_DOCSTRING = re.compile(r'"""".*?""""|\'\'\'.*?\'\'\'', re.S)
PY_DOC = re.compile(r'"""(?:.|\n)*?"""', re.S)


def strip_comments(src: str, path: str) -> str:
    """Комментарии и докстроки — не интерфейс, из инвентаризации исключаем."""
    if path.endswith(".py"):
        src = PY_DOC.sub("", src)
    else:
        src = BLOCK_COMMENT.sub("", src)
    return LINE_COMMENT.sub("", src)


def scan_file(path: str) -> list[str]:
    try:
        src = open(path, encoding="utf-8").read()
    except (OSError, UnicodeDecodeError):
        return []
    src = strip_comments(src, path)
    found = []
    for m in LITERAL.finditer(src):
        text = m.group(2).strip()
        if text and CYR.search(text):
            found.append(text)
    for m in JSX_TEXT.finditer(src):
        text = m.group(1).strip()
        if text and CYR.search(text):
            found.append(text)
    # Строки внутри t('...') уже переведены — отбрасываем ключи, а не значения.
    return [f for f in found if not f.startswith("t(")]


def walk(root: str, exts: tuple[str, ...], skip=("node_modules", "dist", ".expo", "locales")):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for fn in filenames:
            if fn.endswith(exts):
                yield os.path.join(dirpath, fn)


def locale_key_count() -> int:
    def count(o):
        return sum(count(v) if isinstance(v, dict) else 1 for v in o.values())
    with open(os.path.join(LOCALES, "ru.json"), encoding="utf-8") as fh:
        return count(json.load(fh))


def main() -> int:
    groups: dict[str, dict[str, list[str]]] = {}
    totals = {"web": 0, "mobile": 0, "backend": 0}

    for label, root, exts in (
        ("web", WEB, (".jsx", ".js")),
        ("mobile", MOBILE, (".tsx", ".ts")),
        ("backend", BACKEND, (".py",)),
    ):
        for path in walk(root, exts):
            rel = os.path.relpath(path, ROOT)
            if "/i18n/" in rel or rel.endswith("i18n.ts") or rel.endswith("i18n.py"):
                continue
            strings = scan_file(path)
            if not strings:
                continue
            totals[label] += len(strings)
            groups.setdefault(section_for(path), {}).setdefault(rel, []).extend(strings)

    lines = [
        "# Инвентаризация строк интерфейса (i18n)",
        "",
        "Файл генерируется скриптом `tools/i18n-inventory.py` — не редактируйте вручную.",
        "",
        f"В словарях (`ru.json`): **{locale_key_count()}** ключей.",
        "",
        "Ниже — строки с кириллицей, которые ещё захардкожены в коде и не вынесены",
        "в словари, сгруппированные по разделам продукта.",
        "",
        f"| Клиент | Осталось строк |",
        f"|---|---|",
        f"| Веб | {totals['web']} |",
        f"| Мобильное приложение | {totals['mobile']} |",
        f"| Бэкенд (письма, бот, уведомления) | {totals['backend']} |",
        "",
    ]
    for section in sorted(groups, key=lambda s: -sum(len(v) for v in groups[s].values())):
        files = groups[section]
        total = sum(len(v) for v in files.values())
        lines.append(f"## {section} — {total}")
        lines.append("")
        for rel in sorted(files, key=lambda r: -len(files[r])):
            samples = "; ".join(s.replace("|", "/")[:60] for s in files[rel][:3])
            lines.append(f"- `{rel}` — {len(files[rel])}: {samples}")
        lines.append("")

    out = os.path.join(ROOT, "docs", "i18n-inventory.md")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"Отчёт: {os.path.relpath(out, ROOT)}")
    print(f"веб: {totals['web']}, приложение: {totals['mobile']}, бэкенд: {totals['backend']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
