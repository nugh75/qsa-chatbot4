import React, { useEffect, useState } from 'react'
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Button, Table, TableHead, TableRow, TableCell, TableBody, TextField, Divider, Chip, Tooltip } from '@mui/material'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8005'

interface SummaryResp {
  total: number
  questions: Record<string, { count: number; avg: number; min: number; max: number; distribution: Record<number, number> }>
}
interface OpenAnswerItem { type: string; text: string; submitted_at: string }

const labels: Record<string,string> = {
  q_utilita: 'Utilità',
  q_pertinenza: 'Pertinenza',
  q_chiarezza: 'Chiarezza',
  q_dettaglio: 'Dettaglio',
  q_facilita: 'Facilità d’uso',
  q_velocita: 'Velocità',
  q_fiducia: 'Fiducia',
  q_riflessione: 'Riflessione',
  q_coinvolgimento: 'Coinvolgimento',
  q_riuso: 'Riutilizzo/Consiglio'
}

const SurveyResults: React.FC = () => {
  const [data, setData] = useState<SummaryResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openAnswers, setOpenAnswers] = useState<OpenAnswerItem[]>([])
  const [filter, setFilter] = useState('')

  useEffect(()=>{
    const load = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/survey/summary`)
        if(!r.ok) throw new Error('Errore fetch')
        const js = await r.json()
        console.log('Survey summary:', js)
        setData(js)
        const oa = await fetch(`${BACKEND}/api/survey/open-answers?limit=500`)
        if(oa.ok){
          const ojs = await oa.json()
          console.log('Open answers:', ojs)
          setOpenAnswers(ojs.items || [])
        }
      } catch(e:any){
        setError(e.message)
      } finally { setLoading(false) }
    }
    load()
  },[])

  const exportCSV = () => {
    if(!data) return
  const headers = 'codice,label,media,count,min,max\n'
    const rows = Object.entries(data.questions).map(([k,v])=>`${k},${labels[k]||k},${(v.avg??0).toFixed(2)},${v.count},${v.min||''},${v.max||''}`)
    const blob = new Blob([headers + rows.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `survey_summary_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Box sx={{ p:3, minHeight:'100vh', background: 'linear-gradient(120deg,#f5f9ff 0%, #f0f7ff 40%, #fff 100%)' }}>
      <Box sx={{ mb:3, display:'flex', flexWrap:'wrap', gap:2, alignItems:'center' }}>
        <Typography variant="h4" sx={{ fontWeight:600, background: 'linear-gradient(90deg,#1976d2,#42a5f5)', WebkitBackgroundClip:'text', color:'transparent' }}>
          Risultati Questionario
        </Typography>
        {data && (
          <Chip label={`Totale risposte: ${data.total}`} color="primary" variant="outlined" />
        )}
        <Button variant="contained" size="small" onClick={exportCSV} disabled={!data}>Esporta CSV</Button>
      </Box>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (
        <>
          {data.total === 0 && (
            <Alert severity="info" sx={{ mb:3 }}>Non ci sono ancora risposte. Torna più tardi.</Alert>
          )}
          {/* Sezione distribuzioni */}
          <Paper elevation={3} sx={{ mb:4, p:3, borderRadius:4, background:'linear-gradient(135deg,#e3f2fd 0%, #e8f5e9 100%)' }}>
            <Typography variant="subtitle1" sx={{ fontWeight:600, mb:2, display:'flex', alignItems:'center', gap:1 }}>
              Andamento risposte (1–5)
            </Typography>
            <Grid container spacing={3}>
              {Object.entries(data.questions).map(([k,v])=>{
                const dist = v.distribution || {}
                const maxC = Math.max(1, ...Object.values(dist))
                const palette = ['#e57373','#ffb74d','#64b5f6','#4db6ac','#9575cd']
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={k}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:3, bgcolor:'#ffffffcc', backdropFilter:'blur(4px)' }}>
                      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight:600 }}>{labels[k] || k}</Typography>
                        <Chip size="small" label={v.avg ? v.avg.toFixed(2) : '-'} color="primary" variant="outlined" />
                      </Box>
                      <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:110, mt:1 }}>
                        {[1,2,3,4,5].map((val,idx)=> {
                          const c = dist[val] || 0
                          const h = (c / maxC) * 90 // px
                          const pct = v.count ? (c / v.count * 100).toFixed(0) : '0'
                          return (
                            <Tooltip key={val} title={`${c} risposte (${pct}%) valore ${val}`}> 
                              <Box sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                <Box sx={{ 
                                  width:'100%', 
                                  height: h || 4, 
                                  background:`linear-gradient(180deg, ${palette[idx]} 0%, ${palette[idx]}99 70%, ${palette[idx]}55 100%)`, 
                                  borderRadius:1, 
                                  transition:'height .35s',
                                  boxShadow:'0 2px 4px rgba(0,0,0,0.15)'
                                }} />
                                <Typography variant="caption" sx={{ fontSize:'0.65rem', color:'#555' }}>{val}</Typography>
                              </Box>
                            </Tooltip>
                          )
                        })}
                      </Box>
                      <Box sx={{ mt:1.5, display:'flex', gap:1, flexWrap:'wrap' }}>
                        <Chip size="small" label={`N=${v.count}`} />
                        <Chip size="small" label={`Min ${v.min ?? '-'}`} variant="outlined" />
                        <Chip size="small" label={`Max ${v.max ?? '-'}`} variant="outlined" />
                      </Box>
                    </Paper>
                  </Grid>
                )
              })}
            </Grid>
          </Paper>

          {/* Tabella riepilogo */}
          <Paper variant="outlined" sx={{ mb:4, borderRadius:4, overflow:'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor:'#1976d2' }}>
                  <TableCell sx={{ color:'#fff', fontWeight:600 }}>Domanda</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Media</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>N</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Min</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Max</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(data.questions).map(([k,v])=> (
                  <TableRow key={k} hover>
                    <TableCell>{labels[k] || k}</TableCell>
                    <TableCell align="right" sx={{ fontWeight:600 }}>{v.avg ? v.avg.toFixed(2) : '-'}</TableCell>
                    <TableCell align="right">{v.count}</TableCell>
                    <TableCell align="right">{v.min ?? '-'}</TableCell>
                    <TableCell align="right">{v.max ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {/* Risposte aperte */}
          <Paper elevation={2} sx={{ p:3, borderRadius:4, background:'linear-gradient(135deg,#fafafa,#f0f4ff)' }}>
            <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:2, mb:2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight:600 }}>Risposte aperte</Typography>
              <TextField size="small" placeholder="Cerca testo..." value={filter} onChange={e=> setFilter(e.target.value)} sx={{ maxWidth:280 }} />
            </Box>
            <Divider sx={{ mb:2 }} />
            <Box sx={{ display:'flex', flexDirection:'column', gap:1.5, maxHeight:420, overflowY:'auto', pr:1 }}>
              {openAnswers
                .filter(a=> !filter || a.text.toLowerCase().includes(filter.toLowerCase()))
                .map((a,i)=>(
                  <Paper key={i} variant="outlined" sx={{ p:1.5, borderRadius:3, background:'#fff', position:'relative' }}>
                    <Typography variant="caption" sx={{ color:'text.secondary', display:'block', mb:0.5 }}>{a.type} · {new Date(a.submitted_at).toLocaleString()}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace:'pre-wrap', lineHeight:1.5 }}>{a.text}</Typography>
                  </Paper>
                ))}
              {openAnswers.length === 0 && <Typography variant="caption" color="text.secondary">Nessuna risposta aperta ancora.</Typography>}
            </Box>
          </Paper>
        </>
      )}
    </Box>
  )
}

export default SurveyResults
