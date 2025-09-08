import React from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField, MenuItem, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { apiService } from '../apiService'

type Props = {
  open: boolean
  onClose: ()=> void
  enabledFormIds: string[]
  conversationId?: string | null
  personalityId?: string | null
  onPostSummary?: (summary: string) => void
  onConversationReady?: (conversationId: string) => void
}

const FormRunnerDialog: React.FC<Props> = ({ open, onClose, enabledFormIds, conversationId, personalityId, onPostSummary, onConversationReady }) => {
  const [forms, setForms] = React.useState<{ id: string; name: string; description?: string }[]>([])
  const [selectedId, setSelectedId] = React.useState<string>('')
  const [items, setItems] = React.useState<any[]>([])
  const [values, setValues] = React.useState<Record<string, any>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(()=>{
    if (!open) return
    (async()=>{
      const r = await apiService.listForms()
      if (r.success && r.data) {
        const source = (r.data.forms || []) as any[]
        const list = (enabledFormIds && enabledFormIds.length) ? source.filter((f:any)=> enabledFormIds.includes(f.id)) : source
        // server already normalizes legacy items; still accept old shape
        setForms(list as any)
        // Prefer last used form from localStorage; fallback to first available
        if (list.length) {
          try {
            const last = localStorage.getItem('last_form_id')
            if (last && list.some(f=> f.id === last)) {
              setSelectedId(last)
            } else if (!selectedId) {
              setSelectedId(list[0].id)
            }
          } catch {
            if (!selectedId) setSelectedId(list[0].id)
          }
        }
      } else {
        setForms([])
      }
    })()
  },[open, enabledFormIds])

  React.useEffect(()=>{
    if (!selectedId) { setItems([]); setValues({}); return }
    (async()=>{
      const r = await apiService.getForm(selectedId)
      if (r.success && r.data) {
        const its = r.data.form.items || []
        // normalize legacy factor -> id
        const norm = its.map((it:any)=> it.factor ? { id: it.factor, label: it.description||it.factor, type: 'scale', min: it.min, max: it.max } : it)
        setItems(norm)
        const initVals: Record<string, any> = {}
        norm.forEach((it:any)=> { initVals[it.id || it.factor] = it.type==='choice_multi' ? [] : (it.type==='boolean' ? false : '') })
        setValues(initVals)
      }
    })()
  },[selectedId])

  const submit = async () => {
    if (!selectedId) return
    setSaving(true)
    // Client-side validation
    const errors: string[] = []
    const rows = items.map((it:any) => {
      const id = it.id || it.factor
      let value = values[id]
      if (it.type === 'scale') {
        value = Number(value || 0)
        if (typeof it.min === 'number' && value < it.min) errors.push(`${id}: valore < min`)
        if (typeof it.max === 'number' && value > it.max) errors.push(`${id}: valore > max`)
      }
      if ((it.type === 'text' || it.type === 'textarea') && it.max_length && typeof value === 'string' && value.length > it.max_length) {
        errors.push(`${id}: testo troppo lungo`)
      }
      if ((it.type === 'choice_single' || it.type === 'choice_multi') && it.options && it.options.length) {
        if (it.type === 'choice_single' && value && !it.options.includes(value) && value !== '__other__') errors.push(`${id}: scelta non valida`)
        if (it.type === 'choice_multi' && Array.isArray(value) && value.some((v:any)=> !it.options.includes(v))) errors.push(`${id}: scelta multipla contiene valori non validi`)
      }
      if (it.type === 'file' && it.accept_url && value) {
        try { new URL(value) } catch { errors.push(`${id}: URL non valida`) }
      }
      return { id, value }
    })
    if (errors.length) {
      alert('Errore di validazione:\n' + errors.join('\n'))
      setSaving(false)
      return
    }
    const payload = { rows }
    const res = await apiService.submitForm(selectedId, payload, { conversationId: conversationId || undefined, personalityId: personalityId || undefined })
    try { localStorage.setItem('last_form_id', selectedId) } catch {}
    if (!res.success && res.error && res.error.includes('validation')) {
      // server returned structured validation; show it
      alert('Server validation failed: ' + (res.error || ''))
    }
    // Build summary message once (used both for UI and DB persistence)
    try {
      const lines: string[] = []
      // Solo i campi richiesti: id, label, esito
      lines.push('Id | Label | Esito')
      lines.push('--- | --- | ---')
      items.forEach(it => {
        const id = it.id || it.factor
        const v = values[id]
        lines.push(`${id} | ${it.label || it.description || ''} | ${Array.isArray(v) ? v.join(',') : String(v ?? '')}`)
      })
      // Sezione conferma richiesta dall'utente
      lines.push('')
      lines.push('I dati sono corretti?')
      lines.push('• Scrivi "sì" per confermare')
      lines.push('• Scrivi "no" per reinviare il form')
      const summary = lines.join('\n')
      // Update UI immediately
      onPostSummary?.(summary)
      // Persist to DB best-effort: ensure conversation exists
      if (res.success) {
        let convId = conversationId || null
        if (!convId) {
          try {
            const formName = (forms.find(f=> f.id === selectedId)?.name) || 'Esiti form'
            const title = `Esiti form: ${formName}`
            const c = await apiService.createConversation(title)
            if (c.success && c.data?.conversation_id) {
              convId = c.data.conversation_id
              onConversationReady?.(convId)
            }
          } catch {/* ignore */}
        }
        if (convId) {
          await apiService.sendMessage(convId, summary, 'assistant')
        }
      }
    } catch (e) {
      // best-effort: non bloccare il flusso del dialog
      console.warn('Failed to post summary message', e)
    }
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Inserisci esiti questionario</DialogTitle>
      <DialogContent sx={{ pt:1 }}>
        <TextField select size="small" fullWidth label="Seleziona form" value={selectedId} onChange={e=> setSelectedId(e.target.value)} sx={{ mb:1 }}>
          {forms.map(f=> <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
        </TextField>
        {items.length>0 ? (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fattore</TableCell>
                  <TableCell>Descrizione</TableCell>
                  <TableCell width={120}>Esito</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it:any) => {
                  const id = it.id || it.factor
                  const val = values[id]
                  return (
                  <TableRow key={id}>
                    <TableCell>{id}</TableCell>
                    <TableCell>{it.label || it.description || ''}</TableCell>
                    <TableCell>
                      {/* Render input depending on type */}
                      {it.type === 'scale' && (
                        <TextField size="small" type="number" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: Number(e.target.value) }))} inputProps={{ min: it.min ?? 0, max: it.max ?? 100, step: it.step ?? 1 }} />
                      )}
                      {it.type === 'text' && (
                        <TextField size="small" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ maxLength: it.max_length || undefined }} placeholder={it.placeholder||''} />
                      )}
                      {it.type === 'textarea' && (
                        <TextField size="small" multiline rows={3} value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ maxLength: it.max_length || undefined }} placeholder={it.placeholder||''} />
                      )}
                      {(it.type === 'choice_single') && (
                        <TextField size="small" select value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))}>
                          {(it.options||[]).map((o:string)=> <MenuItem key={o} value={o}>{o}</MenuItem>)}
                          {it.allow_other && <MenuItem value={'__other__'}>Altro...</MenuItem>}
                        </TextField>
                      )}
                      {(it.type === 'choice_multi') && (
                        <TextField size="small" value={(val||[]).join(',')} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value.split(',').map((s:string)=> s.trim()).filter(Boolean) }))} placeholder={(it.options||[]).join(',')} />
                      )}
                      {it.type === 'boolean' && (
                        <TextField size="small" select value={val ? 'true' : 'false'} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value === 'true' }))}>
                          <MenuItem value={'true'}>{it.true_label||'Sì'}</MenuItem>
                          <MenuItem value={'false'}>{it.false_label||'No'}</MenuItem>
                        </TextField>
                      )}
                      {it.type === 'date' && (
                        <TextField size="small" type="date" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ min: it.min_date || undefined, max: it.max_date || undefined }} />
                      )}
                      {it.type === 'file' && (
                        <TextField size="small" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} placeholder={it.accept_url ? 'https://...' : 'URL o path'} />
                      )}
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          </Paper>
        ) : (
          <>
            {forms.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nessun form disponibile. Crea un form in Admin → Questionari.</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">Nessun form selezionato</Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="contained" onClick={submit} disabled={saving || !selectedId}>Salva</Button>
      </DialogActions>
    </Dialog>
  )
}

export default FormRunnerDialog
