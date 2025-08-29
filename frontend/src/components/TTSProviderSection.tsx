import React, { useState, useCallback } from 'react'
import { Paper, Stack, Typography, IconButton, Chip, Collapse, FormControl, InputLabel, Select, MenuItem, Button, LinearProgress, Alert } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { authFetch, BACKEND } from '../utils/authFetch'

export interface TTSProviderConfig {
  key: string
  enabled?: boolean
  voices?: string[]
  selected_voice?: string
  api_key_status?: string
}

interface Props {
  provider: TTSProviderConfig
  onVoiceChange: (providerKey: string, voice: string) => Promise<void> | void
}

const TTSProviderSection: React.FC<Props> = ({ provider, onVoiceChange }) => {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(provider.selected_voice || '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const toggle = () => setOpen(o => !o)

  const handleSelect = async (value: string) => {
    setSelected(value)
    await onVoiceChange(provider.key, value)
  }

  const testVoice = useCallback(async () => {
    if (!selected) return
    setTesting(true)
    setResult(null)
    try {
      const res = await authFetch(`${BACKEND}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test voce sintetica.', provider: provider.key, voice: selected })
      })
      if (!res.ok) {
        let detail = ''
        try {
          const maybe = await res.json()
          detail = maybe.detail || JSON.stringify(maybe)
        } catch { /* ignore */ }
        setResult(`Errore TTS (${res.status}) ${detail}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
      setResult('Riproduzione avviata')
    } catch (e: any) {
      setResult('Errore chiamata: ' + (e?.message || 'sconosciuto'))
    } finally { setTesting(false) }
  }, [provider.key, selected])

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" onClick={toggle} sx={{ cursor: 'pointer' }}>
        <IconButton size="small" onClick={toggle}>
          <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s' }} />
        </IconButton>
        <VolumeUpIcon fontSize="small" />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>{provider.key}</Typography>
        {provider.enabled ? <Chip size="small" color="success" label="on" /> : <Chip size="small" label="off" />}
        {provider.api_key_status && <Chip size="small" label={provider.api_key_status === 'configured' ? 'key ok' : 'key ?'} />}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1} sx={{ mt: 1, pl: 5 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Voce</InputLabel>
            <Select label="Voce" value={selected} onChange={e => handleSelect(e.target.value)}>
              {(provider.voices || []).map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
          </FormControl>
          <Button size="small" variant="outlined" onClick={testVoice} disabled={!selected || testing} startIcon={<PlayArrowIcon fontSize="small" />}>Test</Button>
          {testing && <LinearProgress sx={{ maxWidth: 240 }} />}
          {result && <Alert severity={result.startsWith('Richiesta') ? 'success' : 'error'}>{result}</Alert>}
        </Stack>
      </Collapse>
    </Paper>
  )
}

export default TTSProviderSection
