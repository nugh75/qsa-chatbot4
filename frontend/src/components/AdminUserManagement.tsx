// Deprecated AdminUserManagement (legacy). Not used by current routes.
// Managed users now live under the full-page AdminPanel at `src/AdminPanel.tsx`.
import React from 'react'

export default function AdminUserManagementDeprecated() {
  if (import.meta && (import.meta as any).env?.DEV) {
    console.warn('[deprecated] components/AdminUserManagement is unused. Use src/AdminPanel.tsx')
  }
  return null
}
