// Deprecated dialog-based AdminPanel (unused).
// The application uses the full-page AdminPanel at `src/AdminPanel.tsx`.
// This stub remains only to avoid breaking imports in stale branches.
import React from 'react'

export default function AdminPanelDeprecated() {
  if (import.meta && (import.meta as any).env?.DEV) {
    console.warn('[deprecated] components/AdminPanel is unused. Use src/AdminPanel.tsx')
  }
  return null
}
