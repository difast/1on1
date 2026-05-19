import { useState, useRef } from 'react'
import { createUser, joinTeam, updateUser } from '../api/client'

const Logo = () => (
  <div style={{ textAlign: 'center', marginBottom: 32 }}>
    <span className="logo" style={{ fontSize: 26 }}>
      OneOn<span className="accent">One</span>
    </span>
  </div>
)

function resizeImage(file, maxPx = 256) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = maxPx; canvas.height = maxPx
      const ctx = canvas.getContext('2d')
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, maxPx, maxPx)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })
}

export default function Onboarding({ email, onComplete }) {
  const initialInviteCode = new URLSearchParams(window.location.search).get('join') || ''
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [createdUser, setCreatedUser] = useState(null)

  // Step 2: profile fields
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [telegram, setTelegram] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [github, setGithub] = useState('')
  const [inviteCode, setInviteCode] = useState(initialInviteCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 3: photo
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarBase64, setAvatarBase64] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const fileRef = useRef()

  const handleRoleSelect = (r) => { setRole(r); setStep(2) }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Укажите имя'); return }
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        email,
        role,
        title: title.trim() || undefined,
        telegram: telegram.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        github: github.trim() || undefined,
      }
      const { data: newUser } = await createUser(payload)

      if (role === 'member' && inviteCode.trim()) {
        try { await joinTeam({ invite_code: inviteCode.trim(), user_id: newUser.id }) } catch {}
      }

      setCreatedUser(newUser)
      setStep(3)
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Ошибка сервера')
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await resizeImage(file)
    setAvatarPreview(b64)
    setAvatarBase64(b64)
  }

  const handlePhotoSave = async () => {
    if (!avatarBase64 || !createdUser) { finishOnboarding(createdUser); return }
    setPhotoLoading(true)
    try {
      await updateUser(createdUser.id, { avatar: avatarBase64 })
      finishOnboarding({ ...createdUser, avatar: avatarBase64 })
    } catch {
      finishOnboarding(createdUser)
    } finally {
      setPhotoLoading(false)
    }
  }

  const finishOnboarding = (user) => {
    localStorage.setItem('smart_user', JSON.stringify(user))
    onComplete(user)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }} className="anim-fade">
        <Logo />

        {/* Step 1: Role */}
        {step === 1 && (
          <div className="anim-slide">
            <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Кто вы?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { role: 'team_lead', icon: '👔', title: 'Тимлид', desc: 'Управляю командой, провожу 1-on-1 встречи' },
                { role: 'member', icon: '🧑‍💻', title: 'Участник команды', desc: 'Являюсь частью команды, участвую в 1-on-1 встречах' },
              ].map(opt => (
                <button
                  key={opt.role}
                  onClick={() => handleRoleSelect(opt.role)}
                  className="card card-interactive"
                  style={{ padding: '20px 22px', textAlign: 'left', width: '100%', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{opt.icon}</div>
                  <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)', marginBottom: 4 }}>{opt.title}</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Profile */}
        {step === 2 && (
          <div className="card anim-slide" style={{ padding: 28 }}>
            <button onClick={() => setStep(1)} className="btn btn-ghost btn-sm" style={{ marginBottom: 16, paddingLeft: 0 }}>
              ← Назад
            </button>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              {role === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник команды'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 22 }}>
              Расскажите немного о себе
            </p>
            <form onSubmit={handleProfileSubmit}>
              <div className="form-group">
                <label className="form-label">Имя <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Иван Иванов" className="input" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={email} className="input" disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Должность <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span></label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Senior Engineer" className="input" />
              </div>
              <div className="form-group">
                <label className="form-label">Telegram <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span></label>
                <input type="text" value={telegram} onChange={e => setTelegram(e.target.value)}
                  placeholder="@username" className="input" />
              </div>
              <div className="form-group">
                <label className="form-label">LinkedIn <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span></label>
                <input type="text" value={linkedin} onChange={e => setLinkedin(e.target.value)}
                  placeholder="linkedin.com/in/username" className="input" />
              </div>
              <div className="form-group">
                <label className="form-label">GitHub <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span></label>
                <input type="text" value={github} onChange={e => setGithub(e.target.value)}
                  placeholder="github.com/username" className="input" />
              </div>
              {role === 'member' && (
                <div className="form-group">
                  <label className="form-label">Код приглашения <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(необязательно)</span></label>
                  <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    placeholder="ABC123" className="input" style={{ fontFamily: 'var(--font-mono)' }} />
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
              <button type="submit" disabled={loading} className="btn btn-accent"
                style={{ width: '100%', padding: '13px 24px', fontSize: 15, marginTop: 4 }}>
                {loading ? 'Сохранение...' : 'Далее →'}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Photo */}
        {step === 3 && (
          <div className="card anim-slide" style={{ padding: 32, textAlign: 'center' }}>
            <h2 style={{ fontWeight: 600, fontSize: 18, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              Фото профиля
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 28 }}>
              Помогает коллегам узнать вас. Можно пропустить.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {/* Avatar preview */}
              <div
                className={`avatar ${avatarPreview ? '' : 'avatar-accent'}`}
                style={{ width: 96, height: 96, fontSize: 36, cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : (name?.charAt(0)?.toUpperCase() || '?')}
              </div>

              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />

              <button onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">
                {avatarPreview ? 'Выбрать другое' : 'Выбрать фото'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button
                onClick={() => finishOnboarding(createdUser)}
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={photoLoading}
              >
                Пропустить
              </button>
              {avatarPreview && (
                <button
                  onClick={handlePhotoSave}
                  className="btn btn-accent"
                  style={{ flex: 1 }}
                  disabled={photoLoading}
                >
                  {photoLoading ? 'Сохранение...' : 'Сохранить'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
