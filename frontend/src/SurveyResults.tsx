import React, { useEffect, useState } from 'react'
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Button, Table, TableHead, TableRow, TableCell, TableBody, TextField, Divider, Chip, Tooltip, FormControl, InputLabel, Select, MenuItem, ToggleButtonGroup, ToggleButton, Collapse, IconButton, Dialog, DialogTitle, DialogContent } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseIcon from '@mui/icons-material/Close'

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005')

interface SummaryResp {
  total: number
  questions: Record<string, { count: number; avg: number; min: number; max: number; std?: number; median?: number; distribution: Record<number, number> }>
  demographics?: {
    eta?: { min:number; max:number; avg:number; bins: Record<string, number> }
    sesso?: Record<string, number>
    istruzione?: Record<string, number>
    tipo_istituto?: Record<string, number>
    provenienza?: Record<string, number>
    by_area?: Record<string, Record<string, number>>
  }
  correlations?: {
    by_age_bins?: Record<string, Record<string, number>>
    by_sesso?: Record<string, Record<string, number>>
    by_istruzione?: Record<string, Record<string, number>>
  }
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

// Palette base per grafici
const demoPalette = ['#42a5f5','#66bb6a','#ffa726','#ab47bc','#ef5350','#26c6da','#8d6e63','#d4e157','#5c6bc0','#ec407a','#7e57c2','#26a69a']

// Semplice torta/donut via SVG con strokeDasharray
const PieChart: React.FC<{ data: Record<string, number>; size?: number; colors?: string[] }>=({ data, size=200, colors=demoPalette })=>{
  const entries = Object.entries(data || {}).filter(([,v])=> (typeof v === 'number') && v>0)
  const total = entries.reduce((a, [,v])=> a + (v as number), 0)
  if(total === 0 || entries.length === 0){
    return <Typography variant="caption" color="text.secondary">Nessun dato</Typography>
  }
  const r = (size/2) - 6
  let startAngle = -Math.PI/2 // start at top
  return (
    <Box sx={{ display:'flex', alignItems:'center', gap:2, flexWrap:'wrap', maxWidth:'100%', overflow:'hidden' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display:'block', margin:'0 auto' }}>
        {entries.map(([k,v], idx)=>{
          const cx = size/2, cy = size/2
          const fraction = (v as number)/total
          const endAngle = startAngle + fraction * Math.PI * 2
          const x1 = cx + r * Math.cos(startAngle)
          const y1 = cy + r * Math.sin(startAngle)
          const x2 = cx + r * Math.cos(endAngle)
          const y2 = cy + r * Math.sin(endAngle)
          const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0
          const d = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ')
          const midAngle = (startAngle + endAngle)/2
          const labelR = r * 0.6
          const lx = cx + labelR * Math.cos(midAngle)
          const ly = cy + labelR * Math.sin(midAngle)
          startAngle = endAngle
          return (
            <g key={k}>
              <path d={d} fill={colors[idx % colors.length]} />
              {/* Etichette: solo conteggio, niente percentuale */}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#222"
                stroke="#fff" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents:'none' }}>
                {v as number}
              </text>
            </g>
          )
        })}
      </svg>
       <Box sx={{ display:'flex', flexDirection:'column', gap:0.5 }}>
         {entries.map(([k,v], idx)=>{
          const pct = Math.round((v/total)*100)
          return (
            <Box key={k} sx={{ display:'flex', alignItems:'center', gap:1 }}>
              <Box sx={{ width:10, height:10, bgcolor: colors[idx % colors.length], borderRadius:0.5 }} />
              <Typography variant="caption">{k}: {v} ({pct}%)</Typography>
            </Box>
          )
        })}
       </Box>
     </Box>
  )
}

// Classificazione tipo istituto in macro-tipologie
const classifyIstitutoType = (label: string, overrides?: Record<string,'Scuola'|'Università'|'ITS'|'Altro'>): 'Scuola'|'Università'|'ITS'|'Altro' => {
  const l = (label||'').toLowerCase()
  if(overrides){
    for(const [k,v] of Object.entries(overrides)){
      if(l === k.toLowerCase()) return v
    }
  }
  if(/univers|ateneo|politec/.test(l)) return 'Università'
  if(/\bits\b|istruzione tecnica superiore/.test(l)) return 'ITS'
  if(/accademia|conservatorio|afam/.test(l)) return 'Università'
  // sigle e varianti scuole
  if(/scuola|liceo|istituto|iis\b|iiss\b|it[ic]|itis|iti\b|itc\b|ipsia|ip[sa]|ips[sc]|tecnic|profession|scient|class|geomet|agrar|albergh|alberghier|artist|linguis|pedagog|magistr|commercial|ragion|geomet/.test(l)) return 'Scuola'
  return 'Altro'
}

const groupIstitutoByType = (rec: Record<string, number>, overrides?: Record<string,'Scuola'|'Università'|'ITS'|'Altro'>) => {
  const res: Record<string, Record<string, number>> = {}
  for(const [k,v] of Object.entries(rec||{})){
    const g = classifyIstitutoType(k, overrides)
    if(!res[g]) res[g] = {}
    res[g][k] = v
  }
  return res
}

// Line chart per tutte le domande Likert (1-5)
const LineChartLikert: React.FC<{ questions: SummaryResp['questions']; labelsMap: Record<string,string>; height?: number }>=({ questions, labelsMap, height=280 })=>{
  const qEntries = Object.entries(questions || {})
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const toggle = (k:string)=> setHidden(prev=>{ const next = new Set(prev); if(next.has(k)) next.delete(k); else next.add(k); return next })
  if(qEntries.length === 0) return null
  const xVals = [1,2,3,4,5]
  // Calcola massimo tra tutte le distribuzioni
  let maxY = 1
  for(const [,q] of qEntries){
    const dist = q.distribution || {}
    for(const x of xVals){
      maxY = Math.max(maxY, dist[x] || 0)
    }
  }
  const width = 880
  const left = 40, right = 12, top = 16, bottom = 28
  const w = width - left - right
  const h = height - top - bottom
  const xPos = (x:number)=> left + (xVals.indexOf(x) / (xVals.length-1)) * w
  const yPos = (y:number)=> top + (1 - (y / maxY)) * h
  const yTicks = [0, Math.round(maxY/4), Math.round(maxY/2), Math.round(3*maxY/4), maxY]
  return (
    <Box sx={{ width:'100%', overflowX:'auto' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Assi */}
        <line x1={left} y1={top} x2={left} y2={top+h} stroke="#bbb" />
        <line x1={left} y1={top+h} x2={left+w} y2={top+h} stroke="#bbb" />
        {/* Griglia Y */}
        {yTicks.map((t,i)=> (
          <g key={i}>
            <line x1={left} x2={left+w} y1={yPos(t)} y2={yPos(t)} stroke="#eee" />
            <text x={left-6} y={yPos(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#666">{t}</text>
          </g>
        ))}
        {/* Ticks X */}
        {xVals.map((x,i)=> (
          <g key={i}>
            <line x1={xPos(x)} x2={xPos(x)} y1={top+h} y2={top+h+4} stroke="#999" />
            <text x={xPos(x)} y={top+h+16} textAnchor="middle" fontSize="10" fill="#666">{x}</text>
          </g>
        ))}
        {/* Serie */}
        {qEntries.map(([k,q], idx)=>{
          const color = demoPalette[idx % demoPalette.length]
          const points = xVals.map(x=> `${xPos(x)},${yPos(q.distribution?.[x] || 0)}`).join(' ')
          const isHidden = hidden.has(k)
          return (
            <g key={k}>
              {!isHidden && (
                <>
                  <polyline fill="none" stroke={color} strokeWidth={2} points={points} />
                  {xVals.map((x,i)=> (
                    <circle key={i} cx={xPos(x)} cy={yPos(q.distribution?.[x] || 0)} r={2.5} fill={color} />
                  ))}
                </>
              )}
            </g>
          )
        })}
      </svg>
      {/* Legenda */}
      <Box sx={{ display:'flex', flexWrap:'wrap', gap:1, mt:1 }}>
        {qEntries.map(([k], idx)=> {
          const color = demoPalette[idx % demoPalette.length]
          const isHidden = hidden.has(k)
          return (
            <Box key={k}
              onClick={()=> toggle(k)}
              sx={{ display:'flex', alignItems:'center', gap:0.5, mr:1.5, cursor:'pointer', opacity: isHidden ? 0.5 : 1 }}
              title={isHidden ? 'Mostra' : 'Nascondi'}
            >
              <Box sx={{ width:14, height:0, borderTop:`2px solid ${isHidden ? '#ccc' : color}` }} />
              <Typography variant="caption" sx={{ textDecoration: isHidden ? 'line-through' : 'none' }}>{labelsMap[k] || k}</Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

const SurveyResults: React.FC = () => {
  const [data, setData] = useState<SummaryResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openAnswers, setOpenAnswers] = useState<OpenAnswerItem[]>([])
  const [filter, setFilter] = useState('')
  // Toolbar stato dinamico
  const [groupBy, setGroupBy] = useState<'none'|'eta'|'sesso'|'istruzione'|'area'>('none')
  const [question, setQuestion] = useState<string>('q_utilita')
  const [demoChart, setDemoChart] = useState<'bar'|'pie'>('bar')
  const [openAge, setOpenAge] = useState(true)
  const [openSesso, setOpenSesso] = useState(true)
  const [openIstruzione, setOpenIstruzione] = useState(true)
  const [openTipoIstituto, setOpenTipoIstituto] = useState(true)
  const [openProvenienza, setOpenProvenienza] = useState(true)
  const [openLikertLines, setOpenLikertLines] = useState(true)
  const [openDistributions, setOpenDistributions] = useState(true)
  const [openAreaStudyDemo, setOpenAreaStudyDemo] = useState(true)
  const [istitutoOverrides, setIstitutoOverrides] = useState<Record<string,'Scuola'|'Università'|'ITS'|'Altro'>>({})

  // Collapsible helper header
  const SectionHeader: React.FC<{title:string; open:boolean; onToggle: ()=>void}> = ({title, open, onToggle}) => (
    <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight:600 }}>{title}</Typography>
      <IconButton size="small" onClick={onToggle} aria-label={open? 'Comprimi' : 'Espandi'}>
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </IconButton>
    </Box>
  )

  const Zoomable: React.FC<{ title: string; small: React.ReactNode; large?: React.ReactNode }>=({ title, small, large })=>{
    const [open, setOpen] = useState(false)
    return (
      <>
        <Box sx={{ position:'relative' }}>
          <IconButton size="small" onClick={()=> setOpen(true)} aria-label={`Apri ${title} a schermo intero`} sx={{ position:'absolute', top:0, right:0 }}>
            <OpenInFullIcon fontSize="small" />
          </IconButton>
          <Box sx={{ pr:4 }}>
            {small}
          </Box>
        </Box>
        <Dialog open={open} onClose={()=> setOpen(false)} fullScreen>
          <DialogTitle sx={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <Typography variant="h6">{title}</Typography>
            <IconButton onClick={()=> setOpen(false)} aria-label="Chiudi">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ display:'flex', justifyContent:'center', alignItems:'center' }}>
            <Box sx={{ p:2, width:'100%', display:'flex', justifyContent:'center', alignItems:'center' }}>
              <Box sx={{ maxWidth:'min(1200px, 95vw)' }}>
                {large || small}
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </>
    )
  }

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
        // Carica mapping istituto (se esiste)
        try {
          const mapResp = await fetch('/istituto_mapping.json')
          if(mapResp.ok){
            const m = await mapResp.json()
            setIstitutoOverrides(m || {})
          }
        } catch { /* ignoriamo */ }
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
        <Button variant="outlined" size="small" href="/" sx={{ ml: 'auto' }}>
          Torna alla Chat
        </Button>
      </Box>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (
        <>
          {data.total === 0 && (
            <Alert severity="info" sx={{ mb:3 }}>Non ci sono ancora risposte. Torna più tardi.</Alert>
          )}
          {/* Demografia PER PRIMA */}
          {data.demographics && (
            <Paper elevation={2} sx={{ p:3, borderRadius:2, mb:4, background:'linear-gradient(135deg,#fff,#f9fbff)' }}>
              <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:2, mb:1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight:600 }}>Dati demografici</Typography>
                <ToggleButtonGroup size="small" exclusive value={demoChart} onChange={(e, val)=> val && setDemoChart(val)}>
                  <ToggleButton value="bar">Istogramma</ToggleButton>
                  <ToggleButton value="pie">Torta</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Grid container spacing={3}>
                {data.demographics.eta && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:2 }}>
                      <SectionHeader title="Distribuzione età" open={openAge} onToggle={()=> setOpenAge(v=>!v)} />
                      <Collapse in={openAge} timeout="auto" unmountOnExit>
                      <Zoomable
                        title="Distribuzione età"
                        small={(
                          <>
                            {demoChart === 'bar' ? (
                              <>
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:140 }}>
                                  {Object.entries(data.demographics.eta.bins).map(([label,count])=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.eta!.bins))
                                    const h = (count as number)/maxC*110
                                    return (
                                      <Box key={label} sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||4, bgcolor:'#90caf9', borderRadius:1 }} />
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                                <Typography variant="caption" color="text.secondary">Media: {data.demographics.eta.avg ? data.demographics.eta.avg.toFixed(1) : '-'}</Typography>
                              </>
                            ) : (
                              <PieChart data={data.demographics.eta.bins} />
                            )}
                          </>
                        )}
                        large={(
                          <>
                            {demoChart === 'bar' ? (
                              <>
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1.5, height:360 }}>
                                  {Object.entries(data.demographics.eta.bins).map(([label,count])=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.eta!.bins))
                                    const h = (count as number)/maxC*320
                                    return (
                                      <Box key={label} sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||6, bgcolor:'#90caf9', borderRadius:1 }} />
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                                <Typography variant="body2" color="text.secondary">Media: {data.demographics.eta.avg ? data.demographics.eta.avg.toFixed(1) : '-'}</Typography>
                              </>
                            ) : (
                              <PieChart data={data.demographics.eta.bins} size={440} />
                            )}
                          </>
                        )}
                      />
                      </Collapse>
                    </Paper>
                  </Grid>
                )}
                {data.demographics.sesso && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:2 }}>
                      <SectionHeader title="Sesso" open={openSesso} onToggle={()=> setOpenSesso(v=>!v)} />
                      <Collapse in={openSesso} timeout="auto" unmountOnExit>
                        <Zoomable
                          title="Sesso"
                          small={(
                            <>
                              {demoChart === 'bar' ? (
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:140 }}>
                                  {Object.entries(data.demographics.sesso).map(([label,count], idx)=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.sesso!))
                                    const h = (count as number)/maxC*110
                                    return (
                                      <Box key={label} sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||4, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                              ) : (
                                <PieChart data={data.demographics.sesso} />
                              )}
                            </>
                          )}
                          large={(
                            <>
                              {demoChart === 'bar' ? (
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1.5, height:360 }}>
                                  {Object.entries(data.demographics.sesso).map(([label,count], idx)=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.sesso!))
                                    const h = (count as number)/maxC*320
                                    return (
                                      <Box key={label} sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||6, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                              ) : (
                                <PieChart data={data.demographics.sesso} size={440} />
                              )}
                            </>
                          )}
                        />
                      </Collapse>
                    </Paper>
                  </Grid>
                )}
                {data.demographics.istruzione && (
                  <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:2 }}>
                      <SectionHeader title="Istruzione" open={openIstruzione} onToggle={()=> setOpenIstruzione(v=>!v)} />
                      <Collapse in={openIstruzione} timeout="auto" unmountOnExit>
                        <Zoomable
                          title="Istruzione"
                          small={(
                            <>
                              {demoChart === 'bar' ? (
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:140, flexWrap:'nowrap' }}>
                                  {Object.entries(data.demographics.istruzione).map(([label,count], idx)=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.istruzione!))
                                    const h = (count as number)/maxC*110
                                    return (
                                      <Box key={label} sx={{ minWidth:28, flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||4, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                        <Typography variant="caption" sx={{ fontSize:'0.7rem', textAlign:'center' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                              ) : (
                                <PieChart data={data.demographics.istruzione} />
                              )}
                            </>
                          )}
                          large={(
                            <>
                              {demoChart === 'bar' ? (
                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1.5, height:360, flexWrap:'nowrap' }}>
                                  {Object.entries(data.demographics.istruzione).map(([label,count], idx)=>{
                                    const maxC = Math.max(1, ...Object.values(data.demographics!.istruzione!))
                                    const h = (count as number)/maxC*320
                                    return (
                                      <Box key={label} sx={{ minWidth:44, flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.75 }}>
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{count as number}</Typography>
                                        <Box sx={{ width:'100%', height: h||6, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                        <Typography variant="body2" sx={{ fontSize:'0.8rem', textAlign:'center' }}>{label}</Typography>
                                      </Box>
                                    )
                                  })}
                                </Box>
                              ) : (
                                <PieChart data={data.demographics.istruzione} size={480} />
                              )}
                            </>
                          )}
                        />
                      </Collapse>
                    </Paper>
                  </Grid>
                )}
                {(data.demographics.tipo_istituto || data.demographics.provenienza) && (
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:3 }}>
                      <Typography variant="subtitle2" sx={{ mb:1, fontWeight:600 }}>Categorie più frequenti</Typography>
                      <Grid container spacing={2}>
                        {data.demographics.tipo_istituto && (
                          <Grid item xs={12} md={6}>
                            <SectionHeader title="Tipo istituto" open={openTipoIstituto} onToggle={()=> setOpenTipoIstituto(v=>!v)} />
                            <Collapse in={openTipoIstituto} timeout="auto" unmountOnExit>
                              <Zoomable
                                title="Tipo istituto"
                                small={(
                                  <>
                                    {(() => {
                                      const groups = groupIstitutoByType(data.demographics.tipo_istituto!, istitutoOverrides)
                                      const order = ['Scuola','Università','ITS','Altro']
                                      return order
                                        .filter(g => groups[g] && Object.keys(groups[g]).length > 0)
                                        .map((g, gi) => {
                                          const gEntries = Object.entries(groups[g])
                                          const maxC = Math.max(1, ...Object.values(groups[g] as Record<string, number>))
                                          return (
                                            <Box key={g} sx={{ mt: gi ? 2 : 1 }}>
                                              <Typography variant="caption" sx={{ fontWeight:600 }}>{({ Scuola:'Scuole', Università:'Università/AFAM', ITS:'ITS', Altro:'Altre tipologie' } as Record<string,string>)[g] || g}</Typography>
                                              {demoChart === 'bar' ? (
                                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:160, mt:1, overflowX:'auto', pb:1 }}>
                                                  {gEntries.map(([label,count], idx)=> {
                                                    const h = (count as number)/maxC*120
                                                    return (
                                                      <Box key={label} sx={{ minWidth:28, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                                        <Typography variant="caption" sx={{ fontSize:'0.65rem' }}>{count as number}</Typography>
                                                        <Box sx={{ width:24, height: h||4, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                                        <Typography variant="caption" sx={{ fontSize:'0.65rem', textAlign:'center' }}>{label}</Typography>
                                                      </Box>
                                                    )
                                                  })}
                                                </Box>
                                              ) : (
                                                <Box sx={{ mt:1 }}>
                                                  <PieChart data={groups[g] as Record<string, number>} />
                                                </Box>
                                              )}
                                            </Box>
                                          )
                                        })
                                    })()}
                                  </>
                                )}
                                large={(
                                  <>
                                    {(() => {
                                      const groups = groupIstitutoByType(data.demographics.tipo_istituto!, istitutoOverrides)
                                      const order = ['Scuola','Università','ITS','Altro']
                                      return order
                                        .filter(g => groups[g] && Object.keys(groups[g]).length > 0)
                                        .map((g, gi) => {
                                          const gEntries = Object.entries(groups[g])
                                          const maxC = Math.max(1, ...Object.values(groups[g] as Record<string, number>))
                                          return (
                                            <Box key={g} sx={{ mt: gi ? 3 : 1 }}>
                                              <Typography variant="subtitle2" sx={{ fontWeight:600 }}>{({ Scuola:'Scuole', Università:'Università/AFAM', ITS:'ITS', Altro:'Altre tipologie' } as Record<string,string>)[g] || g}</Typography>
                                              {demoChart === 'bar' ? (
                                                <Box sx={{ display:'flex', alignItems:'flex-end', gap:2, height:360, mt:1, overflowX:'auto', pb:1 }}>
                                                  {gEntries.map(([label,count], idx)=> {
                                                    const h = (count as number)/maxC*320
                                                    return (
                                                      <Box key={label} sx={{ minWidth:44, display:'flex', flexDirection:'column', alignItems:'center', gap:0.75 }}>
                                                        <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{count as number}</Typography>
                                                        <Box sx={{ width:32, height: h||6, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                                        <Typography variant="body2" sx={{ fontSize:'0.8rem', textAlign:'center' }}>{label}</Typography>
                                                      </Box>
                                                    )
                                                  })}
                                                </Box>
                                              ) : (
                                                <Box sx={{ mt:1 }}>
                                                  <PieChart data={groups[g] as Record<string, number>} size={480} />
                                                </Box>
                                              )}
                                            </Box>
                                          )
                                        })
                                    })()}
                                  </>
                                )}
                              />
                            </Collapse>
                          </Grid>
                        )}
                        {data.demographics.provenienza && (
                          <Grid item xs={12} md={6}>
                            <SectionHeader title="Provenienza" open={openProvenienza} onToggle={()=> setOpenProvenienza(v=>!v)} />
                            <Collapse in={openProvenienza} timeout="auto" unmountOnExit>
                            <Zoomable
                              title="Provenienza"
                              small={(
                                <>
                                  {demoChart === 'bar' ? (
                                    <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:160, mt:1, overflowX:'auto', pb:1 }}>
                                      {Object.entries(data.demographics.provenienza).map(([label,count], idx)=>{
                                        const maxC = Math.max(1, ...Object.values(data.demographics!.provenienza!))
                                        const h = (count as number)/maxC*120
                                        return (
                                          <Box key={label} sx={{ minWidth:28, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                            <Typography variant="caption" sx={{ fontSize:'0.65rem' }}>{count as number}</Typography>
                                            <Box sx={{ width:24, height: h||4, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                            <Typography variant="caption" sx={{ fontSize:'0.65rem', textAlign:'center' }}>{label}</Typography>
                                          </Box>
                                        )
                                      })}
                                    </Box>
                                  ) : (
                                    <Box sx={{ mt:1 }}>
                                      <PieChart data={data.demographics.provenienza} />
                                    </Box>
                                  )}
                                </>
                              )}
                              large={(
                                <>
                                  {demoChart === 'bar' ? (
                                    <Box sx={{ display:'flex', alignItems:'flex-end', gap:2, height:360, mt:1, overflowX:'auto', pb:1 }}>
                                      {Object.entries(data.demographics.provenienza).map(([label,count], idx)=>{
                                        const maxC = Math.max(1, ...Object.values(data.demographics!.provenienza!))
                                        const h = (count as number)/maxC*320
                                        return (
                                          <Box key={label} sx={{ minWidth:44, display:'flex', flexDirection:'column', alignItems:'center', gap:0.75 }}>
                                            <Typography variant="body2" sx={{ fontSize:'0.8rem' }}>{count as number}</Typography>
                                            <Box sx={{ width:32, height: h||6, bgcolor: demoPalette[idx % demoPalette.length], borderRadius:1 }} />
                                            <Typography variant="body2" sx={{ fontSize:'0.8rem', textAlign:'center' }}>{label}</Typography>
                                          </Box>
                                        )
                                      })}
                                    </Box>
                                  ) : (
                                    <Box sx={{ mt:1 }}>
                                      <PieChart data={data.demographics.provenienza} size={480} />
                                    </Box>
                                  )}
                                </>
                              )}
                            />
                            </Collapse>
                          </Grid>
                        )}
                      </Grid>
                    </Paper>
                  </Grid>
                )}
                {/* Mini grafico STEM/Umanistiche per la domanda selezionata */}
                {data.demographics.by_area && (
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:3 }}>
                      <SectionHeader title={`Area di studio (STEM/Umanistiche) – ${labels[question] || question}`} open={openAreaStudyDemo} onToggle={()=> setOpenAreaStudyDemo(v=>!v)} />
                      <Collapse in={openAreaStudyDemo} timeout="auto" unmountOnExit>
                        <Zoomable
                          title={`Area di studio – ${labels[question] || question}`}
                          small={(() => {
                            const stem = data.demographics!.by_area!.STEM?.[question] ?? 0
                            const hum = data.demographics!.by_area!.Umanistiche?.[question] ?? 0
                            const maxV = Math.max(1, stem, hum)
                            return (
                              <Box sx={{ display:'flex', alignItems:'flex-end', gap:2, height:160, mt:1 }}>
                                {[['STEM', stem], ['Umanistiche', hum]].map(([lab,val], idx)=> (
                                  <Box key={lab as string} sx={{ minWidth:80, flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                                    <Typography variant="caption" sx={{ fontSize:'0.75rem' }}>{(val as number) ? (val as number).toFixed(2) : '-'}</Typography>
                                    <Box sx={{ width:'100%', height: `${((val as number)/maxV)*120}px`, bgcolor: demoPalette[idx], borderRadius:1 }} />
                                    <Typography variant="caption" sx={{ fontSize:'0.75rem' }}>{lab as string}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )
                          })()}
                          large={(() => {
                            const stem = data.demographics!.by_area!.STEM?.[question] ?? 0
                            const hum = data.demographics!.by_area!.Umanistiche?.[question] ?? 0
                            const maxV = Math.max(1, stem, hum)
                            return (
                              <Box sx={{ display:'flex', alignItems:'flex-end', gap:5, height:360, mt:1 }}>
                                {[['STEM', stem], ['Umanistiche', hum]].map(([lab,val], idx)=> (
                                  <Box key={lab as string} sx={{ minWidth:140, flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                                    <Typography variant="body2" sx={{ fontSize:'0.9rem' }}>{(val as number) ? (val as number).toFixed(2) : '-'}</Typography>
                                    <Box sx={{ width:'100%', height: `${((val as number)/maxV)*300}px`, bgcolor: demoPalette[idx], borderRadius:1 }} />
                                    <Typography variant="body2" sx={{ fontSize:'0.9rem' }}>{lab as string}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )
                          })()}
                        />
                      </Collapse>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </Paper>
          )}

          {/* Toolbar dinamica per viste */}
          <Paper variant="outlined" sx={{ mb:3, p:2, borderRadius:2 }}>
            <Box sx={{ display:'flex', flexWrap:'wrap', gap:2, alignItems:'center' }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Raggruppa per</InputLabel>
                <Select label="Raggruppa per" value={groupBy} onChange={(e)=> setGroupBy(e.target.value as any)}>
                  <MenuItem value="none">Nessuno</MenuItem>
                  <MenuItem value="eta">Età</MenuItem>
                  <MenuItem value="sesso">Sesso</MenuItem>
                  <MenuItem value="istruzione">Istruzione</MenuItem>
                  <MenuItem value="area">Area (STEM/Umanistiche)</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Domanda</InputLabel>
                <Select label="Domanda" value={question} onChange={(e)=> setQuestion(e.target.value)}>
                  {Object.keys(data.questions).map(k=> (
                    <MenuItem key={k} value={k}>{labels[k] || k}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Vista dinamica: medie per gruppo e domanda selezionata */}
          {groupBy !== 'none' && (
            <Paper elevation={2} sx={{ p:3, borderRadius:2, mb:4 }}>
              <Typography variant="subtitle1" sx={{ fontWeight:600, mb:2 }}>Media per {groupBy} – {labels[question] || question}</Typography>
              <Box sx={{ display:'flex', alignItems:'flex-end', gap:1, height:160 }}>
                {(() => {
                  let entries: [string, number|undefined][] = []
                  if(groupBy === 'eta') {
                    entries = Object.entries(data.correlations?.by_age_bins || {}).map(([k,v])=> [k, v?.[question] as number])
                  } else if(groupBy === 'sesso') {
                    entries = Object.entries(data.correlations?.by_sesso || {}).map(([k,v])=> [k, v?.[question] as number])
                  } else if(groupBy === 'istruzione') {
                    entries = Object.entries(data.correlations?.by_istruzione || {}).map(([k,v])=> [k, v?.[question] as number])
                  } else if(groupBy === 'area') {
                    entries = Object.entries(data.demographics?.by_area || {}).map(([k,v])=> [k, v?.[question] as number])
                  }
                  const maxVal = Math.max(1, ...entries.map(([,val])=> (val||0)))
                  return entries.map(([label,val], idx)=> (
                    <Tooltip key={label} title={`${label}: ${val? val.toFixed(2) : '-'}`}>
                      <Box sx={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0.5 }}>
                        <Box sx={{ width:'100%', height: `${(val? val/maxVal : 0)*120}px`, bgcolor:'#64b5f6', borderRadius:1 }} />
                        <Typography variant="caption" sx={{ fontSize:'0.7rem' }}>{label}</Typography>
                      </Box>
                    </Tooltip>
                  ))
                })()}
              </Box>
            </Paper>
          )}

          {/* Grafico a linee per tutte le domande Likert */}
          <Paper elevation={2} sx={{ p:3, borderRadius:2, mb:4 }}>
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight:600 }}>Grafico a linee (Likert 1–5)</Typography>
              <IconButton size="small" onClick={()=> setOpenLikertLines(v=>!v)}>
                {openLikertLines ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            <Collapse in={openLikertLines} timeout="auto" unmountOnExit>
              <LineChartLikert questions={data.questions} labelsMap={labels} />
            </Collapse>
          </Paper>

          {/* Sezione distribuzioni */}
          <Paper elevation={3} sx={{ mb:4, p:3, borderRadius:2, background:'linear-gradient(135deg,#e3f2fd 0%, #e8f5e9 100%)' }}>
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight:600, display:'flex', alignItems:'center', gap:1 }}>
                Andamento risposte (1–5)
              </Typography>
              <IconButton size="small" onClick={()=> setOpenDistributions(v=>!v)}>
                {openDistributions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            <Collapse in={openDistributions} timeout="auto" unmountOnExit>
            <Grid container spacing={3}>
              {Object.entries(data.questions).map(([k,v])=>{
                const dist = v.distribution || {}
                const maxC = Math.max(1, ...Object.values(dist))
                const palette = ['#e57373','#ffb74d','#64b5f6','#4db6ac','#9575cd']
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={k}>
                    <Paper variant="outlined" sx={{ p:2, borderRadius:2, bgcolor:'#ffffffcc', backdropFilter:'blur(4px)' }}>
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
            </Collapse>
          </Paper>

          {/* Tabella riepilogo (con media, deviazione standard, mediana) */}
          <Paper variant="outlined" sx={{ mb:4, borderRadius:2, overflow:'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor:'#1976d2' }}>
                  <TableCell sx={{ color:'#fff', fontWeight:600 }}>Domanda</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Media</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Dev.Std</TableCell>
                  <TableCell align="right" sx={{ color:'#fff', fontWeight:600 }}>Mediana</TableCell>
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
                    <TableCell align="right">{v.std !== undefined && v.std !== null ? v.std.toFixed(2) : '-'}</TableCell>
                    <TableCell align="right">{v.median !== undefined && v.median !== null ? Number(v.median).toFixed(2) : '-'}</TableCell>
                    <TableCell align="right">{v.count}</TableCell>
                    <TableCell align="right">{v.min ?? '-'}</TableCell>
                    <TableCell align="right">{v.max ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          
          {/* Risposte aperte */}
          <Paper elevation={2} sx={{ p:3, borderRadius:2, background:'linear-gradient(135deg,#fafafa,#f0f4ff)' }}>
            <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:2, mb:2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight:600 }}>Risposte aperte</Typography>
              <TextField size="small" placeholder="Cerca testo..." value={filter} onChange={e=> setFilter(e.target.value)} sx={{ maxWidth:280 }} />
            </Box>
            <Divider sx={{ mb:2 }} />
            <Box sx={{ display:'flex', flexDirection:'column', gap:1.5, maxHeight:420, overflowY:'auto', pr:1 }}>
              {openAnswers
                .filter(a=> !filter || a.text.toLowerCase().includes(filter.toLowerCase()))
                .map((a,i)=>(
                  <Paper key={i} variant="outlined" sx={{ p:1.5, borderRadius:2, background:'#fff', position:'relative' }}>
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
