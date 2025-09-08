import React from 'react'
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, MenuItem } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import { apiService } from '../apiService'

// New minimal form item schema used by backend. Keep backward-compatible mapping from legacy `factor`.
type FormItem = {
  // canonical id (was `factor` in legacy forms)
  id?: string;
  // human label
  label?: string;
  description?: string;
  type?: string; // 'scale'|'text'|'textarea'|'choice_single'|'choice_multi'|'boolean'|'date'|'file'
  // numeric for scale
  min?: number;
  max?: number;
  step?: number;
  // for choices
  options?: string[];
  // legacy flag kept for convenience
  invertita?: boolean;
}
type FormDef = { id: string; name: string; description?: string; items: FormItem[] }

const FormsBuilderPanel: React.FC = () => {
  const [forms, setForms] = React.useState<FormDef[]>([])
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string|null>(null)
  const [dlgOpen, setDlgOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<FormDef|null>(null)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [items, setItems] = React.useState<FormItem[]>([])
  const [saving, setSaving] = React.useState(false)

  const load = async () => {
    setLoading(true); setErr(null)
    const r = await apiService.adminListForms()
    if (r.success && r.data) {
      const list = (r.data.forms || []) as any[]
      // Normalize legacy items (factor -> id/type:scale)
      const mapped = list.map((f:any)=> ({
        id: f.id,
        name: f.name,
        description: f.description,
        items: (f.items || []).map((it:any) => {
          if (it.factor) {
            return { id: it.factor, label: it.description || it.factor, type: 'scale', min: it.min, max: it.max, invertita: it.invertita }
          }
          // assume already in new schema
          return it
        })
      }))
      setForms(mapped)
    } else setErr(r.error || 'Errore caricamento forms')
    setLoading(false)
  }
  React.useEffect(()=>{ load() },[])

  const openNew = () => { setEditing(null); setName(''); setDescription(''); setItems([]); setDlgOpen(true) }
  const openEdit = (f: FormDef) => { setEditing(f); setName(f.name); setDescription(f.description||''); setItems(f.items||[]); setDlgOpen(true) }
  const addRow = () => setItems(prev => [...prev, { id:'', label:'', type:'scale', min:1, max:9, step:1, options: [] }])
  const updateItem = (idx:number, patch: Partial<FormItem>) => {
    setItems(prev => prev.map((it,i)=> i===idx ? { ...it, ...patch } : it))
  }
  const removeItem = (idx:number) => setItems(prev => prev.filter((_,i)=> i!==idx))
  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    // Ensure items use canonical `id` field
    const cleaned = items.map(it => ({
      id: it.id || (it as any).factor || '',
      label: it.label || it.description || '',
      description: it.description,
      type: it.type || 'scale',
      min: it.min,
      max: it.max,
      step: it.step,
      options: it.options
    }))
    const payload = { id: editing?.id, name: name.trim(), description: description.trim() || undefined, items: cleaned }
    const r = await apiService.adminSaveForm(payload)
    if (r.success && r.data) { setDlgOpen(false); load() } else setErr(r.error || 'Errore salvataggio form')
    setSaving(false)
  }
  const onDelete = async (id: string) => {
    if (!confirm('Eliminare il form?')) return
    const r = await apiService.adminDeleteForm(id)
    if (r.success) load()
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
          <Typography variant="h6">Questionari (Forms)</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={openNew}>Nuovo</Button>
          <IconButton size="small" onClick={load}><RefreshIcon fontSize="small" /></IconButton>
        </Stack>
        {loading && <LinearProgress sx={{ mb:1 }} />}
        {err && <Typography color="error" variant="body2" sx={{ mb:1 }}>{err}</Typography>}
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Descrizione</TableCell>
                <TableCell>Voci</TableCell>
                <TableCell align="right">Azioni</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {forms.map(f => (
                <TableRow key={f.id}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell>{f.description}</TableCell>
                  <TableCell>{f.items?.length || 0}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={()=> openEdit(f)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={()=> onDelete(f.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {forms.length===0 && (
                <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Nessun form definito</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Dialog open={dlgOpen} onClose={()=> setDlgOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>{editing? 'Modifica form' : 'Nuovo form'}</DialogTitle>
          <DialogContent sx={{ pt:1 }}>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1} sx={{ mb:1 }}>
              <TextField label="Nome" value={name} onChange={e=> setName(e.target.value)} fullWidth size="small" />
              <TextField label="Descrizione" value={description} onChange={e=> setDescription(e.target.value)} fullWidth size="small" />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb:1 }}>
              <Typography variant="subtitle2">Voci (id, label, tipo)</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addRow}>Aggiungi voce</Button>
            </Stack>
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={140}>Id</TableCell>
                    <TableCell>Label / Descrizione</TableCell>
                    <TableCell width={160}>Tipo</TableCell>
                    <TableCell width={100}>Min</TableCell>
                    <TableCell width={100}>Max</TableCell>
                    <TableCell align="right">Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it,idx) => (
                    <TableRow key={idx}>
                      <TableCell><TextField size="small" value={it.id || ''} onChange={e=> updateItem(idx,{ id: e.target.value })} /></TableCell>
                      <TableCell><TextField size="small" fullWidth value={it.label || it.description || ''} onChange={e=> updateItem(idx,{ label: e.target.value, description: e.target.value })} /></TableCell>
                      <TableCell>
                        <TextField size="small" select value={it.type || 'scale'} onChange={e=> updateItem(idx,{ type: e.target.value })}>
                          <MenuItem value={'scale'}>Scala</MenuItem>
                          <MenuItem value={'text'}>Testo (breve)</MenuItem>
                          <MenuItem value={'textarea'}>Testo (lunga)</MenuItem>
                          <MenuItem value={'choice_single'}>Scelta singola</MenuItem>
                          <MenuItem value={'choice_multi'}>Scelta multipla</MenuItem>
                          <MenuItem value={'boolean'}>Sì/No</MenuItem>
                          <MenuItem value={'date'}>Data</MenuItem>
                          <MenuItem value={'file'}>File (URL)</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell><TextField size="small" type="number" value={it.min ?? 1} onChange={e=> updateItem(idx,{ min: parseInt(e.target.value||'1') })} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={it.max ?? 9} onChange={e=> updateItem(idx,{ max: parseInt(e.target.value||'9') })} /></TableCell>
                      <TableCell align="right"><IconButton size="small" color="error" onClick={()=> removeItem(idx)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                  {items.length===0 && (
                    <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Aggiungi voci al form</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          </DialogContent>
          <DialogActions>
            <Button onClick={()=> setDlgOpen(false)}>Annulla</Button>
            <Button variant="contained" onClick={save} disabled={saving}>{saving? 'Salvo…':'Salva'}</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export default FormsBuilderPanel
