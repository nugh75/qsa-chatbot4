import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Paper, Typography, Button, TextField, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, LinearProgress, Alert, FormControl, InputLabel, Select, MenuItem, Slider, Box, Avatar, FormLabel, FormGroup, FormControlLabel, Checkbox } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import SettingsIcon from '@mui/icons-material/Settings'
import { authFetch, BACKEND } from '../utils/authFetch'
import { PersonalityEntry, SystemPromptEntry, RAGGroup, MCPServer, DelegateRule } from '../types/admin'
import SystemPromptsPanel from './SystemPromptsPanel'
import WelcomeGuidesPanel from './WelcomeGuidesPanel'

interface PersonalitiesResponse { default_id: string | null; personalities: PersonalityEntry[] }

const PersonalitiesPanel: React.FC = () => {
  const [items, setItems] = useState<PersonalitiesResponse>({ default_id: null, personalities: [] })
  const [systemPrompts, setSystemPrompts] = useState<SystemPromptEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalityEntry | null>(null)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('')
  const [providerModels, setProviderModels] = useState<Record<string,string[]>>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsNote, setModelsNote] = useState<string|null>(null)
  const [systemPromptId, setSystemPromptId] = useState('')
  const [ttsProvider, setTtsProvider] = useState<string>('')
  const [ttsVoice, setTtsVoice] = useState<string>('')
  const [availableVoices, setAvailableVoices] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [guideId, setGuideId] = useState<string>('')
  const [contextWindow, setContextWindow] = useState<number | ''>('')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [maxTokens, setMaxTokens] = useState<number | ''>('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarKey, setAvatarKey] = useState<number>(0) // Force re-render key
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [active, setActive] = useState<boolean>(true)
  const [guideOptions, setGuideOptions] = useState<{id:string; label:string; content:string}[]>([])
  // Pipeline e RAG
  const [pipelineTopics, setPipelineTopics] = useState<string[]>([])
  const [ragGroups, setRagGroups] = useState<RAGGroup[]>([])
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [selectedPipelineTopics, setSelectedPipelineTopics] = useState<string[]>([])
  const [selectedRagGroups, setSelectedRagGroups] = useState<number[]>([])
  const [selectedMcpServers, setSelectedMcpServers] = useState<string[]>([])
  // Data tables
  const [dataTables, setDataTables] = useState<{id:string; title:string; name:string; row_count?: number}[]>([])
  const [selectedDataTables, setSelectedDataTables] = useState<string[]>([])
  // Forms (questionari)
  const [forms, setForms] = useState<{ id: string; name: string; description?: string; items_count: number }[]>([])
  const [selectedForms, setSelectedForms] = useState<string[]>([])
  // UI visibility flags
  const [showPipelineTopics, setShowPipelineTopics] = useState<boolean>(true)

  const [showSourceDocs, setShowSourceDocs] = useState<boolean>(true)
  const [hideRagLinks, setHideRagLinks] = useState<boolean>(false)
  const [starterPrompts, setStarterPrompts] = useState<string[]>([])
  const FULL_PROVIDERS = ['openai','gemini','claude','openrouter','ollama','local']
  const [providers, setProviders] = useState<string[]>(FULL_PROVIDERS)
  // Test inline LLM
  const [testMessage, setTestMessage] = useState<string>('Ciao! Test rapido.')
  const [testing, setTesting] = useState<boolean>(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState<string>('')
  // Extended model data with metadata (is_free for openrouter, is_cloud for ollama)
  const [extendedModels, setExtendedModels] = useState<Record<string, Array<{id: string; is_free?: boolean; is_cloud?: boolean}>>>({})
  // Filter states
  const [showFreeOnly, setShowFreeOnly] = useState(false)
  const [showCloudOnly, setShowCloudOnly] = useState(false)
  // Fallback model states
  const [fallbackModel, setFallbackModel] = useState<string>('')
  const [fallbackProvider, setFallbackProvider] = useState<string>('')
  
  // State per form starter prompts
  const [selectedFormPrompt, setSelectedFormPrompt] = useState<string>('')
  const [formPromptLabel, setFormPromptLabel] = useState<string>('')
  const [formPromptMessage, setFormPromptMessage] = useState<string>('')
  // Webhook configuration
  const [webhookUrl, setWebhookUrl] = useState<string>('')
  const [webhookEnabled, setWebhookEnabled] = useState<boolean>(false)
  const [webhookTimeout, setWebhookTimeout] = useState<number>(60)
  const [webhookAuthHeader, setWebhookAuthHeader] = useState<string>('')
  const [webhookIncludeHistory, setWebhookIncludeHistory] = useState<boolean>(true)
  // Delegation rules
  const [delegateRules, setDelegateRules] = useState<DelegateRule[]>([])
  // AI-driven delegation
  const [delegationInstructions, setDelegationInstructions] = useState<string>('')
  const [delegationTargets, setDelegationTargets] = useState<{id: string; name: string; description: string}[]>([])
  // Dialog per gestire System Prompts
  const [systemPromptsDialogOpen, setSystemPromptsDialogOpen] = useState(false)
  const [guidesDialogOpen, setGuidesDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [persRes, sysRes, tablesRes, formsRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/personalities`),
        authFetch(`${BACKEND}/api/admin/system-prompts`),
        authFetch(`${BACKEND}/api/data-tables`),
        authFetch(`${BACKEND}/api/admin/forms`)
      ])
      if (persRes.ok) {
        const data = await persRes.json()
        setItems({ default_id: data.default_id || null, personalities: data.personalities || [] })
      }
      if (sysRes.ok) {
        const data = await sysRes.json()
        setSystemPrompts(data.prompts || [])
      }
      if (tablesRes.ok) {
        const data = await tablesRes.json()
        const items = Array.isArray(data.tables) ? data.tables : []
        setDataTables(items.map((t:any)=> ({ id: t.id, title: t.title, name: t.name, row_count: t.row_count })) )
      }
      if (formsRes.ok) {
        const data = await formsRes.json()
        const list = Array.isArray(data.forms) ? data.forms : []
        setForms(list.map((f:any)=> ({ id: f.id, name: f.name, description: f.description, items_count: (f.items||[]).length || f.items_count || 0 })))
      }
    } finally { setLoading(false) }
  }, [])

  const loadGuides = useCallback(async () => {
    try {
      const gd = await fetch(`${BACKEND}/api/welcome-guides/guides`).then(r=>r.json())
      if (Array.isArray(gd)) {
        const glist = gd.map((g:any)=>({ id: g.id || g.title, label: g.title || g.id, content: g.content }))
        setGuideOptions(glist)
      } else {
        setGuideOptions([])
      }
    } catch {
      setGuideOptions([])
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(()=>{ (async()=>{
    try {
      // Recupera config admin completa per ottenere liste modelli per provider
      const adminCfgResp = await authFetch(`${BACKEND}/api/admin/config`)
      if (adminCfgResp.ok) {
        const cfg = await adminCfgResp.json()
        const aiProv = cfg?.ai_providers || {}
        const provNames = Object.keys(aiProv)
        if (provNames.length) {
          // Costruisci mappa provider -> models (filtra solo string[] non vuote)
            const pm: Record<string,string[]> = {}
            provNames.forEach(pn => {
              const models = Array.isArray(aiProv[pn]?.models) ? aiProv[pn].models.filter((m:string)=> typeof m === 'string' && m.trim()) : []
              if (models.length) pm[pn] = models
            })
            setProviderModels(pm)
            // Provider abilitati: quelli con enabled true, oppure tutti se manca flag
            const enabled = provNames.filter(pn => aiProv[pn]?.enabled || aiProv[pn]?.enabled === undefined)
            if (enabled.length) {
              const merged = [...enabled, ...FULL_PROVIDERS.filter(p=> !enabled.includes(p))]
              setProviders(merged)
            }
        }
      }
    } catch {
      // fallback già inizializzato
    }
    if (!providers.length) setProviders(FULL_PROVIDERS)
    try {
      await loadGuides()

      // Carica opzioni pipeline
      const pipelineRes = await authFetch(`${BACKEND}/api/admin/pipeline-options`)
      if (pipelineRes.ok) {
        const pipelineData = await pipelineRes.json()
        if (pipelineData.success) {
          setPipelineTopics(pipelineData.topics || [])
        }
      }
      
      // Carica gruppi RAG
      const ragRes = await authFetch(`${BACKEND}/api/admin/rag-options`)
      if (ragRes.ok) {
        const ragData = await ragRes.json()
        if (ragData.success) {
          setRagGroups(ragData.groups || [])
        }
      }
      
      // Carica server MCP
      const mcpRes = await authFetch(`${BACKEND}/api/admin/mcp-options`)
      if (mcpRes.ok) {
        const mcpData = await mcpRes.json()
        if (mcpData.success) {
          setMcpServers(mcpData.servers || [])
        }
      }
    } catch {}
  })() },[loadGuides])

  // Fetch models for a single provider on demand (used when user changes provider in dialog)
  const fetchProviderModels = useCallback(async (prov: string, refresh = false) => {
    if (!prov) return
    setModelsLoading(true); setModelsNote(null)
    try {
      // For openrouter and ollama, use extended endpoint to get metadata
      if (prov === 'openrouter' || prov === 'ollama') {
        const url = `${BACKEND}/api/admin/provider-models-extended/${prov}${refresh ? '?refresh=1':''}`
        const r = await authFetch(url)
        if (r.ok) {
          const data = await r.json()
          if (data.success) {
            const extModels = Array.isArray(data.models) ? data.models : []
            setExtendedModels(prev => ({ ...prev, [prov]: extModels }))
            const models: string[] = extModels.map((m: {id: string}) => m.id)
            setProviderModels(prev => ({ ...prev, [prov]: models }))
            if (data.note) setModelsNote(data.note)
            // Auto-select first if current model empty or vanished
            if (models.length && (!model || !models.includes(model))) {
              setModel(models[0])
            }
          } else {
            setModelsNote(data.error || 'errore')
          }
        } else {
          setModelsNote('fetch_error')
        }
      } else {
        const url = `${BACKEND}/api/admin/provider-models/${prov}${refresh ? '?refresh=1':''}`
        const r = await authFetch(url)
        if (r.ok) {
          const data = await r.json()
          if (data.success) {
            const models: string[] = Array.isArray(data.models) ? data.models : []
            setProviderModels(prev => ({ ...prev, [prov]: models }))
            if (data.note) setModelsNote(data.note)
            // Auto-select first if current model empty or vanished
            if (models.length && (!model || !models.includes(model))) {
              setModel(models[0])
            }
          } else {
            setModelsNote(data.error || 'errore')
          }
        } else {
          setModelsNote('fetch_error')
        }
      }
    } catch { setModelsNote('fetch_exception') } finally { setModelsLoading(false) }
  }, [model])

  // When provider changes in the dialog, fetch models list
  useEffect(()=>{ if (dialogOpen) { fetchProviderModels(provider) } }, [provider, dialogOpen, fetchProviderModels])

  const openNew = () => {
    setEditing(null);
    setName('');
    setProvider(providers[0] || 'local');
    setModel('');
    setSystemPromptId('');
    setGuideId(''); 
    setContextWindow(''); 
    setTemperature(0.7); 
    setMaxTokens('');
    setAvatarFile(null); 
    setAvatarPreview(null); 
    setRemoveAvatar(false); 
    setActive(true); 
    setTtsProvider('');
    setSelectedPipelineTopics([]);
    setSelectedRagGroups([]);
    setSelectedMcpServers([]);


    setStarterPrompts([]);
    // Reset webhook config
    setWebhookUrl('');
    setWebhookEnabled(false);
    setWebhookTimeout(60);
    setWebhookAuthHeader('');
    setWebhookIncludeHistory(true);
    // Reset delegation rules
    setDelegateRules([]);
    // Reset AI delegation
    setDelegationInstructions('');
    setDelegationTargets([]);
    // Reset filter states
    setShowFreeOnly(false)
    setShowCloudOnly(false)
    // Reset fallback states
    setFallbackModel('')
    setFallbackProvider('')
    setDialogOpen(true)
    setTestResult(null); setTestMessage('Ciao! Test rapido.')
    if ((providers[0] || 'local') === 'ollama') {
      fetch(`${BACKEND}/api/admin/config`).then(r=>r.json()).then(cfg => {
        const url = cfg?.ai_providers?.ollama?.base_url
        if (url) setOllamaBaseUrl(url)
      }).catch(()=>{})
    } else { setOllamaBaseUrl('') }
  }
  const openEdit = (p: PersonalityEntry) => {
    setEditing(p); setName(p.name); setProvider(p.provider); setModel(p.model); setSystemPromptId(p.system_prompt_id);
    const gids = new Set(guideOptions.map(o=>o.id))
    setGuideId(p.guide_id && gids.has(p.guide_id) ? p.guide_id : (p.guide_id || ''))
    setContextWindow(typeof p.context_window === 'number' ? p.context_window : '');
    setTemperature(typeof p.temperature === 'number' ? p.temperature : 0.7);
    setMaxTokens(typeof p.max_tokens === 'number' ? p.max_tokens : '');
    // Normalizza avatar: alcuni endpoint admin restituiscono solo `avatar` (filename) senza avatar_url
    const anyP: any = p as any;
    let effectiveAvatarUrl: string | null = null;
    if (p.avatar_url) {
      effectiveAvatarUrl = p.avatar_url as string;
    } else if (anyP.avatar) {
      // Costruisci URL statico coerente con backend public, usando BACKEND per il dominio completo
      effectiveAvatarUrl = `${BACKEND}/static/avatars/${anyP.avatar}`;
    }
    console.log('[PersonalitiesPanel] Opening edit for:', p.name, 'avatar_url:', p.avatar_url, 'raw avatar:', anyP.avatar, 'effective:', effectiveAvatarUrl);
    setAvatarFile(null); setAvatarPreview(effectiveAvatarUrl); setRemoveAvatar(false); setActive(p.active !== false); setTtsProvider(p.tts_provider || ''); setTtsVoice((p as any).tts_voice || '');
    // Carica configurazioni pipeline e RAG
    setSelectedPipelineTopics(p.enabled_pipeline_topics || []);
    setSelectedRagGroups((p.enabled_rag_groups as any[] || []).map((x:any)=> typeof x === 'number' ? x : parseInt(String(x),10)).filter((n:number)=> !isNaN(n)));
    setSelectedMcpServers(p.enabled_mcp_servers || []);
    setSelectedDataTables((p as any).enabled_data_tables || []);
    setSelectedForms((p as any).enabled_forms || []);
    setShowPipelineTopics((p as any).show_pipeline_topics !== false)
    setShowSourceDocs((p as any).show_source_docs !== false)
    setHideRagLinks((p as any).hide_rag_links === true)
    setStarterPrompts(p.starter_prompts || [])
    // Carica webhook config
    setWebhookUrl(p.webhook_url || '')
    setWebhookEnabled(p.webhook_enabled || false)
    setWebhookTimeout(p.webhook_timeout || 60)
    setWebhookAuthHeader(p.webhook_auth_header || '')
    setWebhookIncludeHistory(p.webhook_include_history !== false)
    // Carica delegation rules
    setDelegateRules((p as any).delegate_rules || [])
    // Carica AI delegation
    setDelegationInstructions((p as any).delegation_instructions || '')
    setDelegationTargets((p as any).delegation_targets || [])
    // Reset filter states
    setShowFreeOnly(false)
    setShowCloudOnly(false)
    // Load fallback states from personality
    setFallbackModel((p as any).fallback_model || '')
    setFallbackProvider((p as any).fallback_provider || '')
    setDialogOpen(true)
    setTestResult(null); setTestMessage('Ciao! Test rapido.')
    if (p.provider === 'ollama') {
      fetch(`${BACKEND}/api/admin/config`).then(r=>r.json()).then(cfg => {
        const url = cfg?.ai_providers?.ollama?.base_url
        if (url) setOllamaBaseUrl(url)
      }).catch(()=>{})
    } else { setOllamaBaseUrl('') }
  }

  // Carica elenco voci quando cambia provider TTS selezionato (nel dialog)
  useEffect(()=>{
    let abort = false
    const loadVoices = async () => {
      if (!ttsProvider) { setAvailableVoices([]); return }
      try {
        const r = await authFetch(`${BACKEND}/api/admin/voices/${ttsProvider}`)
        if (!r.ok) return
        const data = await r.json()
        if (!abort) {
          const voices: string[] = Array.isArray(data.voices) ? data.voices : []
          setAvailableVoices(voices)
          if (voices.length && !voices.includes(ttsVoice)) {
            setTtsVoice(voices[0])
          }
        }
      } catch { /* ignore */ }
    }
    loadVoices()
    return ()=>{ abort = true }
  },[ttsProvider])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      // Preserva il filename dell'avatar esistente quando non si cambia avatar
      let avatarFilename = null
      if (!removeAvatar && !avatarFile) {
        // Se non stiamo rimuovendo l'avatar e non abbiamo un nuovo file,
        // preserva l'avatar esistente
        const anyEditing: any = editing
        avatarFilename = anyEditing?.avatar || null
      }

      const res = await authFetch(`${BACKEND}/api/admin/personalities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: editing?.id, 
          name: name.trim(), 
          provider, 
          model, 
          system_prompt_id: systemPromptId, 
          tts_provider: ttsProvider || null,
          tts_voice: ttsVoice || null,
          guide_id: guideId || null, 
          context_window: contextWindow === '' ? null : contextWindow, 
          temperature, 
          max_tokens: maxTokens === '' ? null : maxTokens,
          avatar: avatarFilename, // Includi l'avatar esistente quando non si cambia
          remove_avatar: removeAvatar, 
          active,
          enabled_pipeline_topics: selectedPipelineTopics,
          enabled_rag_groups: selectedRagGroups,
          enabled_mcp_servers: selectedMcpServers,
          enabled_data_tables: selectedDataTables,
          enabled_forms: selectedForms,
          show_pipeline_topics: showPipelineTopics,
          show_source_docs: showSourceDocs,

          hide_rag_links: hideRagLinks,
          starter_prompts: starterPrompts,
          webhook_url: webhookUrl || null,
          webhook_enabled: webhookEnabled,
          webhook_timeout: webhookTimeout,
          webhook_auth_header: webhookAuthHeader || null,
          webhook_include_history: webhookIncludeHistory,
          delegate_rules: delegateRules,
          delegation_instructions: delegationInstructions || null,
          delegation_targets: delegationTargets.length > 0 ? delegationTargets : null,
          fallback_provider: fallbackProvider || null,
          fallback_model: fallbackModel || null
        })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setErr((d as any)?.detail || 'Errore salvataggio')
        return
      }

      let responseData: any = null
      try {
        responseData = await res.json()
      } catch {
        responseData = null
      }

      const fallbackId = name.trim().toLowerCase().replace(/[^a-z0-9\-\s]/g,'').replace(/\s+/g,'-')
      let personalityId = responseData?.id || editing?.id || fallbackId
      if (!personalityId) personalityId = fallbackId

      let updatedAvatarUrl: string | null = null
      let uploadedAvatarFilename: string | null = null

      if (avatarFile && !removeAvatar) {
        try {
          const form = new FormData()
          form.append('file', avatarFile)
          const up = await authFetch(`${BACKEND}/api/admin/personalities/${personalityId}/avatar`, { method: 'POST', body: form })
          if (up.ok) {
            try {
              const upJson = await up.json()
              const rawUrl = upJson?.url || null
              uploadedAvatarFilename = upJson?.filename || null
              if (rawUrl) {
                updatedAvatarUrl = /^https?:\/\//i.test(rawUrl)
                  ? rawUrl
                  : `${BACKEND.endsWith('/') ? BACKEND.slice(0, -1) : BACKEND}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`
              }
              console.log('[PersonalitiesPanel] Avatar upload success, URL:', updatedAvatarUrl)
            } catch {
            }
          } else {
            console.warn('Avatar upload failed', up.status, up.statusText)
          }
        } catch (e) {
          console.warn('Avatar upload error', e)
        }
      } else if (removeAvatar) {
        updatedAvatarUrl = null
        uploadedAvatarFilename = null
      }

      setItems(prev => {
        const list = [...prev.personalities]
        const idx = list.findIndex(p => p.id === personalityId)
        if (idx >= 0) {
          const p = { ...list[idx] }
          if (updatedAvatarUrl !== null) {
            p.avatar_url = updatedAvatarUrl
            if (uploadedAvatarFilename !== null) (p as any).avatar = uploadedAvatarFilename
          }
          if (removeAvatar) {
            p.avatar_url = null
            ;(p as any).avatar = null
          }
          p.name = name.trim()
          p.provider = provider
          p.model = model
          p.system_prompt_id = systemPromptId
          p.tts_provider = ttsProvider || null
          ;(p as any).tts_voice = ttsVoice || null
          p.guide_id = guideId || null
          p.context_window = contextWindow === '' ? null : (contextWindow as number)
          p.temperature = temperature
          p.max_tokens = maxTokens === '' ? null : (maxTokens as number)
          p.active = active
          ;(p as any).enabled_pipeline_topics = selectedPipelineTopics
          ;(p as any).enabled_rag_groups = selectedRagGroups
          ;(p as any).enabled_mcp_servers = selectedMcpServers
          ;(p as any).enabled_data_tables = selectedDataTables
          ;(p as any).enabled_forms = selectedForms
          ;(p as any).show_pipeline_topics = showPipelineTopics
          ;(p as any).show_source_docs = showSourceDocs
          ;(p as any).show_source_docs = showSourceDocs
          ;(p as any).hide_rag_links = hideRagLinks
          p.starter_prompts = starterPrompts
          list[idx] = p
        } else {
          list.push({
            id: personalityId,
            name: name.trim(),
            provider,
            model,
            system_prompt_id: systemPromptId,
            avatar_url: updatedAvatarUrl,
            avatar: uploadedAvatarFilename,
            tts_provider: ttsProvider || null,
            tts_voice: ttsVoice || null,
            guide_id: guideId || null,
            context_window: contextWindow === '' ? null : (contextWindow as number),
            temperature,
            max_tokens: maxTokens === '' ? null : (maxTokens as number),
            active,
            enabled_pipeline_topics: selectedPipelineTopics,
            enabled_rag_groups: selectedRagGroups,
            enabled_mcp_servers: selectedMcpServers,
            enabled_data_tables: selectedDataTables,
            enabled_forms: selectedForms,
            show_pipeline_topics: showPipelineTopics,
            show_source_docs: showSourceDocs,

            hide_rag_links: hideRagLinks,
            starter_prompts: starterPrompts
          })
        }
        return { ...prev, personalities: list }
      })

      if (updatedAvatarUrl !== null || removeAvatar) {
        if (avatarFile && avatarPreview) {
          try { URL.revokeObjectURL(avatarPreview) } catch {}
        }
        console.log('[PersonalitiesPanel] Updating avatar preview from:', avatarPreview, 'to:', updatedAvatarUrl)
        setAvatarPreview(updatedAvatarUrl)
        setAvatarKey(prev => prev + 1)
      }

      load()
      setMsg('Salvato')

      setTimeout(() => {
        setDialogOpen(false)
      }, 1000)
    } catch {
      setErr('Errore rete')
    } finally {
      setSaving(false)
    }
  }


  const runTest = async () => {
    if (!testMessage.trim()) return
    setTesting(true); setTestResult(null)
    try {
      const headers: Record<string,string> = { 'Content-Type':'application/json', 'X-LLM-Provider': provider }
      if (model) headers['X-LLM-Model'] = model
      if (provider === 'ollama' && ollamaBaseUrl.trim()) headers['X-Ollama-Base-Url'] = ollamaBaseUrl.trim()
      if (editing?.id) headers['X-Personality-Id'] = editing.id
      if (typeof temperature === 'number') headers['X-LLM-Temperature'] = String(temperature)
      const payload = {
        message: testMessage,
        sessionId: editing?.id ? `personality-${editing.id}-test` : 'personality-test'
      }
      const r = await authFetch(`${BACKEND}/api/chat`, { method:'POST', headers, body: JSON.stringify(payload) })
      const data = await r.json()
      setTestResult(data)
    } catch(e) { setTestResult({ error: 'Errore test' }) } finally { setTesting(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare la personalità?')) return
    await authFetch(`${BACKEND}/api/admin/personalities/${id}`, { method: 'DELETE' })
    load()
  }

  const setDefault = async (id: string) => {
    await authFetch(`${BACKEND}/api/admin/personalities/default?personality_id=${encodeURIComponent(id)}`, { method: 'POST' })
    load()
  }

  const duplicate = async (p: PersonalityEntry) => {
    const suggested = `${p.name} (copia)`
    const input = prompt('Nome per la nuova personalità', suggested)
    if (input === null) return
    const finalName = input.trim()
    if (!finalName) {
      alert('Nome non valido')
      return
    }
    try {
      const res = await authFetch(`${BACKEND}/api/admin/personalities/${encodeURIComponent(p.id)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: finalName })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        await load()
        setMsg(`Personalità duplicata: ${data.name || finalName}`)
      } else {
        const detail = (data && (data.detail || data.error)) || 'Errore duplicazione personalità'
        alert(detail)
      }
    } catch (e) {
      alert('Errore duplicazione personalità')
    }
  }

  return (
    <Paper variant="outlined" sx={{ p:2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1" sx={{ flex:1 }}>Personalità</Typography>
        <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
        <Button size="small" startIcon={<AddIcon />} onClick={openNew}>Nuova</Button>
      </Stack>
      {loading && <LinearProgress sx={{ my:1 }} />}
      <Stack spacing={1} sx={{ mt:1 }}>
        {items.personalities.map(p => {
          // Normalizza avatar URL per anteprima
          const anyP: any = p as any;
          let avatarUrl: string | null = null;
          if (p.avatar_url) {
            avatarUrl = p.avatar_url as string;
          } else if (anyP.avatar) {
            avatarUrl = `${BACKEND}/static/avatars/${anyP.avatar}`;
          }
          
          // Trova il nome del system prompt
          const systemPrompt = systemPrompts.find(sp => sp.id === p.system_prompt_id);
          const systemPromptName = systemPrompt?.name || p.system_prompt_id || 'Non impostato';
          
          return (
            <Paper key={p.id} variant="outlined" sx={{ p:2 }}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                {/* Avatar */}
                <Avatar 
                  src={avatarUrl || undefined} 
                  sx={{ width: 48, height: 48, flexShrink: 0 }}
                >
                  {!avatarUrl && p.name ? p.name[0].toUpperCase() : ''}
                </Avatar>
                
                {/* Contenuto principale */}
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                    {items.default_id === p.id && <Chip size="small" color="success" label="default" />}
                    {p.active === false && <Chip size="small" color="warning" label="inattiva" />}
                    {p.webhook_enabled && p.webhook_url && <Chip size="small" color="info" label="webhook" />}
                  </Stack>
                  
                  {p.webhook_enabled && p.webhook_url ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      <strong>Webhook:</strong> {(() => { try { return new URL(p.webhook_url).hostname } catch { return p.webhook_url } })()}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      <strong>Provider:</strong> {p.provider} · <strong>Modello:</strong> {p.model}
                    </Typography>
                  )}
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>System Prompt:</strong> {systemPromptName}
                  </Typography>
                  
                  {/* Informazioni aggiuntive */}
                  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {p.temperature !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Temperatura:</strong> {p.temperature}
                      </Typography>
                    )}
                    {p.context_window && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Context:</strong> {p.context_window}
                      </Typography>
                    )}
                    {p.max_tokens && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Max Tokens:</strong> {p.max_tokens}
                      </Typography>
                    )}
                    {p.tts_provider && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>TTS:</strong> {p.tts_provider}
                      </Typography>
                    )}
                    {p.guide_id && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Guida:</strong> ✓
                      </Typography>
                    )}
                    {p.enabled_pipeline_topics && p.enabled_pipeline_topics.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Pipeline:</strong> {p.enabled_pipeline_topics.length} topics
                      </Typography>
                    )}
                    {p.enabled_rag_groups && p.enabled_rag_groups.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>RAG:</strong> {p.enabled_rag_groups.length} gruppi
                      </Typography>
                    )}
                    {p.enabled_mcp_servers && p.enabled_mcp_servers.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>MCP:</strong> {p.enabled_mcp_servers.length} servers
                      </Typography>
                    )}
                  </Stack>
                </Stack>
                
                {/* Azioni */}
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Modifica">
                    <IconButton size="small" onClick={()=>openEdit(p)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Duplica">
                    <IconButton size="small" onClick={()=>duplicate(p)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Imposta default">
                    <span>
                      <IconButton 
                        size="small" 
                        disabled={items.default_id===p.id} 
                        onClick={()=>setDefault(p.id)}
                      >
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Elimina">
                    <IconButton size="small" onClick={()=>remove(p.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
        {!loading && items.personalities.length===0 && <Typography variant="body2" color="text.secondary">Nessuna personalità.</Typography>}
      </Stack>
      <Dialog open={dialogOpen} onClose={()=>setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing? 'Modifica personalità':'Nuova personalità'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt:1 }}>
            <TextField label="Nome" value={name} onChange={e=>setName(e.target.value)} fullWidth size="small" />

            {/* Webhook Configuration */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2">Configurazione Webhook</Typography>
                <TextField
                  label="Webhook URL"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="https://n8n.example.com/webhook/xxx"
                  helperText="Se configurato e abilitato, i messaggi saranno inoltrati a questo URL invece di usare il provider AI"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={webhookEnabled}
                      onChange={e => setWebhookEnabled(e.target.checked)}
                      disabled={!webhookUrl.trim()}
                    />
                  }
                  label="Abilita Webhook"
                />
                {webhookEnabled && webhookUrl && (
                  <>
                    <Alert severity="info" sx={{ py: 0.5 }}>
                      Quando il webhook e abilitato, Provider, Modello e Temperatura non verranno utilizzati.
                    </Alert>
                    <TextField
                      label="Timeout (secondi)"
                      type="number"
                      value={webhookTimeout}
                      onChange={e => setWebhookTimeout(parseInt(e.target.value) || 60)}
                      size="small"
                      inputProps={{ min: 5, max: 300 }}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      label="Header Autorizzazione"
                      value={webhookAuthHeader}
                      onChange={e => setWebhookAuthHeader(e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="Bearer your-secret-token"
                      helperText="Opzionale: header Authorization da inviare al webhook"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={webhookIncludeHistory}
                          onChange={e => setWebhookIncludeHistory(e.target.checked)}
                        />
                      }
                      label="Includi cronologia conversazione nella richiesta"
                    />
                  </>
                )}
              </Stack>
            </Paper>

            {/* Provider/Model section - hidden when webhook is active */}
            {!(webhookEnabled && webhookUrl) && (
            <>
            <FormControl size="small" fullWidth>
              <InputLabel id="prov-label">Provider</InputLabel>
              <Select labelId="prov-label" label="Provider" value={provider} onChange={e=>{ setProvider(e.target.value); setModel(''); }}>
                {providers.map(pv => <MenuItem key={pv} value={pv}>{pv}</MenuItem>)}
              </Select>
            </FormControl>
            {provider === 'ollama' && (
              <TextField size="small" fullWidth label="Ollama Base URL" placeholder="http://192.168.x.x:11434" value={ollamaBaseUrl} onChange={e=> setOllamaBaseUrl(e.target.value)} />
            )}
            {/* Checkbox filtro per OpenRouter (solo gratuiti) */}
            {provider === 'openrouter' && extendedModels[provider] && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showFreeOnly}
                    onChange={(e) => setShowFreeOnly(e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Mostra solo modelli gratuiti</Typography>}
              />
            )}

            {/* Checkbox filtro per Ollama (solo cloud) */}
            {provider === 'ollama' && extendedModels[provider] && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showCloudOnly}
                    onChange={(e) => setShowCloudOnly(e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Mostra solo modelli cloud</Typography>}
              />
            )}

            {/* Model selector dinamico basato su provider: se ci sono modelli => Select, altrimenti TextField per input manuale */}
            { (providerModels[provider]?.length || 0) > 0 ? (
              <FormControl size="small" fullWidth>
                <InputLabel id="model-label">Modello</InputLabel>
                <Select
                  labelId="model-label"
                  label="Modello"
                  value={model}
                  onChange={e=>setModel(e.target.value)}
                  endAdornment={modelsLoading ? <LinearProgress sx={{ width: 60 }} /> : undefined}
                >
                  {(() => {
                    let models = providerModels[provider] || []
                    // Apply free filter for openrouter
                    if (provider === 'openrouter' && showFreeOnly && extendedModels[provider]) {
                      const freeIds = new Set(extendedModels[provider].filter(m => m.is_free).map(m => m.id))
                      models = models.filter(m => freeIds.has(m))
                    }
                    // Apply cloud filter for ollama
                    if (provider === 'ollama' && showCloudOnly && extendedModels[provider]) {
                      const cloudIds = new Set(extendedModels[provider].filter(m => m.is_cloud).map(m => m.id))
                      models = models.filter(m => cloudIds.has(m))
                    }
                    return models.map(m => {
                      const extModel = extendedModels[provider]?.find(em => em.id === m)
                      const isFree = extModel?.is_free
                      const isCloud = extModel?.is_cloud
                      const suffix = isFree ? ' (gratuito)' : isCloud ? ' (cloud)' : ''
                      return <MenuItem key={m} value={m}>{m}{suffix}</MenuItem>
                    })
                  })()}
                  {model && !providerModels[provider].includes(model) && (
                    <MenuItem value={model}>{model} (personalizzato)</MenuItem>
                  )}
                </Select>
              </FormControl>
            ) : (
              <TextField
                size="small"
                fullWidth
                label={modelsLoading ? 'Caricamento modelli…' : 'Modello (inserisci manualmente)'}
                value={model}
                onChange={e=>setModel(e.target.value)}
                helperText={modelsLoading ? 'Recupero elenco modelli...' : (modelsNote === 'missing_api_key' ? 'Configura API key per elenco automatico' : 'Nessun elenco remoto, inserisci il nome esatto')}
              />
            ) }
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={()=>fetchProviderModels(provider, true)} disabled={modelsLoading}>Aggiorna modelli</Button>
              {modelsLoading && <LinearProgress sx={{ flex:1 }} />}
            </Stack>
            {modelsNote && modelsNote !== 'missing_api_key' && modelsNote !== 'fetch_error' && modelsNote !== 'fetch_exception' && (
              <Typography variant="caption" color="text.secondary">Nota: {modelsNote}</Typography>
            )}

            {/* ============================================ */}
            {/* SEZIONE LLM FALLBACK (identica a principale) */}
            {/* ============================================ */}
            <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.main' }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" color="warning.dark">LLM di Fallback (opzionale)</Typography>
                <Typography variant="caption" color="text.secondary">
                  Se il modello principale fallisce, verrà utilizzato questo modello di fallback
                </Typography>

                {/* Fallback Provider */}
                <FormControl size="small" fullWidth>
                  <InputLabel id="fallback-prov-label">Provider Fallback</InputLabel>
                  <Select
                    labelId="fallback-prov-label"
                    label="Provider Fallback"
                    value={fallbackProvider}
                    onChange={e => {
                      setFallbackProvider(e.target.value)
                      setFallbackModel('')
                      // Load models for fallback provider if needed
                      if (e.target.value && !providerModels[e.target.value]) {
                        fetchProviderModels(e.target.value, false)
                      }
                    }}
                  >
                    <MenuItem value="">Nessun fallback</MenuItem>
                    {providers.map(pv => <MenuItem key={pv} value={pv}>{pv}</MenuItem>)}
                  </Select>
                </FormControl>

                {/* Fallback Ollama Base URL (se ollama) */}
                {fallbackProvider === 'ollama' && (
                  <TextField size="small" fullWidth label="Ollama Base URL (Fallback)" placeholder="http://192.168.x.x:11434" value={ollamaBaseUrl} onChange={e => setOllamaBaseUrl(e.target.value)} />
                )}

                {/* Checkbox filtro per OpenRouter fallback (solo gratuiti) */}
                {fallbackProvider === 'openrouter' && extendedModels['openrouter'] && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={showFreeOnly}
                        onChange={(e) => setShowFreeOnly(e.target.checked)}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">Mostra solo modelli gratuiti</Typography>}
                  />
                )}

                {/* Checkbox filtro per Ollama fallback (solo cloud) */}
                {fallbackProvider === 'ollama' && extendedModels['ollama'] && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={showCloudOnly}
                        onChange={(e) => setShowCloudOnly(e.target.checked)}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">Mostra solo modelli cloud</Typography>}
                  />
                )}

                {/* Fallback Model selector */}
                {fallbackProvider && (providerModels[fallbackProvider]?.length || 0) > 0 ? (
                  <FormControl size="small" fullWidth>
                    <InputLabel id="fallback-model-label">Modello Fallback</InputLabel>
                    <Select
                      labelId="fallback-model-label"
                      label="Modello Fallback"
                      value={fallbackModel}
                      onChange={e => setFallbackModel(e.target.value)}
                    >
                      <MenuItem value="">Seleziona modello...</MenuItem>
                      {(() => {
                        let models = providerModels[fallbackProvider] || []
                        // Apply free filter for openrouter
                        if (fallbackProvider === 'openrouter' && showFreeOnly && extendedModels['openrouter']) {
                          const freeIds = new Set(extendedModels['openrouter'].filter(m => m.is_free).map(m => m.id))
                          models = models.filter(m => freeIds.has(m))
                        }
                        // Apply cloud filter for ollama
                        if (fallbackProvider === 'ollama' && showCloudOnly && extendedModels['ollama']) {
                          const cloudIds = new Set(extendedModels['ollama'].filter(m => m.is_cloud).map(m => m.id))
                          models = models.filter(m => cloudIds.has(m))
                        }
                        return models.map(m => {
                          const extModel = extendedModels[fallbackProvider]?.find(em => em.id === m)
                          const isFree = extModel?.is_free
                          const isCloud = extModel?.is_cloud
                          const suffix = isFree ? ' (gratuito)' : isCloud ? ' (cloud)' : ''
                          return <MenuItem key={m} value={m}>{m}{suffix}</MenuItem>
                        })
                      })()}
                      {fallbackModel && !providerModels[fallbackProvider]?.includes(fallbackModel) && (
                        <MenuItem value={fallbackModel}>{fallbackModel} (personalizzato)</MenuItem>
                      )}
                    </Select>
                  </FormControl>
                ) : fallbackProvider ? (
                  <TextField
                    size="small"
                    fullWidth
                    label="Modello Fallback (inserisci manualmente)"
                    value={fallbackModel}
                    onChange={e => setFallbackModel(e.target.value)}
                    helperText="Nessun elenco remoto, inserisci il nome esatto"
                  />
                ) : null}

                {/* Pulsante aggiorna modelli fallback */}
                {fallbackProvider && (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => fetchProviderModels(fallbackProvider, true)} disabled={modelsLoading}>
                      Aggiorna modelli fallback
                    </Button>
                    {modelsLoading && <LinearProgress sx={{ flex: 1 }} />}
                  </Stack>
                )}
              </Stack>
            </Paper>

            {/* Test rapido LLM */}
            <Paper variant="outlined" sx={{ p:1.5 }}>
              <Stack spacing={1.2}>
                <Typography variant="subtitle2">Test LLM</Typography>
                <TextField
                  size="small"
                  fullWidth
                  label="Messaggio di test"
                  value={testMessage}
                  onChange={e=> setTestMessage(e.target.value)}
                  multiline
                  minRows={2}
                />
                <Stack direction="row" spacing={1} alignItems="center">
                  <Button size="small" variant="contained" disabled={testing || !testMessage.trim()} onClick={runTest}>Esegui</Button>
                  {testing && <LinearProgress sx={{ flex:1, height:6, borderRadius:1 }} />}
                </Stack>
                {testResult && (
                  <Paper variant="outlined" sx={{ p:1, maxHeight:160, overflow:'auto', fontFamily:'monospace', fontSize:12 }}>
                    <pre style={{ margin:0, whiteSpace:'pre-wrap' }}>{JSON.stringify(testResult, null, 2)}</pre>
                  </Paper>
                )}
              </Stack>
            </Paper>
            </>
            )}
            {/* End of Provider/Model section hidden when webhook is active */}

            <Box>
              <Typography variant="caption" sx={{ display:'block', mb:0.5 }}>Avatar</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar 
                  key={`avatar-${avatarKey}-${avatarPreview || 'no-avatar'}`} // Force re-render when URL changes
                  src={avatarPreview || undefined} 
                  sx={{ width:56, height:56 }}
                  onError={(e) => console.log('[PersonalitiesPanel] Avatar load error:', avatarPreview, e)}
                  onLoad={() => console.log('[PersonalitiesPanel] Avatar loaded successfully:', avatarPreview)}
                >
                  {!avatarPreview && name ? name[0] : ''}
                </Avatar>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" component="label">Scegli
                    <input hidden type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(f){ setAvatarFile(f); setRemoveAvatar(false); const url=URL.createObjectURL(f); setAvatarPreview(url) } }} />
                  </Button>
                  {avatarPreview && !removeAvatar && (
                    <Button size="small" color="error" onClick={()=>{ setAvatarFile(null); setAvatarPreview(null); setRemoveAvatar(true) }}>Rimuovi</Button>
                  )}
                  {removeAvatar && (
                    <Chip size="small" label="Rimosso" color="warning" />
                  )}
                </Stack>
              </Stack>
              <Typography variant="caption" color="text.secondary">PNG/JPG/WebP max 2MB</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel id="sp-label">System Prompt</InputLabel>
                <Select labelId="sp-label" label="System Prompt" value={systemPromptId} onChange={e=>setSystemPromptId(e.target.value)}>
                  {systemPrompts.map(sp => <MenuItem key={sp.id} value={sp.id}>{sp.name}</MenuItem>)}
                </Select>
              </FormControl>
              <Tooltip title="Gestisci System Prompts">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setSystemPromptsDialogOpen(true)}
                  sx={{ minWidth: 'auto', px: 1.5, height: 40 }}
                >
                  <SettingsIcon fontSize="small" />
                </Button>
              </Tooltip>
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel id="tts-label">Voce (TTS)</InputLabel>
              <Select labelId="tts-label" label="Voce (TTS)" value={ttsProvider} onChange={e=> setTtsProvider(e.target.value)} displayEmpty>
                <MenuItem value=""><em>Default</em></MenuItem>
                {/* Opzioni base: aggiunto 'coqui' */}
                {['edge','elevenlabs','openai','piper','coqui'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
              </Select>
            </FormControl>
            {ttsProvider && (
              <FormControl size="small" fullWidth>
                <InputLabel id="tts-voice-label">Voce specifica</InputLabel>
                <Select labelId="tts-voice-label" label="Voce specifica" value={ttsVoice} onChange={e=> setTtsVoice(e.target.value)} displayEmpty>
                  <MenuItem value=""><em>Auto / default</em></MenuItem>
                  {availableVoices.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel id="active-label">Stato</InputLabel>
              <Select labelId="active-label" label="Stato" value={active ? 'true':'false'} onChange={e=> setActive(e.target.value === 'true')}>
                <MenuItem value="true">Attiva (visibile in chat)</MenuItem>
                <MenuItem value="false">Inattiva (nascosta)</MenuItem>
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel id="guide-label">Guida</InputLabel>
                <Select labelId="guide-label" label="Guida" value={guideId} onChange={e=> setGuideId(e.target.value)}>
                  <MenuItem value=""><em>Nessuna</em></MenuItem>
                  {guideOptions.map(opt => <MenuItem key={opt.id} value={opt.id}>{opt.label || opt.id}</MenuItem>)}
                </Select>
              </FormControl>
              <Tooltip title="Gestisci Guide">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setGuidesDialogOpen(true)}
                  sx={{ minWidth: 'auto', px: 1.5, height: 40 }}
                >
                  <SettingsIcon fontSize="small" />
                </Button>
              </Tooltip>
            </Stack>
            <TextField label="Context Window" value={contextWindow} onChange={e=>{ const v = e.target.value; if(v===''){ setContextWindow(''); } else { const n = Number(v); if(!isNaN(n) && n>=0 && n<=200){ setContextWindow(n)} } }} fullWidth size="small" placeholder="Es. 8 (numero scambi recenti)" />
            <TextField label="Max Tokens" value={maxTokens} onChange={e=>{ const v = e.target.value; if(v===''){ setMaxTokens(''); } else { const n = Number(v); if(!isNaN(n) && n>=1 && n<=50000){ setMaxTokens(n)} } }} fullWidth size="small" placeholder="Es. 2000 (massimo token per risposta)" />
            {/* Temperature - hidden when webhook is active */}
            {!(webhookEnabled && webhookUrl) && (
            <Box>
              <Typography variant="caption" sx={{ display:'block', mb:0.5 }}>Temperatura: {temperature.toFixed(2)}</Typography>
              <Slider size="small" min={0} max={1.2} step={0.05} value={temperature} onChange={(_,val)=> setTemperature(val as number)} />
            </Box>
            )}

            {/* Pipeline Topics */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Topics Pipeline Abilitati</FormLabel>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 200, overflow: 'auto' }}>
                <FormGroup>
                  {pipelineTopics.map(topic => (
                    <FormControlLabel
                      key={topic}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedPipelineTopics.includes(topic)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPipelineTopics(prev => [...prev, topic])
                            } else {
                              setSelectedPipelineTopics(prev => prev.filter(t => t !== topic))
                            }
                          }}
                        />
                      }
                      label={topic}
                    />
                  ))}
                  {pipelineTopics.length === 0 && (
                    <Typography variant="caption" color="text.secondary">Nessun topic pipeline disponibile</Typography>
                  )}
                </FormGroup>
              </Paper>
            </Box>

            {/* Visibilità in chat */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Visibilità in Chat</FormLabel>
              <Paper variant="outlined" sx={{ p: 1 }}>
                <FormGroup>
                  <FormControlLabel control={<Checkbox size="small" checked={showPipelineTopics} onChange={e=> setShowPipelineTopics(e.target.checked)} />} label="Mostra Topics Pipeline" />
                  <FormControlLabel control={<Checkbox size="small" checked={showSourceDocs} onChange={e=> setShowSourceDocs(e.target.checked)} />} label="Mostra Fonti (RAG/Tabelle)" />
                  <FormControlLabel
              control={<Checkbox size="small" checked={hideRagLinks} onChange={e=> setHideRagLinks(e.target.checked)} />}
              label="Nascondi link ai documenti RAG (se RAG attivo)"
            />
                </FormGroup>
              </Paper>
            </Box>

            <Box sx={{ mt: 2, p: 1, border: '1px solid #ddd', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>Starter Prompts (Opzionale)</Typography>
              <Typography variant="caption" display="block" color="text.secondary" sx={{ mb: 1 }}>
                Frasi suggerite che appaiono quando la chat è vuota con questa personalità. Inserisci una frase e premi Invio.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField
                  fullWidth size="small"
                  placeholder="Nuovo prompt..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                            setStarterPrompts([...starterPrompts, val]);
                            (e.target as HTMLInputElement).value = '';
                        }
                    }
                  }}
                />
              </Stack>
              
              {/* Form Prompt Adder */}
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, p:1, bgcolor:'#f9f9f9', borderRadius:1 }} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 150, flex:1 }}>
                  <InputLabel id="fp-select-label">Aggiungi Form</InputLabel>
                  <Select 
                    labelId="fp-select-label"
                    label="Aggiungi Form"
                    value={selectedFormPrompt} 
                    onChange={e=> {
                       setSelectedFormPrompt(e.target.value);
                       // Auto-fill label with form name if empty
                       const f = forms.find(x=>x.id===e.target.value);
                       if(f) setFormPromptLabel(f.name);
                    }}
                  >
                    <MenuItem value=""><em>Seleziona...</em></MenuItem>
                    {forms.map(f => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField 
                  size="small" 
                  label="Etichetta pulsante" 
                  value={formPromptLabel} 
                  onChange={e=> setFormPromptLabel(e.target.value)}
                  sx={{ flex:1 }}
                />
                <TextField 
                  size="small" 
                  label="Messaggio (opzionale)" 
                  placeholder="Es: Voglio compilare il form"
                  value={formPromptMessage} 
                  onChange={e=> setFormPromptMessage(e.target.value)}
                  sx={{ flex:1 }}
                />
                <Button 
                  size="small" 
                  variant="outlined" 
                  disabled={!selectedFormPrompt || !formPromptLabel.trim()}
                  onClick={() => {
                    const msgPart = formPromptMessage.trim() ? `|${formPromptMessage.trim()}` : '';
                    const cmd = `CMD:OPEN_FORM|${formPromptLabel.trim()}|${selectedFormPrompt}${msgPart}`;
                    setStarterPrompts([...starterPrompts, cmd]);
                    setSelectedFormPrompt('');
                    setFormPromptLabel('');
                    setFormPromptMessage('');
                  }}
                >
                  Agg.
                </Button>
              </Stack>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {starterPrompts.map((sp, idx) => (
                  <Chip
                    key={idx}
                    label={sp}
                    onDelete={() => setStarterPrompts(starterPrompts.filter((_, i) => i !== idx))}
                    size="small"
                  />
                ))}
              </Box>
            </Box>

            {/* Gruppi RAG */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Gruppi RAG Abilitati</FormLabel>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 200, overflow: 'auto' }}>
                <FormGroup>
                  {ragGroups.map(group => (
                    <FormControlLabel
                      key={group.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedRagGroups.includes(group.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRagGroups(prev => [...prev, group.id])
                            } else {
                              setSelectedRagGroups(prev => prev.filter(id => id !== group.id))
                            }
                          }}
                        />
                      }
                      label={`${group.name} (${group.document_count} documenti)`}
                    />
                  ))}
                  {ragGroups.length === 0 && (
                    <Typography variant="caption" color="text.secondary">Nessun gruppo RAG disponibile</Typography>
                  )}
                </FormGroup>
              </Paper>
            </Box>

            {/* Server MCP */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Server MCP Abilitati</FormLabel>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 200, overflow: 'auto' }}>
                <FormGroup>
                  {mcpServers.map(server => (
                    <FormControlLabel
                      key={server.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedMcpServers.includes(server.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMcpServers(prev => [...prev, server.id])
                            } else {
                              setSelectedMcpServers(prev => prev.filter(id => id !== server.id))
                            }
                          }}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2">{server.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {server.description}
                          </Typography>
                          {server.capabilities.length > 0 && (
                            <Typography variant="caption" color="primary" sx={{ display: 'block' }}>
                              {server.capabilities.join(', ')}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  ))}
                  {mcpServers.length === 0 && (
                    <Typography variant="caption" color="text.secondary">Nessun server MCP disponibile</Typography>
                  )}
                </FormGroup>
              </Paper>
            </Box>

            {/* Tabelle Dati */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Tabelle Dati Abilitate</FormLabel>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto' }}>
                <FormGroup>
                  {dataTables.map(tbl => (
                    <FormControlLabel
                      key={tbl.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedDataTables.includes(tbl.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDataTables(prev => [...prev, tbl.id])
                            } else {
                              setSelectedDataTables(prev => prev.filter(id => id !== tbl.id))
                            }
                          }}
                        />
                      }
                      label={`${tbl.title} (${tbl.row_count || 0} righe)`}
                    />
                  ))}
                  {dataTables.length === 0 && (
                    <Typography variant="caption" color="text.secondary">Nessuna tabella disponibile</Typography>
                  )}
                </FormGroup>
              </Paper>
            </Box>

            {/* Forms (Questionari) */}
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Questionari Abilitati</FormLabel>
              <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto' }}>
                <FormGroup>
                  {forms.map(f => (
                    <FormControlLabel
                      key={f.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedForms.includes(f.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedForms(prev => [...prev, f.id])
                            } else {
                              setSelectedForms(prev => prev.filter(id => id !== f.id))
                            }
                          }}
                        />
                      }
                      label={`${f.name} (${f.items_count || 0} voci)`}
                    />
                  ))}
                  {forms.length === 0 && (
                    <Typography variant="caption" color="text.secondary">Nessun form disponibile</Typography>
                  )}
                </FormGroup>
              </Paper>
            </Box>

            {/* Delegation Rules */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2">Regole di Delega</Typography>
                <Typography variant="caption" color="text.secondary">
                  Configura quando delegare la risposta ad un'altra personalità in base al contenuto del messaggio
                </Typography>

                {/* Lista regole esistenti */}
                {delegateRules.map((rule, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small"
                          label="Pattern (regex)"
                          value={rule.pattern}
                          onChange={e => {
                            const updated = [...delegateRules]
                            updated[idx] = { ...rule, pattern: e.target.value }
                            setDelegateRules(updated)
                          }}
                          sx={{ flex: 2 }}
                          placeholder="traduci|translate"
                        />
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                          <InputLabel>Personalità</InputLabel>
                          <Select
                            label="Personalità"
                            value={rule.target_personality_id}
                            onChange={e => {
                              const updated = [...delegateRules]
                              updated[idx] = { ...rule, target_personality_id: e.target.value }
                              setDelegateRules(updated)
                            }}
                          >
                            {items.personalities
                              .filter(p => p.id !== editing?.id)
                              .map(p => (
                                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                              ))
                            }
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <InputLabel>Modalità</InputLabel>
                          <Select
                            label="Modalità"
                            value={rule.mode}
                            onChange={e => {
                              const updated = [...delegateRules]
                              updated[idx] = { ...rule, mode: e.target.value as 'full' | 'partial' }
                              setDelegateRules(updated)
                            }}
                          >
                            <MenuItem value="full">Totale</MenuItem>
                            <MenuItem value="partial">Parziale</MenuItem>
                          </Select>
                        </FormControl>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDelegateRules(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {rule.mode === 'full'
                          ? 'Totale: la risposta viene generata interamente dalla personalità delegata'
                          : 'Parziale: entrambe le personalità rispondono, le risposte vengono combinate'}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}

                {/* Pulsante per aggiungere nuova regola */}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setDelegateRules(prev => [...prev, { pattern: '', target_personality_id: '', mode: 'full' }])}
                  disabled={items.personalities.filter(p => p.id !== editing?.id).length === 0}
                >
                  Aggiungi regola
                </Button>
                {items.personalities.filter(p => p.id !== editing?.id).length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Crea altre personalità per poter configurare le deleghe
                  </Typography>
                )}
              </Stack>
            </Paper>

            {/* AI-Driven Delegation */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2">Delega Intelligente (AI)</Typography>
                <Typography variant="caption" color="text.secondary">
                  L'AI valuta semanticamente il messaggio e decide se delegare, anche quando il regex non matcha.
                  Scrivi istruzioni in linguaggio naturale su quando delegare.
                </Typography>

                <TextField
                  label="Istruzioni per la delega"
                  multiline
                  minRows={3}
                  maxRows={8}
                  value={delegationInstructions}
                  onChange={e => setDelegationInstructions(e.target.value)}
                  fullWidth
                  placeholder={`Esempio:
Delega all'esperto di matematica quando l'utente:
- Chiede aiuto con calcoli o equazioni
- Ha problemi matematici da risolvere
- Vuole capire concetti matematici

Delega all'esperto di storia quando l'utente:
- Chiede informazioni su eventi storici
- Vuole sapere di personaggi del passato`}
                  helperText="Descrivi in linguaggio naturale quando delegare e a quale personalità"
                />

                {/* Lista target per delega AI */}
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Personalità target per la delega AI</Typography>

                {delegationTargets.map((target, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Personalità</InputLabel>
                        <Select
                          label="Personalità"
                          value={target.id}
                          onChange={e => {
                            const selectedP = items.personalities.find(p => p.id === e.target.value)
                            const updated = [...delegationTargets]
                            updated[idx] = {
                              ...target,
                              id: e.target.value,
                              name: selectedP?.name || e.target.value
                            }
                            setDelegationTargets(updated)
                          }}
                        >
                          {items.personalities
                            .filter(p => p.id !== editing?.id)
                            .map(p => (
                              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                            ))
                          }
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Descrizione (per l'AI)"
                        value={target.description}
                        onChange={e => {
                          const updated = [...delegationTargets]
                          updated[idx] = { ...target, description: e.target.value }
                          setDelegationTargets(updated)
                        }}
                        sx={{ flex: 1 }}
                        placeholder="Es: Esperto in calcoli e problemi matematici"
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDelegationTargets(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Paper>
                ))}

                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setDelegationTargets(prev => [...prev, { id: '', name: '', description: '' }])}
                  disabled={items.personalities.filter(p => p.id !== editing?.id).length === 0}
                >
                  Aggiungi target
                </Button>

                {delegationInstructions && delegationTargets.length === 0 && (
                  <Alert severity="warning" sx={{ py: 0.5 }}>
                    Hai scritto istruzioni ma non hai aggiunto personalità target. Aggiungi almeno un target.
                  </Alert>
                )}
              </Stack>
            </Paper>

            {err && <Alert severity="error" onClose={()=>setErr(null)}>{err}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setDialogOpen(false)}>Annulla</Button>
          <Button disabled={saving} variant="contained" onClick={save}>{saving? 'Salvo…':'Salva'}</Button>
        </DialogActions>
      </Dialog>
      {msg && <Alert severity="success" onClose={()=>setMsg(null)} sx={{ mt:1 }}>{msg}</Alert>}

      {/* Dialog per gestire System Prompts */}
      <Dialog
        open={systemPromptsDialogOpen}
        onClose={() => {
          setSystemPromptsDialogOpen(false);
          // Ricarica i system prompts dopo la chiusura
          load();
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Gestione System Prompts</DialogTitle>
        <DialogContent>
          <SystemPromptsPanel />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setSystemPromptsDialogOpen(false);
            load();
          }}>Chiudi</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={guidesDialogOpen}
        onClose={() => {
          setGuidesDialogOpen(false);
          loadGuides();
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Gestione Guide</DialogTitle>
        <DialogContent>
          <WelcomeGuidesPanel mode="guide" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setGuidesDialogOpen(false);
            loadGuides();
          }}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

export default PersonalitiesPanel
