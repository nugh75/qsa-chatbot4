import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Paper, Typography, Button, TextField, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, LinearProgress, Alert } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import { authFetch, BACKEND } from '../utils/authFetch'
import { SummaryPromptEntry } from '../types/admin'

interface SummaryPromptsResponse { active_id: string | null; prompts: SummaryPromptEntry[] }

const SummaryPromptsPanel: React.FC = () => {
  const [items, setItems] = useState<SummaryPromptsResponse>({ active_id: null, prompts: [] })
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SummaryPromptEntry | null>(null)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

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

  const openNew = () => { setEditing(null); setName(''); setText(''); setDialogOpen(true) }
  const openEdit = (p: SummaryPromptEntry) => { setEditing(p); setName(p.name); setText(p.text); setDialogOpen(true) }

  const save = async () => {
    if (!name.trim() || !text.trim()) return
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
    if (!confirm('Eliminare il prompt?')) return
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
    </Paper>
  )
}

export default SummaryPromptsPanel
