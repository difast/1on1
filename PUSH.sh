#!/usr/bin/env bash
# Разовая привязка локального репозитория к GitHub.
#
# Токен НЕ хранится в файле и не попадает в remote. Раньше здесь была строка
# PAT="...", куда предлагалось вписать личный токен: вписанный токен оказался бы
# и в рабочей копии, и в URL remote (.git/config), и в истории git при
# случайном коммите. Теперь токен передаётся переменной окружения на один
# запуск, а remote остаётся без учётных данных.
#
# Запуск:
#   GITHUB_PAT=xxxxx ./PUSH.sh
set -eu

: "${GITHUB_PAT:?Задайте GITHUB_PAT в окружении на время запуска: GITHUB_PAT=xxx ./PUSH.sh}"
GITHUB_USER="${GITHUB_USER:-difast}"
REPO_NAME="${REPO_NAME:-1on1}"

git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git" 2>/dev/null || true
AUTH_HEADER="Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_PAT" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=${AUTH_HEADER}" push -u origin main
