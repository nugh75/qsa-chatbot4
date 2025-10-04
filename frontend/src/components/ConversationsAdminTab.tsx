import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  TextField,
  Button,
  Stack,
  Pagination,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Card,
  CardContent,
  Divider
} from '@mui/material'
import {
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Psychology as AIIcon,
  Message as MessageIcon
} from '@mui/icons-material'
import { authFetch } from '../utils/authFetch'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

interface UserInfo {
  id: number
  email: string
  username?: string
  is_admin: boolean
}

interface Conversation {
  id: string
  user_id: number
  user_email?: string
  username?: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  personality_id?: string
  personality_name?: string
  device_id?: string
}

interface Message {
  id: string
  role: string
  content: string
  timestamp: string
  token_count: number
  processing_time: number
}

interface ConversationDetail {
  id: string
  user_id: number
  user_email?: string
  username?: string
  title: string
  created_at: string
  updated_at: string
  personality_id?: string
  personality_name?: string
  device_id?: string
  messages: Message[]
}

export default function ConversationsAdminTab() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  // Users list for filter
  const [users, setUsers] = useState<UserInfo[]>([])

  // Filters
  const [searchUser, setSearchUser] = useState('')
  const [searchTitle, setSearchTitle] = useState('')
  const [filterPersonality, setFilterPersonality] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Detail dialog
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadConversations = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString()
      })
      
      if (searchUser) params.append('user_id', searchUser)
      if (filterPersonality) params.append('personality_id', filterPersonality)
      if (searchTitle) params.append('search', searchTitle)
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)
      
      const response = await authFetch(`/api/admin/conversations?${params}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('[ConversationsAdminTab] Response data:', data)
      
      // Backend returns {success: true, conversations: [...], total: number}
      if (data.success) {
        setConversations(data.conversations || [])
        setTotal(data.total || 0)
      } else {
        setError(data.error || 'Errore nel caricamento delle conversazioni')
      }
    } catch (err: any) {
      console.error('[ConversationsAdminTab] Error loading conversations:', err)
      setError(err.message || 'Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  const loadConversationDetail = async (conversationId: string) => {
    setDetailLoading(true)
    setDetailError(null)
    
    try {
      const response = await authFetch(`/api/admin/conversations/${conversationId}`)
      const data = await response.json()
      
      setSelectedConversation(data)
    } catch (err: any) {
      setDetailError(err.message || 'Errore nel caricamento dei dettagli')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleDelete = async (conversationId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa conversazione?')) return
    
    try {
      const response = await authFetch(`/api/admin/conversations/${conversationId}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      
      if (data.success) {
        loadConversations()
      } else {
        alert('Errore nell\'eliminazione')
      }
    } catch (err: any) {
      alert(err.message || 'Errore nell\'eliminazione')
    }
  }

  const handleViewDetail = (conversationId: string) => {
    loadConversationDetail(conversationId)
  }

  const closeDetailDialog = () => {
    setSelectedConversation(null)
    setDetailError(null)
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return new Intl.DateTimeFormat('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
    } catch {
      return dateStr
    }
  }

  const loadUsers = async () => {
    try {
      const response = await authFetch('/api/admin/users')
      if (response.ok) {
        const data = await response.json()
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users)
        }
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
  }

  useEffect(() => {
    loadConversations()
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const totalPages = Math.ceil(total / limit)

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography variant="h5">Conversazioni Utenti</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => loadConversations()}
          disabled={loading}
        >
          Aggiorna
        </Button>
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>Filtri</Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel>Utente</InputLabel>
              <Select
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                label="Utente"
              >
                <MenuItem value="">
                  <em>Tutti gli utenti</em>
                </MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id.toString()}>
                    {user.email} {user.is_admin && '(Admin)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Cerca titolo"
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              size="small"
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Da data"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="A data"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            <Button
              variant="contained"
              onClick={() => {
                setPage(1)
                loadConversations()
              }}
              disabled={loading}
            >
              Applica
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setSearchUser('')
                setSearchTitle('')
                setFilterPersonality('')
                setDateFrom('')
                setDateTo('')
                setPage(1)
                setTimeout(() => loadConversations(), 100)
              }}
            >
              Reset
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary Stats */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Chip icon={<MessageIcon />} label={`Totale: ${total} conversazioni`} />
        <Chip label={`Pagina ${page} di ${totalPages || 1}`} />
      </Stack>

      {/* Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Utente</TableCell>
                  <TableCell>Titolo</TableCell>
                  <TableCell>Personality</TableCell>
                  <TableCell>Messaggi</TableCell>
                  <TableCell>Creato</TableCell>
                  <TableCell>Ultimo aggiornamento</TableCell>
                  <TableCell align="right">Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conversations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        Nessuna conversazione trovata
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  conversations.map((conv) => (
                    <TableRow key={conv.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PersonIcon fontSize="small" color="action" />
                          <Typography variant="body2">
                            {conv.user_email || conv.username || `ID: ${conv.user_id}`}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                          {conv.title || 'Senza titolo'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {conv.personality_name ? (
                          <Chip
                            icon={<AIIcon />}
                            label={conv.personality_name}
                            size="small"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={conv.message_count} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {formatDate(conv.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {formatDate(conv.updated_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Tooltip title="Visualizza conversazione">
                            <IconButton
                              size="small"
                              onClick={() => handleViewDetail(conv.id)}
                              color="primary"
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Elimina conversazione">
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(conv.id)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={3}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedConversation}
        onClose={closeDetailDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: '80vh' } }}
      >
        {selectedConversation && (
          <>
            <DialogTitle>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">
                  {selectedConversation.title || 'Conversazione'}
                </Typography>
                <Stack direction="row" spacing={1}>
                  {selectedConversation.personality_name && (
                    <Chip
                      icon={<AIIcon />}
                      label={selectedConversation.personality_name}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  <Chip
                    icon={<PersonIcon />}
                    label={selectedConversation.user_email || selectedConversation.username || `User ${selectedConversation.user_id}`}
                    size="small"
                  />
                </Stack>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Creato: {formatDate(selectedConversation.created_at)} • 
                Messaggi: {selectedConversation.messages.length}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              {detailLoading ? (
                <Box display="flex" justifyContent="center" p={4}>
                  <CircularProgress />
                </Box>
              ) : detailError ? (
                <Alert severity="error">{detailError}</Alert>
              ) : (
                <Stack spacing={2}>
                  {selectedConversation.messages.map((msg, idx) => (
                    <Card
                      key={msg.id}
                      variant="outlined"
                      sx={{
                        bgcolor: msg.role === 'user' ? '#f5f5f5' : '#e3f2fd',
                        borderLeft: msg.role === 'user' ? '4px solid #666' : '4px solid #1976d2'
                      }}
                    >
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {msg.role === 'user' ? '👤 Utente' : '🤖 Assistente'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(msg.timestamp)}
                          </Typography>
                        </Stack>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ '& p': { mb: 1 }, '& pre': { p: 1, bgcolor: '#f5f5f5', overflow: 'auto' } }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                            {msg.content}
                          </ReactMarkdown>
                        </Box>
                        {(msg.token_count > 0 || msg.processing_time > 0) && (
                          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                            {msg.token_count > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Token: {msg.token_count}
                              </Typography>
                            )}
                            {msg.processing_time > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Tempo: {msg.processing_time.toFixed(2)}s
                              </Typography>
                            )}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDetailDialog}>Chiudi</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
}
