import React, { useEffect, useState, useCallback } from 'react'
import { Paper, Stack, Typography, Button, Switch, FormControlLabel, TextField, LinearProgress, Alert } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { authFetch, BACKEND } from '../utils/authFetch'

interface SummarySettings { enabled: boolean; provider?: string }

const SummarySettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<SummarySettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opMsg, setOpMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-settings`)
      if (!res.ok) throw new Error('HTTP '+res.status)
      setSettings(await res.json())
    } catch(e:any){ setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(()=>{load()}, [load])

  const update = async (partial: Partial<SummarySettings>) => {
    if (!settings) return
    const newSettings: SummarySettings = { ...settings, ...partial }
    setSettings(newSettings)
    setOpMsg(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-settings`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ provider: newSettings.provider, enabled: newSettings.enabled }) })
      let data: any = {}
      try { data = await res.json() } catch {/* non json */}
      if (res.ok) setOpMsg(data.message || 'Aggiornato')
      else {
        const detail = data.detail || (typeof data === 'string' ? data : 'Errore aggiornamento')
        setOpMsg(detail)
      }
    } catch (e:any) { setOpMsg(e.message || 'Errore chiamata') }
  }

  // Seed reset rimosso poiché non pertinente alle summary-settings attuali (solo provider/enabled)

  return (
    <Paper variant='outlined' sx={{ p:2 }}>
      <Stack direction='row' alignItems='center' spacing={1}>
        <Typography variant='subtitle1' sx={{ flex:1 }}>Riepilogo conversazioni</Typography>
        <Button size='small' startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
      </Stack>
      {loading && <LinearProgress sx={{ my:1 }} />}
      {error && <Alert severity='error' sx={{ mt:1 }}>{error}</Alert>}
      {settings && (
        <Stack spacing={1.2} sx={{ mt:1 }}>
          <FormControlLabel control={<Switch checked={settings.enabled} onChange={e=>update({ enabled: e.target.checked })} />} label='Abilitato' />
          <TextField size='small' label='Provider' value={settings.provider||''} onChange={e=>update({ provider: e.target.value })} sx={{ maxWidth:260 }} />
        </Stack>
      )}
      {opMsg && <Alert severity='info' sx={{ mt:1 }} onClose={()=>setOpMsg(null)}>{opMsg}</Alert>}
    </Paper>
  )
}

export default SummarySettingsPanel
