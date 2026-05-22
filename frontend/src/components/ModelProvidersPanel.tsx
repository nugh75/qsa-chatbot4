import React, { useCallback, useState } from 'react'
import { Stack, Button, Accordion, AccordionSummary, AccordionDetails, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SettingsIcon from '@mui/icons-material/Settings'
import ModelProviderSection, { ProviderConfig } from './ModelProviderSection'
import APIKeysManagementPanel from './APIKeysManagementPanel'
import { authFetch, BACKEND } from '../utils/authFetch'
import { AdminConfig } from '../types/admin'

interface Props {
  config: AdminConfig
  onConfigUpdate: (next: Partial<AdminConfig>) => void
}

const ModelProvidersPanel: React.FC<Props> = ({ config, onConfigUpdate }) => {
  const [showAPIKeysPanel, setShowAPIKeysPanel] = useState(false)
  
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

  const handleOpenAPIKeysPanel = () => {
    setShowAPIKeysPanel(true)
  }

  return (
    <Stack spacing={1.2} sx={{ mt: 1 }}>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SettingsIcon sx={{ mr: 1 }} />
          <Typography variant="subtitle1">Gestione API Keys</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <APIKeysManagementPanel />
        </AccordionDetails>
      </Accordion>
      
      <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
        Provider AI Configurati
      </Typography>
      
      {providersArray.map(p => (
        <ModelProviderSection 
          key={p.key} 
          provider={p} 
          onModelChange={updateSelectedModel}
          onOpenAPIKeysPanel={handleOpenAPIKeysPanel}
        />
      ))}
    </Stack>
  )
}

export default ModelProvidersPanel
