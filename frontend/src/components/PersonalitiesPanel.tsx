import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Paper, Typography, Button, TextField, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, LinearProgress, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import { authFetch, BACKEND } from '../utils/authFetch'
import { PersonalityEntry, SystemPromptEntry } from '../types/admin'

interface PersonalitiesResponse { default_id: string | null; personalities: PersonalityEntry[] }

const PersonalitiesPanel: React.FC = () => {
  const [items, setItems] = useState<PersonalitiesResponse>({ default_id: null, personalities: [] })
  const [systemPrompts, setSystemPrompts] = useState<SystemPromptEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PersonalityEntry | null>(null)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [systemPromptId, setSystemPromptId] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

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

  const openNew = () => { setEditing(null); setName(''); setProvider('openai'); setModel('gpt-4o-mini'); setSystemPromptId(''); setDialogOpen(true) }
  const openEdit = (p: PersonalityEntry) => { setEditing(p); setName(p.name); setProvider(p.provider); setModel(p.model); setSystemPromptId(p.system_prompt_id); setDialogOpen(true) }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true); setErr(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/personalities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing?.id, name: name.trim(), provider, model, system_prompt_id: systemPromptId })
      })
      if (res.ok) { setDialogOpen(false); load(); setMsg('Salvato') } else { const d=await res.json(); setErr(d.detail || 'Errore salvataggio') }
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
        {items.personalities.map(p => (
          <Paper key={p.id} variant="outlined" sx={{ p:1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" sx={{ flex:1 }}>{p.name}</Typography>
              {items.default_id === p.id && <Chip size="small" color="success" label="default" />}
              <Tooltip title="Modifica"><IconButton size="small" onClick={()=>openEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Imposta default"><span><IconButton size="small" disabled={items.default_id===p.id} onClick={()=>setDefault(p.id)}><CheckCircleIcon fontSize="small" /></IconButton></span></Tooltip>
              <Tooltip title="Elimina"><IconButton size="small" onClick={()=>remove(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Typography variant="caption" color="text.secondary">{p.provider} · {p.model}</Typography>
          </Paper>
        ))}
        {!loading && items.personalities.length===0 && <Typography variant="body2" color="text.secondary">Nessuna personalità.</Typography>}
      </Stack>
      <Dialog open={dialogOpen} onClose={()=>setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing? 'Modifica personalità':'Nuova personalità'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt:1 }}>
            <TextField label="Nome" value={name} onChange={e=>setName(e.target.value)} fullWidth size="small" />
            <TextField label="Provider" value={provider} onChange={e=>setProvider(e.target.value)} fullWidth size="small" />
            <TextField label="Modello" value={model} onChange={e=>setModel(e.target.value)} fullWidth size="small" />
            <FormControl size="small" fullWidth>
              <InputLabel id="sp-label">System Prompt</InputLabel>
              <Select labelId="sp-label" label="System Prompt" value={systemPromptId} onChange={e=>setSystemPromptId(e.target.value)}>
                {systemPrompts.map(sp => <MenuItem key={sp.id} value={sp.id}>{sp.name}</MenuItem>)}
              </Select>
            </FormControl>
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
