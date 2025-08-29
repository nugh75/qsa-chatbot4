import React, { useEffect, useState, useCallback } from 'react'
import { Paper, Stack, Typography, Button, LinearProgress, Alert, TextField, IconButton } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteIcon from '@mui/icons-material/Delete'
import CleaningServicesIcon from '@mui/icons-material/CleaningServices'
import { authFetch, BACKEND } from '../utils/authFetch'

interface SessionStatsRaw {
  messages: number
  last_message_time?: number
  last_activity?: string
}

interface MemoryStatsResponseRaw {
  sessions: Record<string, SessionStatsRaw>
  total_sessions: number
  total_messages: number
  max_messages_per_session?: number
  active_sessions?: number
}

interface MemoryStatsEntry {
  session_id: string
  messages: number
  last_activity: string
}

const MemoryPanel: React.FC = () => {
  const [stats, setStats] = useState<MemoryStatsResponseRaw | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxMessages, setMaxMessages] = useState('')
  const [opMsg, setOpMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/stats`)
      if (!res.ok) throw new Error('HTTP '+res.status)
  const data: MemoryStatsResponseRaw = await res.json()
  setStats(data)
  if (data.max_messages_per_session) setMaxMessages(String(data.max_messages_per_session))
    } catch (e:any) { setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(()=>{load()}, [load])

  const updateMax = async () => {
    if (!maxMessages.trim()) return
    setOpMsg(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/config?max_messages=${encodeURIComponent(maxMessages)}`, { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { setOpMsg(data.message || 'Configurazione aggiornata'); load() } else setOpMsg(data.detail || 'Errore aggiornamento')
    } catch { setOpMsg('Errore chiamata') }
  }

  const clearAll = async () => {
    setOpMsg(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/clear`, { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { setOpMsg(data.message || 'Memoria cancellata'); load() } else setOpMsg(data.detail || 'Errore clear')
    } catch { setOpMsg('Errore chiamata') }
  }

  const clearSession = async (sid: string) => {
    setOpMsg(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/clear?session_id=${encodeURIComponent(sid)}`, { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { setOpMsg(data.message || 'Sessione cancellata'); load() } else setOpMsg(data.detail || 'Errore sessione')
    } catch { setOpMsg('Errore chiamata') }
  }

  const cleanupIdle = async () => {
    setOpMsg(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/cleanup`, { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { setOpMsg(data.message || 'Pulizia completata'); load() } else setOpMsg(data.detail || 'Errore cleanup')
    } catch { setOpMsg('Errore chiamata') }
  }

  return (
    <Paper variant='outlined' sx={{ p:2 }}>
      <Stack direction='row' alignItems='center' spacing={1}>
        <Typography variant='subtitle1' sx={{ flex:1 }}>Memoria conversazioni</Typography>
        <Button size='small' startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
      </Stack>
      {loading && <LinearProgress sx={{ my:1 }} />}
      {error && <Alert severity='error' sx={{ mt:1 }}>{error}</Alert>}
    {stats && (
        <Stack spacing={1.2} sx={{ mt:1 }}>
      <Typography variant='body2'>Sessioni: {stats.total_sessions} · Attive: {stats.active_sessions ?? '-'} · Messaggi totali: {stats.total_messages}</Typography>
          <Stack direction='row' spacing={1} alignItems='center'>
            <TextField size='small' label='Max messaggi/sessione' value={maxMessages} onChange={e=>setMaxMessages(e.target.value)} sx={{ maxWidth:180 }} />
            <Button size='small' variant='outlined' onClick={updateMax}>Aggiorna</Button>
            <Button size='small' color='warning' variant='outlined' onClick={cleanupIdle} startIcon={<CleaningServicesIcon fontSize='inherit' />}>Cleanup</Button>
            <Button size='small' color='error' variant='contained' onClick={clearAll} startIcon={<DeleteIcon fontSize='inherit' />}>Clear All</Button>
          </Stack>
          <Stack spacing={0.6} sx={{ maxHeight:260, overflow:'auto' }}>
            {Object.entries(stats.sessions || {}).length === 0 && <Typography variant='caption' sx={{ opacity:.7 }}>Nessuna sessione</Typography>}
            {Object.entries(stats.sessions || {}).map(([sid, s]) => {
              const last = s.last_activity || (s.last_message_time ? new Date(s.last_message_time*1000).toISOString() : '-')
              return (
                <Stack key={sid} direction='row' spacing={1} alignItems='center' sx={{ border:'1px solid #eee', p:.6, borderRadius:1 }}>
                  <Typography variant='caption' sx={{ flex:1 }}>{sid}</Typography>
                  <Typography variant='caption'>{s.messages} msg</Typography>
                  <Typography variant='caption' sx={{ opacity:.6 }}>{last}</Typography>
                  <IconButton size='small' onClick={()=>clearSession(sid)}><DeleteIcon fontSize='inherit' /></IconButton>
                </Stack>
              )
            })}
          </Stack>
        </Stack>
      )}
      {opMsg && <Alert severity='info' sx={{ mt:1 }} onClose={()=>setOpMsg(null)}>{opMsg}</Alert>}
    </Paper>
  )
}

export default MemoryPanel
