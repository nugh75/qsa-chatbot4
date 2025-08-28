import React from 'react'
import { Container, Box, Typography, Grid, Card, CardContent, LinearProgress, Table, TableHead, TableRow, TableCell, TableBody, Chip, Stack, CircularProgress, Button } from '@mui/material'
import { useAuth } from './contexts/AuthContext'

type ProviderStats = { likes: number; dislikes: number }
type ModelStats = { provider: string; likes: number; dislikes: number }
type PersonalityStats = { name: string; provider: string; model: string; likes: number; dislikes: number }

type FeedbackStats = {
  total: number
  likes: number
  dislikes: number
  by_provider: Record<string, ProviderStats>
  by_model?: Record<string, ModelStats>
  by_personality?: Record<string, PersonalityStats>
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8005'

const percent = (likes: number, total: number) => (total > 0 ? Math.round((likes / total) * 100) : 0)

const Arena: React.FC = () => {
  const { user } = useAuth()
  const [stats, setStats] = React.useState<FeedbackStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [allowed, setAllowed] = React.useState<boolean>(false)
  const [gateChecked, setGateChecked] = React.useState<boolean>(false)

  // Gate di accesso: admin sempre ammesso, altrimenti dipende da config pubblica
  React.useEffect(() => {
    const check = async () => {
      if (user?.is_admin) {
        setAllowed(true)
        setGateChecked(true)
        return
      }
      try {
        const res = await fetch(`${BACKEND}/api/config/public`)
        const data = await res.json()
        const arenaPublic = Boolean(data?.ui_settings?.arena_public)
        setAllowed(arenaPublic)
      } catch {
        setAllowed(false)
      } finally {
        setGateChecked(true)
      }
    }
    check()
  }, [user?.is_admin])

  React.useEffect(() => {
    if (!allowed) return
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${BACKEND}/api/feedback/stats`)
        const data = await res.json()
        setStats(data)
      } catch (e: any) {
        setError(e?.message || 'Errore nel recupero statistiche')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [allowed])

  const total = stats?.total || 0
  const likes = stats?.likes || 0
  const dislikes = stats?.dislikes || 0
  const likeRate = percent(likes, total)

  if (!gateChecked) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <CircularProgress size={20} />
          <Typography>Verifica accesso...</Typography>
        </Stack>
      </Container>
    )
  }

  if (!allowed) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Arena non disponibile</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              L'amministratore non ha reso pubblica la pagina Arena.
            </Typography>
            <Button variant="contained" href="/">Torna alla chat</Button>
          </CardContent>
        </Card>
      </Container>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Arena – Statistiche Feedback
      </Typography>

      {loading && <LinearProgress />}
      {error && (
        <Box sx={{ my: 2, color: 'error.main' }}>{error}</Box>
      )}

      {stats && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary">Totale Feedback</Typography>
                  <Typography variant="h6">{total}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary">Mi piace</Typography>
                  <Typography variant="h6">{likes}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary">Like rate</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LinearProgress variant="determinate" value={likeRate} sx={{ flex: 1, height: 8, borderRadius: 1 }} />
                    <Typography variant="body2">{likeRate}%</Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Per Provider</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Provider</TableCell>
                        <TableCell align="right">Like</TableCell>
                        <TableCell align="right">Dislike</TableCell>
                        <TableCell align="right">Like %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(stats.by_provider || {}).map(([prov, s]) => {
                        const tot = s.likes + s.dislikes
                        return (
                          <TableRow key={prov}>
                            <TableCell>{prov}</TableCell>
                            <TableCell align="right">{s.likes}</TableCell>
                            <TableCell align="right">{s.dislikes}</TableCell>
                            <TableCell align="right">{percent(s.likes, tot)}%</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Per Modello</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Modello</TableCell>
                        <TableCell>Provider</TableCell>
                        <TableCell align="right">Like</TableCell>
                        <TableCell align="right">Dislike</TableCell>
                        <TableCell align="right">Like %</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(stats.by_model || {}).map(([model, s]) => {
                        const tot = s.likes + s.dislikes
                        return (
                          <TableRow key={model}>
                            <TableCell>{model}</TableCell>
                            <TableCell><Chip label={s.provider} size="small" /></TableCell>
                            <TableCell align="right">{s.likes}</TableCell>
                            <TableCell align="right">{s.dislikes}</TableCell>
                            <TableCell align="right">{percent(s.likes, tot)}%</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ mt: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Per Personalità</Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Personalità</TableCell>
                      <TableCell>Provider</TableCell>
                      <TableCell>Modello</TableCell>
                      <TableCell align="right">Like</TableCell>
                      <TableCell align="right">Dislike</TableCell>
                      <TableCell align="right">Like %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(stats.by_personality || {}).map(([pid, s]) => {
                      const tot = s.likes + s.dislikes
                      return (
                        <TableRow key={pid}>
                          <TableCell>{s.name} <Typography variant="caption" color="text.secondary">({pid})</Typography></TableCell>
                          <TableCell><Chip label={s.provider} size="small" /></TableCell>
                          <TableCell>{s.model}</TableCell>
                          <TableCell align="right">{s.likes}</TableCell>
                          <TableCell align="right">{s.dislikes}</TableCell>
                          <TableCell align="right">{percent(s.likes, tot)}%</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Container>
  )
}

export default Arena
