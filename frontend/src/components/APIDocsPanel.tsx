import React, { useEffect, useState, useMemo } from 'react'
import { Paper, Typography, Stack, Chip, Accordion, AccordionSummary, AccordionDetails, LinearProgress, Alert, Box, TextField, Tooltip, IconButton, Button } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { authFetch, BACKEND } from '../utils/authFetch'

interface OpenAPISpec { paths?: Record<string, any>; info?: { title?: string; version?: string } }

interface EndpointEntry { method: string; path: string; summary?: string; deprecated?: boolean; tag: string }

const APIDocsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [endpoints, setEndpoints] = useState<EndpointEntry[]>([])
  const [filter, setFilter] = useState('')
  const [archText, setArchText] = useState<string | null>(null)

  const loadSpec = async () => {
    setLoading(true)
    setError(null)
    try {
      const candidates = [
        `${BACKEND}/api/openapi.json`,
        `${BACKEND}/openapi.json`,
        '/api/openapi.json',
        '/openapi.json'
      ]
      let spec: OpenAPISpec | null = null
      let lastStatus: number | undefined
      let lastBody: string | undefined
      for (const url of candidates) {
        try {
          const res = await authFetch(url)
          lastStatus = res.status
          if (!res.ok) continue
          const text = await res.text()
          lastBody = text
          if (text.trim().startsWith('<')) continue // HTML page, not JSON
          try {
            spec = JSON.parse(text)
            break
          } catch {
            continue
          }
        } catch {
          continue
        }
      }
      if (!spec) throw new Error(`openapi.json non trovato (ultimo status ${lastStatus}). Snippet: ${(lastBody||'').slice(0,60)}`)
      const list: EndpointEntry[] = []
      const paths = spec.paths || {}
      for (const p of Object.keys(paths)) {
        const ops = paths[p]
        for (const m of Object.keys(ops)) {
          const op = ops[m]
          list.push({
            method: m.toUpperCase(),
            path: p,
            summary: op.summary || op.operationId,
            deprecated: !!op.deprecated,
            tag: (op.tags && op.tags[0]) || 'untagged'
          })
        }
      }
      list.sort((a,b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
      setEndpoints(list)
    } catch (e:any) {
      setError(e.message)
    } finally { setLoading(false) }

    try {
      const resArch = await fetch('/ARCHITECTURE.md')
      if (resArch.ok) {
        const txt = await resArch.text()
        setArchText(txt)
      }
    } catch {/* ignore */}
  }

  useEffect(() => { loadSpec() }, [])

  const filtered = useMemo(() => {
    if (!filter) return endpoints
    const f = filter.toLowerCase()
    return endpoints.filter(e => e.path.toLowerCase().includes(f) || e.method.toLowerCase().includes(f) || (e.summary||'').toLowerCase().includes(f) || e.tag.toLowerCase().includes(f))
  }, [filter, endpoints])

  const byTag = useMemo(() => {
    const map: Record<string, EndpointEntry[]> = {}
    for (const e of filtered) {
      map[e.tag] = map[e.tag] || []
      map[e.tag].push(e)
    }
    return map
  }, [filtered])

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <TextField size="small" label="Filtro" value={filter} onChange={e=>setFilter(e.target.value)} InputProps={{ endAdornment: <FilterListIcon fontSize='small' /> }} />
      {loading && <LinearProgress />}
  {error && <Alert severity='error' action={<Button color='inherit' size='small' onClick={loadSpec}>Riprova</Button>}>Errore caricamento OpenAPI: {error}</Alert>}
      {!loading && !error && Object.keys(byTag).map(tag => (
        <Paper key={tag} variant='outlined' sx={{ p:1.2 }}>
          <Typography variant='subtitle2' sx={{ mb: .5 }}>{tag}</Typography>
          <Stack spacing={0.4}>
            {byTag[tag].map(ep => (
              <Box key={ep.method+ep.path} sx={{ display:'flex', gap:1, alignItems:'center', fontSize:13, p:0.5, border:'1px solid #eee', borderRadius:1 }}>
                <Chip size='small' label={ep.method} color={ep.method==='GET'?'primary': ep.method==='POST'?'success': ep.method==='DELETE'?'error':'default'} sx={{ minWidth:64 }} />
                <code style={{ fontFamily:'monospace', fontSize:12 }}>{ep.path}</code>
                {ep.deprecated && <Chip size='small' color='warning' label='deprecated' />}
                <span style={{ flex:1, opacity:.8 }}>{ep.summary}</span>
              </Box>
            ))}
          </Stack>
        </Paper>
      ))}
      {archText && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
            <Stack direction='row' spacing={1} alignItems='center'>
              <Typography variant='subtitle2'>Note architetturali (possibilmente obsolete)</Typography>
              <Tooltip title='Il contenuto di ARCHITECTURE.md potrebbe non riflettere lo stato attuale del codice'>
                <WarningAmberIcon fontSize='small' color='warning' />
              </Tooltip>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Box component='pre' sx={{ whiteSpace:'pre-wrap', fontSize:12, maxHeight:300, overflow:'auto', m:0 }}>{archText}</Box>
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  )
}

export default APIDocsPanel
