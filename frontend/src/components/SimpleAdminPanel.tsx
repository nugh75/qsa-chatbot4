// Deprecated SimpleAdminPanel (unused).
// The application uses the full-page AdminPanel at `src/AdminPanel.tsx`.
import React from 'react'

export default function SimpleAdminPanelDeprecated() {
  if (import.meta && (import.meta as any).env?.DEV) {
    console.warn('[deprecated] components/SimpleAdminPanel is unused. Use src/AdminPanel.tsx')
  }
  return null
}
