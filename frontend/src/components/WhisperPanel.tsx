import React, { useEffect, useState, useCallback } from 'react'
import { Paper, Stack, Typography, Button, Chip, LinearProgress, Alert, Box, Switch, FormControlLabel, IconButton, TextField, Divider } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import CheckIcon from '@mui/icons-material/Check'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'
import { apiService } from '../apiService'
import WhisperRecorder from './WhisperRecorder'

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
      const res = await apiService.listWhisperModels()
      if (!res.error && res.data) {
        setStatus(res.data as WhisperModelsResponse)
      } else if (res.error) {
        setOpError(res.error)
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const download = async (modelName: string) => {
    setOpMsg(null); setOpError(null)
    try {
      if (!advanced) {
        const res = await apiService.downloadWhisperModel(modelName)
        if (!res.error) {
          setOpMsg(res.data?.message || `Download ${modelName} avviato`)
          setTimeout(load, 1200); setTimeout(load, 3000); setTimeout(load, 6000)
        } else setOpError(res.error)
      } else {
        const res = await apiService.downloadWhisperModelAsync(modelName)
        if (!res.error && res.data?.task_id) {
          setTasks(prev => ({ ...prev, [res.data!.task_id]: { task_id: res.data!.task_id, model: res.data!.model, status: 'pending', progress_pct: 0 } }))
          setOpMsg(`Download async avviato: ${modelName}`)
          setPolling(true)
        } else setOpError(res.error || 'Errore avvio download async')
      }
    } catch { setOpError('Errore chiamata') }
  }

  const setModel = async (m: string) => {
    setOpMsg(null); setOpError(null)
    try {
      const res = await apiService.setWhisperModel(m)
      if (!res.error) {
        setOpMsg(res.data?.message || 'Modello impostato')
        setTimeout(load, 800)
      } else setOpError(res.error)
    } catch { setOpError('Errore chiamata') }
  }

  const activateModel = async (m: string) => {
    setOpMsg(null); setOpError(null)
    try {
      const res = await apiService.activateWhisperModel(m)
      if (!res.error) {
        setOpMsg(res.data?.message || 'Modello attivato')
      } else setOpError(res.error)
    } catch { setOpError('Errore chiamata') }
  }

  const deleteModel = async (m: string) => {
    setOpMsg(null); setOpError(null)
    try {
      const res = await apiService.deleteWhisperModel(m)
      if (!res.error) {
        setOpMsg(res.data?.message || `Modello ${m} eliminato`)
        setTimeout(load, 800)
      } else setOpError(res.error)
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
          const res = await apiService.whisperDownloadTaskStatus(t.task_id)
          if (!res.error && res.data) {
            const data = res.data
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

  // Transcription test state
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcription, setTranscription] = useState<string | null>(null)

  const handleTranscribe = async () => {
    if (!audioFile) return
    setTranscribing(true); setOpError(null); setTranscription(null)
    try {
      const current = status?.current_model
      const res = current ? await apiService.transcribeAudio(audioFile, current) : await apiService.transcribeAudio(audioFile)
      if (!res.error) {
        setTranscription(res.data?.text || JSON.stringify(res.data))
      } else setOpError(res.error)
    } catch { setOpError('Errore trascrizione') } finally { setTranscribing(false) }
  }

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
                      <>
                        <Button size='small' onClick={()=>setModel(s.name)} variant='outlined' startIcon={<PlayArrowIcon fontSize='inherit' />} disabled={active}>Usa</Button>
                        {advanced && <Button size='small' onClick={()=>activateModel(s.name)} variant='text' disabled={active}>Attiva</Button>}
                      </>
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
          <Paper variant='outlined' sx={{ p:1.2 }}>
            <Typography variant='subtitle2' gutterBottom>Test Trascrizione</Typography>
            <Stack direction='row' spacing={1} alignItems='center' sx={{ flexWrap:'wrap' }}>
              <Button component='label' size='small' variant='contained'>Audio
                <input hidden type='file' accept='audio/*' onChange={e=>{ const f=e.target.files?.[0]; setAudioFile(f||null); setTranscription(null) }} />
              </Button>
              <Typography variant='caption'>{audioFile?.name || 'Nessun file'}</Typography>
              <Button size='small' disabled={!audioFile || transcribing} onClick={handleTranscribe} variant='outlined'>Trascrivi</Button>
              {transcribing && <LinearProgress sx={{ flex:1, height:4, borderRadius:1 }} />}
            </Stack>
            {transcription && (
              <TextField multiline fullWidth size='small' margin='dense' value={transcription} onChange={()=>{}} label='Risultato' />
            )}
            {advanced && (
              <>
                <Divider sx={{ my:1 }} />
                <Typography variant='subtitle2' gutterBottom>Registrazione (VAD)</Typography>
                <WhisperRecorder model={status?.current_model} onTranscription={txt=> setTranscription(txt)} />
              </>
            )}
          </Paper>
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
