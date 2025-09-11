import React from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, TextField, MenuItem, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Box, RadioGroup, FormControl, FormControlLabel, Radio, Checkbox, FormGroup } from '@mui/material'
import { apiService } from '../apiService'

type Props = {
  open: boolean
  onClose: ()=> void
  enabledFormIds: string[]
  conversationId?: string | null
  personalityId?: string | null
  onPostSummary?: (summary: string) => void
  onPostStructured?: (payload: any) => void
  onConversationReady?: (conversationId: string) => void
}

const FormRunnerDialog: React.FC<Props> = ({ open, onClose, enabledFormIds, conversationId, personalityId, onPostSummary, onPostStructured, onConversationReady }) => {
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
        if (it.type === 'choice_single') {
          // allow free-text single choice when allow_other is enabled
          if (value && !it.options.includes(value) && !(it.allow_other && typeof value === 'string' && value.length>0)) errors.push(`${id}: scelta non valida`)
        }
        if (it.type === 'choice_multi') {
          // if allow_other is enabled, accept values not in options (they come from the 'Altro' input)
          if (!it.allow_other && Array.isArray(value) && value.some((v:any)=> !it.options.includes(v))) errors.push(`${id}: scelta multipla contiene valori non validi`)
        }
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
      // Build structured summary rows with labels and group/series metadata
  const structured = { rows: items.map((it:any) => ({ id: it.id || it.factor, question: it.description || it.label || '', value: values[it.id || it.factor], group: it.group || '', series: it.series || '' })) }
      // Provide a backwards compatible textual summary for simple clients
      // Use 'Domanda | Risposta' headers (question/answer) and render booleans as 'Sì'/'No'
      const lines: string[] = []
      lines.push('Domanda | Risposta')
      lines.push('--- | ---')
      structured.rows.forEach((r:any) => {
        let display = ''
        if (typeof r.value === 'boolean') display = r.value ? 'Sì' : 'No'
        else if (Array.isArray(r.value)) display = r.value.join(', ')
        else display = String(r.value ?? '')
        lines.push(`${r.question || r.label || r.id} | ${display}`)
      })
      lines.push('')
      lines.push('I dati sono corretti?')
      lines.push('• Scrivi "sì" per confermare')
      lines.push('• Scrivi "no" per reinviare il form')
      const summary = lines.join('\n')
      // Update UI immediately: send both structured payload and textual summary via callbacks
      onPostSummary?.(summary)
      // If the caller expects structured form payload in the message object, provide it via onPostSummary as well by returning the structured payload through a side-channel: here we use a custom event via window (simple) or prefer to let App.tsx handle messages added locally.
      // Persist to DB best-effort: ensure conversation exists, then send textual summary to conversation (keep existing behavior)
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
          // Send textual summary to DB for compatibility
          await apiService.sendMessage(convId, summary, 'assistant')
          // Notify caller with structured payload so UI can render rich result
          try { if (typeof onPostStructured === 'function') { onPostStructured(structured) } } catch (e) { /* ignore */ }
        }
      }
    } catch (e) {
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
          <Paper variant="outlined" sx={{ p: 2 }}>
            {/* Group items by `group` field (fallback to empty string) */}
            {(() => {
              const groups: Record<string, any[]> = {}
              items.forEach((it:any) => {
                const g = it.group || ''
                groups[g] = groups[g] || []
                groups[g].push(it)
              })
              return Object.keys(groups).map((g, gi) => {
                const groupItems = groups[g]
                const onlyScales = groupItems.every((x:any) => x.type === 'scale')
                return (
                  <Box key={gi} sx={{ mb: 2 }}>
                    {g ? <Typography variant="subtitle1" sx={{ mb:1 }}>{g}</Typography> : null}
                    {onlyScales && groupItems.length > 1 ? (
                      // Render scales stacked vertically (one per row)
                      <Stack direction="column" spacing={1} sx={{ width: '100%' }}>
                        {groupItems.map((it:any) => {
                          const id = it.id || it.factor
                          const val = values[id]
                          const label = it.series || it.label || id
                          return (
                            <Box key={id} sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                              <Typography variant="caption" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{label}</Typography>
                              <TextField fullWidth size="small" type="number" value={val ?? ''}
                                onChange={e=> setValues(v=> ({ ...v, [id]: Number(e.target.value) }))}
                                inputProps={{ min: it.min ?? 0, max: it.max ?? 100, step: it.step ?? 1 }} sx={{ mt:0.5 }} />
                            </Box>
                          )
                        })}
                      </Stack>
                    ) : (
                      // Render individual items stacked vertically without table
                      <Stack direction="column" spacing={1.5} sx={{ width: '100%' }}>
                        {groupItems.map((it:any) => {
                          const id = it.id || it.factor
                          const val = values[id]
                          const question = it.description || it.label || id
                          return (
                            <Box key={id} sx={{ width: '100%' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-word' }}>{question}</Typography>
                              {/* Input area placed below description and spanning full width */}
                              {it.type === 'scale' && (
                                <TextField fullWidth size="small" type="number" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: Number(e.target.value) }))} inputProps={{ min: it.min ?? 0, max: it.max ?? 100, step: it.step ?? 1 }} sx={{ mt:1 }} />
                              )}
                              {it.type === 'text' && (
                                <TextField fullWidth size="small" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ maxLength: it.max_length || undefined }} placeholder={it.placeholder||''} sx={{ mt:1 }} />
                              )}
                              {it.type === 'textarea' && (
                                <TextField fullWidth size="small" multiline rows={4} value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ maxLength: it.max_length || undefined }} placeholder={it.placeholder||''} sx={{ mt:1 }} />
                              )}
                              {(it.type === 'choice_single') && (
                                <FormControl component="fieldset" sx={{ mt:1 }}>
                                  <RadioGroup value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))}>
                                    {(it.options||[]).map((o:string)=> (
                                      <FormControlLabel key={o} value={o} control={<Radio />} label={o} sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { whiteSpace: 'normal', wordBreak: 'break-word' } }} />
                                    ))}
                                    {it.allow_other && (
                                      <FormControlLabel value={values[`${id}__other`] ?? '__other__'} control={<Radio />} sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { width: '100%' } }} label={
                                        <TextField fullWidth size="small" placeholder="Altro..." value={values[`${id}__other`] ?? ''} onChange={e=> setValues(v=> ({ ...v, [`${id}__other`]: e.target.value, [id]: e.target.value }))} onFocus={()=> setValues(v=> ({ ...v, [id]: values[`${id}__other`] ?? '' }))} />
                                      } />
                                    )}
                                  </RadioGroup>
                                </FormControl>
                              )}
                              {(it.type === 'choice_multi') && (
                                <FormControl component="fieldset" sx={{ mt:1 }}>
                                  <FormGroup sx={{ flexDirection: 'column' }}>
                                    {(it.options||[]).map((o:string)=> (
                                      <FormControlLabel key={o} control={<Checkbox checked={Array.isArray(val) ? val.includes(o) : false} onChange={e=> {
                                        const checked = e.target.checked
                                        setValues(v=> {
                                          const cur = Array.isArray(v[id]) ? [...v[id]] : []
                                          if (checked) {
                                            if (!cur.includes(o)) cur.push(o)
                                          } else {
                                            const idx = cur.indexOf(o)
                                            if (idx>=0) cur.splice(idx,1)
                                          }
                                          return { ...v, [id]: cur }
                                        })
                                      }} />} label={o} sx={{ alignItems: 'flex-start', '& .MuiFormControlLabel-label': { whiteSpace: 'normal', wordBreak: 'break-word' } }} />
                                    ))}
                                    {it.allow_other && (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                        <TextField fullWidth size="small" placeholder="Altro..." value={values[`${id}__other`] ?? ''} onChange={e=> setValues(v=> ({ ...v, [`${id}__other`]: e.target.value }))} onBlur={e=> {
                                          const txt = e.target.value.trim()
                                          if (!txt) return
                                          setValues(v=> {
                                            const cur = Array.isArray(v[id]) ? [...v[id]] : []
                                            if (!cur.includes(txt)) cur.push(txt)
                                            return { ...v, [id]: cur }
                                          })
                                        }} />
                                      </Box>
                                    )}
                                  </FormGroup>
                                </FormControl>
                              )}
                              {it.type === 'boolean' && (
                                <TextField fullWidth size="small" select value={val ? 'true' : 'false'} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value === 'true' }))} sx={{ mt:1 }}>
                                  <MenuItem value={'true'}>{it.true_label||'Sì'}</MenuItem>
                                  <MenuItem value={'false'}>{it.false_label||'No'}</MenuItem>
                                </TextField>
                              )}
                              {it.type === 'date' && (
                                <TextField fullWidth size="small" type="date" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} inputProps={{ min: it.min_date || undefined, max: it.max_date || undefined }} sx={{ mt:1 }} />
                              )}
                              {it.type === 'file' && (
                                <TextField fullWidth size="small" value={val ?? ''} onChange={e=> setValues(v=> ({ ...v, [id]: e.target.value }))} placeholder={it.accept_url ? 'https://...' : 'URL o path'} sx={{ mt:1 }} />
                              )}
                            </Box>
                          )
                        })}
                      </Stack>
                    )}
                  </Box>
                )
              })
            })()}
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
