#!/bin/sh
# Единый источник переводов — smartweb/frontend/src/i18n/locales.
# Мобильное приложение использует те же файлы (свой лёгкий i18n без i18next),
# поэтому после правки словарей на вебе нужно синхронизировать копию:
#
#   sh tools/sync-locales.sh
#
# Скрипт заодно проверяет, что наборы ключей во всех трёх локалях совпадают.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/smartweb/frontend/src/i18n/locales"
DST="$ROOT/mobile/src/i18n/locales"
mkdir -p "$DST"
cp "$SRC/ru.json" "$SRC/en.json" "$SRC/kz.json" "$DST/"
python3 - "$SRC" <<'PY'
import json, sys, os
src = sys.argv[1]
PLURAL = ('_one', '_few', '_many', '_other')

def keys(o, p=''):
    """Ключи локали. Суффиксы плюрализации схлопываем в базовый ключ: число
    форм у языков разное (ru — четыре, en — две, kz — одна), и это норма."""
    out = set()
    for k, v in o.items():
        kk = f"{p}.{k}" if p else k
        if isinstance(v, dict):
            out |= keys(v, kk)
        else:
            for suf in PLURAL:
                if kk.endswith(suf):
                    kk = kk[: -len(suf)]
                    break
            out.add(kk)
    return out
ru = keys(json.load(open(os.path.join(src, 'ru.json'))))
bad = False
for lang in ('en', 'kz'):
    cur = keys(json.load(open(os.path.join(src, lang + '.json'))))
    missing, extra = sorted(ru - cur), sorted(cur - ru)
    if missing:
        bad = True
        print(f"{lang}: нет ключей ({len(missing)}): " + ", ".join(missing[:20]))
    if extra:
        print(f"{lang}: лишние ключи ({len(extra)}): " + ", ".join(extra[:20]))
print("ключей в ru:", len(ru), "| расхождений нет" if not bad else "| ЕСТЬ РАСХОЖДЕНИЯ")
PY
echo "Локали синхронизированы в mobile/src/i18n/locales"
