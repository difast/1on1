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

    if (!name.trim()) {
      setError('Имя обязательно')
      return
    }
    if (!email.trim()) {
      setError('Email обязателен')
      return
    }

    setLoading(true)
    try {
      const { data: newUser } = await createUser({ name: name.trim(), email: email.trim(), title: title.trim() || undefined, role })

      if (role === 'member' && inviteCode.trim()) {
        try {
          await joinTeam({ invite_code: inviteCode.trim(), user_id: newUser.id })
        } catch {
          // silent — user can join team later from dashboard
        }
      }

      const userToStore = { ...newUser }
      localStorage.setItem('smart_user', JSON.stringify(userToStore))
      onComplete(userToStore)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Произошла ошибка. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">Smart 1-on-1</h1>
          <p className="text-gray-500 mt-2">Эффективные встречи с командой</p>
        </div>

        {/* Step 1: Role selection */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">Кто вы?</h2>
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleRoleSelect('team_lead')}
                className="bg-white border-2 border-gray-200 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all hover:shadow-md group"
              >
                <div className="text-4xl mb-3">👔</div>
                <h3 className="text-lg font-semibold text-gray-800 group-hover:text-indigo-600">Тимлид</h3>
                <p className="text-sm text-gray-500 mt-1">Управляю командой, провожу 1-on-1 встречи с сотрудниками</p>
              </button>

              <button
                onClick={() => handleRoleSelect('member')}
                className="bg-white border-2 border-gray-200 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all hover:shadow-md group"
              >
                <div className="text-4xl mb-3">🧑‍💻</div>
                <h3 className="text-lg font-semibold text-gray-800 group-hover:text-indigo-600">Участник команды</h3>
                <p className="text-sm text-gray-500 mt-1">Являюсь частью команды, участвую в 1-on-1 встречах</p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Profile details */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1"
            >
              ← Назад
            </button>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">
              {role === 'team_lead' ? '👔 Тимлид' : '🧑‍💻 Участник команды'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">Расскажите немного о себе</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Имя <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ivan@company.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Должность <span className="text-gray-400">(необязательно)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Senior Engineer"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {role === 'member' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Код приглашения <span className="text-gray-400">(необязательно)</span>
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="ABC123"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">Если у вас есть ссылка-приглашение от тимлида</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
