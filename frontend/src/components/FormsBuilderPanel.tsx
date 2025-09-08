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
  // raw options string used while editing (not persisted as-is)
  optionsRaw?: string;
  type?: string; // 'scale'|'text'|'textarea'|'choice_single'|'choice_multi'|'boolean'|'date'|'file'
  // numeric for scale
  min?: number;
  max?: number;
  step?: number;
  // for choices
  options?: string[];
  allow_other?: boolean;
  // text
  placeholder?: string;
  max_length?: number;
  pattern?: string;
  // boolean labels
  true_label?: string;
  false_label?: string;
  // date
  min_date?: string;
  max_date?: string;
  // file
  accept_url?: boolean;
  // grouping for UI: optional group title for grouping multiple items together
  group?: string;
  // series header (for scale series): optional label used when rendering a series of scales
  series?: string;
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
    return { id: it.factor, description: it.description || it.factor, type: 'scale', min: it.min, max: it.max, invertita: it.invertita }
          }
          // assume already in new schema; keep a raw options string for editing
          const copy = { ...it }
          if (Array.isArray(it.options)) copy.optionsRaw = (it.options || []).join(', ')
          return copy
        })
      }))
      setForms(mapped)
    } else {
      setErr(r.error || 'Errore caricamento forms')
    }
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
    // Ensure items use canonical `id` field. If id is missing, derive from label (slugify).
    const slugify = (s: string) => s ? s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') : ''
    const cleaned = items.map((it, idx) => {
      // Use description as the canonical question text; fall back to label for compatibility
      const label = it.description || it.label || ''
      const base = slugify(label) || `item-${idx+1}`
      // Avoid forcing uniqueness here; server or consumer can handle collisions if needed
      const id = (it as any).id || (it as any).factor || base
      // Parse optionsRaw (editable) into options array; accept comma or semicolon separators
      let optionsArr: string[] | undefined = undefined
      const raw = (it as any).optionsRaw
      if (typeof raw === 'string' && raw.trim().length) {
        optionsArr = raw.split(/[;,]/).map((s:string)=> s.trim()).filter(Boolean)
      } else if (Array.isArray(it.options)) {
        optionsArr = it.options
      }
      return {
        id,
        label,
        description: it.description || it.label,
        type: it.type || 'scale',
        min: it.min,
        max: it.max,
        step: it.step,
        options: optionsArr,
        group: (it as any).group,
        series: (it as any).series
      }
    })
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
                <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Nome</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Descrizione</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Voci</TableCell>
                <TableCell align="right">Azioni</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {forms.map(f => (
                <TableRow key={f.id}>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{f.name}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{f.description}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{f.items?.length || 0}</TableCell>
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
                    <TableCell sx={{ width: '60%', whiteSpace: 'normal', wordBreak: 'break-word' }}>Domanda</TableCell>
                    <TableCell width={160} sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Tipo</TableCell>
                    <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>Config / Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((it,idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'normal', wordBreak: 'break-word' }}><TextField size="small" fullWidth value={it.description || it.label || ''} onChange={e=> updateItem(idx,{ description: e.target.value })} /></TableCell>
                      <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
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
                      <TableCell>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <TextField size="small" label="Group title" value={it.group||''} onChange={e=> updateItem(idx,{ group: e.target.value })} sx={{ width:200 }} />
                            <TextField size="small" label="Series header" value={it.series||''} onChange={e=> updateItem(idx,{ series: e.target.value })} sx={{ width:180 }} />
                          </Stack>
                          {/* Type-specific small editors */}
                          {it.type === 'scale' && (
                            <Stack direction="row" spacing={1}>
                              <TextField size="small" label="min" type="number" value={it.min ?? 1} onChange={e=> updateItem(idx,{ min: parseInt(e.target.value||'1') })} sx={{ width:80 }} />
                              <TextField size="small" label="max" type="number" value={it.max ?? 9} onChange={e=> updateItem(idx,{ max: parseInt(e.target.value||'9') })} sx={{ width:80 }} />
                            </Stack>
                          )}
                          {it.type === 'text' && (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <TextField size="small" label="placeholder" value={it.placeholder||''} onChange={e=> updateItem(idx,{ placeholder: e.target.value })} sx={{ width:200 }} />
                              <TextField size="small" label="max len" type="number" value={it.max_length||''} onChange={e=> updateItem(idx,{ max_length: e.target.value ? parseInt(e.target.value) : undefined })} sx={{ width:120 }} />
                            </Stack>
                          )}
                          {(it.type === 'choice_single' || it.type === 'choice_multi') && (
                            <Stack direction="row" spacing={1} alignItems="center">
                              {/* Use a raw string while editing so commas are not interpreted by the input component */}
                              <TextField size="small" label="Opzioni (comma)" value={(it as any).optionsRaw || (it.options||[]).join(', ')} onChange={e=> updateItem(idx,{ optionsRaw: e.target.value })} sx={{ width:260 }} />
                              <TextField size="small" select label="Altro" value={it.allow_other ? 'yes' : 'no'} onChange={e=> updateItem(idx,{ allow_other: e.target.value === 'yes' })} sx={{ width:100 }}>
                                <MenuItem value={'no'}>No</MenuItem>
                                <MenuItem value={'yes'}>Sì (campo altro)</MenuItem>
                              </TextField>
                            </Stack>
                          )}
                          {it.type === 'boolean' && (
                            <Stack direction="row" spacing={1}>
                              <TextField size="small" label="True label" value={it.true_label||'Sì'} onChange={e=> updateItem(idx,{ true_label: e.target.value })} sx={{ width:120 }} />
                              <TextField size="small" label="False label" value={it.false_label||'No'} onChange={e=> updateItem(idx,{ false_label: e.target.value })} sx={{ width:120 }} />
                            </Stack>
                          )}
                          {it.type === 'date' && (
                            <Stack direction="row" spacing={1}>
                              <TextField size="small" label="min date" placeholder="YYYY-MM-DD" value={it.min_date||''} onChange={e=> updateItem(idx,{ min_date: e.target.value })} sx={{ width:140 }} />
                              <TextField size="small" label="max date" placeholder="YYYY-MM-DD" value={it.max_date||''} onChange={e=> updateItem(idx,{ max_date: e.target.value })} sx={{ width:140 }} />
                            </Stack>
                          )}
                          {it.type === 'file' && (
                            <Stack direction="row" spacing={1}>
                              <TextField size="small" select label="Accept" value={it.accept_url ? 'url' : 'file'} onChange={e=> updateItem(idx,{ accept_url: e.target.value === 'url' })} sx={{ width:140 }}>
                                <MenuItem value={'file'}>Upload file</MenuItem>
                                <MenuItem value={'url'}>Solo URL</MenuItem>
                              </TextField>
                            </Stack>
                          )}
                        </Stack>
                        <Stack direction="row" justifyContent="flex-end">
                          {it.type !== 'text' && (
                            <IconButton size="small" color="error" onClick={()=> removeItem(idx)}><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length===0 && (
                    <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">Aggiungi voci al form</Typography></TableCell></TableRow>
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
