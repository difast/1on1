import { useState } from 'react'
import { createUser, joinTeam } from '../api/client'

export default function Onboarding({ initialInviteCode = '', onComplete }) {
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [inviteCode, setInviteCode] = useState(initialInviteCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole)
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) { setError('Имя обязательно'); return }
    if (!email.trim()) { setError('Email обязателен'); return }

    setLoading(true)
    try {
      const { data: newUser } = await createUser({ name: name.trim(), email: email.trim(), title: title.trim() || undefined, role })

      if (role === 'member' && inviteCode.trim()) {
        try {
          await joinTeam({ invite_code: inviteCode.trim(), user_id: newUser.id })
        } catch {
          // silent — user can join later
        }
      }

      const userToStore = { ...newUser }
      localStorage.setItem('smart_user', JSON.stringify(userToStore))
      onComplete(userToStore)
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || JSON.stringify(err?.response?.data) || 'Нет ответа от сервера')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }} className="anim-fade">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <span className="logo" style={{ fontSize: 24 }}>
            Smart <span className="accent">1-on-1</span>
          </span>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8, fontSize: 15 }}>
            Эффективные встречи с командой
          </p>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div className="anim-slide">
            <h2 style={{
              textAlign: 'center', marginBottom: 24, fontSize: 18,
              fontWeight: 600, color: 'var(--color-text-primary)',
            }}>
              Кто вы?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { role: 'team_lead', icon: '👔', title: 'Тимлид', desc: 'Управляю командой, провожу 1-on-1 встречи с сотрудниками' },
                { role: 'member', icon: '🧑‍💻', title: 'Участник команды', desc: 'Являюсь частью команды, участвую в 1-on-1 встречах' },
              ].map(opt => (
                <button
                  key={opt.role}
                  onClick={() => handleRoleSelect(opt.role)}
                  className="card card-interactive"
                  style={{ padding: '20px 22px', textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{opt.icon}</div>
                  <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 4 }}>
                    {opt.title}
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Profile details */}
        {step === 2 && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <button
              onClick={() => setStep(1)}
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 16, paddingLeft: 0 }}
            >
              ← Назад
            </button>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {role === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник команды'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>
              Расскажите немного о себе
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Имя <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Иван Иванов" className="input" required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="ivan@company.com" className="input" required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Должность <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span>
                </label>
                <input
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Senior Engineer" className="input"
                />
              </div>

              {role === 'member' && (
                <div className="form-group">
                  <label className="form-label">
                    Код приглашения <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span>
                  </label>
                  <input
                    type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    placeholder="ABC123" className="input"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Если у вас есть ссылка-приглашение от тимлида
                  </p>
                </div>
              )}

              {error && (
                <div style={{
                  background: 'var(--color-danger-bg)', border: '1px solid #FCA5A5',
                  color: 'var(--color-danger)', borderRadius: 'var(--radius-md)',
                  padding: '11px 14px', fontSize: 14, marginBottom: 14,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="btn btn-accent"
                style={{ width: '100%', padding: '13px 24px', fontSize: 15, marginTop: 4 }}
              >
                {loading ? 'Создание аккаунта...' : 'Начать →'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
