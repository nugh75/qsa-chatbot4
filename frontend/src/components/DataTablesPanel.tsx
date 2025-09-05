import React, { useEffect, useMemo, useState } from 'react'
import { authFetch, BACKEND } from '../utils/authFetch'
import {
  Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, MenuItem
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'

type DataTableMeta = {
  id: string
  name: string
  title: string
  description?: string
  original_filename?: string
  file_format?: string
  row_count?: number
}

const DataTablesPanel: React.FC = () => {
  const [tables, setTables] = useState<DataTableMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File|null>(null)
  const [error, setError] = useState<string|null>(null)
  // Selected table + rows
  const [selectedId, setSelectedId] = useState<string|undefined>(undefined)
  const [selectedMeta, setSelectedMeta] = useState<any|null>(null)
  const [dtColumns, setDtColumns] = useState<string[]>([])
  const [dtRows, setDtRows] = useState<{ id: string; data: Record<string, any> }[]>([])
  const [dtLimit, setDtLimit] = useState<number>(100)
  const [dtLoading, setDtLoading] = useState<boolean>(false)
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; col: string }|null>(null)
  const [editValue, setEditValue] = useState<string>('')
  // Agent settings
  const [providers, setProviders] = useState<string[]>([])
  const [agentEnabled, setAgentEnabled] = useState<boolean>(true)
  const [agentProvider, setAgentProvider] = useState<string>('openrouter')
  const [agentModel, setAgentModel] = useState<string>('')
  const [agentModels, setAgentModels] = useState<string[]>([])
  const [agentTemp, setAgentTemp] = useState<number>(0.2)
  const [agentLimit, setAgentLimit] = useState<number>(8)
  const [savingSettings, setSavingSettings] = useState<boolean>(false)
  const [testQ, setTestQ] = useState<string>('Quali lezioni di settembre?')
  const [testing, setTesting] = useState<boolean>(false)
  const [testAnswer, setTestAnswer] = useState<string>('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/data-tables`)
      const data = await res.json()
      if (data?.success) setTables(data.tables || [])
      else setError(data?.error || 'Errore caricamento tabelle')
    } catch (e:any) {
      setError(e?.message || 'Errore caricamento')
    } finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  const loadTable = async (id: string, limit: number = dtLimit) => {
    setDtLoading(true)
    try {
      const res = await authFetch(`${BACKEND}/api/data-tables/${id}?limit=${limit}`)
      const data = await res.json()
      if (data?.success) {
        setSelectedId(id)
        setSelectedMeta(data.table)
        const cols: string[] = Array.isArray(data.table?.columns) ? data.table.columns : []
        setDtColumns(cols)
        const rows = (data.rows || []).map((r:any) => ({ id: r.id, data: r.data || {} }))
        setDtRows(rows)
      } else {
        setError(data?.error || 'Errore caricamento tabella')
      }
    } catch (e:any) {
      setError(e?.message || 'Errore caricamento tabella')
    } finally {
      setDtLoading(false)
    }
  }

  const flatRow = (row: { id: string; data: Record<string, any> }) => {
    const out: Record<string, any> = { _id: row.id }
    dtColumns.forEach(c => { out[c] = row.data?.[c] ?? '' })
    return out
  }

  const startEditCell = (rowIndex: number, col: string) => {
    const row = dtRows[rowIndex]
    setEditingCell({ rowIndex, col })
    setEditValue(String((row?.data || {})[col] ?? ''))
  }

  const commitEditCell = async () => {
    if (!editingCell || !selectedId) return
    const { rowIndex, col } = editingCell
    const row = dtRows[rowIndex]
    if (!row) { setEditingCell(null); return }
    const newData = { ...(row.data || {}), [col]: editValue }
    try {
      const r = await authFetch(`${BACKEND}/api/data-tables/${selectedId}/rows/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: newData })
      })
      const j = await r.json()
      if (j?.success) {
        const next = [...dtRows]
        next[rowIndex] = { ...row, data: newData }
        setDtRows(next)
        setEditingCell(null)
      } else {
        setError(j?.error || 'Errore aggiornamento cella')
      }
    } catch (e:any) {
      setError(e?.message || 'Errore aggiornamento cella')
    }
  }

  const cancelEditCell = () => { setEditingCell(null); setEditValue('') }

  // Load agent settings + provider list
  useEffect(()=>{
    (async()=>{
      try {
        const [cfgRes, stRes] = await Promise.all([
          authFetch(`${BACKEND}/api/admin/config`),
          authFetch(`${BACKEND}/api/admin/data-tables/settings`)
        ])
        if (cfgRes.ok) {
          const cfg = await cfgRes.json()
          const names = Object.keys(cfg.ai_providers || {})
          setProviders(names)
          if (!names.includes(agentProvider) && names.length) setAgentProvider(names[0])
        }
        if (stRes.ok) {
          const data = await stRes.json()
          const s = data.settings || {}
          setAgentEnabled(!!s.enabled)
          if (s.provider) setAgentProvider(s.provider)
          if (typeof s.temperature === 'number') setAgentTemp(s.temperature)
          if (typeof s.limit_per_table === 'number') setAgentLimit(s.limit_per_table)
          if (s.model) setAgentModel(s.model)
        }
      } catch {/* ignore */}
    })()
  },[])

  // Fetch models for selected provider
  useEffect(()=>{
    (async()=>{
      if (!agentProvider) { setAgentModels([]); return }
      try {
        const r = await authFetch(`${BACKEND}/api/admin/provider-models/${agentProvider}`)
        const data = await r.json()
        const list: string[] = data.models || []
        setAgentModels(list)
        if (list.length && (!agentModel || !list.includes(agentModel))) setAgentModel(list[0])
      } catch { setAgentModels([]) }
    })()
  }, [agentProvider])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const r = await authFetch(`${BACKEND}/api/admin/data-tables/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: agentEnabled, provider: agentProvider, model: agentModel || null, temperature: agentTemp, limit_per_table: agentLimit })
      })
      const data = await r.json()
      if (!data?.success) setError(data?.error || 'Errore salvataggio impostazioni')
    } catch (e:any) { setError(e?.message || 'Errore salvataggio impostazioni') }
    setSavingSettings(false)
  }

  const runTest = async () => {
    setTesting(true); setTestAnswer('')
    try {
      const r = await authFetch(`${BACKEND}/api/admin/data-tables/agent-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: testQ }) })
      const data = await r.json()
      if (data?.success) setTestAnswer(data.answer || '(nessuna risposta)')
      else setError(data?.error || 'Test fallito')
    } catch (e:any) { setError(e?.message || 'Errore test') }
    setTesting(false)
  }

  const onUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (title) fd.append('title', title)
      if (description) fd.append('description', description)
      const res = await authFetch(`${BACKEND}/api/data-tables/upload`, { method:'POST', body: fd })
      const data = await res.json()
      if (data?.success) {
        setTitle(''); setDescription(''); setFile(null)
        load()
      } else setError(data?.error || 'Errore upload')
    } catch (e:any) { setError(e?.message || 'Errore upload') } finally { setUploading(false) }
  }

  const onDelete = async (id: string) => {
    if (!confirm('Eliminare la tabella?')) return
    try {
      const res = await authFetch(`${BACKEND}/api/data-tables/${id}`, { method:'DELETE' })
      const data = await res.json()
      if (data?.success) load()
    } catch {/* noop */}
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Tabelle dati (CSV/XLSX)</Typography>
        {/* Agent settings */}
        <Paper variant="outlined" sx={{ p:1.5, mb:2 }}>
          <Typography variant="subtitle1" gutterBottom>Sottoagente AI per tabelle</Typography>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'flex-end' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={agentEnabled ? 'abilitato' : 'disabilitato'} color={agentEnabled? 'success':'default'} />
              <Button size="small" variant="outlined" onClick={()=> setAgentEnabled(v=> !v)}>{agentEnabled? 'Disabilita':'Abilita'}</Button>
            </Stack>
            <TextField select size="small" label="Provider" value={agentProvider} onChange={e=> setAgentProvider(e.target.value)} sx={{ minWidth: 160 }}>
              {providers.map(p=> <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            {agentModels.length ? (
              <TextField select size="small" label="Modello" value={agentModel} onChange={e=> setAgentModel(e.target.value)} sx={{ minWidth: 260 }}>
                {agentModels.map(m=> <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            ) : (
              <TextField size="small" label="Modello (manuale)" value={agentModel} onChange={e=> setAgentModel(e.target.value)} sx={{ minWidth: 260 }} />
            )}
            <TextField size="small" label="Temperatura" type="number" value={agentTemp} onChange={e=> setAgentTemp(parseFloat(e.target.value))} sx={{ width: 120 }} />
            <TextField size="small" label="Righe per tabella" type="number" value={agentLimit} onChange={e=> setAgentLimit(parseInt(e.target.value||'8'))} sx={{ width: 160 }} />
            <Button size="small" variant="contained" onClick={saveSettings} disabled={savingSettings}>Salva impostazioni</Button>
          </Stack>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'flex-end' }} sx={{ mt:1 }}>
            <TextField size="small" fullWidth label="Domanda di test" value={testQ} onChange={e=> setTestQ(e.target.value)} />
            <Button size="small" variant="outlined" onClick={runTest} disabled={testing || !testQ.trim()}>Prova subagente</Button>
          </Stack>
          {testing && <LinearProgress sx={{ mt:1 }} />}
          {testAnswer && (
            <Paper variant="outlined" sx={{ mt:1, p:1, bgcolor:'#fafafa' }}>
              <Typography variant="subtitle2">Risposta subagente</Typography>
              <Box component="pre" sx={{ whiteSpace:'pre-wrap', fontSize: 13 }}>{testAnswer}</Box>
            </Paper>
          )}
        </Paper>
        <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ sm:'flex-end' }}>
          <TextField label="Titolo" value={title} onChange={e=> setTitle(e.target.value)} size="small" sx={{ minWidth: 200 }} />
          <TextField label="Descrizione" value={description} onChange={e=> setDescription(e.target.value)} size="small" sx={{ minWidth: 300 }} />
          <Button variant="outlined" component="label" size="small">
            Scegli file
            <input type="file" hidden onChange={e => setFile(e.target.files?.[0] || null)} />
          </Button>
          {file && <Chip size="small" label={file.name} onDelete={()=> setFile(null)} />}
          <Button variant="contained" size="small" onClick={onUpload} disabled={!file || uploading}>Carica</Button>
          <IconButton onClick={load} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
        </Stack>
        {(uploading || loading) && <LinearProgress sx={{ mt:1 }} />}
        {error && <Typography color="error" variant="body2" sx={{ mt:1 }}>{error}</Typography>}

        <Divider sx={{ my:2 }} />

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Titolo</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Righe</TableCell>
              <TableCell>File</TableCell>
              <TableCell align="right">Azioni</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tables.map(t => (
              <TableRow key={t.id} hover sx={{ cursor:'pointer' }} onClick={()=> loadTable(t.id)} selected={selectedId===t.id}>
                <TableCell>{t.title}</TableCell>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.row_count || 0}</TableCell>
                <TableCell>{t.original_filename}</TableCell>
                <TableCell align="right">
                  <IconButton href={`${BACKEND}/api/data-tables/${t.id}/download?format=csv`} title="Scarica CSV"><DownloadIcon fontSize="small" /></IconButton>
                  <IconButton href={`${BACKEND}/api/data-tables/${t.id}/download?format=xlsx`} title="Scarica XLSX"><DownloadIcon fontSize="small" /></IconButton>
                  <IconButton onClick={()=> onDelete(t.id)} title="Elimina"><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {tables.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary">Nessuna tabella caricata</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Selected table viewer (Excel-style editing) */}
        {selectedId && (
          <Box sx={{ mt:2 }}>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems={{ sm:'center' }} justifyContent="space-between" sx={{ mb:1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">Tabella:</Typography>
                <Chip size="small" label={selectedMeta?.title || selectedMeta?.name || selectedId} />
                <Chip size="small" label={`${dtRows.length} righe`} />
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="number" label="Limite" value={dtLimit} onChange={e=> setDtLimit(parseInt(e.target.value||'100'))} sx={{ width: 120 }} />
                <Button size="small" variant="outlined" onClick={()=> selectedId && loadTable(selectedId, dtLimit)} disabled={dtLoading}>Ricarica</Button>
              </Stack>
            </Stack>
            {dtLoading && <LinearProgress sx={{ mb:1 }} />}
            <Paper variant="outlined">
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {dtColumns.map(c => (
                      <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontWeight:600 }}>Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dtRows.map((r, rIdx) => {
                    const flat = flatRow(r)
                    return (
                      <TableRow key={r.id} hover>
                        {dtColumns.map(col => (
                          <TableCell key={`${r.id}-${col}`} onDoubleClick={()=> startEditCell(rIdx, col)} sx={{ cursor:'text' }}>
                            {editingCell && editingCell.rowIndex===rIdx && editingCell.col===col ? (
                              <TextField
                                size="small"
                                autoFocus
                                value={editValue}
                                onChange={e=> setEditValue(e.target.value)}
                                onBlur={commitEditCell}
                                onKeyDown={(e)=> {
                                  if (e.key==='Enter') { e.preventDefault(); commitEditCell() }
                                  if (e.key==='Escape') { e.preventDefault(); cancelEditCell() }
                                }}
                              />
                            ) : (
                              <Typography variant="body2" sx={{ whiteSpace:'pre-wrap' }}>{String(flat[col] ?? '')}</Typography>
                            )}
                          </TableCell>
                        ))}
                        <TableCell align="right">
                          <IconButton size="small" color="error" onClick={async()=>{
                            try {
                              const rr = await authFetch(`${BACKEND}/api/data-tables/${selectedId}/rows/${r.id}`, { method: 'DELETE' })
                              const j = await rr.json()
                              if (j?.success) setDtRows(rows => rows.filter(x => x.id !== r.id))
                            } catch {/* ignore */}
                          }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {dtRows.length === 0 && (
                    <TableRow><TableCell colSpan={(dtColumns.length||0)+1}><Typography variant="body2" color="text.secondary">Nessun dato</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
            <Stack direction="row" spacing={1} sx={{ mt:1 }}>
              <Button size="small" startIcon={<RefreshIcon />} onClick={()=> selectedId && loadTable(selectedId, dtLimit)} disabled={dtLoading}>Aggiorna</Button>
              <Button size="small" variant="outlined" onClick={async()=>{
                if (!selectedId) return
                const empty: Record<string, any> = {}
                dtColumns.forEach(c => { empty[c] = '' })
                try {
                  const r = await authFetch(`${BACKEND}/api/data-tables/${selectedId}/rows`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [empty] })
                  })
                  const j = await r.json()
                  if (j?.success) loadTable(selectedId, dtLimit)
                } catch {/* ignore */}
              }}>Aggiungi riga</Button>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

export default DataTablesPanel
