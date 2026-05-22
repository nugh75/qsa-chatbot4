import React, { useEffect, useMemo, useState } from 'react'
import { authFetch, BACKEND } from '../utils/authFetch'
import { Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

type AdminCfg = { ai_providers: Record<string, any> }

const ModelsManagerPanel: React.FC = () => {
  const [cfg, setCfg] = useState<AdminCfg | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState<string>('openrouter')
  const [models, setModels] = useState<string[]>([])
  const [selected, setSelected] = useState<string>('')
  const [custom, setCustom] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)
  const [note, setNote] = useState<string | null>(null)

  const loadCfg = async () => {
    const r = await authFetch(`${BACKEND}/api/admin/config`)
    if (r.ok) {
      const data = await r.json()
      setCfg(data)
      const names = Object.keys(data.ai_providers || {})
      setProviders(names)
      if (!names.includes(provider) && names.length) setProvider(names[0])
    }
  }
  useEffect(()=> { loadCfg() }, [])

  const loadModels = async (prov = provider) => {
    setLoading(true); setNote(null)
    try {
      const r = await authFetch(`${BACKEND}/api/admin/provider-models/${prov}?refresh=1`)
      const data = await r.json()
      const list: string[] = data.models || []
      setModels(list)
      if (data.note) setNote(String(data.note))
      if (list.length) setSelected(list[0])
    } catch { setModels([]) } finally { setLoading(false) }
  }
  useEffect(()=> { if (provider) loadModels(provider) }, [provider])

  const saveSelected = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      const next = { ...cfg }
      next.ai_providers = { ...next.ai_providers, [provider]: { ...(next.ai_providers[provider]||{}), selected_model: selected } }
      await authFetch(`${BACKEND}/api/admin/config`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(next) })
      setCfg(next)
    } catch {/* ignore */}
    setSaving(false)
  }

  const addCustom = async () => {
    const m = (custom || '').trim()
    if (!m) return
    if (!cfg) return
    setSaving(true)
    try {
      const cur = new Set([...(cfg.ai_providers?.[provider]?.models || [])])
      cur.add(m)
      const next = { ...cfg }
      next.ai_providers = { ...next.ai_providers, [provider]: { ...(next.ai_providers[provider]||{}), models: Array.from(cur), selected_model: m } }
      await authFetch(`${BACKEND}/api/admin/config`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(next) })
      setCfg(next)
      setCustom('')
      // reflect in local list too
      setModels(prev => Array.from(new Set([...(prev||[]), m])))
      setSelected(m)
    } catch {/* ignore */}
    setSaving(false)
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Gestione Modelli AI</Typography>
        <Paper variant="outlined" sx={{ p:1.5, mb:2 }}>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'flex-end' }}>
            <TextField select size="small" label="Provider" value={provider} onChange={e=> setProvider(e.target.value)} sx={{ minWidth: 200 }}>
              {providers.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Modello" value={selected} onChange={e=> setSelected(e.target.value)} sx={{ minWidth: 320 }}>
              {models.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </TextField>
            <Button size="small" variant="contained" onClick={saveSelected} disabled={saving || !selected}>Imposta selezionato</Button>
            <IconButton onClick={()=> loadModels(provider)} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
          </Stack>
          {loading && <LinearProgress sx={{ mt:1 }} />}
          {note && <Typography variant="caption" color="text.secondary">Nota: {note}</Typography>}
          <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems={{ sm:'flex-end' }} sx={{ mt:1 }}>
            <TextField size="small" label="Aggiungi modello manuale" value={custom} onChange={e=> setCustom(e.target.value)} sx={{ minWidth: 320 }} />
            <Button size="small" variant="outlined" onClick={addCustom} disabled={saving || !custom.trim()}>Aggiungi</Button>
          </Stack>
        </Paper>
        <Typography variant="body2" color="text.secondary">Le liste modelli vengono recuperate online ove possibile. Se un modello non compare, aggiungilo manualmente e impostalo come selezionato.</Typography>
      </CardContent>
    </Card>
  )
}

export default ModelsManagerPanel

