import React, { useEffect, useMemo, useState } from 'react'
import {
  Container, Paper, Typography, TextField, Button, Stack, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Card, CardContent, Grid, Divider, Alert, Chip, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, IconButton, CircularProgress,
  Tooltip, Slider
} from '@mui/material'
import Avatar from '@mui/material/Avatar'
import { Settings as SettingsIcon, VolumeUp as VolumeIcon, Psychology as AIIcon, Analytics as StatsIcon, ExpandMore as ExpandMoreIcon, Mic as MicIcon, Key as KeyIcon, Storage as StorageIcon, Description as DescriptionIcon, Chat as ChatIcon, SportsKabaddi as ArenaIcon } from '@mui/icons-material'

import UserManagement from './components/UserManagement'
import ModelProvidersPanel from './components/ModelProvidersPanel'
import TTSProvidersPanel from './components/TTSProvidersPanel'
import WhisperPanel from './components/WhisperPanel'
import MemoryPanel from './components/MemoryPanel';
import UsagePanel from './components/UsagePanel';
import SummarySettingsPanel from './components/SummarySettingsPanel';
import SystemPromptsPanel from './components/SystemPromptsPanel'
import SummaryPromptsPanel from './components/SummaryPromptsPanel'
import PersonalitiesPanel from './components/PersonalitiesPanel'
import APIDocsPanel from './components/APIDocsPanel'
import { authFetch, BACKEND } from './utils/authFetch'
import type { AdminConfig, FeedbackStats } from './types/admin'

const AdminPanel: React.FC = () => {
  // Stato principale
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [arenaPublic, setArenaPublic] = useState<boolean>(false)
  const [savingArena, setSavingArena] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // UI stato locale
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    providers: true,
    tts: false,
  transcription: false,
    prompts: false,
    personalities: false,
    user_management: true,
  usage: false,
  summary: false,
  memory: false,
  apidocs: false
  })

  // Token test
  const [tokenTestInput, setTokenTestInput] = useState<string>('Ciao! Questo è un test.')
  const [testingTokens, setTestingTokens] = useState<boolean>(false)
  const [tokenTestResult, setTokenTestResult] = useState<any>(null)

  // Memo per provider e voci disponibili
  const providerNames = useMemo(() => {
    if (!config) return []
    return Object.keys(config.ai_providers)
  }, [config])

  const ttsNames = useMemo(() => {
    if (!config) return []
    return Object.keys(config.tts_providers)
  }, [config])

  // Caricamenti
  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config`)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data: AdminConfig = await res.json()
      setConfig(data)
    } catch (e) {
      setError('Errore nel caricamento della configurazione')
    } finally {
      setLoading(false)
    }
  }

  const loadUsage = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/feedback/stats`)
      if (res.ok) {
        const data: FeedbackStats = await res.json()
        setFeedbackStats(data)
      }
    } catch {
      /* opzionale: silenzioso */
    }
  }

  const loadUiSettings = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`)
      if (res.ok) {
        const data = await res.json()
        setArenaPublic(Boolean(data?.settings?.arena_public))
      }
    } catch {/* ignore */}
  }

  useEffect(() => {
    loadConfig()
    loadUsage()
    loadUiSettings()
  }, [])

  const toggleArenaPublic = async (value: boolean) => {
    setSavingArena(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arena_public: value })
      })
      if (res.ok) {
        setArenaPublic(value)
      }
    } catch {/* noop */} finally {
      setSavingArena(false)
    }
  }

  const handlePanelExpansion = (panel: string) => (_: any, isExpanded: boolean) => {
    setExpandedPanels(prev => ({
      ...prev,
      [panel]: isExpanded
    }))
  }

  const runTokenTest = async () => {
    if (!tokenTestInput.trim()) return
    setTestingTokens(true)
    setTokenTestResult(null)
    try {
      const res = await authFetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': config?.default_provider || 'local'
        },
        body: JSON.stringify({ message: tokenTestInput })
      })
      const data = await res.json()
      setTokenTestResult(data)
    } catch {
      setTokenTestResult({ error: 'Errore chiamata' })
    } finally {
      setTestingTokens(false)
    }
  }

  const updateDefaultProvider = async (value: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config/default-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: value })
      })
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, default_provider: value } as AdminConfig : prev)
      }
    } catch {
      /* noop */
    }
  }

  const updateDefaultTTS = async (value: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config/default-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tts: value })
      })
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, default_tts: value } as AdminConfig : prev)
      }
    } catch {
      /* noop */
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <SettingsIcon />
        <Typography variant="h5" sx={{ mr: 2 }}>Pannello di amministrazione</Typography>
        <Button size="small" startIcon={<ChatIcon />} href="/" variant="outlined">Chat</Button>
        <Button size="small" startIcon={<ArenaIcon />} href="/arena" variant="outlined">Arena</Button>
        <FormControlLabel sx={{ ml: 1 }} control={<Switch size="small" checked={arenaPublic} onChange={(e)=> toggleArenaPublic(e.target.checked)} />} label={savingArena ? 'Arena…' : 'Arena pubblica'} />
        {loading && <LinearProgress sx={{ flexBasis: '100%', mt: 1 }} />}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Providers */}
      <Accordion expanded={expandedPanels.providers} onChange={handlePanelExpansion('providers')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon fontSize="small" />
            <Typography variant="h6">Modelli e provider</Typography>
            {config && <Chip size="small" label={config.default_provider ? `default: ${config.default_provider}` : 'default: -'} />}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Card>
            <CardContent>
              {!config ? (
                <Typography color="text.secondary">Caricamento configurazione…</Typography>
              ) : (
                <>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="default-provider-label">Provider predefinito</InputLabel>
                        <Select
                          labelId="default-provider-label"
                          label="Provider predefinito"
                          value={config.default_provider || ''}
                          onChange={(e) => updateDefaultProvider(e.target.value)}
                        >
                          {providerNames.map(p => (
                            <MenuItem key={p} value={p}>{p}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  <ModelProvidersPanel config={config as any} onConfigUpdate={(next) => setConfig(prev => prev ? ({ ...prev, ...next } as any) : prev)} />
                </>
              )}
            </CardContent>
          </Card>
        </AccordionDetails>
      </Accordion>

      {/* TTS */}
      <Accordion expanded={expandedPanels.tts} onChange={handlePanelExpansion('tts')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VolumeIcon fontSize="small" />
            <Typography variant="h6">Sintesi vocale (TTS)</Typography>
            {config && <Chip size="small" label={config.default_tts ? `default: ${config.default_tts}` : 'default: -'} />}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Card>
            <CardContent>
              {!config ? (
                <Typography color="text.secondary">Caricamento…</Typography>
              ) : (
                <>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="default-tts-label">TTS predefinito</InputLabel>
                        <Select
                          labelId="default-tts-label"
                          label="TTS predefinito"
                          value={config.default_tts || ''}
                          onChange={(e) => updateDefaultTTS(e.target.value)}
                        >
                          {ttsNames.map(t => (
                            <MenuItem key={t} value={t}>{t}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  <TTSProvidersPanel config={config as any} onConfigUpdate={(next) => setConfig(prev => prev ? ({ ...prev, ...next } as any) : prev)} />
                </>
              )}
            </CardContent>
          </Card>
        </AccordionDetails>
      </Accordion>

      {/* Gestione Utenti */}
      <Accordion expanded={expandedPanels.user_management} onChange={handlePanelExpansion('user_management')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon fontSize="small" />
            <Typography variant="h6">Gestione Utenti</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <UserManagement />
        </AccordionDetails>
      </Accordion>

      {/* Utilizzo & Feedback panel nuovo */}
      <Accordion expanded={expandedPanels.usage} onChange={handlePanelExpansion('usage')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatsIcon fontSize="small" />
            <Typography variant="h6">Utilizzo & Feedback</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <UsagePanel />
        </AccordionDetails>
      </Accordion>

      {/* Riepilogo conversazioni settings */}
      <Accordion expanded={expandedPanels.summary} onChange={handlePanelExpansion('summary')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Riepilogo conversazioni</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <SummarySettingsPanel />
        </AccordionDetails>
      </Accordion>

      {/* Memoria conversazioni */}
      <Accordion expanded={expandedPanels.memory} onChange={handlePanelExpansion('memory')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon fontSize="small" />
            <Typography variant="h6">Memoria</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <MemoryPanel />
        </AccordionDetails>
      </Accordion>

      {/* Trascrizione (Whisper) */}
      <Accordion expanded={expandedPanels.transcription} onChange={handlePanelExpansion('transcription')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MicIcon fontSize="small" />
            <Typography variant="h6">Trascrizione (Whisper)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <WhisperPanel />
        </AccordionDetails>
      </Accordion>

      {/* Prompts (System & Summary) */}
      <Accordion expanded={expandedPanels.prompts} onChange={handlePanelExpansion('prompts')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Prompts (System & Summary)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <SystemPromptsPanel />
            <SummaryPromptsPanel />
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Personalità */}
      <Accordion expanded={expandedPanels.personalities} onChange={handlePanelExpansion('personalities')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon fontSize="small" />
            <Typography variant="h6">Personalità</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <PersonalitiesPanel />
        </AccordionDetails>
      </Accordion>

  {/* FastAPI Endpoints */}
      <Accordion expanded={expandedPanels.apidocs} onChange={handlePanelExpansion('apidocs')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
    <Typography variant="h6">FastAPI Endpoints</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <APIDocsPanel />
        </AccordionDetails>
      </Accordion>
    </Container>
  )
}

export default AdminPanel
