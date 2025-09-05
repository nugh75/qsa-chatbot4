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
  const [items, setItems] = React.useState<{ factor: string; description: string; min?: number; max?: number }[]>([])
  const [values, setValues] = React.useState<Record<string, number>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(()=>{
    if (!open) return
    (async()=>{
      const r = await apiService.listForms()
      if (r.success && r.data) {
        const source = (r.data.forms || []) as any[]
        const list = (enabledFormIds && enabledFormIds.length) ? source.filter((f:any)=> enabledFormIds.includes(f.id)) : source
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
        setItems(its)
        const initVals: Record<string, number> = {}
        its.forEach((it:any)=> { initVals[it.factor] = 0 })
        setValues(initVals)
      }
    })()
  },[selectedId])

  const submit = async () => {
    if (!selectedId) return
    setSaving(true)
    const payload = { rows: items.map(it=> ({ factor: it.factor, description: it.description, value: Number(values[it.factor]||0) })) }
    const res = await apiService.submitForm(selectedId, payload, { conversationId: conversationId || undefined, personalityId: personalityId || undefined })
    try { localStorage.setItem('last_form_id', selectedId) } catch {}
    // Build summary message once (used both for UI and DB persistence)
    try {
      const lines: string[] = []
      // Solo i campi richiesti: nome, descrizione, esito
      lines.push('Nome | Descrizione | Esito')
      lines.push('--- | --- | ---')
      items.forEach(it => {
        const v = values[it.factor]
        lines.push(`${it.factor} | ${it.description ?? ''} | ${v ?? ''}`)
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
                {items.map(it => (
                  <TableRow key={it.factor}>
                    <TableCell>{it.factor}</TableCell>
                    <TableCell>{it.description}</TableCell>
                    <TableCell>
                      <TextField size="small" type="number" value={values[it.factor] ?? ''} onChange={e=> setValues(v=> ({ ...v, [it.factor]: Number(e.target.value||0) }))} inputProps={{ min: it.min ?? 0, max: it.max ?? 100 }} />
                    </TableCell>
                  </TableRow>
                ))}
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
