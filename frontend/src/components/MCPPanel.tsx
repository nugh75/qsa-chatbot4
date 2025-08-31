import React, { useEffect, useState, useCallback } from 'react'
import { 
  Stack, Paper, Typography, Button, TextField, IconButton, Dialog, DialogTitle, 
  DialogContent, DialogActions, Tooltip, LinearProgress, Alert, FormControl, 
  InputLabel, Select, MenuItem, Switch, FormControlLabel, Box, Chip
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { authFetch, BACKEND } from '../utils/authFetch'

interface MCPServer {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  capabilities: string[]
}

const MCPPanel: React.FC = () => {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MCPServer | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Form fields
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [capabilities, setCapabilities] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/mcp-servers`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setServers(data.servers || [])
        }
      }
    } catch (e) {
      setErr('Errore caricamento server MCP')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditing(null)
    setId('')
    setName('')
    setDescription('')
    setCommand('npx')
    setArgs('')
    setEnv('')
    setEnabled(true)
    setCapabilities('')
    setDialogOpen(true)
  }

  const openEdit = (server: MCPServer) => {
    setEditing(server)
    setId(server.id)
    setName(server.name)
    setDescription(server.description)
    setCommand(server.command)
    setArgs(server.args.join(' '))
    setEnv(Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n'))
    setEnabled(server.enabled)
    setCapabilities(server.capabilities.join(', '))
    setDialogOpen(true)
  }

  const save = async () => {
    if (!id.trim() || !name.trim() || !command.trim()) {
      setErr('ID, Nome e Comando sono obbligatori')
      return
    }

    setSaving(true)
    setErr(null)
    
    try {
      const envObj: Record<string, string> = {}
      if (env.trim()) {
        env.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=')
          if (key && valueParts.length > 0) {
            envObj[key.trim()] = valueParts.join('=').trim()
          }
        })
      }

      const serverData: MCPServer = {
        id: id.trim(),
        name: name.trim(),
        description: description.trim(),
        command: command.trim(),
        args: args.trim().split(' ').filter(Boolean),
        env: envObj,
        enabled,
        capabilities: capabilities.split(',').map(c => c.trim()).filter(Boolean)
      }

      const url = editing 
        ? `${BACKEND}/api/admin/mcp-servers/${editing.id}`
        : `${BACKEND}/api/admin/mcp-servers`
      
      const method = editing ? 'PUT' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverData)
      })

      if (res.ok) {
        setMsg(editing ? 'Server aggiornato' : 'Server creato')
        setDialogOpen(false)
        load()
      } else {
        const data = await res.json()
        setErr(data.detail || 'Errore salvataggio')
      }
    } catch (e) {
      setErr('Errore rete')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (serverId: string) => {
    if (!confirm('Eliminare questo server MCP?')) return
    
    try {
      const res = await authFetch(`${BACKEND}/api/admin/mcp-servers/${serverId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setMsg('Server eliminato')
        load()
      }
    } catch (e) {
      setErr('Errore eliminazione')
    }
  }

  const testConnection = async (serverId: string) => {
    setTesting(serverId)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/mcp-servers/${serverId}/test`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        setMsg(`Test ${serverId}: ${data.message}`)
      } else {
        setErr(`Test ${serverId} fallito: ${data.error}`)
      }
    } catch (e) {
      setErr('Errore test connessione')
    } finally {
      setTesting(null)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle1" sx={{ flex: 1 }}>Server MCP</Typography>
        <IconButton size="small" onClick={load}>
          <RefreshIcon fontSize="small" />
        </IconButton>
        <Button size="small" startIcon={<AddIcon />} onClick={openNew}>
          Nuovo Server
        </Button>
      </Stack>
      
      {loading && <LinearProgress sx={{ my: 1 }} />}
      
      <Stack spacing={2} sx={{ mt: 2 }}>
        {servers.map(server => (
          <Paper key={server.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <Stack sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {server.name}
                  </Typography>
                  {!server.enabled && <Chip size="small" color="warning" label="disabilitato" />}
                </Stack>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {server.description}
                </Typography>
                
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Comando:</strong> {server.command} {server.args.join(' ')}
                </Typography>
                
                {server.capabilities.length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      <strong>Capabilities:</strong>
                    </Typography>
                    {server.capabilities.map(cap => (
                      <Chip key={cap} size="small" label={cap} variant="outlined" />
                    ))}
                  </Stack>
                )}
              </Stack>
              
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Test connessione">
                  <IconButton 
                    size="small" 
                    onClick={() => testConnection(server.id)}
                    disabled={testing === server.id}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Modifica">
                  <IconButton size="small" onClick={() => openEdit(server)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Elimina">
                  <IconButton size="small" onClick={() => remove(server.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>
        ))}
        
        {!loading && servers.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Nessun server MCP configurato.
          </Typography>
        )}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {editing ? 'Modifica Server MCP' : 'Nuovo Server MCP'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ID"
              value={id}
              onChange={e => setId(e.target.value)}
              fullWidth
              size="small"
              disabled={!!editing}
              placeholder="es. email_server"
            />
            <TextField
              label="Nome"
              value={name}
              onChange={e => setName(e.target.value)}
              fullWidth
              size="small"
              placeholder="es. Email MCP Server"
            />
            <TextField
              label="Descrizione"
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Descrizione del server e delle sue funzionalità"
            />
            <TextField
              label="Comando"
              value={command}
              onChange={e => setCommand(e.target.value)}
              fullWidth
              size="small"
              placeholder="es. npx"
            />
            <TextField
              label="Argomenti"
              value={args}
              onChange={e => setArgs(e.target.value)}
              fullWidth
              size="small"
              placeholder="es. @modelcontextprotocol/server-email"
            />
            <TextField
              label="Variabili d'ambiente"
              value={env}
              onChange={e => setEnv(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={4}
              placeholder="Una per riga: CHIAVE=valore"
            />
            <TextField
              label="Capabilities"
              value={capabilities}
              onChange={e => setCapabilities(e.target.value)}
              fullWidth
              size="small"
              placeholder="es. email, send_message (separati da virgola)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />
              }
              label="Abilitato"
            />
            {err && <Alert severity="error" onClose={() => setErr(null)}>{err}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button 
            disabled={saving} 
            variant="contained" 
            onClick={save}
          >
            {saving ? 'Salvo...' : 'Salva'}
          </Button>
        </DialogActions>
      </Dialog>

      {msg && <Alert severity="success" onClose={() => setMsg(null)} sx={{ mt: 1 }}>{msg}</Alert>}
    </Paper>
  )
}

export default MCPPanel
