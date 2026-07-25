// Хранение собственного JWT (замена Supabase-сессии). Токен кладём в
// localStorage; axios-интерсептор в api/client.js подставляет его в заголовок
// Authorization на каждый запрос.
const TOKEN_KEY = 'auth_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

// Сессия администратора. Тот же механизм хранения, что и у обычного токена
// (localStorage), — чтобы обновление страницы (F5) не разлогинивало админа.
// Мобильное приложение аналогично хранит признак админ-режима в AsyncStorage.
const ADMIN_KEY = 'admin_session'

export function getAdminSession() {
  try { return localStorage.getItem(ADMIN_KEY) === '1' } catch { return false }
}

export function setAdminSession(on) {
  try {
    if (on) localStorage.setItem(ADMIN_KEY, '1')
    else localStorage.removeItem(ADMIN_KEY)
  } catch { /* ignore */ }
}
