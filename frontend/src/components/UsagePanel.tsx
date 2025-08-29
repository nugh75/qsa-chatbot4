import React, { useEffect, useState, useCallback } from 'react'
import { Paper, Stack, Typography, Button, LinearProgress, Alert, Divider, Box, useMediaQuery, useTheme, Chip } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import { authFetch, BACKEND } from '../utils/authFetch'

interface DailyUsage { date: string; requests: number; tokens?: number }
interface UsageStats { total_requests: number; total_tokens?: number; today?: { requests: number; tokens: number }; by_provider?: Record<string, { requests: number; tokens: number; cost: number }> }
interface DailyUsageResponse { daily: Record<string, { count: number; tokens: number }> | DailyUsage[] }
interface FeedbackStats { total: number; likes: number; dislikes: number; by_provider?: Record<string, { likes: number; dislikes: number }> }

const UsagePanel: React.FC = () => {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [daily, setDaily] = useState<DailyUsage[] | null>(null)
  const [feedback, setFeedback] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [opMsg, setOpMsg] = useState<string | null>(null)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [statsRes, dailyRes, fbRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/usage/stats`),
        authFetch(`${BACKEND}/api/admin/usage?page_size=1`),
        authFetch(`${BACKEND}/api/feedback/stats`)
      ])
      if (!statsRes.ok) throw new Error('Usage stats HTTP '+statsRes.status)
      if (!dailyRes.ok) throw new Error('Usage daily HTTP '+dailyRes.status)
      if (!fbRes.ok) throw new Error('Feedback HTTP '+fbRes.status)
      setUsageStats(await statsRes.json())
      const dailyJson: DailyUsageResponse = await dailyRes.json()
      let dailyArr: DailyUsage[] = []
      if (Array.isArray(dailyJson.daily)) {
        // Already array (unexpected with current backend but handle anyway)
        dailyArr = dailyJson.daily as DailyUsage[]
      } else if (dailyJson.daily && typeof dailyJson.daily === 'object') {
        dailyArr = Object.entries(dailyJson.daily).map(([date, v]) => ({ date, requests: (v as any).count || 0, tokens: (v as any).tokens }))
        dailyArr.sort((a,b)=> a.date.localeCompare(b.date))
      }
      setDaily(dailyArr)
      setFeedback(await fbRes.json())
    } catch(e:any){ setError(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(()=>{load()}, [load])

  const resetUsage = async () => {
    setOpMsg(null)
    try {
  const res = await authFetch(`${BACKEND}/api/admin/usage/reset`, { method: 'POST' })
      const data = await res.json().catch(()=>({}))
      if (res.ok) { setOpMsg(data.message || 'Usage resettato'); load() } else setOpMsg(data.detail || 'Errore reset')
    } catch { setOpMsg('Errore chiamata') }
  }

  const exportUsage = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/usage/export`)
      if (!res.ok) throw new Error('HTTP '+res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
  a.download = 'usage_export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch(e:any){ setOpMsg(e.message) }
  }

  return (
    <Paper variant='outlined' sx={{ p: isMobile ? 1.5 : 2 }}>
      <Stack direction='row' alignItems='center' spacing={1} flexWrap='wrap'>
        <Typography variant={isMobile ? 'body1' : 'subtitle1'} sx={{ flex:1 }}>Utilizzo & Feedback</Typography>
        <Button size='small' startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
      </Stack>
      {loading && <LinearProgress sx={{ my:1 }} />}
      {error && <Alert severity='error' sx={{ mt:1 }}>{error}</Alert>}
      {usageStats && feedback && (
        <Stack spacing={isMobile ? 1 : 1.5} sx={{ mt:1 }}>
          {!isMobile && (
            <Stack direction='row' spacing={2} flexWrap='wrap'>
              <Typography variant='body2'>Richieste totali: {usageStats.total_requests}</Typography>
              {usageStats.total_tokens !== undefined && <Typography variant='body2'>Token totali: {usageStats.total_tokens}</Typography>}
              {usageStats.today && <Typography variant='body2'>Oggi: {usageStats.today.requests} req / {usageStats.today.tokens} tokens</Typography>}
            </Stack>
          )}
          {isMobile && (
            <Stack direction='row' spacing={1} flexWrap='wrap'>
              <Chip size='small' label={`Tot: ${usageStats.total_requests}`} />
              {usageStats.total_tokens !== undefined && <Chip size='small' label={`Tokens: ${usageStats.total_tokens}`} />}
              {usageStats.today && <Chip size='small' color='primary' label={`Oggi: ${usageStats.today.requests}`} />}
              {usageStats.today && usageStats.today.tokens !== undefined && <Chip size='small' label={`${usageStats.today.tokens} tk`} />}
            </Stack>
          )}
          <Typography variant='body2'>Feedback: +{feedback.likes} / -{feedback.dislikes} (tot {feedback.total})</Typography>
          <Divider />
          <Stack spacing={0.6} sx={{ maxHeight: isMobile ? 140 : 180, overflow:'auto', pr:0.5 }}>
            {daily && Array.isArray(daily) && daily.map(d => (
              <Typography key={d.date} variant='caption'>{d.date}: {d.requests} richieste{d.tokens ? ` (${d.tokens} tokens)` : ''}</Typography>
            ))}
          </Stack>
          <Stack direction='row' spacing={1} sx={{ pt:0.5 }}>
            <Button size='small' variant='outlined' startIcon={<DownloadIcon />} onClick={exportUsage} fullWidth={isMobile}>Export</Button>
            <Button size='small' color='error' variant='contained' startIcon={<DeleteIcon />} onClick={resetUsage} fullWidth={isMobile}>Reset</Button>
          </Stack>
        </Stack>
      )}
      {opMsg && <Alert severity='info' sx={{ mt:1 }} onClose={()=>setOpMsg(null)}>{opMsg}</Alert>}
    </Paper>
  )
}

export default UsagePanel
