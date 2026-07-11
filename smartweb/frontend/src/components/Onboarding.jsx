import { useState, useRef } from 'react'
import { createUser, joinTeam, updateUser } from '../api/client'

const STYLES = `
@keyframes obFloat {
  0%,100%{transform:translateY(0)rotate(-1.5deg)}50%{transform:translateY(-12px)rotate(1.5deg)}
}
@keyframes obBlink {
  0%,88%,100%{transform:scaleY(1)}93%{transform:scaleY(0.08)}
}
@keyframes obShadow {
  0%,100%{transform:scaleX(1);opacity:0.3}50%{transform:scaleX(0.65);opacity:0.1}
}
@keyframes obGlow {
  0%,100%{box-shadow:0 12px 40px rgba(37,84,212,0.5)}
  50%{box-shadow:0 16px 50px rgba(37,84,212,0.7),0 0 24px 6px rgba(37,84,212,0.25)}
}
@keyframes obAntenna {
  0%,100%{box-shadow:0 0 6px 2px rgba(165,180,252,0.7)}
  50%{box-shadow:0 0 14px 5px rgba(165,180,252,1)}
}
@keyframes obOrb1 {
  0%,100%{transform:translate(0,0)scale(1)}33%{transform:translate(40px,-60px)scale(1.1)}66%{transform:translate(-30px,30px)scale(0.95)}
}
@keyframes obOrb2 {
  0%,100%{transform:translate(0,0)}40%{transform:translate(-50px,40px)}70%{transform:translate(35px,-20px)}
}
@keyframes obOrb3 {
  0%,100%{transform:translate(0,0)}50%{transform:translate(20px,-30px)}
}
@keyframes obSlideUp {
  from{opacity:0;transform:translateY(28px)scale(0.96)}to{opacity:1;transform:translateY(0)scale(1)}
}
@keyframes obPulse {
  0%,100%{box-shadow:0 0 0 0 rgba(37,84,212,0.5)}50%{box-shadow:0 0 0 6px rgba(37,84,212,0)}
}
@keyframes obSpin {
  from{transform:rotate(0deg)}to{transform:rotate(360deg)}
}
@keyframes obConfettiPop {
  0%{opacity:1;transform:scale(0)}50%{opacity:1;transform:scale(1.4)}100%{opacity:0;transform:scale(1)translateY(-60px)}
}
`

function PitBig() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 8 }}>
      <div style={{
        width: 90, height: 90, borderRadius: '50%', position: 'relative',
        background: 'radial-gradient(ellipse at 36% 30%,#c7d2fe 0%,#2554D4 38%,#3730a3 68%,#1e1b4b 100%)',
        animation: 'obFloat 3.2s ease-in-out infinite,obGlow 3.2s ease-in-out infinite',
      }}>
        {/* Antenna */}
        <div style={{ position:'absolute',top:-18,left:'50%',transform:'translateX(-50%)',width:4,height:16,background:'linear-gradient(to top,#2554D4,#a5b4fc)',borderRadius:4 }}>
          <div style={{ position:'absolute',top:-7,left:'50%',transform:'translateX(-50%)',width:11,height:11,borderRadius:'50%',background:'#c7d2fe',animation:'obAntenna 2s ease-in-out infinite' }} />
        </div>
        {/* Highlight */}
        <div style={{ position:'absolute',top:'16%',left:'18%',width:'34%',height:'24%',background:'radial-gradient(ellipse,rgba(255,255,255,0.52) 0%,transparent 70%)',borderRadius:'50%',transform:'rotate(-30deg)',pointerEvents:'none' }} />
        {/* Eyes */}
        <div style={{ position:'absolute',top:'32%',left:'22%',width:16,height:16,borderRadius:'50%',background:'#fff',animation:'obBlink 4.5s ease-in-out infinite',boxShadow:'0 0 8px rgba(199,210,254,0.9)' }}>
          <div style={{ position:'absolute',bottom:3,right:3,width:7,height:7,background:'#1e1b4b',borderRadius:'50%' }} />
        </div>
        <div style={{ position:'absolute',top:'32%',right:'22%',width:16,height:16,borderRadius:'50%',background:'#fff',animation:'obBlink 4.5s ease-in-out infinite 0.18s',boxShadow:'0 0 8px rgba(199,210,254,0.9)' }}>
          <div style={{ position:'absolute',bottom:3,right:3,width:7,height:7,background:'#1e1b4b',borderRadius:'50%' }} />
        </div>
        {/* Smile */}
        <div style={{ position:'absolute',bottom:'22%',left:'50%',transform:'translateX(-50%)',width:28,height:12,borderBottom:'3px solid rgba(255,255,255,0.75)',borderRadius:'0 0 28px 28px' }} />
      </div>
      <div style={{ width:72,height:12,borderRadius:'50%',margin:'4px auto 0',background:'rgba(79,70,229,0.4)',animation:'obShadow 3s ease-in-out infinite' }} />
      <div style={{ marginTop:8,fontSize:12,fontWeight:700,color:'#a5b4fc',background:'rgba(37,84,212,0.15)',border:'1px solid rgba(165,180,252,0.3)',borderRadius:10,padding:'3px 14px',letterSpacing:'0.04em' }}>Пит</div>
    </div>
  )
}

function Dots({ step, total }) {
  return (
    <div style={{ display:'flex',gap:8,justifyContent:'center',marginBottom:24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i + 1 === step ? 28 : 8, height: 8, borderRadius: 4,
          background: i + 1 === step ? '#2554D4' : 'rgba(255,255,255,0.18)',
          transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          animation: i + 1 === step ? 'obPulse 2s ease-in-out infinite' : 'none',
        }} />
      ))}
    </div>
  )
}

const glass = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.1)',
  padding: '28px 28px 24px',
  animation: 'obSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)',
}

const inp = {
  width:'100%', padding:'11px 14px', borderRadius:10,
  border:'1px solid rgba(255,255,255,0.15)',
  background:'rgba(255,255,255,0.07)', color:'#f1f5f9',
  fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box',
  transition:'border-color 0.2s',
}

const lbl = {
  fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.55)',
  textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6, display:'block',
}

function resizeImage(file, maxPx = 256) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = maxPx; canvas.height = maxPx
      canvas.getContext('2d').drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, maxPx, maxPx)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })
}

export default function Onboarding({ email, onComplete }) {
  const initialCode = new URLSearchParams(window.location.search).get('join') || ''
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [createdUser, setCreatedUser] = useState(null)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [telegram, setTelegram] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [github, setGithub] = useState('')
  const [inviteCode, setInviteCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarBase64, setAvatarBase64] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef()

  const handleRoleSelect = r => { setRole(r); setStep(2) }

  const handleProfileSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Укажите имя'); return }
    setLoading(true)
    try {
      const payload = {
        name: name.trim(), email, role,
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
    } finally { setLoading(false) }
  }

  const handlePhotoChange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await resizeImage(file)
    setAvatarBase64(b64)
    setAvatarPreview(b64)
  }

  const finish = user => {
    setDone(true)
    localStorage.setItem('smart_user', JSON.stringify(user))
    setTimeout(() => onComplete(user), 1400)
  }

  const handlePhotoSave = async () => {
    if (!avatarBase64 || !createdUser) { finish(createdUser); return }
    setPhotoLoading(true)
    try {
      await updateUser(createdUser.id, { avatar: avatarBase64 })
      finish({ ...createdUser, avatar: avatarBase64 })
    } catch { finish(createdUser) }
    finally { setPhotoLoading(false) }
  }

  const fOpts = e => { e.target.style.borderColor = 'rgba(37,84,212,0.7)' }
  const fOut  = e => { e.target.style.borderColor = 'rgba(255,255,255,0.15)' }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{
        minHeight:'100vh', position:'relative', overflowY:'auto',
        background:'linear-gradient(135deg,#0a1330 0%,#1e40af 55%,#172554 100%)',
        display:'flex', padding:'56px 20px', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      }}>
        {/* Orbs */}
        <div style={{ position:'absolute',top:'8%',left:'5%',width:340,height:340,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(37,84,212,0.22) 0%,transparent 70%)',animation:'obOrb1 9s ease-in-out infinite',pointerEvents:'none',filter:'blur(2px)' }} />
        <div style={{ position:'absolute',bottom:'10%',right:'4%',width:280,height:280,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(59,110,240,0.18) 0%,transparent 70%)',animation:'obOrb2 11s ease-in-out infinite',pointerEvents:'none',filter:'blur(2px)' }} />
        <div style={{ position:'absolute',top:'50%',left:'68%',width:190,height:190,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(59,130,246,0.14) 0%,transparent 70%)',animation:'obOrb3 7s ease-in-out infinite',pointerEvents:'none' }} />
        <div style={{ position:'absolute',top:'72%',left:'12%',width:150,height:150,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(167,139,250,0.16) 0%,transparent 70%)',animation:'obOrb1 13s ease-in-out infinite reverse',pointerEvents:'none' }} />

        <div style={{ width:'100%',maxWidth:460,position:'relative',zIndex:1,margin:'auto' }}>
          <div style={{ display:'flex',justifyContent:'center',marginBottom:16 }}><PitBig /></div>

          <div style={{ textAlign:'center',marginBottom:20 }}>
            <span style={{ fontSize:24,fontWeight:800,color:'#fff',letterSpacing:'-0.02em' }}>
              OneOn<span style={{ color:'#818cf8' }}>One</span>
            </span>
          </div>

          <Dots step={step} total={3} />

          {/* ── Step 1: Role ── */}
          {step === 1 && (
            <div style={glass}>
              <h2 style={{ textAlign:'center',marginBottom:8,fontSize:22,fontWeight:700,color:'#fff' }}>Добро пожаловать!</h2>
              <p style={{ textAlign:'center',fontSize:14,color:'rgba(255,255,255,0.5)',marginBottom:24 }}>
                Пит поможет настроить рабочее пространство. Кто вы?
              </p>
              <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
                {[
                  { role:'team_lead', emoji:'👔', title:'Тимлид', desc:'Провожу 1-on-1 встречи, управляю командой и задачами' },
                  { role:'member',    emoji:'🧑‍💻', title:'Участник команды', desc:'Участвую во встречах, работаю над задачами' },
                ].map(opt => (
                  <button key={opt.role} onClick={() => handleRoleSelect(opt.role)} style={{
                    textAlign:'left',width:'100%',cursor:'pointer',padding:'18px 20px',
                    background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
                    borderRadius:14,transition:'all 0.2s',color:'inherit',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(37,84,212,0.15)';e.currentTarget.style.borderColor='rgba(37,84,212,0.5)';e.currentTarget.style.transform='translateY(-2px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.borderColor='rgba(255,255,255,0.1)';e.currentTarget.style.transform='translateY(0)'}}>
                    <div style={{ fontSize:28,marginBottom:8 }}>{opt.emoji}</div>
                    <p style={{ fontWeight:700,fontSize:16,color:'#fff',marginBottom:4 }}>{opt.title}</p>
                    <p style={{ fontSize:13,color:'rgba(255,255,255,0.5)' }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Profile ── */}
          {step === 2 && (
            <div style={glass}>
              <button onClick={() => setStep(1)} style={{ background:'none',border:'none',color:'rgba(255,255,255,0.45)',cursor:'pointer',fontSize:13,marginBottom:16,padding:0,display:'flex',alignItems:'center',gap:4 }}>← Назад</button>
              <h2 style={{ fontSize:20,fontWeight:700,color:'#fff',marginBottom:4 }}>
                {role === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник'}
              </h2>
              <p style={{ fontSize:14,color:'rgba(255,255,255,0.45)',marginBottom:22 }}>Расскажите немного о себе</p>
              <form onSubmit={handleProfileSubmit}>
                {[
                  { label:'Имя *',      val:name,      set:setName,     ph:'Иван Иванов',       req:true },
                  { label:'Должность',  val:title,     set:setTitle,    ph:'Senior Engineer' },
                  { label:'Telegram',   val:telegram,  set:setTelegram, ph:'@username' },
                  { label:'LinkedIn',   val:linkedin,  set:setLinkedin, ph:'linkedin.com/in/...' },
                  { label:'GitHub',     val:github,    set:setGithub,   ph:'github.com/...' },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom:14 }}>
                    <label style={lbl}>{f.label}</label>
                    <input type="text" value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder={f.ph} required={f.req} style={inp} onFocus={fOpts} onBlur={fOut} />
                  </div>
                ))}
                <div style={{ marginBottom:14 }}>
                  <label style={lbl}>Email</label>
                  <input type="email" value={email} disabled style={{ ...inp,opacity:0.45,cursor:'not-allowed' }} />
                </div>
                {role === 'member' && (
                  <div style={{ marginBottom:14 }}>
                    <label style={lbl}>Код приглашения</label>
                    <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                      placeholder="ABC123" style={{ ...inp,fontFamily:'monospace' }} onFocus={fOpts} onBlur={fOut} />
                  </div>
                )}
                {error && (
                  <div style={{ background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',color:'#fca5a5',borderRadius:10,padding:'11px 14px',fontSize:13,marginBottom:14 }}>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading} style={{
                  width:'100%',padding:'13px 24px',fontSize:15,fontWeight:700,
                  background:loading?'rgba(37,84,212,0.4)':'linear-gradient(135deg,#2554D4,#4f46e5)',
                  color:'#fff',border:'none',borderRadius:12,cursor:loading?'default':'pointer',
                  boxShadow:'0 4px 16px rgba(37,84,212,0.35)',transition:'all 0.2s',
                }}>
                  {loading ? 'Сохранение...' : 'Далее →'}
                </button>
              </form>
            </div>
          )}

          {/* ── Step 3: Photo ── */}
          {step === 3 && (
            <div style={{ ...glass, textAlign:'center' }}>
              {!done ? (
                <>
                  <h2 style={{ fontSize:20,fontWeight:700,color:'#fff',marginBottom:8 }}>Фото профиля</h2>
                  <p style={{ fontSize:14,color:'rgba(255,255,255,0.45)',marginBottom:28 }}>
                    Помогает коллегам узнать вас. Можно пропустить.
                  </p>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      width:100,height:100,borderRadius:'50%',margin:'0 auto 16px',cursor:'pointer',
                      background:avatarPreview?'transparent':'linear-gradient(135deg,#2554D4,#4f46e5)',
                      border:'3px solid rgba(37,84,212,0.5)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:36,color:'#fff',fontWeight:700,overflow:'hidden',
                      boxShadow:'0 8px 24px rgba(37,84,212,0.3)',transition:'transform 0.2s',
                    }}
                    onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'}
                    onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
                  >
                    {avatarPreview
                      ? <img src={avatarPreview} alt="preview" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
                      : (name?.charAt(0)?.toUpperCase() || '?')}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhotoChange} />
                  <button onClick={() => fileRef.current?.click()} style={{
                    background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',
                    color:'#fff',borderRadius:10,padding:'8px 20px',cursor:'pointer',fontSize:13,fontWeight:600,marginBottom:24,
                  }}>
                    {avatarPreview ? 'Выбрать другое' : '+ Выбрать фото'}
                  </button>
                  <div style={{ display:'flex',gap:12 }}>
                    <button onClick={() => finish(createdUser)} disabled={photoLoading} style={{
                      flex:1,padding:'12px',background:'rgba(255,255,255,0.07)',
                      border:'1px solid rgba(255,255,255,0.15)',color:'rgba(255,255,255,0.65)',
                      borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:600,
                    }}>Пропустить</button>
                    {avatarPreview && (
                      <button onClick={handlePhotoSave} disabled={photoLoading} style={{
                        flex:1,padding:'12px',background:'linear-gradient(135deg,#2554D4,#4f46e5)',
                        border:'none',color:'#fff',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:700,
                        boxShadow:'0 4px 16px rgba(37,84,212,0.35)',
                      }}>{photoLoading ? 'Сохранение...' : 'Сохранить →'}</button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ animation:'obSlideUp 0.5s ease' }}>
                  <div style={{ width:64,height:64,borderRadius:'50%',background:'rgba(255,255,255,0.12)',border:'2px solid rgba(255,255,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',animation:'obConfettiPop 0.6s ease' }}><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><polyline points="5,14 11,20 23,8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                  <h2 style={{ fontSize:22,fontWeight:700,color:'#fff',marginBottom:8 }}>Всё готово!</h2>
                  <p style={{ fontSize:14,color:'rgba(255,255,255,0.55)' }}>Открываем рабочее пространство...</p>
                  <div style={{ marginTop:20,display:'flex',justifyContent:'center' }}>
                    <div style={{ width:28,height:28,borderRadius:'50%',border:'3px solid rgba(37,84,212,0.3)',borderTopColor:'#2554D4',animation:'obSpin 0.8s linear infinite' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
