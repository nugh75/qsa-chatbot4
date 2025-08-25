import React, { useState, useEffect } from 'react'
import {
  Container, Paper, Typography, TextField, Button, Stack, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Card, CardContent, Grid, Divider, Alert, Chip, LinearProgress
} from '@mui/material'
import {
  Settings as SettingsIcon,
  VolumeUp as VolumeIcon,
  Psychology as AIIcon,
  Analytics as StatsIcon,
  Security as SecurityIcon
} from '@mui/icons-material'

interface AdminConfig {
  ai_providers: {
    local: { enabled: boolean; name: string; models: string[]; selected_model: string }
    gemini: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    claude: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openai: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openrouter: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    ollama: { enabled: boolean; name: string; base_url: string; models: string[]; selected_model: string }
  }
  tts_providers: {
    edge: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
    elevenlabs: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; voices: string[]; selected_voice: string }
    openai_voice: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
    piper: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
  }
  default_provider: string
  default_tts: string
}

interface FeedbackStats {
  total: number
  likes: number
  dislikes: number
  by_provider: Record<string, { likes: number; dislikes: number }>
}

const BACKEND = 'http://localhost:8005'

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({})
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({})
  const [modelTestResults, setModelTestResults] = useState<Record<string, {success: boolean, message: string}>>({})
  const [loadingVoices, setLoadingVoices] = useState<Record<string, boolean>>({})
  const [testingVoices, setTestingVoices] = useState<Record<string, boolean>>({})
  const [voiceTestResults, setVoiceTestResults] = useState<Record<string, {success: boolean, message: string}>>({})
  const [systemPrompt, setSystemPrompt] = useState('')
  const [pipelineConfig, setPipelineConfig] = useState<{routes: {pattern: string; topic: string}[]; files: Record<string,string>} | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [savingPipeline, setSavingPipeline] = useState(false)
  const [promptChars, setPromptChars] = useState(0)
  const [promptTokens, setPromptTokens] = useState(0)
  const [tokenTestInput, setTokenTestInput] = useState('')
  const [tokenTestResult, setTokenTestResult] = useState<any | null>(null)
  const [testingTokens, setTestingTokens] = useState(false)
  const [usageItems, setUsageItems] = useState<any[]>([])
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [usageStats, setUsageStats] = useState<any | null>(null)

  const loadUsage = async () => {
    try {
      setLoadingUsage(true)
      const res = await fetch(`${BACKEND}/api/admin/usage?limit=200`)
      const data = await res.json()
      setUsageItems(data.items || [])
      const statsRes = await fetch(`${BACKEND}/api/admin/usage/stats`)
      setUsageStats(await statsRes.json())
    } catch (e) {
      setMessage('Errore caricamento usage')
    } finally {
      setLoadingUsage(false)
    }
  }

  const resetUsage = async () => {
    if (!window.confirm('Sicuro di voler cancellare i log di utilizzo?')) return
    await fetch(`${BACKEND}/api/admin/usage/reset`, { method: 'POST' })
    loadUsage()
  }

  const authenticate = () => {
    if (password === 'Lagom192.') {
      setAuthenticated(true)
      loadConfig()
      loadStats()
    } else {
      setMessage('Password errata')
    }
  }

  const loadConfig = async () => {
    try {
      const response = await fetch(`${BACKEND}/api/admin/config`)
      const data = await response.json()
      setConfig(data)
      
      // Carica automaticamente i modelli per ogni provider abilitato
      if (data.ai_providers) {
        Object.keys(data.ai_providers).forEach(provider => {
          if (data.ai_providers[provider].enabled) {
            loadModels(provider)
          }
        })
      }
    } catch (error) {
      setMessage('Errore nel caricamento configurazione')
    }
  }

  const updatePromptStats = (text: string) => {
    setPromptChars(text.length)
    setPromptTokens(Math.max(1, Math.round(text.length / 4)))
  }

  const loadSystemPrompt = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/system-prompt`)
      const data = await res.json()
      setSystemPrompt(data.prompt || '')
      updatePromptStats(data.prompt || '')
    } catch (e) {
      setMessage('Errore caricamento system prompt')
    }
  }

  const saveSystemPrompt = async () => {
    try {
      setSavingPrompt(true)
      const res = await fetch(`${BACKEND}/api/admin/system-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: systemPrompt })
      })
      const data = await res.json()
      if (data.success) setMessage('Prompt salvato con successo')
      else setMessage('Errore salvataggio prompt')
      updatePromptStats(systemPrompt)
    } catch (e) {
      setMessage('Errore salvataggio prompt')
    } finally {
      setSavingPrompt(false)
    }
  }

  const resetSystemPrompt = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/system-prompt/reset`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSystemPrompt(data.prompt)
        updatePromptStats(data.prompt)
        setMessage('Prompt ripristinato')
      }
    } catch (e) { setMessage('Errore reset prompt') }
  }

  const loadPipeline = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/pipeline`)
      const data = await res.json()
      setPipelineConfig(data)
    } catch (e) {
      setMessage('Errore caricamento pipeline')
    }
  }

  const savePipeline = async () => {
    if (!pipelineConfig) return
    try {
      setSavingPipeline(true)
      const res = await fetch(`${BACKEND}/api/admin/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineConfig)
      })
      const data = await res.json()
      if (data.success) setMessage('Pipeline salvata')
      else setMessage('Errore salvataggio pipeline')
    } catch (e) {
      setMessage('Errore salvataggio pipeline')
    } finally {
      setSavingPipeline(false)
    }
  }

  useEffect(() => {
    if (authenticated) {
      loadSystemPrompt()
      loadPipeline()
  loadUsage()
    }
  }, [authenticated])

  const loadStats = async () => {
    try {
      const response = await fetch(`${BACKEND}/api/feedback/stats`)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      setMessage('Errore nel caricamento statistiche')
    }
  }

  const loadModels = async (provider: string) => {
    setLoadingModels(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await fetch(`${BACKEND}/api/admin/models/${provider}`)
      const data = await response.json()
      
      if (config) {
        const updatedConfig = { ...config }
        // Estrai l'array models dalla risposta {models: [...]}
        const models = data.models || []
        updatedConfig.ai_providers[provider as keyof AdminConfig['ai_providers']].models = models
        setConfig(updatedConfig)
      }
    } catch (error) {
      console.error('Errore caricamento modelli:', error)
      setMessage('Errore nel caricamento dei modelli')
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }))
    }
  }

  const handleModelChange = (provider: keyof AdminConfig['ai_providers'], model: string) => {
    if (config) {
      const updatedConfig = { ...config }
      updatedConfig.ai_providers[provider].selected_model = model
      setConfig(updatedConfig)
    }
  }

  const testModel = async (provider: string, model: string) => {
    setTestingModels(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await fetch(`${BACKEND}/api/admin/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model })
      })
      
      const result = await response.json()
      setModelTestResults(prev => ({
        ...prev,
        [provider]: {
          success: result.success,
          message: result.message || (result.success ? 'Test completato con successo' : 'Test fallito')
        }
      }))
    } catch (error) {
      setModelTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          message: 'Errore durante il test del modello'
        }
      }))
    } finally {
      setTestingModels(prev => ({ ...prev, [provider]: false }))
    }
  }

  const saveConfig = async () => {
    if (!config) return
    
    setLoading(true)
    try {
      await fetch(`${BACKEND}/api/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      setMessage('Configurazione salvata con successo')
    } catch (error) {
      setMessage('Errore nel salvataggio')
    }
    setLoading(false)
  }

  const updateProvider = (provider: string, field: string, value: any) => {
    if (!config) return
    
    // Non permettere la modifica delle API key dall'interfaccia
    if (field === 'api_key') return
    
    setConfig({
      ...config,
      ai_providers: {
        ...config.ai_providers,
        [provider]: {
          ...config.ai_providers[provider as keyof typeof config.ai_providers],
          [field]: value
        }
      }
    })
  }

  const updateTTS = (provider: string, field: string, value: any) => {
    if (!config) return
    setConfig({
      ...config,
      tts_providers: {
        ...config.tts_providers,
        [provider]: {
          ...config.tts_providers[provider as keyof typeof config.tts_providers],
          [field]: value
        }
      }
    })
  }

  const testTTSProvider = async (provider: string, voice?: string) => {
    try {
      setMessage(`Testando ${provider} con voce ${voice}...`)
      
      const response = await fetch(`${BACKEND}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Ciao, questo è un test della voce selezionata per il provider " + provider,
          provider: provider,
          voice: voice
        })
      })

      if (response.ok) {
        // Riproduci l'audio
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audio.play()
        
        setMessage(`Test ${provider} completato con successo`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage(`Errore nel test ${provider}: ${response.statusText}`)
      }
    } catch (error) {
      setMessage(`Errore nel test ${provider}: ${error}`)
    }
  }

  const runTokenTest = async () => {
    if (!tokenTestInput.trim()) return
    setTestingTokens(true)
    setTokenTestResult(null)
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': config?.default_provider || 'local',
          'X-Admin-Password': password
        },
        body: JSON.stringify({ message: tokenTestInput })
      })
      const data = await res.json()
      setTokenTestResult(data)
    } catch (e) {
      setTokenTestResult({ error: 'Errore chiamata' })
    } finally {
      setTestingTokens(false)
    }
  }

  if (!authenticated) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SecurityIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Pannello Amministratore
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Inserisci la password per accedere alle impostazioni
          </Typography>
          
          <TextField
            fullWidth
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && authenticate()}
            sx={{ mb: 2 }}
          />
          
          <Button 
            variant="contained" 
            onClick={authenticate}
            fullWidth
            size="large"
          >
            Accedi
          </Button>
          
          {message && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {message}
            </Alert>
          )}
        </Paper>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">
          <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Pannello Amministratore
        </Typography>
        <Button variant="outlined" onClick={() => setAuthenticated(false)}>
          Esci
        </Button>
      </Stack>

      {message && (
        <Alert severity={message.includes('successo') ? 'success' : 'error'} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Configurazione AI Providers */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <AIIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Provider AI
              </Typography>
              
              {config && Object.entries(config.ai_providers).map(([key, provider]) => (
                <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {provider.name}
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={provider.enabled}
                          onChange={(e) => updateProvider(key, 'enabled', e.target.checked)}
                        />
                      }
                      label="Attivo"
                    />
                  </Stack>
                  
                  {'api_key_status' in provider && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        API Key:
                      </Typography>
                      <Chip
                        size="small"
                        label={provider.api_key_status === 'configured' ? 'Configurata' : 'Mancante'}
                        color={provider.api_key_status === 'configured' ? 'success' : 'error'}
                        variant="outlined"
                      />
                      {provider.api_key_masked && (
                        <Typography variant="caption" color="text.secondary">
                          {provider.api_key_masked}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        (configurare via variabili di ambiente)
                      </Typography>
                    </Box>
                  )}
                  
                  {'base_url' in provider && (
                    <TextField
                      fullWidth
                      size="small"
                      label="Base URL"
                      value={provider.base_url || ''}
                      onChange={(e) => updateProvider(key, 'base_url', e.target.value)}
                      disabled={!provider.enabled}
                    />
                  )}
                </Box>
              ))}

              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Provider Predefinito</InputLabel>
                <Select
                  value={config?.default_provider || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, default_provider: e.target.value} : null)}
                >
                  {config && Object.entries(config.ai_providers)
                    .filter(([_, p]) => p.enabled)
                    .map(([key, provider]) => (
                      <MenuItem key={key} value={key}>{provider.name}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* Configurazione TTS */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <VolumeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Provider TTS
              </Typography>
              
              {config && Object.entries(config.tts_providers).map(([key, provider]) => (
                <Box key={key} sx={{ mb: 3, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {key.toUpperCase()}
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={provider.enabled}
                          onChange={(e) => updateTTS(key, 'enabled', e.target.checked)}
                        />
                      }
                      label="Attivo"
                    />
                  </Stack>
                  
                  {'api_key' in provider && (
                    <TextField
                      fullWidth
                      size="small"
                      label="API Key"
                      type="password"
                      value={provider.api_key || ''}
                      onChange={(e) => updateTTS(key, 'api_key', e.target.value)}
                      disabled={!provider.enabled}
                      sx={{ mb: 2 }}
                    />
                  )}

                  {/* Selezione voce */}
                  {provider.voices && provider.voices.length > 0 && (
                    <FormControl fullWidth size="small" disabled={!provider.enabled}>
                      <InputLabel>Voce predefinita</InputLabel>
                      <Select
                        value={provider.selected_voice || provider.voices[0]}
                        onChange={(e) => updateTTS(key, 'selected_voice', e.target.value)}
                        label="Voce predefinita"
                      >
                        {provider.voices.map((voice: string) => (
                          <MenuItem key={voice} value={voice}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip 
                                size="small" 
                                label={voice}
                                variant={provider.selected_voice === voice ? "filled" : "outlined"}
                                color={provider.selected_voice === voice ? "primary" : "default"}
                              />
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  
                  <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Voci disponibili: {provider.voices?.length || 0}
                    </Typography>
                    
                    {provider.enabled && (
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => testTTSProvider(key, provider.selected_voice || provider.voices?.[0])}
                      >
                        Testa voce
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}

              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>TTS Predefinito</InputLabel>
                <Select
                  value={config?.default_tts || ''}
                  onChange={(e) => setConfig(prev => prev ? {...prev, default_tts: e.target.value} : null)}
                >
                  {config && Object.entries(config.tts_providers)
                    .filter(([_, p]) => p.enabled)
                    .map(([key, _]) => (
                      <MenuItem key={key} value={key}>{key.toUpperCase()}</MenuItem>
                    ))}
                </Select>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* Modelli AI */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <AIIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Selezione Modelli AI
              </Typography>
              
              <Grid container spacing={2}>
                {config && Object.entries(config.ai_providers).map(([provider, settings]) => (
                  settings.enabled && (
                    <Grid item xs={12} md={6} key={provider}>
                      <Box sx={{ p: 2, border: 1, borderColor: 'grey.300', borderRadius: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                          {settings.name}
                        </Typography>
                        
                        <Stack spacing={2}>
                          <FormControl fullWidth>
                            <InputLabel>Modello Selezionato</InputLabel>
                            <Select
                              value={settings.selected_model || ''}
                              label="Modello Selezionato"
                              onChange={(e) => handleModelChange(provider as keyof AdminConfig['ai_providers'], e.target.value)}
                            >
                              {(settings.models || []).map((model) => (
                                <MenuItem key={model} value={model}>
                                  {model}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => loadModels(provider)}
                              disabled={loadingModels[provider]}
                              sx={{ flex: 1 }}
                            >
                              {loadingModels[provider] ? 'Caricamento...' : 'Aggiorna Modelli'}
                            </Button>
                            
                            <Button
                              variant="outlined"
                              size="small"
                              color="success"
                              onClick={() => testModel(provider, settings.selected_model)}
                              disabled={testingModels[provider] || !settings.selected_model}
                              sx={{ flex: 1 }}
                            >
                              {testingModels[provider] ? 'Test...' : 'Test Modello'}
                            </Button>
                          </Box>
                          
                          {modelTestResults[provider] && (
                            <Alert 
                              severity={modelTestResults[provider].success ? 'success' : 'error'}
                              variant="outlined"
                            >
                              {modelTestResults[provider].message}
                            </Alert>
                          )}
                        </Stack>
                      </Box>
                    </Grid>
                  )
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Statistiche Feedback */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <StatsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Statistiche Feedback
              </Typography>
              
              {stats ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                      <Typography variant="h4" color="primary">{stats.total}</Typography>
                      <Typography variant="body2">Feedback Totali</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#e8f5e8', borderRadius: 1 }}>
                      <Typography variant="h4" color="success.main">{stats.likes}</Typography>
                      <Typography variant="body2">Mi Piace</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#ffebee', borderRadius: 1 }}>
                      <Typography variant="h4" color="error.main">{stats.dislikes}</Typography>
                      <Typography variant="body2">Non Mi Piace</Typography>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" gutterBottom>Feedback per Provider</Typography>
                    {Object.entries(stats.by_provider).map(([provider, data]) => {
                      const total = data.likes + data.dislikes
                      const percentage = total > 0 ? (data.likes / total) * 100 : 0
                      return (
                        <Box key={provider} sx={{ mb: 2 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Chip label={provider} size="small" />
                            <Typography variant="body2">
                              {data.likes} 👍 / {data.dislikes} 👎 ({percentage.toFixed(1)}%)
                            </Typography>
                          </Stack>
                          <LinearProgress 
                            variant="determinate" 
                            value={percentage} 
                            sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                            color={percentage >= 70 ? 'success' : percentage >= 50 ? 'warning' : 'error'}
                          />
                        </Box>
                      )
                    })}
                  </Grid>
                </Grid>
              ) : (
                <Typography>Caricamento statistiche...</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* System Prompt Editor */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Prompt di Sistema
              </Typography>
              <TextField
                multiline
                minRows={12}
                value={systemPrompt}
                onChange={(e) => { setSystemPrompt(e.target.value); updatePromptStats(e.target.value) }}
                fullWidth
                placeholder="Inserisci il prompt di sistema..."
              />
              <Typography variant="caption" color="text.secondary">
                {promptChars} caratteri ~ {promptTokens} token stimati
              </Typography>
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Button variant="outlined" size="small" onClick={resetSystemPrompt} sx={{ mr: 1 }}>Ripristina</Button>
                <Button variant="outlined" size="small" onClick={loadSystemPrompt} sx={{ mr: 1 }}>Ricarica</Button>
                <Button variant="contained" size="small" onClick={saveSystemPrompt} disabled={savingPrompt}>
                  {savingPrompt ? 'Salvataggio...' : 'Salva Prompt'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Pipeline Editor */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Pipeline (Routing & File)</Typography>
              {pipelineConfig && (
                <Stack spacing={2}>
                  <Typography variant="subtitle2">Regole di Routing</Typography>
                  {pipelineConfig.routes.map((r, idx) => (
                    <Stack key={idx} direction="row" spacing={1}>
                      <TextField
                        label="Pattern (regex)"
                        size="small"
                        value={r.pattern}
                        onChange={(e) => {
                          const routes = [...pipelineConfig.routes]
                          routes[idx] = { ...routes[idx], pattern: e.target.value }
                          setPipelineConfig({ ...pipelineConfig, routes })
                        }}
                        fullWidth
                      />
                      <TextField
                        label="Topic"
                        size="small"
                        value={r.topic}
                        onChange={(e) => {
                          const routes = [...pipelineConfig.routes]
                          routes[idx] = { ...routes[idx], topic: e.target.value }
                          setPipelineConfig({ ...pipelineConfig, routes })
                        }}
                        sx={{ width: 180 }}
                      />
                      <Button color="error" size="small" onClick={() => {
                        const routes = pipelineConfig.routes.filter((_, i) => i !== idx)
                        setPipelineConfig({ ...pipelineConfig, routes })
                      }}>X</Button>
                    </Stack>
                  ))}
                  <Button size="small" variant="outlined" onClick={() => {
                    setPipelineConfig(prev => prev ? { ...prev, routes: [...prev.routes, { pattern: '', topic: '' }] } : prev)
                  }}>Aggiungi Regola</Button>
                  <Divider />
                  <Typography variant="subtitle2">File per Topic</Typography>
                  {Object.entries(pipelineConfig.files).map(([topic, filename]) => (
                    <Stack key={topic} direction="row" spacing={1} alignItems="center">
                      <TextField
                        label="Topic"
                        size="small"
                        value={topic}
                        disabled
                        sx={{ width: 180 }}
                      />
                      <TextField
                        label="File"
                        size="small"
                        value={filename}
                        onChange={(e) => {
                          setPipelineConfig(prev => prev ? { ...prev, files: { ...prev.files, [topic]: e.target.value } } : prev)
                        }}
                        fullWidth
                      />
                      <Button color="error" size="small" onClick={() => {
                        setPipelineConfig(prev => {
                          if (!prev) return prev
                          const files = { ...prev.files }
                          delete files[topic]
                          return { ...prev, files }
                        })
                      }}>X</Button>
                    </Stack>
                  ))}
                  <Button size="small" variant="outlined" onClick={() => {
                    const newTopic = prompt('Nome nuovo topic?')
                    if (newTopic) {
                      setPipelineConfig(prev => prev ? { ...prev, files: { ...prev.files, [newTopic]: '' } } : prev)
                    }
                  }}>Aggiungi Topic/File</Button>
                  <Box sx={{ textAlign: 'right' }}>
                    <Button variant="outlined" size="small" onClick={async () => { await fetch(`${BACKEND}/api/admin/pipeline/reset`, { method:'POST' }); loadPipeline(); }} sx={{ mr: 1 }}>Ripristina</Button>
                    <Button variant="outlined" size="small" onClick={loadPipeline} sx={{ mr: 1 }}>Ricarica</Button>
                    <Button variant="contained" size="small" disabled={savingPipeline} onClick={savePipeline}>
                      {savingPipeline ? 'Salvataggio...' : 'Salva Pipeline'}
                    </Button>
                  </Box>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Token Tester */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Analisi Token</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Inserisci un messaggio di prova per stimare i token (input + output). I token vengono mostrati solo a te come amministratore.
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="Messaggio di test"
                  multiline
                  minRows={3}
                  value={tokenTestInput}
                  onChange={(e) => setTokenTestInput(e.target.value)}
                  fullWidth
                />
                <Stack direction="row" spacing={2} alignItems="center">
                  <Button variant="contained" size="small" onClick={runTokenTest} disabled={testingTokens}>
                    {testingTokens ? 'Calcolo...' : 'Calcola Token'}
                  </Button>
                  {tokenTestResult?.tokens && (
                    <Chip color="primary" label={`Totale: ${tokenTestResult.tokens.total} token (in ${tokenTestResult.tokens.input_tokens} / out ${tokenTestResult.tokens.output_tokens})`} />
                  )}
                  {tokenTestResult?.tokens && (
                    <Chip variant="outlined" label={`Messaggi: ${tokenTestResult.tokens.per_message.join(',')}`} />
                  )}
                  {tokenTestResult?.topic && (
                    <Chip label={`Topic: ${tokenTestResult.topic || 'n/d'}`} />
                  )}
                </Stack>
                {tokenTestResult?.reply && (
                  <Box sx={{ p:2, bgcolor:'#fafafa', borderRadius:1, fontSize:'.85rem', whiteSpace:'pre-wrap' }}>
                    {tokenTestResult.reply}
                  </Box>
                )}
                {tokenTestResult?.error && (
                  <Alert severity="error">{tokenTestResult.error}</Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

          {/* Usage Table */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" gutterBottom>Log Utilizzo (ultimi {usageItems.length})</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" onClick={loadUsage} disabled={loadingUsage}>Aggiorna</Button>
                    <Button size="small" color="error" variant="outlined" onClick={resetUsage}>Reset</Button>
                  </Stack>
                </Stack>
                {usageStats && (
                  <Box sx={{ mb:2 }}>
                    <Chip label={`Interazioni: ${usageStats.total_interactions}`} sx={{ mr:1 }} />
                    <Chip label={`Token totali: ${usageStats.total_tokens}`} sx={{ mr:1 }} />
                    {Object.entries(usageStats.by_provider || {}).map(([p, v]: any) => (
                      <Chip key={p} label={`${p}: ${(v as any).count} (${(v as any).tokens} tok)`} sx={{ mr:1, mb:1 }} />
                    ))}
                  </Box>
                )}
                <Box sx={{ maxHeight: 300, overflow: 'auto', fontSize: '.75rem', border: '1px solid #eee', borderRadius:1 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead style={{ position:'sticky', top:0, background:'#fafafa' }}>
                      <tr>
                        <th style={{ textAlign:'left', padding:'4px' }}>Giorno</th>
                        <th style={{ textAlign:'left', padding:'4px' }}>Ora</th>
                        <th style={{ textAlign:'left', padding:'4px' }}>Provider</th>
                        <th style={{ textAlign:'left', padding:'4px' }}>Modello</th>
                        <th style={{ textAlign:'right', padding:'4px' }}>Durata ms</th>
                        <th style={{ textAlign:'right', padding:'4px' }}>Token</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageItems.slice().reverse().map((u, idx) => {
                        const ts = u.ts || ''
                        const [dayPart, timePartFull] = ts.split('T')
                        const timePart = (timePartFull || '').replace('Z','').slice(0,8)
                        return (
                          <tr key={idx} style={{ borderTop:'1px solid #eee' }}>
                            <td style={{ padding:'4px' }}>{dayPart || '-'}</td>
                            <td style={{ padding:'4px' }}>{timePart || '-'}</td>
                            <td style={{ padding:'4px' }}>{u.provider}</td>
                            <td style={{ padding:'4px' }}>{u.model || '-'}</td>
                            <td style={{ padding:'4px', textAlign:'right' }}>{u.duration_ms}</td>
                            <td style={{ padding:'4px', textAlign:'right' }}>{u.tokens?.total ?? '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Box>
              </CardContent>
            </Card>
          </Grid>
      </Grid>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button 
          variant="contained" 
          size="large" 
          onClick={saveConfig}
          disabled={loading || !config}
        >
          {loading ? 'Salvataggio...' : 'Salva Configurazione'}
        </Button>
      </Box>
    </Container>
  )
}
