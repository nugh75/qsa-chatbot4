import { CredentialManager } from '../crypto'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8005'

export const authFetch = async (url: string, init: RequestInit = {}) => {
  const attachAuth = (token: string | null) => ({
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  } as HeadersInit)

  let access = CredentialManager.getAccessToken()
  let res = await fetch(url, { ...init, headers: attachAuth(access) })

  if (res.status === 401) {
    // Try refresh
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
      } catch {}
    }
  }

  return res
}

