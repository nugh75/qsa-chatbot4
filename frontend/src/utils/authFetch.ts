import { CredentialManager } from '../crypto'

export const BACKEND: string =
  (import.meta as any).env?.VITE_BACKEND_URL
  ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005')

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const attachAuth = (token: string | null): HeadersInit => ({
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  })

  let access = CredentialManager.getAccessToken()
  let res = await fetch(url, { ...init, headers: attachAuth(access) })

  if (res.status === 401) {
    const refresh = CredentialManager.getRefreshToken()
    if (refresh) {
      try {
        const r = await fetch(`${BACKEND}/api/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${refresh}` }
        })
        if (r.ok) {
          const data = await r.json()
          if (data?.access_token) {
            CredentialManager.updateAccessToken(data.access_token)
            access = data.access_token
            res = await fetch(url, { ...init, headers: attachAuth(access) })
          }
        }
      } catch { /* ignore */ }
    }
  }

  return res
}
