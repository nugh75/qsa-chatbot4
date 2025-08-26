import React, { useState, useEffect } from 'react'
import {
  Container, Paper, Typography, TextField, Button, Stack, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Card, CardContent, Grid, Divider, Alert, Chip, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, IconButton, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material'
import {
  Settings as SettingsIcon,
  VolumeUp as VolumeIcon,
  Psychology as AIIcon,
  Analytics as StatsIcon,
  Security as SecurityIcon,
  Psychology as PsychologyIcon,
  ExpandMore as ExpandMoreIcon,
  Mic as MicIcon,
  Check as CheckIcon,
  Download as DownloadIcon,
  Add as AddIcon,
  Remove as RemoveIcon
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
  summary_settings?: {
    provider: string
    enabled: boolean
  }
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
  const [systemPromptRows, setSystemPromptRows] = useState(8)
  const [pipelineConfig, setPipelineConfig] = useState<{routes: {pattern: string; topic: string}[]; files: Record<string,string>} | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [savingPipeline, setSavingPipeline] = useState(false)
  const [promptChars, setPromptChars] = useState(0)
  const [promptTokens, setPromptTokens] = useState(0)
  
  // Stati per riassunti
  const [summaryPrompt, setSummaryPrompt] = useState('')
  const [summaryPromptRows, setSummaryPromptRows] = useState(6)
  const [summarySettings, setSummarySettings] = useState<{provider: string, enabled: boolean}>({provider: 'anthropic', enabled: true})
  const [savingSummaryPrompt, setSavingSummaryPrompt] = useState(false)
  const [savingSummarySettings, setSavingSummarySettings] = useState(false)
  
  // Stati per modelli Whisper
  const [whisperModels, setWhisperModels] = useState<string[]>([])
  const [availableWhisperModels] = useState<string[]>(['tiny', 'base', 'small', 'medium', 'large-v1', 'large-v2', 'large-v3'])
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [selectedWhisperModel, setSelectedWhisperModel] = useState<string>('')
  const [whisperModelStatus, setWhisperModelStatus] = useState<Record<string, string>>({})
  
  // Stati per pannelli collassabili
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    ai_providers: true,
    tts_providers: false,
    stats: false,
    feedback: false,
    prompts: false,
    whisper: false,
    usage: false,
    memory: false
  })
  const [tokenTestInput, setTokenTestInput] = useState('')
  const [tokenTestResult, setTokenTestResult] = useState<any | null>(null)
  const [testingTokens, setTestingTokens] = useState(false)
  const [usageItems, setUsageItems] = useState<any[]>([])
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [usageStats, setUsageStats] = useState<any | null>(null)
  const [usageDaily, setUsageDaily] = useState<Record<string, {count:number; tokens:number}>>({})
  const [usageProviders, setUsageProviders] = useState<any>({})
  const [usageModels, setUsageModels] = useState<any>({})
  // Filtri log
  const [filterProvider, setFilterProvider] = useState<string>('')
  const [filterModel, setFilterModel] = useState<string>('')
  const [filterQ, setFilterQ] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [totalUsage, setTotalUsage] = useState<number>(0)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)
  
  // Funzione per gestire l'espansione dei pannelli
  const handlePanelExpansion = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanels(prev => ({
      ...prev,
      [panel]: isExpanded
    }))
  }
  const [showTokenDetails, setShowTokenDetails] = useState<boolean>(false)
  const [refreshTick, setRefreshTick] = useState<number>(0)
  // Memory settings
  const [memoryStats, setMemoryStats] = useState<any | null>(null)
  const [maxMessages, setMaxMessages] = useState<number>(10)
  const [loadingMemory, setLoadingMemory] = useState(false)

  // Auto refresh effect
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => setRefreshTick(t => t+1), 10000) // 10s
    return () => clearInterval(id)
  }, [autoRefresh])

  const buildQuery = () => {
    const params: Record<string,string|number> = { page, page_size: 10000 } // Aumento per ottenere tutte le richieste
    if (filterProvider) params.provider = filterProvider
    if (filterModel) params.model = filterModel
    if (filterQ) params.q = filterQ
    if (filterDateFrom) params.start = filterDateFrom + 'T00:00:00'
    if (filterDateTo) params.end = filterDateTo + 'T23:59:59'
    const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    return qs
  }

  const loadUsage = async () => {
    try {
      setLoadingUsage(true)
      const qs = buildQuery()
      const res = await fetch(`${BACKEND}/api/admin/usage?${qs}`)
      const data = await res.json()
      if (data.mode === 'query') {
        setUsageItems(data.items || [])
        setUsageDaily(data.daily || {})
        setUsageProviders(data.providers || {})
        setUsageModels(data.models || {})
        setTotalUsage(data.total || 0)
      } else {
        setUsageItems(data.items || [])
        setTotalUsage(data.items?.length || 0)
      }
      const statsRes = await fetch(`${BACKEND}/api/admin/usage/stats`)
      const statsData = await statsRes.json()
      console.log('Usage stats loaded:', statsData)
      setUsageStats(statsData)
    } catch (e) {
      setMessage('Errore caricamento usage')
    } finally {
      setLoadingUsage(false)
    }
  }

  // Ricarica quando cambiano filtri/pagina intervalli o auto refresh tick
  useEffect(() => { if (authenticated) loadUsage() }, [page, pageSize, refreshTick, filterProvider, filterModel, filterQ, filterDateFrom, filterDateTo])

  const presetRange = (type: string) => {
    const today = new Date()
    const toISODate = (d: Date) => d.toISOString().slice(0,10)
    if (type === 'oggi') {
      setFilterDateFrom(toISODate(today))
      setFilterDateTo(toISODate(today))
    } else if (type === 'ieri') {
      const y = new Date(today.getTime()-86400000)
      setFilterDateFrom(toISODate(y))
      setFilterDateTo(toISODate(y))
    } else if (type === '7g') {
      const s = new Date(today.getTime()-6*86400000)
      setFilterDateFrom(toISODate(s))
      setFilterDateTo(toISODate(today))
    } else if (type === '30g') {
      const s = new Date(today.getTime()-29*86400000)
      setFilterDateFrom(toISODate(s))
      setFilterDateTo(toISODate(today))
    } else if (type === 'clear') {
      setFilterDateFrom(''); setFilterDateTo('')
    }
    setPage(1)
    setTimeout(loadUsage, 0)
  }

  const exportUsage = async (format: 'csv' | 'jsonl') => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/usage/export?format=${format}`)
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `usage_export.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessage('Errore export')
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
      loadSummaryPrompt()
      loadSummarySettings()
    } else {
      setMessage('Password errata')
    }
  }

  const loadConfig = async () => {
    try {
      const response = await fetch(`${BACKEND}/api/admin/config`)
      const data = await response.json()
      setConfig(data)
      
      // Carica impostazioni memoria
      const memorySettings = data.memory_settings || {}
      setMaxMessages(memorySettings.max_messages_per_session || 10)
      
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

  // Funzioni per gestire i riassunti
  const loadSummaryPrompt = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/summary-prompt`)
      const data = await res.json()
      setSummaryPrompt(data.prompt || '')
    } catch (e) {
      setMessage('Errore caricamento summary prompt')
    }
  }

  const saveSummaryPrompt = async () => {
    try {
      setSavingSummaryPrompt(true)
      const res = await fetch(`${BACKEND}/api/admin/summary-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: summaryPrompt })
      })
      const data = await res.json()
      if (data.success) setMessage('Summary prompt salvato con successo')
      else setMessage('Errore salvataggio summary prompt')
    } catch (e) {
      setMessage('Errore salvataggio summary prompt')
    } finally {
      setSavingSummaryPrompt(false)
    }
  }

  const loadSummarySettings = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/summary-settings`)
      const data = await res.json()
      setSummarySettings(data.settings || {provider: 'anthropic', enabled: true})
    } catch (e) {
      setMessage('Errore caricamento impostazioni summary')
    }
  }

  const saveSummarySettings = async () => {
    try {
      setSavingSummarySettings(true)
      const res = await fetch(`${BACKEND}/api/admin/summary-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summarySettings)
      })
      const data = await res.json()
      if (data.success) setMessage('Impostazioni summary salvate con successo')
      else setMessage('Errore salvataggio impostazioni summary')
    } catch (e) {
      setMessage('Errore salvataggio impostazioni summary')
    } finally {
      setSavingSummarySettings(false)
    }
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
      loadMemoryStats()
      loadWhisperModels()
    }
  }, [authenticated])

  // Ricarica modelli Whisper quando la config cambia
  useEffect(() => {
    if (config) {
      loadWhisperModels()
    }
  }, [config])

  const loadMemoryStats = async () => {
    try {
      setLoadingMemory(true)
      const res = await fetch(`${BACKEND}/api/admin/memory/stats`)
      const data = await res.json()
      setMemoryStats(data)
    } catch (e) {
      setMessage('Errore caricamento statistiche memoria')
    } finally {
      setLoadingMemory(false)
    }
  }

  const updateMemoryConfig = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/memory/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_messages: maxMessages })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Configurazione memoria salvata')
        loadMemoryStats()
      } else {
        setMessage(data.message || 'Errore salvataggio memoria')
      }
    } catch (e) {
      setMessage('Errore aggiornamento memoria')
    }
  }

  const clearMemory = async (sessionId?: string) => {
    const confirmMsg = sessionId ? 
      `Vuoi cancellare la sessione ${sessionId}?` : 
      'Vuoi cancellare tutte le sessioni dalla memoria?'
    
    if (!window.confirm(confirmMsg)) return
    
    try {
      const url = sessionId ? 
        `${BACKEND}/api/admin/memory/clear?session_id=${sessionId}` :
        `${BACKEND}/api/admin/memory/clear`
      
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message)
        loadMemoryStats()
      }
    } catch (e) {
      setMessage('Errore cancellazione memoria')
    }
  }

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

  // Funzioni aggiunte per compatibilità
  const updateConfig = (key: string, value: any) => {
    if (!config) return
    setConfig({
      ...config,
      [key]: value
    })
  }

  const updateTTSProvider = (provider: string, key: string, value: any) => {
    if (!config) return
    const updatedConfig = { ...config }
    ;(updatedConfig.tts_providers as any)[provider][key] = value
    setConfig(updatedConfig)
  }

  const loadVoices = async (provider: string) => {
    setLoadingVoices(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await fetch(`${BACKEND}/api/admin/tts/voices/${provider}`)
      const data = await response.json()
      
      if (config && data.voices) {
        const updatedConfig = { ...config }
        ;(updatedConfig.tts_providers as any)[provider].voices = data.voices
        setConfig(updatedConfig)
      }
    } catch (error) {
      setMessage('Errore nel caricamento voci')
    } finally {
      setLoadingVoices(prev => ({ ...prev, [provider]: false }))
    }
  }

  const testVoice = async (provider: string) => {
    try {
      const response = await fetch(`${BACKEND}/api/admin/tts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider,
          text: 'Questo è un test della voce.' 
        })
      })
      
      if (response.ok) {
        setMessage('Test voce completato')
      } else {
        setMessage('Errore test voce')
      }
    } catch (error) {
      setMessage('Errore test voce')
    }
  }

  const testTokens = async () => {
    setTestingTokens(true)
    try {
      const response = await fetch(`${BACKEND}/api/admin/test-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test di conteggio token.' })
      })
      
      const result = await response.json()
      setMessage(`Token contati: ${result.tokens || 'N/A'}`)
    } catch (error) {
      setMessage('Errore test token')
    } finally {
      setTestingTokens(false)
    }
  }

  // Funzioni per gestione modelli Whisper
  const loadWhisperModels = async () => {
    try {
      console.log('Caricamento modelli Whisper...')
      const response = await fetch(`${BACKEND}/api/admin/whisper/models`)
      const data = await response.json()
      
      console.log('Risposta backend:', data)
      
      if (data.models) {
        setWhisperModels(data.models)
        setSelectedWhisperModel(data.current_model || '')
        setWhisperModelStatus(data.status || {})
      } else {
        // Fallback: prova a caricare dalla configurazione principale
        console.log('Tentativo fallback con config principale')
        if (config && (config as any).whisper) {
          const whisperConfig = (config as any).whisper
          if (whisperConfig.model) {
            setSelectedWhisperModel(whisperConfig.model)
            setWhisperModels([whisperConfig.model])
          }
        }
      }
    } catch (error) {
      console.error('Errore nel caricamento modelli Whisper:', error)
      // Fallback: prova a caricare dalla configurazione principale
      if (config && (config as any).whisper) {
        const whisperConfig = (config as any).whisper
        if (whisperConfig.model) {
          setSelectedWhisperModel(whisperConfig.model)
          setWhisperModels([whisperConfig.model])
        }
      }
      setMessage('Errore nel caricamento modelli Whisper')
    }
  }

  const downloadWhisperModel = async (modelName: string) => {
    setDownloadingModel(modelName)
    try {
      const response = await fetch(`${BACKEND}/api/admin/whisper/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      
      const result = await response.json()
      if (result.success) {
        setMessage(`Modello ${modelName} scaricato con successo`)
        loadWhisperModels() // Ricarica la lista
      } else {
        setMessage(result.message || 'Errore nel download')
      }
    } catch (error) {
      setMessage('Errore nel download del modello')
    } finally {
      setDownloadingModel(null)
    }
  }

  const setWhisperModel = async (modelName: string) => {
    try {
      const response = await fetch(`${BACKEND}/api/admin/whisper/set-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      
      const result = await response.json()
      if (result.success) {
        setSelectedWhisperModel(modelName)
        setMessage(`Modello ${modelName} impostato come predefinito`)
      } else {
        setMessage(result.message || 'Errore nell\'impostazione del modello')
      }
    } catch (error) {
      setMessage('Errore nell\'impostazione del modello')
    }
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

      {/* Pannelli Accordion - Tutti collassabili */}
      <Stack spacing={2}>
        
        {/* Pannello Provider AI */}
        <Accordion 
          expanded={expandedPanels.ai_providers} 
          onChange={handlePanelExpansion('ai_providers')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <AIIcon color="primary" />
              <Typography variant="h6">Provider AI</Typography>
              <Chip 
                label={config ? Object.values(config.ai_providers).filter(p => p.enabled).length : 0} 
                size="small" 
                color="primary" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
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
                  </Box>
                )}

                {provider.enabled && (
                  <>
                    {'base_url' in provider && (
                      <TextField
                        label="Base URL"
                        value={provider.base_url}
                        onChange={(e) => updateProvider(key, 'base_url', e.target.value)}
                        size="small"
                        fullWidth
                        sx={{ mb: 1 }}
                      />
                    )}

                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Modello</InputLabel>
                        <Select
                          value={provider.selected_model}
                          onChange={(e) => updateProvider(key, 'selected_model', e.target.value)}
                        >
                          {provider.models.map((model) => (
                            <MenuItem key={model} value={model}>{model}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => loadModels(key)}
                        disabled={loadingModels[key]}
                      >
                        {loadingModels[key] ? 'Caricamento...' : 'Ricarica Modelli'}
                      </Button>

                      <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        onClick={() => testModel(key, provider.selected_model)}
                        disabled={testingModels[key]}
                      >
                        {testingModels[key] ? 'Test...' : 'Test Modello'}
                      </Button>
                    </Stack>

                    {modelTestResults[key] && (
                      <Alert 
                        severity={modelTestResults[key].success ? 'success' : 'error'} 
                        sx={{ mt: 1 }}
                      >
                        {modelTestResults[key].message}
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            ))}

            {/* Configurazione Predefinita AI */}
            {config && Object.keys(config.ai_providers).filter(key => (config.ai_providers as any)[key].enabled).length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Provider AI Predefinito
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider AI Predefinito</InputLabel>
                  <Select
                    value={config.default_provider}
                    onChange={(e) => updateConfig('default_provider', e.target.value)}
                  >
                    {Object.entries(config.ai_providers)
                      .filter(([, provider]) => provider.enabled)
                      .map(([key, provider]) => (
                        <MenuItem key={key} value={key}>
                          {provider.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Provider TTS */}
        <Accordion 
          expanded={expandedPanels.tts_providers} 
          onChange={handlePanelExpansion('tts_providers')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <VolumeIcon color="primary" />
              <Typography variant="h6">Provider TTS</Typography>
              <Chip 
                label={config ? Object.values(config.tts_providers).filter(p => p.enabled).length : 0} 
                size="small" 
                color="primary" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {config && Object.entries(config.tts_providers).map(([key, provider]) => (
              <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    {provider.name || key}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={provider.enabled}
                        onChange={(e) => updateTTSProvider(key, 'enabled', e.target.checked)}
                      />
                    }
                    label="Attivo"
                  />
                </Stack>

                {'api_key_status' in provider && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="textSecondary">
                      API Key: {provider.api_key_masked || 'Non configurata'}
                      <Chip
                        label={provider.api_key_status}
                        size="small"
                        color={provider.api_key_status === 'configured' ? 'success' : 'error'}
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                  </Box>
                )}

                {provider.enabled && (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Voce</InputLabel>
                        <Select
                          value={provider.selected_voice}
                          onChange={(e) => updateTTSProvider(key, 'selected_voice', e.target.value)}
                        >
                          {provider.voices.map((voice) => (
                            <MenuItem key={voice} value={voice}>{voice}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => loadVoices(key)}
                        disabled={loadingVoices[key]}
                      >
                        {loadingVoices[key] ? 'Caricamento...' : 'Ricarica Voci'}
                      </Button>

                      <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        onClick={() => testVoice(key)}
                        disabled={testingVoices[key]}
                      >
                        {testingVoices[key] ? 'Test...' : 'Test Voce'}
                      </Button>
                    </Stack>

                    {voiceTestResults[key] && (
                      <Alert 
                        severity={voiceTestResults[key].success ? 'success' : 'error'} 
                        sx={{ mt: 1 }}
                      >
                        {voiceTestResults[key].message}
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            ))}

            {/* Configurazione Predefinita TTS */}
            {config && Object.keys(config.tts_providers).filter(key => (config.tts_providers as any)[key].enabled).length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Provider TTS Predefinito
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider TTS Predefinito</InputLabel>
                  <Select
                    value={config.default_tts}
                    onChange={(e) => updateConfig('default_tts', e.target.value)}
                  >
                    {Object.entries(config.tts_providers)
                      .filter(([, provider]: [string, any]) => provider.enabled)
                      .map(([key, provider]: [string, any]) => (
                        <MenuItem key={key} value={key}>
                          {provider.name || key}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Whisper */}
        <Accordion 
          expanded={expandedPanels.whisper} 
          onChange={handlePanelExpansion('whisper')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <MicIcon color="primary" />
              <Typography variant="h6">Gestione Modelli Whisper</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Gestisci i modelli Whisper per la trascrizione vocale.
            </Typography>

            {/* Modello attualmente selezionato */}
            {selectedWhisperModel && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Modello Attivo: {selectedWhisperModel}
                </Typography>
              </Box>
            )}

            {/* Lista modelli scaricati */}
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
              Modelli Scaricati
            </Typography>
            {whisperModels.length > 0 ? (
              <Box sx={{ mb: 3 }}>
                {whisperModels.map((model) => (
                  <Box key={model} sx={{ mb: 1, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: selectedWhisperModel === model ? 'bold' : 'normal' }}>
                        {model}
                        {selectedWhisperModel === model && (
                          <Chip label="Attivo" size="small" color="primary" sx={{ ml: 1 }} />
                        )}
                      </Typography>
                      {selectedWhisperModel !== model && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setWhisperModel(model)}
                        >
                          Imposta come Predefinito
                        </Button>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                Nessun modello scaricato
              </Typography>
            )}

            {/* Scarica nuovi modelli */}
            <Typography variant="subtitle2" gutterBottom>
              Scarica Modelli
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {availableWhisperModels.map((model) => {
                const isDownloaded = whisperModels.includes(model)
                const isDownloading = downloadingModel === model
                
                return (
                  <Button
                    key={model}
                    variant={isDownloaded ? "outlined" : "contained"}
                    size="small"
                    onClick={() => !isDownloaded && downloadWhisperModel(model)}
                    disabled={isDownloaded || isDownloading}
                    startIcon={isDownloaded ? <CheckIcon /> : (isDownloading ? <CircularProgress size={16} /> : <DownloadIcon />)}
                  >
                    {model}
                    {isDownloading && ' (Download...)'}
                    {isDownloaded && ' (Scaricato)'}
                  </Button>
                )
              })}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Statistiche */}
        <Accordion 
          expanded={expandedPanels.stats} 
          onChange={handlePanelExpansion('stats')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StatsIcon color="primary" />
              <Typography variant="h6">Statistiche Utilizzo</Typography>
              <Chip 
                label={stats ? stats.total : 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {/* Statistiche di Utilizzo */}
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Statistiche di Utilizzo
            </Typography>
            
            {usageStats && (
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light' }}>
                    <Typography variant="h4" color="primary.main">
                      {usageStats.total_requests || 0}
                    </Typography>
                    <Typography variant="body2">Richieste Totali</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                    <Typography variant="h4" color="success.main">
                      {usageStats.total_tokens || 0}
                    </Typography>
                    <Typography variant="body2">Token Utilizzati</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                    <Typography variant="h4" color="warning.main">
                      ${(usageStats.total_cost || 0).toFixed(4)}
                    </Typography>
                    <Typography variant="body2">Costo Totale</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                    <Typography variant="h4" color="info.main">
                      {usageStats.today?.requests || 0}
                    </Typography>
                    <Typography variant="body2">Richieste Oggi</Typography>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Statistiche per Provider */}
            {usageStats && usageStats.by_provider && Object.keys(usageStats.by_provider).length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Utilizzo per Provider AI
                </Typography>
                <Grid container spacing={2}>
                  {Object.entries(usageStats.by_provider).map(([provider, data]: [string, any]) => (
                    <Grid item xs={12} sm={6} md={4} key={provider}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          {provider}
                        </Typography>
                        <Typography variant="body2">
                          Richieste: {data.requests || 0}
                        </Typography>
                        <Typography variant="body2">
                          Token: {data.tokens || 0}
                        </Typography>
                        <Typography variant="body2">
                          Costo: ${(data.cost || 0).toFixed(4)}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* Tabella Richieste Dettagliate */}
            {usageItems && usageItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Richieste Dettagliate ({usageItems.length} di {totalUsage} totali)
                </Typography>
                
                {/* Filtri */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Provider</InputLabel>
                      <Select
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                        label="Provider"
                      >
                        <MenuItem value="">Tutti</MenuItem>
                        <MenuItem value="openai">OpenAI</MenuItem>
                        <MenuItem value="claude">Claude</MenuItem>
                        <MenuItem value="gemini">Gemini</MenuItem>
                        <MenuItem value="openrouter">OpenRouter</MenuItem>
                        <MenuItem value="local">Local</MenuItem>
                        <MenuItem value="ollama">Ollama</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Modello</InputLabel>
                      <Select
                        value={filterModel}
                        onChange={(e) => setFilterModel(e.target.value)}
                        label="Modello"
                      >
                        <MenuItem value="">Tutti</MenuItem>
                        {Object.keys(usageModels).map((model) => (
                          <MenuItem key={model} value={model}>
                            {model} ({usageModels[model]})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Data Da"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Data A"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>
                
                {/* Pulsanti di controllo filtri */}
                <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setFilterProvider('')
                      setFilterModel('')
                      setFilterDateFrom('')
                      setFilterDateTo('')
                    }}
                  >
                    Pulisci Filtri
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={loadUsage}
                    disabled={loadingUsage}
                  >
                    {loadingUsage ? 'Caricamento...' : 'Aggiorna'}
                  </Button>
                </Box>
                
                <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Data/Ora</TableCell>
                        <TableCell>Provider</TableCell>
                        <TableCell>Modello</TableCell>
                        <TableCell>Topic</TableCell>
                        <TableCell align="right">Token Input</TableCell>
                        <TableCell align="right">Token Output</TableCell>
                        <TableCell align="right">Token Totali</TableCell>
                        <TableCell align="right">Durata (ms)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {usageItems.slice().reverse().map((item, index) => (
                        <TableRow key={index} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {item.ts ? new Date(item.ts).toLocaleString('it-IT') : 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={item.provider || 'unknown'} 
                              size="small" 
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {item.model || 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {item.topic || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.tokens?.input_tokens || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.tokens?.output_tokens || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {item.tokens?.total || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.duration_ms || 0}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            
            {!usageStats && usageItems.length === 0 && (
              <Typography variant="body2" color="textSecondary">
                Nessuna statistica disponibile
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Statistiche Feedback */}
        <Accordion 
          expanded={expandedPanels.feedback} 
          onChange={handlePanelExpansion('feedback')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StatsIcon color="primary" />
              <Typography variant="h6">Statistiche Feedback</Typography>
              <Chip 
                label={stats ? stats.total : 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {stats && (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {stats.total}
                    </Typography>
                    <Typography variant="body2">Feedback Totali</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {stats.likes}
                    </Typography>
                    <Typography variant="body2">Like</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="error.main">
                      {stats.dislikes}
                    </Typography>
                    <Typography variant="body2">Dislike</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Feedback per Provider
                  </Typography>
                  {Object.entries(stats.by_provider).map(([provider, data]: [string, any]) => (
                    <Box key={provider} sx={{ mb: 1 }}>
                      <Typography variant="subtitle2">{provider}</Typography>
                      <Grid container spacing={1}>
                        <Grid item xs={4}>
                          <Chip label={`Like: ${data.likes}`} size="small" color="success" />
                        </Grid>
                        <Grid item xs={4}>
                          <Chip label={`Dislike: ${data.dislikes}`} size="small" color="error" />
                        </Grid>
                        <Grid item xs={4}>
                          <Chip 
                            label={`${data.likes + data.dislikes > 0 ? Math.round(data.likes / (data.likes + data.dislikes) * 100) : 0}%`} 
                            size="small" 
                            color={data.likes > data.dislikes ? 'success' : 'warning'} 
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  ))}
                </Grid>
              </Grid>
            )}
            
            {!stats && (
              <Typography variant="body2" color="textSecondary">
                Nessuna statistica feedback disponibile
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Gestione Prompts */}
        <Accordion 
          expanded={expandedPanels.prompts} 
          onChange={handlePanelExpansion('prompts')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <PsychologyIcon color="primary" />
              <Typography variant="h6">Gestione Prompts</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              {/* Prompt Sistema */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1">
                    Prompt Sistema
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">
                      Righe:
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSystemPromptRows(Math.max(3, systemPromptRows - 2))}
                      disabled={systemPromptRows <= 3}
                    >
                      <RemoveIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ minWidth: '20px', textAlign: 'center' }}>
                      {systemPromptRows}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSystemPromptRows(Math.min(30, systemPromptRows + 2))}
                      disabled={systemPromptRows >= 30}
                    >
                      <AddIcon />
                    </IconButton>
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  rows={systemPromptRows}
                  value={systemPrompt}
                  onChange={(e) => {
                    setSystemPrompt(e.target.value)
                    setPromptChars(e.target.value.length)
                    setPromptTokens(Math.ceil(e.target.value.length / 4))
                  }}
                  placeholder="Inserisci il prompt sistema..."
                />
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="textSecondary">
                    Caratteri: {promptChars} | Token stimati: {promptTokens}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={saveSystemPrompt}
                    disabled={savingPrompt}
                  >
                    {savingPrompt ? 'Salvataggio...' : 'Salva Prompt Sistema'}
                  </Button>
                </Box>
              </Box>

              {/* Token Estimator */}
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Token Estimator
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  value={tokenTestInput}
                  onChange={(e) => setTokenTestInput(e.target.value)}
                  placeholder="Inserisci testo per calcolare i token..."
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="outlined"
                  onClick={testTokens}
                  disabled={testingTokens || !tokenTestInput.trim()}
                  sx={{ mb: 2 }}
                >
                  {testingTokens ? 'Calcolo...' : 'Calcola Token'}
                </Button>
                {tokenTestResult && (
                  <Alert severity="info">
                    <Typography variant="body2">
                      <strong>Caratteri:</strong> {tokenTestResult.characters}<br/>
                      <strong>Token stimati:</strong> {tokenTestResult.estimated_tokens}<br/>
                      <strong>Parole:</strong> {tokenTestResult.words}
                    </Typography>
                  </Alert>
                )}
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Pipeline */}
        <Accordion 
          expanded={expandedPanels.pipeline} 
          onChange={handlePanelExpansion('pipeline')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <SettingsIcon color="primary" />
              <Typography variant="h6">Pipeline Configurazione</Typography>
              <Chip 
                label={pipelineConfig?.routes?.length || 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {pipelineConfig && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Route attive: {pipelineConfig.routes?.length || 0}
                </Typography>
                
                {pipelineConfig.routes?.map((route, idx) => (
                  <Chip 
                    key={idx}
                    label={`${route.pattern} → ${route.topic}`}
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                  />
                ))}
                
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Files configurazione: {Object.keys(pipelineConfig.files || {}).length}
                  </Typography>
                  
                  {Object.keys(pipelineConfig.files || {}).map((file) => (
                    <Chip 
                      key={file}
                      label={file}
                      size="small"
                      variant="outlined"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Riassunti */}
        <Accordion 
          expanded={expandedPanels.summaries} 
          onChange={handlePanelExpansion('summaries')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <SecurityIcon color="primary" />
              <Typography variant="h6">Impostazioni Riassunti Chat</Typography>
              <Chip 
                label={summarySettings.enabled ? 'Attivo' : 'Disattivo'} 
                size="small" 
                color={summarySettings.enabled ? 'success' : 'default'} 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              {/* Impostazioni Provider */}
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                  Provider per Riassunti
                </Typography>
                
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Provider AI</InputLabel>
                  <Select
                    value={summarySettings.provider}
                    onChange={(e) => setSummarySettings({...summarySettings, provider: e.target.value})}
                    label="Provider AI"
                  >
                    <MenuItem value="anthropic">Claude (Anthropic)</MenuItem>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="openrouter">OpenRouter</MenuItem>
                  </Select>
                </FormControl>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={summarySettings.enabled}
                      onChange={(e) => setSummarySettings({...summarySettings, enabled: e.target.checked})}
                    />
                  }
                  label="Abilita riassunti automatici delle conversazioni"
                />
              </Box>

              {/* Configurazione Prompt */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    Prompt per Riassunti
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">
                      Righe:
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSummaryPromptRows(Math.max(3, summaryPromptRows - 2))}
                      disabled={summaryPromptRows <= 3}
                    >
                      <RemoveIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ minWidth: '20px', textAlign: 'center' }}>
                      {summaryPromptRows}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSummaryPromptRows(Math.min(25, summaryPromptRows + 2))}
                      disabled={summaryPromptRows >= 25}
                    >
                      <AddIcon />
                    </IconButton>
                  </Box>
                </Box>
                
                <TextField
                  fullWidth
                  multiline
                  rows={summaryPromptRows}
                  value={summaryPrompt}
                  onChange={(e) => setSummaryPrompt(e.target.value)}
                  placeholder="Inserisci il prompt per i riassunti..."
                  label="Prompt personalizzato per la generazione dei riassunti"
                />
                
                <Button
                  variant="contained"
                  onClick={saveSummaryPrompt}
                  disabled={savingSummaryPrompt}
                  sx={{ mt: 2 }}
                >
                  {savingSummaryPrompt ? 'Salvataggio...' : 'Salva Prompt Riassunti'}
                </Button>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

      </Stack>

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
