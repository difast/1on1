#!/usr/bin/env bash
# Запускать ПОСЛЕ того как создал репо на GitHub:
#   github.com → New repository → Name: 1on1 → Private → NO init → Create
#
# Вставь свой PAT (нужен scope: repo) и запусти этот скрипт:

PAT="PASTE_YOUR_PAT_HERE"
GITHUB_USER="difast"
REPO_NAME="1on1"

git remote add origin "https://${PAT}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
git push -u origin main
