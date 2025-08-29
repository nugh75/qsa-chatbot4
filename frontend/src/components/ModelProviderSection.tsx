import React, { useState, useEffect, useCallback } from 'react'
import { Box, Stack, Typography, Chip, FormControl, InputLabel, Select, MenuItem, Button, Collapse, Paper, LinearProgress, Alert, IconButton, Tooltip } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckIcon from '@mui/icons-material/Check'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { authFetch, BACKEND } from '../utils/authFetch'

export interface ProviderConfig {
  key: string
  name: string
  enabled?: boolean
  api_key_status?: string
  api_key_masked?: string
  models?: string[]
  selected_model?: string
  base_url?: string
}

interface Props {
  provider: ProviderConfig
  onModelChange: (providerKey: string, model: string) => Promise<void> | void
}

const ModelProviderSection: React.FC<Props> = ({ provider, onModelChange }) => {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<string[]>(provider.models || [])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [selected, setSelected] = useState(provider.selected_model || '')

  const toggle = () => setOpen(o => !o)

  const fetchModels = useCallback(async () => {
    setLoadingModels(true)
    setTestResult(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/models/${provider.key}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.models)) {
          setModels(data.models)
        }
      }
    } catch {/* ignore */} finally { setLoadingModels(false) }
  }, [provider.key])

  const handleSelect = async (value: string) => {
    setSelected(value)
    await onModelChange(provider.key, value)
  }

  const runTest = async () => {
    if (!selected) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await authFetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': provider.key,
          'X-LLM-Model': selected
        },
        body: JSON.stringify({ message: 'Ping di test modello.' })
      })
      const data = await res.json()
      if (data.error) {
        setTestResult(`Errore: ${data.error}`)
      } else {
        setTestResult('OK risposta ricevuta')
      }
    } catch (e:any) {
      setTestResult('Errore chiamata')
    } finally { setTesting(false) }
  }

  useEffect(() => {
    // auto open if enabled and has selected
    if (provider.enabled) setOpen(true)
  }, [provider.enabled])

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} onClick={toggle} sx={{ cursor: 'pointer' }}>
        <IconButton size="small" onClick={toggle}>
          <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }} />
        </IconButton>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>{provider.name || provider.key}</Typography>
        {provider.enabled ? <Chip size="small" color="success" label="on" /> : <Chip size="small" label="off" />}
        {provider.api_key_status && <Chip size="small" label={provider.api_key_status === 'configured' ? 'key ok' : 'key ?'} />}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1, pl: 5 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Modello</InputLabel>
              <Select label="Modello" value={selected} onChange={e => handleSelect(e.target.value)}>
                {models.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <Tooltip title="Ricarica lista modelli"><span>
              <IconButton size="small" onClick={fetchModels} disabled={loadingModels}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span></Tooltip>
            <Tooltip title="Test modello"><span>
              <IconButton size="small" onClick={runTest} disabled={!selected || testing}>
                <PlayArrowIcon fontSize="small" />
              </IconButton>
            </span></Tooltip>
          </Stack>
          {loadingModels && <LinearProgress sx={{ my: 1, maxWidth: 300 }} />}
          {testResult && <Alert severity={testResult.startsWith('OK') ? 'success' : 'error'} sx={{ mt: 1, maxWidth: 360 }}>{testResult}</Alert>}
          {!selected && <Typography variant="caption" color="text.secondary">Seleziona un modello.</Typography>}
        </Box>
      </Collapse>
    </Paper>
  )
}

export default ModelProviderSection
