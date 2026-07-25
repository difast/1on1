/*
 * Генератор юридических документов из единого источника.
 *
 * ЗАЧЕМ: тексты соглашения и оферты (в т.ч. таблицы тарифов) раньше жили в трёх
 * местах — на лендинге, в личном кабинете и в приложении — и правились руками,
 * поэтому при смене тарифной сетки расходились. Теперь источник один:
 * legal/legal_docs.json. Меняем текст ТАМ и запускаем:
 *
 *     node legal/generate.mjs
 *
 * Генерируются:
 *   landing/documents.html                      — секции между маркерами
 *   smartweb/frontend/src/lib/legalDocs.js      — HTML-строки для веба
 *   mobile/src/lib/legalDocs.ts                 — структурные блоки для RN
 *
 * Плейсхолдер {{CONTACT_EMAIL}} подставляется отдельно для каждой площадки
 * (см. TARGET_EMAIL): сейчас адреса разные, и сведение их к одному — решение
 * бизнеса, а не генератора.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'legal/legal_docs.json')

const TARGET_EMAIL = {
  landing: 'support@oneononehq.com',
  web: 'oneonone.io@yandex.com',
  mobile: 'support@oneononehq.com',
}

const { docs } = JSON.parse(readFileSync(SOURCE, 'utf8'))

const fill = (value, email) => {
  if (typeof value === 'string') return value.replaceAll('{{CONTACT_EMAIL}}', email)
  if (Array.isArray(value)) return value.map(v => fill(v, email))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, email)]))
  }
  return value
}

const renderHtml = (blocks) => blocks.map(b => {
  if (b.t === 'h') return `<h3>${b.text}</h3>`
  if (b.t === 'p') return `<p>${b.text}</p>`
  if (b.t === 'ul') return `<ul>${b.items.map(i => `<li>${i}</li>`).join('')}</ul>`
  if (b.t === 'table') {
    const head = b.head.map(h => `<th>${h}</th>`).join('')
    const rows = b.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
    return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  }
  return ''
}).join('')

// ── 1. Лендинг: секции между маркерами в documents.html ─────────────────────
const LANDING_START = '<!-- LEGAL:GENERATED:START -->'
const LANDING_END = '<!-- LEGAL:GENERATED:END -->'

function writeLanding() {
  const path = join(ROOT, 'landing/documents.html')
  const html = readFileSync(path, 'utf8')
  const from = html.indexOf(LANDING_START)
  const to = html.indexOf(LANDING_END)
  if (from < 0 || to < 0) {
    throw new Error('landing/documents.html: не найдены маркеры LEGAL:GENERATED')
  }
  const sections = docs.map(d => {
    const doc = fill(d, TARGET_EMAIL.landing)
    return `<section id="${doc.key}" class="doc-section">\n` +
      `<h2 class="doc-title">${doc.title}</h2>\n` +
      `<p class="doc-sub">${doc.subtitle}</p>\n` +
      `<div class="doc-body">${renderHtml(doc.blocks)}</div>\n` +
      `</section>`
  }).join('\n\n')
  const next = html.slice(0, from) + LANDING_START + '\n' + sections + '\n' + html.slice(to)
  writeFileSync(path, next)
  console.log('landing/documents.html — обновлён')
}

// ── 2. Личный кабинет (веб) ─────────────────────────────────────────────────
function writeWeb() {
  const path = join(ROOT, 'smartweb/frontend/src/lib/legalDocs.js')
  const items = docs.map(d => {
    const doc = fill(d, TARGET_EMAIL.web)
    return '  ' + JSON.stringify({ key: doc.key, title: doc.title, subtitle: doc.subtitle, html: renderHtml(doc.blocks) })
  }).join(',\n')
  const out = '// Сгенерировано из legal/legal_docs.json (node legal/generate.mjs). Правьте источник, не этот файл.\n' +
    'export const LEGAL_DOCS = [\n' + items + ',\n];\n'
  writeFileSync(path, out)
  console.log('smartweb/frontend/src/lib/legalDocs.js — обновлён')
}

// ── 3. Мобильное приложение ─────────────────────────────────────────────────
function writeMobile() {
  const path = join(ROOT, 'mobile/src/lib/legalDocs.ts')
  const items = docs.map(d => {
    const doc = fill(d, TARGET_EMAIL.mobile)
    return JSON.stringify({ key: doc.key, title: doc.title, subtitle: doc.subtitle, blocks: doc.blocks })
  }).join(', ')
  const out =
    '// Сгенерировано из legal/legal_docs.json (node legal/generate.mjs). Правьте источник, не этот файл.\n' +
    "export interface LegalBlock { t: 'h' | 'p' | 'ul' | 'table'; text?: string; items?: string[]; head?: string[]; rows?: string[][]; }\n" +
    'export interface LegalDoc { key: string; title: string; subtitle: string; blocks: LegalBlock[]; }\n' +
    'export const LEGAL_DOCS: LegalDoc[] = [' + items + '];\n'
  writeFileSync(path, out)
  console.log('mobile/src/lib/legalDocs.ts — обновлён')
}

writeLanding()
writeWeb()
writeMobile()
