// Переиспользуемый модуль поиска компании по ИНН/БИН (Этапы 2, 4 и будущий
// экран оплаты). Поиск идёт через наш бэкенд-прокси к DaData (ключ на сервере)
// сразу по справочникам РФ и КЗ — страну выбирать не нужно, она проставляется
// автоматически из выбранной подсказки. Если DaData не настроена/ничего не
// нашла — доступен ручной ввод (запасной вариант). Компонент не решает, КУДА
// сохранять — отдаёт готовые реквизиты через onSubmit(payload); сохранение
// делает вызывающая сторона (создание пространства, настройки, оплата).
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { suggestCompany } from '../api/client'

const EMPTY = {
  country: 'RU', source: 'manual', name: '', inn: '', kpp: '', ogrn: '',
  legal_address: '', industry: '', management: '', status: '', data: null,
}

export default function CompanySearch({ initial, onSubmit, onCancel, submitting }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [searched, setSearched] = useState(false)
  const [manual, setManual] = useState(!!initial?.name)  // есть данные -> сразу форма
  const [form, setForm] = useState({ ...EMPTY, ...(initial || {}), country: (initial?.country || 'RU').toUpperCase() })
  const debounceRef = useRef(null)

  // Дебаунс-поиск по вводу (когда пользователь ищет, а не в ручном режиме).
  useEffect(() => {
    if (manual) return
    if (query.trim().length < 2) { setSuggestions([]); setSearched(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await suggestCompany(query.trim())
        setNotConfigured(data.configured === false)
        setSuggestions(data.suggestions || [])
        setSearched(true)
      } catch {
        setSuggestions([]); setSearched(true)
      } finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, manual])

  const pick = (s) => {
    setForm({
      country: (s.country || 'RU').toUpperCase(), source: 'dadata',
      name: s.name || '', inn: s.inn || '', kpp: s.kpp || '', ogrn: s.ogrn || '',
      legal_address: s.legal_address || '', industry: s.industry || '',
      management: s.management || '', status: s.status || '', data: s.raw || null,
    })
    setManual(true)
  }

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v, source: f.source === 'dadata' ? 'dadata' : 'manual' }))

  const canSubmit = form.name.trim().length > 0

  // Единый набор полей (без деления по стране). ИНН/БИН в одном поле; КПП/ОГРН
  // необязательны и просто остаются пустыми для КЗ.
  const fields = [
    { k: 'name', label: t('company.fieldName') },
    { k: 'inn', label: t('company.fieldInn') },
    { k: 'kpp', label: t('company.fieldKpp') },
    { k: 'ogrn', label: t('company.fieldOgrn') },
    { k: 'legal_address', label: t('company.fieldAddress') },
    { k: 'industry', label: t('company.fieldIndustry') },
    { k: 'management', label: t('company.fieldManagement') },
    { k: 'status', label: t('company.fieldStatus') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!manual && (
        <div>
          <label className="form-label">{t('company.searchPlaceholder')}</label>
          <input className="input" value={query} autoFocus
            onChange={e => setQuery(e.target.value)}
            placeholder={t('company.searchPlaceholder')} />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
            {t('company.searchHint')}
          </p>

          {searching && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>{t('common.loading')}</p>
          )}

          {!searching && searched && suggestions.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {suggestions.map((s, i) => (
                <button key={i} type="button" onClick={() => pick(s)} style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'inherit',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {[s.inn && `${t('company.fieldInn')} ${s.inn}`, s.legal_address].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && (notConfigured || (searched && suggestions.length === 0)) && query.trim().length >= 2 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>
              {notConfigured ? t('company.notConfigured') : t('company.nothingFound')}
            </p>
          )}

          <button type="button" onClick={() => setManual(true)} className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
            {t('company.manualEntry')}
          </button>
        </div>
      )}

      {manual && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.map(f => (
            <div key={f.k}>
              <label className="form-label">{f.label}{f.k === 'name' ? ' *' : ''}</label>
              <input className="input" value={form[f.k] || ''} onChange={e => setField(f.k, e.target.value)} />
            </div>
          ))}
          {!initial?.name && (
            <button type="button" onClick={() => { setManual(false); setForm({ ...EMPTY }) }}
              className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
              ← {t('common.search')}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }}>
            {t('common.cancel')}
          </button>
        )}
        {manual && (
          <button type="button" disabled={!canSubmit || submitting}
            onClick={() => onSubmit(form)} className="btn btn-accent" style={{ flex: 1 }}>
            {submitting ? t('common.loading') : t('common.save')}
          </button>
        )}
      </div>
    </div>
  )
}
