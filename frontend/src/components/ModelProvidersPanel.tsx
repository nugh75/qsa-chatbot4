import React, { useCallback } from 'react'
import { Stack } from '@mui/material'
import ModelProviderSection, { ProviderConfig } from './ModelProviderSection'
import { authFetch, BACKEND } from '../utils/authFetch'
import { AdminConfig } from '../types/admin'

interface Props {
  config: AdminConfig
  onConfigUpdate: (next: Partial<AdminConfig>) => void
}

const ModelProvidersPanel: React.FC<Props> = ({ config, onConfigUpdate }) => {
  const providersObj: Record<string, any> = config.ai_providers as unknown as Record<string, any>
  const providersArray: ProviderConfig[] = Object.entries(providersObj).map(([key, value]) => ({ key, ...value }))

  const updateSelectedModel = useCallback(async (providerKey: string, model: string) => {
    const nextProviders = { ...providersObj, [providerKey]: { ...providersObj[providerKey], selected_model: model } }
    const nextConfig: AdminConfig = { ...(config as any), ai_providers: nextProviders }
    try {
      await authFetch(`${BACKEND}/api/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig)
      })
      onConfigUpdate({ ai_providers: nextProviders as any })
    } catch {/* noop */}
  }, [providersObj, config, onConfigUpdate])

  return (
    <Stack spacing={1.2} sx={{ mt: 1 }}>
      {providersArray.map(p => (
        <ModelProviderSection key={p.key} provider={p} onModelChange={updateSelectedModel} />
      ))}
    </Stack>
  )
}

export default ModelProvidersPanel
