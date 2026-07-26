#!/usr/bin/env python3
"""Извлечение захардкоженных строк интерфейса в словари переводов.

Собирает строки с кириллицей из безопасных для замены позиций (JSX-текст,
строковые литералы в известных местах) и присваивает каждой УНИКАЛЬНОЙ строке
один ключ вида ui.<слаг>. Одинаковый текст в разных файлах получает один ключ —
так перевод делается один раз и остаётся консистентным по всему продукту.

Режимы:
  scan   — выгрузить кандидатов в JSON (для перевода)
  apply  — заменить строки на t('ключ') и дописать ru.json
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CYR = re.compile(r"[А-Яа-яЁё]")

# Файлы, которые НЕ трогаем: юридические тексты (переводит юрист), длинные
# коучинг-подсказки и системные промпты AI (это не интерфейс).
SKIP = ("legalDocs", "coaching", "prompts.py", "/i18n/", "i18n.ts", "i18n.py")

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"^\s*//.*$", re.M)

# Текстовый узел JSX: >Текст<
JSX_TEXT = re.compile(r">(\s*)([^<>{}\n][^<>{}]*?[А-Яа-яЁё][^<>{}]*?)(\s*)<")
# Строковые литералы в атрибутах и объектах.
ATTR = re.compile(r'\b(placeholder|title|label|aria-label|accessibilityLabel|subtext|alt)=(["\'])([^"\']*[А-Яа-яЁё][^"\']*)\2')
# Литерал в вызове: toast('...'), setError('...'), Alert.alert('...', '...')
CALL = re.compile(r"\b(toast|setError|setMessage|alert|confirm)\(\s*(['\"])([^'\"]*[А-Яа-яЁё][^'\"]*)\2")

TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
}


def slug(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch in TRANSLIT:
            out.append(TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        elif out and out[-1] != '_':
            out.append('_')
    s = ''.join(out).strip('_')
    parts = [p for p in s.split('_') if p]
    s = '_'.join(parts[:6])[:46].strip('_')
    return s or 'text'


def strip_comments(src: str) -> str:
    return LINE_COMMENT.sub('', BLOCK_COMMENT.sub('', src))


def walk(root, exts, skip=('node_modules', 'dist', '.expo', '.git', 'locales')):
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in skip]
        for f in fn:
            if f.endswith(exts):
                p = os.path.join(dp, f)
                if not any(k in p for k in SKIP):
                    yield p


def candidates(path: str) -> list[str]:
    src = strip_comments(open(path, encoding='utf-8').read())
    found = []
    for m in JSX_TEXT.finditer(src):
        t = m.group(2).strip()
        if CYR.search(t) and len(t) <= 80 and '{' not in t:
            found.append(t)
    for m in ATTR.finditer(src):
        t = m.group(3).strip()
        if CYR.search(t) and len(t) <= 80:
            found.append(t)
    for m in CALL.finditer(src):
        t = m.group(3).strip()
        if CYR.search(t) and len(t) <= 80:
            found.append(t)
    return found


def collect() -> dict[str, dict]:
    """Уникальные строки -> {key, count, files}."""
    seen: dict[str, dict] = {}
    used_slugs: set[str] = set()
    roots = [
        (os.path.join(ROOT, 'smartweb', 'frontend', 'src'), ('.jsx',)),
        (os.path.join(ROOT, 'mobile'), ('.tsx',)),
    ]
    hits: dict[str, list[str]] = {}
    for root, exts in roots:
        for path in walk(root, exts):
            for text in candidates(path):
                hits.setdefault(text, []).append(os.path.relpath(path, ROOT))
    for text in sorted(hits, key=lambda t: (-len(hits[t]), t)):
        base = slug(text)
        key = base
        n = 2
        while key in used_slugs:
            key = f"{base}_{n}"
            n += 1
        used_slugs.add(key)
        seen[text] = {'key': f"ui.{key}", 'count': len(hits[text]), 'files': sorted(set(hits[text]))}
    return seen


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'scan'
    if mode == 'scan':
        data = collect()
        out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'i18n-candidates.json')
        with open(out, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        print(f"уникальных строк: {len(data)}; вхождений: {sum(v['count'] for v in data.values())}")
        print(f"файл: {os.path.relpath(out, ROOT)}")


# ── Применение: замена строк на t('ключ') ────────────────────────────────────

def ensure_hook(src: str, path: str) -> str:
    """Добавить импорт и вызов хука перевода, если их ещё нет."""
    if path.endswith('.jsx'):
        if 'useTranslation' not in src:
            src = re.sub(r"^(import [^\n]*\n)", r"\1import { useTranslation } from 'react-i18next'\n", src, count=1)
        if re.search(r"\bconst \{ t[ ,}]", src) is None and 'const { t }' not in src:
            # Вставляем хук в начало тела компонента верхнего уровня.
            m = re.search(r"^export default function \w+\([^)]*\)\s*\{\n", src, re.M)
            if m:
                src = src[:m.end()] + "  const { t } = useTranslation()\n" + src[m.end():]
    else:  # .tsx — собственный лёгкий i18n приложения
        if "from '../lib/i18n'" not in src and "from '../../src/lib/i18n'" not in src and 'useI18n' not in src:
            rel = "../../src/lib/i18n" if f"{os.sep}app{os.sep}" in path else "../lib/i18n"
            src = re.sub(r"^(import [^\n]*\n)", rf"\1import {{ useI18n }} from '{rel}';\n", src, count=1)
        if re.search(r"\bconst \{ t[ ,}]", src) is None:
            m = re.search(r"^export default function \w+\([^)]*\)\s*\{\n", src, re.M)
            if m:
                src = src[:m.end()] + "  const { t } = useI18n();\n" + src[m.end():]
    return src


def apply_file(path: str, mapping: dict[str, str]) -> int:
    """Заменить известные строки на t('ключ'). Возвращает число замен."""
    src = open(path, encoding='utf-8').read()
    orig = src
    n = 0

    def jsx_sub(m):
        nonlocal n
        text = m.group(2).strip()
        key = mapping.get(text)
        if not key or '{' in text:
            return m.group(0)
        n += 1
        return f">{{t('{key}')}}<"

    def attr_sub(m):
        nonlocal n
        key = mapping.get(m.group(3).strip())
        if not key:
            return m.group(0)
        n += 1
        return f"{m.group(1)}={{t('{key}')}}"

    def call_sub(m):
        nonlocal n
        key = mapping.get(m.group(3).strip())
        if not key:
            return m.group(0)
        n += 1
        return f"{m.group(1)}(t('{key}')"

    src = JSX_TEXT.sub(jsx_sub, src)
    src = ATTR.sub(attr_sub, src)
    src = CALL.sub(call_sub, src)
    if n:
        src = ensure_hook(src, path)
        open(path, 'w', encoding='utf-8').write(src)
    return n if src != orig else 0
