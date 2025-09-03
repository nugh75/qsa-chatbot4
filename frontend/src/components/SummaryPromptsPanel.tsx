import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Paper, Typography, Button, TextField, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, LinearProgress, Alert, FormControlLabel, Switch, FormControl, InputLabel, Select, MenuItem, Box } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import { authFetch, BACKEND } from '../utils/authFetch'
import { SummaryPromptEntry, AdminConfig } from '../types/admin'
import { apiService } from '../apiService'

interface SummaryPromptsResponse { active_id: string | null; prompts: SummaryPromptEntry[] }

interface Props { config?: AdminConfig | null }

const SummaryPromptsPanel: React.FC<Props> = ({ config }) => {
  const [items, setItems] = useState<SummaryPromptsResponse>({ active_id: null, prompts: [] })
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SummaryPromptEntry | null>(null)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Summary settings state
  const [summaryProvider, setSummaryProvider] = useState<string>('')
  const [summaryEnabled, setSummaryEnabled] = useState<boolean>(true)
  const [summaryModel, setSummaryModel] = useState<string>('')
  const [savingSettings, setSavingSettings] = useState<boolean>(false)
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false)
  // New advanced settings
  const [minMessages, setMinMessages] = useState<number>(4)
  const [minChars, setMinChars] = useState<number>(200)
  const [autoOnExport, setAutoOnExport] = useState<boolean>(true)
  const [testingSummary, setTestingSummary] = useState<boolean>(false)
  const [testResult, setTestResult] = useState<string>('')
  // Available models state
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState<boolean>(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-prompts`)
      if (res.ok) {
        const data = await res.json()
        setItems({ active_id: data.active_id, prompts: data.prompts || [] })
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Load summary settings
  const loadSummarySettings = useCallback(async () => {
    try {
      const res = await apiService.getSummarySettings()
      if (res.success) {
        setSummaryProvider(res.data!.settings.provider)
        setSummaryEnabled(res.data!.settings.enabled)
        setSummaryModel(res.data!.settings.model || '')
        if (typeof res.data!.settings.min_messages === 'number') setMinMessages(res.data!.settings.min_messages as number)
        if (typeof res.data!.settings.min_chars === 'number') setMinChars(res.data!.settings.min_chars as number)
        if (typeof res.data!.settings.auto_on_export === 'boolean') setAutoOnExport(res.data!.settings.auto_on_export as boolean)
      }
    } finally { setSettingsLoaded(true) }
  }, [])

  useEffect(() => { loadSummarySettings() }, [loadSummarySettings])

  // Load available models when provider changes
  const loadAvailableModels = useCallback(async (provider: string) => {
    if (!provider) {
      setAvailableModels([])
      return
    }
    setLoadingModels(true)
    try {
      const res = await apiService.getAvailableModels(provider)
      if (res.success && res.data) {
        setAvailableModels(res.data.models || [])
      } else {
        setAvailableModels([])
      }
    } catch (error) {
      console.error('Error loading available models:', error)
      setAvailableModels([])
    } finally {
      setLoadingModels(false)
    }
  }, [])

  useEffect(() => {
    if (summaryProvider) {
      loadAvailableModels(summaryProvider)
    } else {
      setAvailableModels([])
    }
  }, [summaryProvider, loadAvailableModels])

  const saveSummarySettings = async () => {
    setSavingSettings(true)
    const payload = { provider: summaryProvider, enabled: summaryEnabled, model: summaryModel || null, min_messages: minMessages, min_chars: minChars, auto_on_export: autoOnExport }
    const res = await apiService.updateSummarySettings(payload)
    if (res.success) {
      setMsg('Impostazioni summary aggiornate')
    } else {
      setErr(res.error || 'Errore salvataggio impostazioni summary')
    }
    setSavingSettings(false)
  }

  const openNew = () => { setEditing(null); setName(''); setText(''); setDialogOpen(true) }
  const openEdit = (p: SummaryPromptEntry) => { setEditing(p); setName(p.name); setText(p.text); setDialogOpen(true) }

  const save = async () => {
    if (!name.trim() || !text.trim()) {
      return
    }
    setSaving(true); setErr(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing?.id, name: name.trim(), text, set_active: false })
      })
      if (res.ok) {
        setDialogOpen(false); load(); setMsg('Salvato')
      } else {
        const d = await res.json(); setErr(d.detail || 'Errore salvataggio')
      }
    } catch { setErr('Errore rete') } finally { setSaving(false) }
  }

  const activate = async (id: string) => {
    await authFetch(`${BACKEND}/api/admin/summary-prompts/${encodeURIComponent(id)}/activate`, { method: 'POST' })
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare il prompt?')) {
      return
    }
    await authFetch(`${BACKEND}/api/admin/summary-prompts/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Summary Prompts</Typography>
        <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
        <Button size="small" startIcon={<AddIcon />} onClick={openNew}>Nuovo</Button>
      </Stack>
      {/* Summary settings controls */}
      <Box sx={{ mt:2, mb:2 }}>
        <Typography variant="subtitle2" gutterBottom>Impostazioni generazione summary</Typography>
        {!settingsLoaded && <LinearProgress sx={{ mb:1 }} />}
        <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'center' }}>
          <FormControl size="small" sx={{ minWidth:160 }} disabled={!config}>
            <InputLabel id="summary-provider-label">Provider</InputLabel>
            <Select labelId="summary-provider-label" label="Provider" value={summaryProvider} onChange={e=> setSummaryProvider(e.target.value)}>
              {config && Object.entries(config.ai_providers).filter(([k,v]) => v.enabled && k !== 'local').map(([k]) => (
                <MenuItem key={k} value={k}>{k}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth:180 }} disabled={!summaryProvider}>
            <TextFieldSelectModel
              provider={summaryProvider}
              model={summaryModel}
              onChange={setSummaryModel}
              availableModels={availableModels}
              loading={loadingModels}
            />
          </FormControl>
          <FormControlLabel control={<Switch size="small" checked={summaryEnabled} onChange={e=> setSummaryEnabled(e.target.checked)} />} label={summaryEnabled? 'Abilitato':'Disabilitato'} />
          <TextField size="small" type="number" label="Min messaggi" value={minMessages} onChange={e=> setMinMessages(Number(e.target.value)||0)} sx={{ width:130 }} />
          <TextField size="small" type="number" label="Min caratteri" value={minChars} onChange={e=> setMinChars(Number(e.target.value)||0)} sx={{ width:140 }} />
          <FormControlLabel control={<Switch size="small" checked={autoOnExport} onChange={e=> setAutoOnExport(e.target.checked)} />} label="Auto export" />
          <Button size="small" variant="contained" disabled={savingSettings || !summaryProvider} onClick={saveSummarySettings}>{savingSettings? 'Salvo…':'Salva impostazioni'}</Button>
          <Button size="small" variant="outlined" disabled={testingSummary || !summaryProvider} onClick={async()=>{
            setTestingSummary(true); setTestResult('')
            const r = await apiService.testSummary({ provider: summaryProvider, model: summaryModel || undefined })
            if (r.success && r.data) setTestResult(r.data.summary)
            else setTestResult(r.error || 'Errore test summary')
            setTestingSummary(false)
          }}>{testingSummary? 'Test…':'Test summary'}</Button>
        </Stack>
      </Box>
      {loading && <LinearProgress sx={{ my: 1 }} />}
      <Stack spacing={1} sx={{ mt: 1 }}>
        {items.prompts.map(p => (
          <Paper key={p.id} variant="outlined" sx={{ p: 1, position: 'relative' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{p.name}</Typography>
              {items.active_id === p.id && <Chip size="small" color="success" label="attivo" />}
              <Tooltip title="Modifica"><IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Attiva"><span><IconButton size="small" disabled={items.active_id===p.id} onClick={() => activate(p.id)}><CheckCircleIcon fontSize="small" /></IconButton></span></Tooltip>
              <Tooltip title="Elimina"><IconButton size="small" onClick={() => remove(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{p.text.slice(0,180)}{p.text.length>180?'…':''}</Typography>
          </Paper>
        ))}
        {!loading && items.prompts.length===0 && <Typography variant="body2" color="text.secondary">Nessun prompt.</Typography>}
      </Stack>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing? 'Modifica prompt':'Nuovo prompt'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nome" value={name} onChange={e=>setName(e.target.value)} fullWidth size="small" />
            <TextField label="Testo" value={text} onChange={e=>setText(e.target.value)} multiline minRows={8} fullWidth />
            {err && <Alert severity="error" onClose={()=>setErr(null)}>{err}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setDialogOpen(false)}>Annulla</Button>
          <Button disabled={saving} variant="contained" onClick={save}>{saving? 'Salvo…':'Salva'}</Button>
        </DialogActions>
      </Dialog>
      {msg && <Alert severity="success" onClose={()=>setMsg(null)} sx={{ mt:1 }}>{msg}</Alert>}
      {testResult && <Alert severity="info" sx={{ mt:1, whiteSpace:'pre-wrap' }} onClose={()=>setTestResult('')}>{testResult.slice(0,1500)}</Alert>}
    </Paper>
  )
}

export default SummaryPromptsPanel

// Helper component for model select (fallback to simple text field if no list)
interface ModelSelectProps { 
  provider: string; 
  model: string; 
  onChange: (m:string)=>void; 
  availableModels: string[];
  loading?: boolean;
}
const TextFieldSelectModel: React.FC<ModelSelectProps> = ({ provider, model, onChange, availableModels, loading }) => {
  if (loading) {
    return (
      <TextField size="small" label="Modello" value="" disabled placeholder="Caricamento..." />
    )
  }
  if (!availableModels.length) {
    return (
      <TextField size="small" label="Modello" value={model} onChange={e=> onChange(e.target.value)} placeholder="nome modello" />
    )
  }
  return (
    <FormControl size="small" fullWidth>
      <InputLabel id="summary-model-label">Modello</InputLabel>
      <Select labelId="summary-model-label" label="Modello" value={model} onChange={e=> onChange(e.target.value)}>
        {availableModels.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </Select>
    </FormControl>
  )
}
