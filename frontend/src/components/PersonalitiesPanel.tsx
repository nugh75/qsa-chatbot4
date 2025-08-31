import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Paper, Typography, Button, TextField, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, LinearProgress, Alert, FormControl, InputLabel, Select, MenuItem, Slider, Box, Avatar, FormLabel, FormGroup, FormControlLabel, Checkbox } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import { authFetch, BACKEND } from '../utils/authFetch'
import { PersonalityEntry, SystemPromptEntry, RAGGroup } from '../types/admin'

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
  const [systemPromptId, setSystemPromptId] = useState('')
  const [ttsProvider, setTtsProvider] = useState<string>('')
  const [ttsVoice, setTtsVoice] = useState<string>('')
  const [availableVoices, setAvailableVoices] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // Selected welcome message id (must match backend existing welcome messages)
  const [welcomeMessageId, setWelcomeMessageId] = useState<string>('')
  const [guideId, setGuideId] = useState<string>('')
  const [contextWindow, setContextWindow] = useState<number | ''>('')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarKey, setAvatarKey] = useState<number>(0) // Force re-render key
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [active, setActive] = useState<boolean>(true)
  const [welcomeOptions, setWelcomeOptions] = useState<{id:string; label:string; content:string}[]>([])
  const [guideOptions, setGuideOptions] = useState<{id:string; label:string; content:string}[]>([])
  // Pipeline e RAG
  const [pipelineTopics, setPipelineTopics] = useState<string[]>([])
  const [ragGroups, setRagGroups] = useState<RAGGroup[]>([])
  const [selectedPipelineTopics, setSelectedPipelineTopics] = useState<string[]>([])
  const [selectedRagGroups, setSelectedRagGroups] = useState<number[]>([])
  const FULL_PROVIDERS = ['openai','gemini','claude','openrouter','ollama','local']
  const [providers, setProviders] = useState<string[]>(FULL_PROVIDERS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [persRes, sysRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/personalities`),
        authFetch(`${BACKEND}/api/admin/system-prompts`)
      ])
      if (persRes.ok) {
        const data = await persRes.json()
        setItems({ default_id: data.default_id || null, personalities: data.personalities || [] })
      }
      if (sysRes.ok) {
        const data = await sysRes.json()
        setSystemPrompts(data.prompts || [])
      }
    } finally { setLoading(false) }
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
      const wm = await fetch(`${BACKEND}/api/welcome-guides/welcome`).then(r=>r.json())
      if (Array.isArray(wm)) {
        const list = wm.map((m:any)=>({ id: m.id || m.title, label: m.title || m.id, content: m.content }))
        setWelcomeOptions(list)
      }
      const gd = await fetch(`${BACKEND}/api/welcome-guides/guides`).then(r=>r.json())
      if (Array.isArray(gd)) {
        const glist = gd.map((g:any)=>({ id: g.id || g.title, label: g.title || g.id, content: g.content }))
        setGuideOptions(glist)
      }
      
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
    } catch {}
  })() },[])

  const openNew = () => { 
    setEditing(null); 
    setName(''); 
    setProvider(providers[0] || 'local'); 
    setModel(''); 
    setSystemPromptId(''); 
    setWelcomeMessageId(''); 
    setGuideId(''); 
    setContextWindow(''); 
    setTemperature(0.7); 
    setAvatarFile(null); 
    setAvatarPreview(null); 
    setRemoveAvatar(false); 
    setActive(true); 
    setTtsProvider('');
    setSelectedPipelineTopics([]);
    setSelectedRagGroups([]);
    setDialogOpen(true) 
  }
  const openEdit = (p: PersonalityEntry) => {
    setEditing(p); setName(p.name); setProvider(p.provider); setModel(p.model); setSystemPromptId(p.system_prompt_id);
    const ids = new Set(welcomeOptions.map(o=>o.id))
    const wid = p.welcome_message_id || (p.welcome_message && ids.has(p.welcome_message) ? p.welcome_message : '')
    setWelcomeMessageId(wid || '')
    const gids = new Set(guideOptions.map(o=>o.id))
    setGuideId(p.guide_id && gids.has(p.guide_id) ? p.guide_id : (p.guide_id || ''))
    setContextWindow(typeof p.context_window === 'number' ? p.context_window : '');
    setTemperature(typeof p.temperature === 'number' ? p.temperature : 0.7);
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
    setSelectedRagGroups(p.enabled_rag_groups || []);
    setDialogOpen(true)
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
          welcome_message: welcomeMessageId || null, 
          guide_id: guideId || null, 
          context_window: contextWindow === '' ? null : contextWindow, 
          temperature, 
          remove_avatar: removeAvatar, 
          active,
          enabled_pipeline_topics: selectedPipelineTopics,
          enabled_rag_groups: selectedRagGroups
        })
      })
      if (res.ok) {
        let updatedAvatarUrl: string | null = null
        let personalityId = editing?.id || name.trim().toLowerCase().replace(/[^a-z0-9\-\s]/g,'').replace(/\s+/g,'-')
        // Upload avatar if needed
        if (avatarFile && !removeAvatar) {
          try {
            const form = new FormData()
            form.append('file', avatarFile)
            const up = await authFetch(`${BACKEND}/api/admin/personalities/${personalityId}/avatar`, { method: 'POST', body: form })
            if (up.ok) {
              try { 
                const upJson = await up.json(); 
                updatedAvatarUrl = upJson.url || null;
                console.log('[PersonalitiesPanel] Avatar upload success, URL:', updatedAvatarUrl);
              } catch {}
            } else {
              console.warn('Avatar upload failed', up.status, up.statusText)
            }
          } catch(e){ console.warn('Avatar upload error', e) }
        } else if (removeAvatar) {
          updatedAvatarUrl = null
        }
        // Optimistic local update of personalities list (avoid full reload flicker)
        setItems(prev => {
          const list = [...prev.personalities]
          const idx = list.findIndex(p => p.id === personalityId)
          if (idx >= 0) {
            const p = { ...list[idx] }
            if (updatedAvatarUrl !== null) p.avatar_url = updatedAvatarUrl
            if (removeAvatar) p.avatar_url = null
            p.name = name.trim()
            p.provider = provider
            p.model = model
            p.system_prompt_id = systemPromptId
            p.tts_provider = ttsProvider || null
            ;(p as any).tts_voice = ttsVoice || null
            p.welcome_message = welcomeMessageId || null
            p.guide_id = guideId || null
            p.context_window = contextWindow === '' ? null : (contextWindow as number)
            p.temperature = temperature
            p.active = active
            ;(p as any).enabled_pipeline_topics = selectedPipelineTopics
            ;(p as any).enabled_rag_groups = selectedRagGroups
            list[idx] = p
          } else {
            list.push({
              id: personalityId,
              name: name.trim(),
              provider,
              model,
              system_prompt_id: systemPromptId,
              avatar_url: updatedAvatarUrl,
              tts_provider: ttsProvider || null,
              tts_voice: ttsVoice || null,
              welcome_message: welcomeMessageId || null,
              guide_id: guideId || null,
              context_window: contextWindow === '' ? null : (contextWindow as number),
              temperature,
              active,
              enabled_pipeline_topics: selectedPipelineTopics,
              enabled_rag_groups: selectedRagGroups
            })
          }
          return { ...prev, personalities: list }
        })
        if (updatedAvatarUrl !== null || removeAvatar) {
          // Clean up any object URLs first
          if (avatarFile && avatarPreview) {
            try { URL.revokeObjectURL(avatarPreview) } catch {}
          }
          
          // Update preview with final server URL (replacing any ObjectURL)
          console.log('[PersonalitiesPanel] Updating avatar preview from:', avatarPreview, 'to:', updatedAvatarUrl);
          setAvatarPreview(updatedAvatarUrl)
          setAvatarKey(prev => prev + 1) // Force re-render
        }
        
        // Background refresh to sync any server-derived fields (system default id etc.)
        load()
        setMsg('Salvato')
        
        // Close dialog after a brief delay to let user see the updated avatar preview
        setTimeout(() => {
          setDialogOpen(false)
        }, 1000) // 1 second delay to show the updated avatar
        
      } else { const d=await res.json(); setErr(d.detail || 'Errore salvataggio') }
    } catch { setErr('Errore rete') } finally { setSaving(false) }
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
                  </Stack>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <strong>Provider:</strong> {p.provider} · <strong>Modello:</strong> {p.model}
                  </Typography>
                  
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
                    {p.tts_provider && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>TTS:</strong> {p.tts_provider}
                      </Typography>
                    )}
                    {p.welcome_message && (
                      <Typography variant="caption" color="text.secondary">
                        <strong>Welcome:</strong> ✓
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
                  </Stack>
                </Stack>
                
                {/* Azioni */}
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="Modifica">
                    <IconButton size="small" onClick={()=>openEdit(p)}>
                      <EditIcon fontSize="small" />
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
      <Dialog open={dialogOpen} onClose={()=>setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing? 'Modifica personalità':'Nuova personalità'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt:1 }}>
            <TextField label="Nome" value={name} onChange={e=>setName(e.target.value)} fullWidth size="small" />
            <FormControl size="small" fullWidth>
              <InputLabel id="prov-label">Provider</InputLabel>
              <Select labelId="prov-label" label="Provider" value={provider} onChange={e=>setProvider(e.target.value)}>
                {providers.map(pv => <MenuItem key={pv} value={pv}>{pv}</MenuItem>)}
              </Select>
            </FormControl>
            {/* Model selector dinamico basato su provider */}
            <FormControl size="small" fullWidth>
              <InputLabel id="model-label">Modello</InputLabel>
              <Select
                labelId="model-label"
                label="Modello"
                value={model}
                onChange={e=>setModel(e.target.value)}
              >
                {(() => {
                  const dynamic = providerModels[provider] || []
                  const list = [...dynamic]
                  if (model && !list.includes(model)) list.push(model)
                  if (!list.length) list.push('')
                  return list.filter(Boolean).map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)
                })()}
              </Select>
            </FormControl>
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
            <FormControl size="small" fullWidth>
              <InputLabel id="sp-label">System Prompt</InputLabel>
              <Select labelId="sp-label" label="System Prompt" value={systemPromptId} onChange={e=>setSystemPromptId(e.target.value)}>
                {systemPrompts.map(sp => <MenuItem key={sp.id} value={sp.id}>{sp.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="tts-label">Voce (TTS)</InputLabel>
              <Select labelId="tts-label" label="Voce (TTS)" value={ttsProvider} onChange={e=> setTtsProvider(e.target.value)} displayEmpty>
                <MenuItem value=""><em>Default</em></MenuItem>
                {/* Opzioni base: saranno sovrascritte se arricchite altrove */}
                {['edge','elevenlabs','openai','piper'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
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
            <FormControl size="small" fullWidth>
              <InputLabel id="welcome-label">Welcome</InputLabel>
              <Select labelId="welcome-label" label="Welcome" value={welcomeMessageId} onChange={e=> setWelcomeMessageId(e.target.value)}>
                <MenuItem value=""><em>Nessuno</em></MenuItem>
                {welcomeOptions.map(opt => <MenuItem key={opt.id} value={opt.id}>{opt.label || opt.id}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="guide-label">Guida</InputLabel>
              <Select labelId="guide-label" label="Guida" value={guideId} onChange={e=> setGuideId(e.target.value)}>
                <MenuItem value=""><em>Nessuna</em></MenuItem>
                {guideOptions.map(opt => <MenuItem key={opt.id} value={opt.id}>{opt.label || opt.id}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Context Window" value={contextWindow} onChange={e=>{ const v = e.target.value; if(v===''){ setContextWindow(''); } else { const n = Number(v); if(!isNaN(n) && n>=0 && n<=200){ setContextWindow(n)} } }} fullWidth size="small" placeholder="Es. 8 (numero scambi recenti)" />
            <Box>
              <Typography variant="caption" sx={{ display:'block', mb:0.5 }}>Temperatura: {temperature.toFixed(2)}</Typography>
              <Slider size="small" min={0} max={1.2} step={0.05} value={temperature} onChange={(_,val)=> setTemperature(val as number)} />
            </Box>
            
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
            
            {err && <Alert severity="error" onClose={()=>setErr(null)}>{err}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setDialogOpen(false)}>Annulla</Button>
          <Button disabled={saving} variant="contained" onClick={save}>{saving? 'Salvo…':'Salva'}</Button>
        </DialogActions>
      </Dialog>
      {msg && <Alert severity="success" onClose={()=>setMsg(null)} sx={{ mt:1 }}>{msg}</Alert>}
    </Paper>
  )
}

export default PersonalitiesPanel
