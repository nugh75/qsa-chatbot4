import React, { useState, useEffect } from 'react'
import {
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Chip,
  Alert,
  Box,
  IconButton,
  Tooltip,
  Grid,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment
} from '@mui/material'
import {
  Visibility,
  VisibilityOff,
  Check,
  Warning,
  PlayArrow,
  Edit,
  Save,
  Cancel,
  PowerSettingsNew,
  ViewList,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material'
import { authFetch, BACKEND } from '../utils/authFetch'

interface APIKeyStatus {
  status: 'configured' | 'missing'
  masked: string
  env_var: string
  enabled?: boolean
}

interface APIKeysData {
  google: APIKeyStatus
  anthropic: APIKeyStatus
  openai: APIKeyStatus
  openrouter: APIKeyStatus
  elevenlabs: APIKeyStatus
}

const APIKeysManagementPanel: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<APIKeysData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [editKey, setEditKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState<string | null>(null)
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [expandedModels, setExpandedModels] = useState<string | null>(null)
  const [modelSearch, setModelSearch] = useState('')

  const providerNames = {
    google: 'Google Gemini',
    anthropic: 'Anthropic Claude',
    openai: 'OpenAI GPT',
    openrouter: 'OpenRouter',
    elevenlabs: 'ElevenLabs TTS'
  }

  const loadAPIKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/api-keys`)
      if (res.ok) {
        const data = await res.json()
        setApiKeys(data.api_keys)
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (e: any) {
      setError(`Errore nel caricamento API keys: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateAPIKey = async (provider: string, apiKey: string) => {
    setSaving(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey })
      })
      
      if (res.ok) {
        await loadAPIKeys() // Ricarica i dati
        setEditingProvider(null)
        setEditKey('')
        setTestResults({
          ...testResults,
          [provider]: { success: true, message: 'API key aggiornata con successo' }
        })
      } else {
        const data = await res.json()
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
    } catch (e: any) {
      setTestResults({
        ...testResults,
        [provider]: { success: false, message: `Errore: ${e.message}` }
      })
    } finally {
      setSaving(false)
    }
  }

  const testAPIKey = async (provider: string) => {
    setTestingProvider(provider)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/api-keys/test/${provider}`, {
        method: 'POST'
      })
      
      const data = await res.json()
      setTestResults({
        ...testResults,
        [provider]: data
      })
    } catch (e: any) {
      setTestResults({
        ...testResults,
        [provider]: { success: false, message: `Errore test: ${e.message}` }
      })
    } finally {
      setTestingProvider(null)
    }
  }

  const toggleProvider = async (provider: string, enabled: boolean) => {
    if (provider === 'elevenlabs') return // TTS non ha toggle
    setTogglingProvider(provider)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/api-keys/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled })
      })
      
      if (res.ok) {
        await loadAPIKeys() // Ricarica i dati
      } else {
        const data = await res.json()
        setTestResults({
          ...testResults,
          [provider]: { success: false, message: data.detail || `Errore toggle` }
        })
      }
    } catch (e: any) {
      setTestResults({
        ...testResults,
        [provider]: { success: false, message: `Errore: ${e.message}` }
      })
    } finally {
      setTogglingProvider(null)
    }
  }

  const loadProviderModels = async (provider: string) => {
    // Mapping da provider API a provider config
    const providerToConfig: Record<string, string> = {
      google: 'gemini',
      anthropic: 'claude',
      openai: 'openai',
      openrouter: 'openrouter'
    }
    
    const configProvider = providerToConfig[provider]
    if (!configProvider) return
    
    // Toggle espansione
    if (expandedModels === provider) {
      setExpandedModels(null)
      return
    }
    
    setLoadingModels(provider)
    setExpandedModels(provider)
    
    try {
      const res = await authFetch(`${BACKEND}/api/admin/provider-models/${configProvider}?refresh=true`)
      if (res.ok) {
        const data = await res.json()
        setProviderModels({
          ...providerModels,
          [provider]: data.models || []
        })
      }
    } catch (e) {
      console.error('Error loading models:', e)
    } finally {
      setLoadingModels(null)
    }
  }

  const handleEdit = (provider: string) => {
    setEditingProvider(provider)
    setEditKey('')
    setShowKey(false)
    // Rimuovi eventuali risultati di test precedenti
    const newResults = { ...testResults }
    delete newResults[provider]
    setTestResults(newResults)
  }

  const handleSave = () => {
    if (editingProvider && editKey.trim()) {
      updateAPIKey(editingProvider, editKey.trim())
    }
  }

  const handleCancel = () => {
    setEditingProvider(null)
    setEditKey('')
    setShowKey(false)
  }

  useEffect(() => {
    loadAPIKeys()
  }, [])

  if (loading) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Gestione API Keys</Typography>
        <LinearProgress sx={{ mt: 2 }} />
      </Paper>
    )
  }

  if (error) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Gestione API Keys</Typography>
        <Alert severity="error">{error}</Alert>
        <Button onClick={loadAPIKeys} sx={{ mt: 2 }}>
          Riprova
        </Button>
      </Paper>
    )
  }

  if (!apiKeys) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Gestione API Keys</Typography>
        <Alert severity="warning">Nessun dato disponibile</Alert>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Gestione API Keys
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configura le API keys per i vari provider. Le chiavi vengono salvate nelle variabili d'ambiente del container.
      </Typography>

      <Grid container spacing={2}>
        {Object.entries(apiKeys).map(([provider, keyInfo]) => (
          <Grid item xs={12} key={provider}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ flex: 1 }}>
                  {providerNames[provider as keyof typeof providerNames]}
                </Typography>
                
                <Chip
                  size="small"
                  icon={keyInfo.status === 'configured' ? <Check /> : <Warning />}
                  label={keyInfo.status === 'configured' ? 'Configurata' : 'Mancante'}
                  color={keyInfo.status === 'configured' ? 'success' : 'warning'}
                />

                {provider !== 'elevenlabs' && (
                  <Tooltip title={keyInfo.enabled ? 'Provider Attivo' : 'Provider Disattivato'}>
                    <IconButton
                      size="small"
                      onClick={() => toggleProvider(provider, !keyInfo.enabled)}
                      disabled={togglingProvider === provider || keyInfo.status === 'missing'}
                      color={keyInfo.enabled ? 'success' : 'default'}
                    >
                      <PowerSettingsNew />
                    </IconButton>
                  </Tooltip>
                )}

                <Tooltip title="Testa API key">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => testAPIKey(provider)}
                      disabled={testingProvider === provider || keyInfo.status === 'missing'}
                    >
                      <PlayArrow />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Modifica API key">
                  <IconButton
                    size="small"
                    onClick={() => handleEdit(provider)}
                    disabled={editingProvider !== null}
                  >
                    <Edit />
                  </IconButton>
                </Tooltip>

                {provider !== 'elevenlabs' && (
                  <Tooltip title="Mostra modelli disponibili">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => loadProviderModels(provider)}
                        disabled={loadingModels === provider || keyInfo.status === 'missing'}
                      >
                        {expandedModels === provider ? <ExpandLess /> : <ViewList />}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Stack>

              {/* Lista modelli espandibile */}
              {expandedModels === provider && (
                <Box sx={{ mt: 1, mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, maxHeight: 350, overflow: 'auto' }}>
                  {loadingModels === provider ? (
                    <Typography variant="body2" color="text.secondary">Caricamento modelli...</Typography>
                  ) : providerModels[provider]?.length > 0 ? (
                    <Stack spacing={1}>
                      <TextField
                        size="small"
                        placeholder="Cerca modelli..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        fullWidth
                        sx={{ mb: 1 }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {providerModels[provider].filter(m => 
                          modelSearch ? m.toLowerCase().includes(modelSearch.toLowerCase()) : true
                        ).length} / {providerModels[provider].length} modelli
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {providerModels[provider]
                          .filter(m => modelSearch ? m.toLowerCase().includes(modelSearch.toLowerCase()) : true)
                          .map((model, idx) => (
                            <Chip 
                              key={idx} 
                              label={model} 
                              size="small" 
                              variant="outlined" 
                              sx={{ fontSize: '0.75rem' }}
                            />
                          ))}
                      </Box>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Nessun modello trovato</Typography>
                  )}
                </Box>
              )}


              {editingProvider === provider ? (
                <Stack spacing={2}>
                  <TextField
                    size="small"
                    label="API Key"
                    type={showKey ? 'text' : 'password'}
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    placeholder="Inserisci la tua API key"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowKey(!showKey)}
                            edge="end"
                            size="small"
                          >
                            {showKey ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSave}
                      disabled={saving || !editKey.trim()}
                      startIcon={<Save />}
                    >
                      {saving ? 'Salvando...' : 'Salva'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleCancel}
                      startIcon={<Cancel />}
                    >
                      Annulla
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Variabile: {keyInfo.env_var}
                  </Typography>
                  {keyInfo.status === 'configured' && (
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {keyInfo.masked}
                    </Typography>
                  )}
                </Box>
              )}

              {testingProvider === provider && (
                <LinearProgress sx={{ mt: 1 }} />
              )}

              {testResults[provider] && (
                <Alert
                  severity={testResults[provider].success ? 'success' : 'error'}
                  sx={{ mt: 1 }}
                >
                  {testResults[provider].message}
                </Alert>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Nota:</strong> Le API keys vengono salvate nel file .env del container. 
          Assicurati di avere i permessi di scrittura e riavvia i servizi se necessario per applicare le modifiche.
        </Typography>
      </Alert>
    </Paper>
  )
}

export default APIKeysManagementPanel
