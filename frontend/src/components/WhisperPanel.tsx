import React, { useEffect, useState, useCallback } from 'react'
import { Paper, Stack, Typography, Button, Chip, LinearProgress, Alert, Box, Tooltip, Switch, FormControlLabel, IconButton } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import CheckIcon from '@mui/icons-material/Check'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import { authFetch, BACKEND } from '../utils/authFetch'

interface WhisperStatusItem {
  name: string
  size: string
  accuracy: string
  speed: string
  memory: string
  disk_space: string
  downloaded: boolean
  download_progress?: number
}

interface WhisperModelsResponse {
  success: boolean
  models: string[]
  current_model: string | null
  status: Record<string, WhisperStatusItem>
}

interface DownloadTaskStatus {
  task_id: string
  model: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped'
  error?: string | null
  progress_pct: number
}

const WhisperPanel: React.FC = () => {
  const [status, setStatus] = useState<WhisperModelsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [tasks, setTasks] = useState<Record<string, DownloadTaskStatus>>({})
  const [opMsg, setOpMsg] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setOpError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/whisper/models`)
      if (res.ok) {
        const data: WhisperModelsResponse = await res.json()
        setStatus(data)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const download = async (modelName: string) => {
    setOpMsg(null); setOpError(null)
    try {
      if (!advanced) {
        const res = await authFetch(`${BACKEND}/api/admin/whisper/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName })
        })
        const data = await res.json()
        if (res.ok) {
          setOpMsg(data.message || `Download ${modelName} avviato`)
          setTimeout(load, 1200); setTimeout(load, 3000); setTimeout(load, 6000)
        } else {
          setOpError(data.detail || 'Errore download')
        }
      } else {
        // Async mode
        const res = await authFetch(`${BACKEND}/api/whisper/models/${modelName}/download-async`, { method: 'POST' })
        const data = await res.json()
        if (res.ok && data.task_id) {
          setTasks(prev => ({ ...prev, [data.task_id]: { task_id: data.task_id, model: data.model, status: 'pending', progress_pct: 0 } }))
          setOpMsg(`Download async avviato: ${modelName}`)
          setPolling(true)
        } else {
          setOpError(data.detail || 'Errore avvio download async')
        }
      }
    } catch { setOpError('Errore chiamata') }
  }

  const setModel = async (m: string) => {
    setOpMsg(null); setOpError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/whisper/set-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m })
      })
      const data = await res.json()
      if (res.ok) {
        setOpMsg(data.message || 'Modello impostato')
        setTimeout(load, 800)
      } else {
        setOpError(data.detail || 'Errore impostazione modello')
      }
    } catch { setOpError('Errore chiamata') }
  }

  const deleteModel = async (m: string) => {
    setOpMsg(null); setOpError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/whisper/models/${m}`, { method: 'DELETE' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) {
        setOpMsg(data.message || `Modello ${m} eliminato`)
        setTimeout(load, 800)
      } else {
        setOpError(data.detail || 'Errore eliminazione')
      }
    } catch { setOpError('Errore chiamata') }
  }

  // Poll tasks statuses when advanced & polling
  useEffect(() => {
    if (!advanced) return
    if (!polling) return
    const interval = setInterval(async () => {
      const activeTasks = Object.values(tasks).filter(t => ['pending','running'].includes(t.status))
      if (!activeTasks.length) { setPolling(false); return }
      for (const t of activeTasks) {
        try {
          const res = await authFetch(`${BACKEND}/api/whisper/models/download-tasks/${t.task_id}`)
          if (res.ok) {
            const data = await res.json()
            setTasks(prev => ({ ...prev, [t.task_id]: { task_id: data.task_id, model: data.model, status: data.status, error: data.error, progress_pct: data.progress_pct || 0 } }))
            if (data.status === 'completed' || data.status === 'skipped') {
              setTimeout(load, 500)
            }
          }
        } catch {/* ignore */}
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [advanced, polling, tasks, load])

  // Optional polling (manual trigger) for progress improvements
  useEffect(() => {
    if (!polling) return
    const id = setInterval(() => { load() }, 2500)
    return () => clearInterval(id)
  }, [polling, load])

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <VolumeUpIcon fontSize="small" />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Whisper (trascrizione)</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
  <FormControlLabel sx={{ ml:1 }} control={<Switch size='small' checked={advanced} onChange={e=>setAdvanced(e.target.checked)} />} label={<Typography variant='caption'>Avanzato</Typography>} />
      </Stack>
      {loading && <LinearProgress sx={{ my: 1 }} />}
      {status && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" label={`Corrente: ${status.current_model || '—'}`} color="info" />
            {advanced && <Button size="small" onClick={()=>setPolling(p=>!p)} variant={polling? 'outlined':'text'}>{polling? 'Stop polling':'Poll tasks'}</Button>}
          </Stack>
          <Box sx={{ display:'grid', gap: .6, gridTemplateColumns:'repeat(auto-fill, minmax(210px,1fr))' }}>
            {Object.values(status.status).map(s => {
              const active = status.current_model === s.name
              // Task progress (advanced)
              const task = advanced ? Object.values(tasks).find(t => t.model === s.name && ['pending','running'].includes(t.status)) : undefined
              const progressPct = task ? task.progress_pct : (s.downloaded ? 100 : 0)
              return (
                <Paper key={s.name} variant='outlined' sx={{ p: .8, display:'flex', flexDirection:'column', gap:.5, borderColor: active? 'primary.main':'divider', backgroundColor: active? 'action.hover':'transparent' }}>
                  <Stack direction='row' spacing={.5} alignItems='center'>
                    <Chip size='small' label={s.name} color={s.downloaded? 'success':'default'} />
                    {active && <CheckIcon fontSize='inherit' color='primary' />}
                  </Stack>
                  <Typography variant='caption' sx={{ lineHeight:1.2 }}>{s.size} · Acc:{s.accuracy} · Vel:{s.speed}</Typography>
                  <Typography variant='caption' sx={{ opacity:.7 }}>RAM:{s.memory} Disk:{s.disk_space}</Typography>
                  {!s.downloaded && (
                    task ? (
                      <LinearProgress variant='determinate' value={progressPct} sx={{ height:4, borderRadius:1 }} />
                    ) : (
                      <LinearProgress variant={advanced? 'determinate':'indeterminate'} value={progressPct} sx={{ height:4, borderRadius:1, opacity:.6 }} />
                    )
                  )}
                  <Stack direction='row' spacing={.5}>
                    {s.downloaded ? (
                      <Button size='small' onClick={()=>setModel(s.name)} variant='outlined' startIcon={<PlayArrowIcon fontSize='inherit' />} disabled={active}>Usa</Button>
                    ) : (
                      <Button size='small' onClick={()=>download(s.name)} variant='contained' startIcon={<DownloadIcon fontSize='inherit' />}>Scarica</Button>
                    )}
                    {advanced && s.downloaded && !active && (
                      <IconButton size='small' onClick={()=>deleteModel(s.name)}><DeleteIcon fontSize='inherit' /></IconButton>
                    )}
                  </Stack>
                  {advanced && task && task.status === 'error' && <Typography color='error' variant='caption'>Err: {task.error}</Typography>}
                </Paper>
              )
            })}
          </Box>
          {advanced && !!Object.values(tasks).filter(t=>['pending','running'].includes(t.status)).length && (
            <Alert severity='info' sx={{ mt:1 }}>Download in corso: {Object.values(tasks).filter(t=>['pending','running'].includes(t.status)).map(t=>t.model).join(', ')}</Alert>
          )}
          {opMsg && <Alert severity='success' onClose={() => setOpMsg(null)}>{opMsg}</Alert>}
          {opError && <Alert severity='error' onClose={() => setOpError(null)}>{opError}</Alert>}
        </Stack>
      )}
    </Paper>
  )
}

export default WhisperPanel
