import React, { useCallback } from 'react'
import { Stack } from '@mui/material'
import TTSProviderSection, { TTSProviderConfig } from './TTSProviderSection'
import { AdminConfig } from '../types/admin'
import { authFetch, BACKEND } from '../utils/authFetch'

interface Props {
  config: AdminConfig
  onConfigUpdate: (next: Partial<AdminConfig>) => void
}

const TTSProvidersPanel: React.FC<Props> = ({ config, onConfigUpdate }) => {
  const providersObj: Record<string, any> = config.tts_providers as any
  const providersArray: TTSProviderConfig[] = Object.entries(providersObj).map(([key, value]) => ({ key, ...value as any }))

  const updateSelectedVoice = useCallback(async (providerKey: string, voice: string) => {
    const nextProviders = { ...providersObj, [providerKey]: { ...providersObj[providerKey], selected_voice: voice } }
    const nextConfig: AdminConfig = { ...(config as any), tts_providers: nextProviders }
    try {
      await authFetch(`${BACKEND}/api/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig)
      })
      onConfigUpdate({ tts_providers: nextProviders as any })
    } catch {/* noop */}
  }, [providersObj, config, onConfigUpdate])

  return (
    <Stack spacing={1.2} sx={{ mt: 1 }}>
      {providersArray.map(p => (
        <TTSProviderSection key={p.key} provider={p} onVoiceChange={updateSelectedVoice} />
      ))}
    </Stack>
  )
}

export default TTSProvidersPanel
