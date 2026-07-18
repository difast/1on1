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
