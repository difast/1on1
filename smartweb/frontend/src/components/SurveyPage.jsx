import { useState, useEffect } from 'react'
import Spinner from '../lib/Spinner'
import { getSurveyConfig, submitSurvey, skipSurvey } from '../api/client'

/*
 * Онбординг-опросник (Задача 3). Показывается один раз, после подтверждения
 * почты и ДО выбора роли. Вопросы и варианты приходят с бэкенда
 * (GET /survey/config) — здесь только отрисовка карточек и сбор ответов.
 *
 * Каждый вопрос — отдельный шаг: карточки вариантов (single/multi), кнопка
 * продолжения и «Пропустить». Пропуск фиксируется на бэкенде отдельным статусом
 * (не пустой ответ). По завершении/пропуске onDone получает обновлённого
 * пользователя (onboarding_survey_done=true) — App уводит дальше, к выбору роли.
 */
export default function SurveyPage({ user, onDone }) {
  const [questions, setQuestions] = useState(null)  // null=loading, []=ошибка/пусто
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})        // { qkey: [optKey, ...] }
  const [busy, setBusy] = useState('')              // '' | 'submit' | 'skip'
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getSurveyConfig()
      .then(r => { if (alive) setQuestions(r.data?.questions || []) })
      .catch(() => { if (alive) setQuestions([]) })
    return () => { alive = false }
  }, [])

  // Не удалось загрузить конфиг — не держим пользователя, пропускаем опросник.
  useEffect(() => {
    if (questions && questions.length === 0) { handleSkip() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions])

  if (questions === null || (questions && questions.length === 0)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <Spinner size={30} />
      </div>
    )
  }

  const total = questions.length
  const q = questions[step]
  const selected = answers[q.key] || []
  const isMulti = q.type === 'multi'
  const canContinue = selected.length > 0

  const toggleOption = (optKey) => {
    setAnswers(prev => {
      const cur = prev[q.key] || []
      if (isMulti) {
        const next = cur.includes(optKey) ? cur.filter(k => k !== optKey) : [...cur, optKey]
        return { ...prev, [q.key]: next }
      }
      return { ...prev, [q.key]: [optKey] }
    })
  }

  const submitAll = async (finalAnswers) => {
    setBusy('submit'); setError('')
    try {
      const { data } = await submitSurvey(user.id, finalAnswers)
      onDone(data)
    } catch {
      setError('Не удалось сохранить ответы. Попробуйте ещё раз или пропустите.')
      setBusy('')
    }
  }

  const handleContinue = () => {
    if (!canContinue) return
    if (step < total - 1) { setStep(s => s + 1); return }
    submitAll(answers)
  }

  const handleSkip = async () => {
    if (busy) return
    setBusy('skip'); setError('')
    try {
      const { data } = await skipSurvey(user.id)
      onDone(data)
    } catch {
      setError('Не удалось выполнить действие. Попробуйте ещё раз.')
      setBusy('')
    }
  }

  const dots = Array.from({ length: total })

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#0a1330 0%,#1e40af 55%,#172554 100%)',
      display: 'flex', padding: '48px 20px', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 520, margin: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            OneOn<span style={{ color: '#818cf8' }}>One</span>
          </span>
        </div>

        {/* Прогресс по шагам */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 22 }}>
          {dots.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 26 : 8, height: 8, borderRadius: 4,
              background: i <= step ? '#2554D4' : 'rgba(255,255,255,0.18)',
              transition: 'all 0.35s var(--ease-spring)',
            }} />
          ))}
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)', padding: '26px 26px 22px',
          animation: 'fadeUp 0.35s var(--ease-spring) both',
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.04em', marginBottom: 8 }}>
            Вопрос {step + 1} из {total}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{q.title}</h2>
          {q.subtitle && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>{q.subtitle}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {q.options.map(opt => {
              const on = selected.includes(opt.key)
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleOption(opt.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    width: '100%', cursor: 'pointer', padding: '14px 16px', borderRadius: 12,
                    background: on ? 'rgba(37,84,212,0.22)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${on ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.1)'}`,
                    color: '#fff', transition: 'all 0.18s var(--ease-smooth)',
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 20, height: 20,
                    borderRadius: isMulti ? 6 : '50%',
                    border: `2px solid ${on ? '#818cf8' : 'rgba(255,255,255,0.35)'}`,
                    background: on ? '#2554D4' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{opt.label}</span>
                </button>
              )
            })}
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleSkip}
              disabled={!!busy}
              style={{
                flex: '0 0 auto', padding: '12px 16px', background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                borderRadius: 12, cursor: busy ? 'default' : 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              {busy === 'skip' ? 'Пропускаем...' : 'Пропустить'}
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || !!busy}
              style={{
                flex: 1, padding: '13px 20px', fontSize: 15, fontWeight: 700,
                background: (!canContinue || busy) ? 'rgba(37,84,212,0.4)' : 'linear-gradient(135deg,#2554D4,#4f46e5)',
                color: '#fff', border: 'none', borderRadius: 12,
                cursor: (!canContinue || busy) ? 'default' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {busy === 'submit'
                ? (<><Spinner size={15} /> Сохраняем...</>)
                : (step < total - 1 ? 'Далее' : 'Завершить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
