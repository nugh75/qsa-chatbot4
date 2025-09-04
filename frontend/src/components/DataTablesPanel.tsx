import React, { useEffect, useState } from 'react'
import { authFetch, BACKEND } from '../utils/authFetch'
import {
  Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
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
              <TableRow key={t.id}>
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
      </CardContent>
    </Card>
  )
}

export default DataTablesPanel

