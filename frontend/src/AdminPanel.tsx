import React, { useState, useEffect } from 'react'
import {
  Container, Paper, Typography, TextField, Button, Stack, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Card, CardContent, Grid, Divider, Alert, Chip, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, IconButton, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Slider
} from '@mui/material'
import Avatar from '@mui/material/Avatar'
import {
  Settings as SettingsIcon,
  VolumeUp as VolumeIcon,
  Psychology as AIIcon,
  Analytics as StatsIcon,
  Security as SecurityIcon,
  Psychology as PsychologyIcon,
  ExpandMore as ExpandMoreIcon,
  Mic as MicIcon,
  Check as CheckIcon,
  Download as DownloadIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Key as KeyIcon,
  Storage as StorageIcon,
  Upload as UploadIcon,
  Description as DescriptionIcon
} from '@mui/icons-material'
import AdminRAGManagement from './components/AdminRAGManagement'
// import AdminUserManagement from './components/AdminUserManagement'
import { useAuth } from './contexts/AuthContext'
import { CredentialManager } from './crypto'

interface AdminConfig {
  ai_providers: {
    local: { enabled: boolean; name: string; models: string[]; selected_model: string }
    gemini: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    claude: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openai: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openrouter: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    ollama: { enabled: boolean; name: string; base_url: string; models: string[]; selected_model: string }
  }
  tts_providers: {
    edge: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
    elevenlabs: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; voices: string[]; selected_voice: string }
    openai_voice: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
    piper: { enabled: boolean; name: string; voices: string[]; selected_voice: string }
  }
  default_provider: string
  default_tts: string
  summary_settings?: {
    provider: string
    enabled: boolean
  }
}

interface FeedbackStats {
  total: number
  likes: number
  dislikes: number
  by_provider: Record<string, { likes: number; dislikes: number }>
}

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005')

// Componente per la gestione utenti
const UserManagementComponent: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [passwordResetResult, setPasswordResetResult] = useState<any>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { apiService } = await import('./apiService')
      const resp = await apiService.get('/auth/admin/users')
      if (resp.success && resp.data) {
        setUsers((resp.data as any).users || [])
      } else {
        setError((resp as any).error || 'Errore nel caricamento utenti')
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      const { apiService } = await import('./apiService')
      const resp = await apiService.delete(`/admin/users/${selectedUser.id}`)
      if ((resp as any).success) {
        setUsers(users.filter(u => u.id !== selectedUser.id));
        setDeleteDialog(false);
        setSelectedUser(null);
      } else {
        setError('Errore nell\'eliminazione utente');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    try {
      const { apiService } = await import('./apiService')
      const resp = await apiService.post(`/admin/users/${selectedUser.id}/reset-password`)
      if ((resp as any).success) {
        setPasswordResetResult((resp as any).data || (resp as any));
        setResetPasswordDialog(true);
        setSelectedUser(null);
      } else {
        setError('Errore nel reset password');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  React.useEffect(() => {
    loadUsers();
  }, []);

  return (
    <Box sx={{ width: '100%' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">Gestione Utenti</Typography>
              <Chip label={`${users.length} utenti`} size="small" />
            </Box>
            <Button
              variant="outlined"
              onClick={loadUsers}
              disabled={loading}
              size="small"
            >
              Aggiorna
            </Button>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Cerca utenti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 3 }}
          />

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Data Registrazione</TableCell>
                  <TableCell>Ultimo Login</TableCell>
                  <TableCell>Ruolo</TableCell>
                  <TableCell>Stato</TableCell>
                  <TableCell>Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">{user.email}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(user.created_at).toLocaleDateString('it-IT')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {user.last_login ? new Date(user.last_login).toLocaleDateString('it-IT') : 'Mai'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={!!(user as any).is_admin}
                              onChange={async (e)=>{
                                try {
                                  const { apiService } = await import('./apiService')
                                  const resp = await apiService.post(`/auth/admin/users/${user.id}/role`, { is_admin: e.target.checked })
                                  if ((resp as any).success) {
                                    setUsers(prev => prev.map(u => u.id===user.id ? { ...u, is_admin: e.target.checked } : u))
                                  }
                                } catch (e) {
                                  console.error('Errore aggiornamento ruolo')
                                }
                              }}
                            />
                          }
                          label={(user as any).is_admin ? 'Amministratore' : 'Utente'}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.last_login ? 'Attivo' : 'Mai loggato'}
                          color={user.last_login ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Reset Password">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedUser(user);
                                handleResetPassword();
                              }}
                            >
                              <KeyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Elimina Utente">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setSelectedUser(user);
                                setDeleteDialog(true);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography color="text.secondary">
                        {searchTerm ? 'Nessun utente trovato' : 'Nessun utente registrato'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Dialog per conferma eliminazione */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Conferma Eliminazione</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler eliminare l'utente <strong>{selectedUser?.email}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Questa azione eliminerà anche tutte le conversazioni dell'utente e non può essere annullata.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Annulla</Button>
          <Button
            onClick={handleDeleteUser}
            variant="contained"
            color="error"
          >
            Elimina
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog per password reset */}
      <Dialog open={resetPasswordDialog} onClose={() => setResetPasswordDialog(false)}>
        <DialogTitle>Password Reset Completato</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            Password resettata con successo per {passwordResetResult?.email}
          </Alert>
          
          <Typography variant="body2" gutterBottom>
            <strong>Nuova password temporanea:</strong>
          </Typography>
          
          <TextField
            fullWidth
            value={passwordResetResult?.temporary_password || ''}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <Button
                  size="small"
                  onClick={() => copyToClipboard(passwordResetResult?.temporary_password || '')}
                >
                  Copia
                </Button>
              )
            }}
            sx={{ mb: 2 }}
          />
          
          <Alert severity="info">
            L'utente dovrà cambiare questa password al primo login.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setResetPasswordDialog(false);
              setPasswordResetResult(null);
            }}
            variant="contained"
          >
            Chiudi
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default function AdminPanel() {
  const authenticated = true
  const { logout } = useAuth()
  const [authWarning, setAuthWarning] = useState(false)
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({})
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({})
  const [modelTestResults, setModelTestResults] = useState<Record<string, {success: boolean, message: string}>>({})
  const [loadingVoices, setLoadingVoices] = useState<Record<string, boolean>>({})
  const [testingVoices, setTestingVoices] = useState<Record<string, boolean>>({})
  const [voiceTestResults, setVoiceTestResults] = useState<Record<string, {success: boolean, message: string}>>({})
  const [systemPrompt, setSystemPrompt] = useState('')
  const [systemPrompts, setSystemPrompts] = useState<{id:string; name:string; text:string}[]>([])
  const [activeSystemPromptId, setActiveSystemPromptId] = useState<string>('')
  const [selectedSystemPromptId, setSelectedSystemPromptId] = useState<string>('')
  const [selectedSystemPromptName, setSelectedSystemPromptName] = useState<string>('')
  // Personalità (presets)
  const [personalities, setPersonalities] = useState<{id:string; name:string; provider:string; model:string; system_prompt_id:string; avatar?: string}[]>([])
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('')
  const [defaultPersonalityId, setDefaultPersonalityId] = useState<string>('')
  const [personalityName, setPersonalityName] = useState<string>('')
  const [personalityProvider, setPersonalityProvider] = useState<string>('openai')
  const [personalityModel, setPersonalityModel] = useState<string>('gpt-4o-mini')
  const [personalityPromptId, setPersonalityPromptId] = useState<string>('')
  // Avatars for personalities (optional)
  const [avatars, setAvatars] = useState<string[]>([])
  const [personalityAvatar, setPersonalityAvatar] = useState<string>('')
  // Avatar personalità disabilitati
  const [systemPromptRows, setSystemPromptRows] = useState(8)
  const [pipelineConfig, setPipelineConfig] = useState<{routes: {pattern: string; topic: string}[]; files: Record<string,string>} | null>(null)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [savingPipeline, setSavingPipeline] = useState(false)
  const [promptChars, setPromptChars] = useState(0)
  const [promptTokens, setPromptTokens] = useState(0)
  
  // Stati per riassunti
  const [summaryPrompt, setSummaryPrompt] = useState('')
  const [summaryPromptRows, setSummaryPromptRows] = useState(6)
  const [summarySettings, setSummarySettings] = useState<{provider: string, enabled: boolean}>({provider: 'anthropic', enabled: true})
  const [savingSummaryPrompt, setSavingSummaryPrompt] = useState(false)
  const [savingSummarySettings, setSavingSummarySettings] = useState(false)
  
  // Stati per modelli Whisper
  const [whisperModels, setWhisperModels] = useState<string[]>([])
  const [availableWhisperModels] = useState<string[]>(['tiny', 'base', 'small', 'medium', 'large-v1', 'large-v2', 'large-v3'])
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [selectedWhisperModel, setSelectedWhisperModel] = useState<string>('')
  const [whisperModelStatus, setWhisperModelStatus] = useState<Record<string, string>>({})
  
  // Stati per pipeline dialog
  const [pipelineDialogs, setPipelineDialogs] = useState({
    addRoute: false,
    editRoute: false,
    addFile: false,
    editFile: false
  })
  const [selectedPipelineRoute, setSelectedPipelineRoute] = useState<{pattern: string, topic: string} | null>(null)
  const [selectedPipelineFile, setSelectedPipelineFile] = useState<{topic: string, filename: string} | null>(null)
  const [availableFiles, setAvailableFiles] = useState<string[]>([])
  // File editor dialog state
  const [fileEditorOpen, setFileEditorOpen] = useState(false)
  const [fileEditorFilename, setFileEditorFilename] = useState<string>('')
  const [fileEditorContent, setFileEditorContent] = useState<string>('')
  const [fileEditorLoading, setFileEditorLoading] = useState<boolean>(false)
  const [fileEditorSaving, setFileEditorSaving] = useState<boolean>(false)
  // Helper fetch con token e refresh automatico
  const authFetch = async (url: string, init: RequestInit = {}) => {
    const attachAuth = (token: string | null) => ({
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    } as HeadersInit)

    let access = CredentialManager.getAccessToken()
    let res = await fetch(url, { ...init, headers: attachAuth(access) })

    if (res.status === 401) {
      // Prova il refresh token
      const refresh = CredentialManager.getRefreshToken()
      if (refresh) {
        try {
          const r = await fetch(`${BACKEND}/api/auth/refresh`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${refresh}` }
          })
          if (r.ok) {
            const data = await r.json()
            if (data?.access_token) {
              CredentialManager.updateAccessToken(data.access_token)
              access = data.access_token
              // Riprova la richiesta originale con il nuovo token
              res = await fetch(url, { ...init, headers: attachAuth(access) })
            }
          }
        } catch {}
      }
    }

    if (res.status === 401 || res.status === 403) setAuthWarning(true)
    return res
  }
  
  // Stati per pannelli collassabili
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    ai_providers: true,
    tts_providers: false,
    ui_settings: false,
    logs: false,
    stats: false,
    feedback: false,
    prompts: false,
    personalities: false,
    whisper: false,
    usage: false,
    memory: false,
    rag_management: false,
    user_management: false
  })
  const [tokenTestInput, setTokenTestInput] = useState('')
  const [tokenTestResult, setTokenTestResult] = useState<any | null>(null)
  const [testingTokens, setTestingTokens] = useState(false)
  const [usageItems, setUsageItems] = useState<any[]>([])
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [usageStats, setUsageStats] = useState<any | null>(null)
  const [usageDaily, setUsageDaily] = useState<Record<string, {count:number; tokens:number}>>({})
  const [usageProviders, setUsageProviders] = useState<any>({})
  const [usageModels, setUsageModels] = useState<any>({})
  // Filtri log
  const [filterProvider, setFilterProvider] = useState<string>('')
  const [filterModel, setFilterModel] = useState<string>('')
  const [filterQ, setFilterQ] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [totalUsage, setTotalUsage] = useState<number>(0)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)
  
  // Funzione per gestire l'espansione dei pannelli
  const handlePanelExpansion = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanels(prev => ({
      ...prev,
      [panel]: isExpanded
    }))
  }
  const [showTokenDetails, setShowTokenDetails] = useState<boolean>(false)
  const [refreshTick, setRefreshTick] = useState<number>(0)
  // Memory settings
  const [memoryStats, setMemoryStats] = useState<any | null>(null)
  const [maxMessages, setMaxMessages] = useState<number>(10)
  const [loadingMemory, setLoadingMemory] = useState(false)
  // UI settings
  const [uiSettings, setUiSettings] = useState<{ arena_public: boolean }>({ arena_public: false })
  const [savingUi, setSavingUi] = useState(false)
  // Logs state
  const [systemLog, setSystemLog] = useState<string[]>([])
  const [systemTail, setSystemTail] = useState<number>(300)
  const [logDates, setLogDates] = useState<string[]>([])
  const [selectedLogDate, setSelectedLogDate] = useState<string>('')
  const [logProvider, setLogProvider] = useState<string>('')
  const [logEvent, setLogEvent] = useState<string>('')
  const [logPersonalityId, setLogPersonalityId] = useState<string>('')
  const [logModel, setLogModel] = useState<string>('')
  const [logConversationId, setLogConversationId] = useState<string>('')
  const [logUserId, setLogUserId] = useState<string>('')
  const [logTopic, setLogTopic] = useState<string>('')
  const [logOptions, setLogOptions] = useState<{ providers: string[]; events: string[]; models: string[]; topics: string[]; user_ids: (string|number)[]; conversation_ids: string[]; personalities: {id:string; name:string}[] }>({ providers: [], events: [], models: [], topics: [], user_ids: [], conversation_ids: [], personalities: [] })
  const [ragFilter, setRagFilter] = useState<string>('')
  const [durationRange, setDurationRange] = useState<number[]>([0, 600000])
  const [tokensRange, setTokensRange] = useState<number[]>([0, 200000])
  const [logsAutoRefresh, setLogsAutoRefresh] = useState<boolean>(false)
  const [logPrefsLoaded, setLogPrefsLoaded] = useState<boolean>(false)
  const [interactions, setInteractions] = useState<any[]>([])
  const [interactionsTotal, setInteractionsTotal] = useState<number>(0)
  const [interactionsLoading, setInteractionsLoading] = useState<boolean>(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<any | null>(null)
  const [groupByRequest, setGroupByRequest] = useState<boolean>(true)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [timelineItems, setTimelineItems] = useState<any[]>([])

  // Auto refresh effect
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => setRefreshTick(t => t+1), 10000) // 10s
    return () => clearInterval(id)
  }, [autoRefresh])

  const buildQuery = () => {
    const params: Record<string,string|number> = { page, page_size: 10000 } // Aumento per ottenere tutte le richieste
    if (filterProvider) params.provider = filterProvider
    if (filterModel) params.model = filterModel
    if (filterQ) params.q = filterQ
    if (filterDateFrom) params.start = filterDateFrom + 'T00:00:00'
    if (filterDateTo) params.end = filterDateTo + 'T23:59:59'
    const qs = Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    return qs
  }

  const loadUiSettings = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`)
      if (res.ok) {
        const data = await res.json()
        setUiSettings(data.settings || { arena_public: false })
      }
    } catch (e) {
      // ignore
    }
  }

  const loadSystemLog = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/logs/system?tail=${systemTail}`)
      const data = await res.json()
      setSystemLog((data.lines || []) as string[])
    } catch (e) {
      setMessage('Errore caricamento system log')
    }
  }

  const loadLogDates = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/logs/interactions/dates`)
      const data = await res.json()
      const dates = (data.dates || []) as string[]
      setLogDates(dates)
      if (!selectedLogDate && dates.length > 0) setSelectedLogDate(dates[0])
    } catch (e) {
      // ignore
    }
  }

  const loadInteractions = async () => {
    try {
      setInteractionsLoading(true)
      const params = new URLSearchParams()
      if (selectedLogDate) params.set('date', selectedLogDate)
      params.set('limit', '200')
      params.set('offset', '0')
      if (logProvider) params.set('provider', logProvider)
      if (logEvent) params.set('event', logEvent)
      if (logPersonalityId) params.set('personality_id', logPersonalityId)
      if (logModel) params.set('model', logModel)
      if (logConversationId) params.set('conversation_id', logConversationId)
      if (logUserId) params.set('user_id', logUserId)
      if (logTopic) params.set('topic', logTopic)
      if (ragFilter) params.set('rag', ragFilter === 'true' ? 'true' : 'false')
      if (durationRange) { params.set('min_duration_ms', String(durationRange[0])); params.set('max_duration_ms', String(durationRange[1])) }
      if (tokensRange) { params.set('min_tokens', String(tokensRange[0])); params.set('max_tokens', String(tokensRange[1])) }
      if (groupByRequest) params.set('group_by_request_id', 'true')
      const res = await authFetch(`${BACKEND}/api/admin/logs/interactions?${params.toString()}`)
      const data = await res.json()
      setInteractions(data.items || [])
      setInteractionsTotal(data.total || 0)
      if (!selectedLogDate && data.date) setSelectedLogDate(data.date)
    } catch (e) {
      setMessage('Errore caricamento interactions log')
    } finally {
      setInteractionsLoading(false)
    }
  }

  // Persistenza filtri: load all on first mount
  useEffect(() => {
    if (logPrefsLoaded) return
    try {
      const g = localStorage.getItem('logs_group')
      if (g !== null) setGroupByRequest(g === 'true')
      const d = localStorage.getItem('logs_date')
      if (d) setSelectedLogDate(d)
      const p = localStorage.getItem('logs_provider')
      if (p !== null) setLogProvider(p)
      const e = localStorage.getItem('logs_event')
      if (e !== null) setLogEvent(e)
      const per = localStorage.getItem('logs_personality')
      if (per !== null) setLogPersonalityId(per)
      const m = localStorage.getItem('logs_model')
      if (m !== null) setLogModel(m)
      const cid = localStorage.getItem('logs_conv')
      if (cid !== null) setLogConversationId(cid)
      const uid = localStorage.getItem('logs_user')
      if (uid !== null) setLogUserId(uid)
      const t = localStorage.getItem('logs_topic')
      if (t !== null) setLogTopic(t)
      const rag = localStorage.getItem('logs_rag')
      if (rag !== null) setRagFilter(rag)
      const dr = localStorage.getItem('logs_duration')
      if (dr) {
        const v = JSON.parse(dr)
        if (Array.isArray(v) && v.length === 2) setDurationRange(v)
      }
      const tr = localStorage.getItem('logs_tokens')
      if (tr) {
        const v = JSON.parse(tr)
        if (Array.isArray(v) && v.length === 2) setTokensRange(v)
      }
      const ar = localStorage.getItem('logs_auto')
      if (ar !== null) setLogsAutoRefresh(ar === 'true')
    } catch {}
    setLogPrefsLoaded(true)
  }, [logPrefsLoaded])

  // Persist every change
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_group', String(groupByRequest)) }, [groupByRequest, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded && selectedLogDate) localStorage.setItem('logs_date', selectedLogDate) }, [selectedLogDate, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_provider', logProvider) }, [logProvider, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_event', logEvent) }, [logEvent, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_personality', logPersonalityId) }, [logPersonalityId, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_model', logModel) }, [logModel, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_conv', logConversationId) }, [logConversationId, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_user', logUserId) }, [logUserId, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_topic', logTopic) }, [logTopic, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_rag', ragFilter) }, [ragFilter, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_duration', JSON.stringify(durationRange)) }, [durationRange, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_tokens', JSON.stringify(tokensRange)) }, [tokensRange, logPrefsLoaded])
  useEffect(() => { if (logPrefsLoaded) localStorage.setItem('logs_auto', String(logsAutoRefresh)) }, [logsAutoRefresh, logPrefsLoaded])

  // Auto-refresh logs every 10s when panel open
  useEffect(() => {
    if (!expandedPanels.logs || !logsAutoRefresh) return
    const id = setInterval(() => { loadInteractions() }, 10000)
    return () => clearInterval(id)
  }, [expandedPanels.logs, logsAutoRefresh, selectedLogDate, groupByRequest, logProvider, logEvent, logPersonalityId, logModel, logConversationId, logUserId, logTopic, ragFilter, durationRange, tokensRange])

  const downloadInteractionsCsv = () => {
    const lines: string[] = []
    const esc = (s: any) => {
      if (s === undefined || s === null) return ''
      const str = String(s)
      return '"' + str.replace(/"/g, '""') + '"'
    }
    if (groupByRequest) {
      lines.push(['start_ts','end_ts','request_id','provider','model','personality','topic','duration_ms','tokens_total','rag_used','events','raw_count'].join(','))
      interactions.forEach((it: any) => {
        const row = [it.start_ts, it.end_ts, it.request_id, it.provider || it.provider_header, it.model, it.personality_name || it.personality_id, it.topic, it.duration_ms, it.tokens_total, it.rag_used, (it.events||[]).join('|'), it.raw_count]
        lines.push(row.map(esc).join(','))
      })
    } else {
      lines.push(['ts','request_id','event','provider','model','personality','topic','duration_ms','tokens','rag_used'].join(','))
      interactions.forEach((it: any) => {
        const tokens = (it.tokens?.total_tokens ?? it.tokens?.total ?? '')
        const row = [it.ts, it.request_id, it.event, it.provider || it.provider_header, it.model, it.personality_name || it.personality_id, it.topic, it.duration_ms, tokens, it.rag_used]
        lines.push(row.map(esc).join(','))
      })
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = groupByRequest ? 'interactions_grouped.csv' : 'interactions_events.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadLogFilters = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedLogDate) params.set('date', selectedLogDate)
      const res = await authFetch(`${BACKEND}/api/admin/logs/interactions/filters?${params.toString()}`)
      const data = await res.json()
      setLogOptions({
        providers: data.providers || [],
        events: data.events || [],
        models: data.models || [],
        topics: data.topics || [],
        user_ids: data.user_ids || [],
        conversation_ids: data.conversation_ids || [],
        personalities: data.personalities || []
      })
    } catch (e) {
      // ignore
    }
  }

  const openDetails = (item: any) => { setDetailItem(item); setDetailOpen(true) }
  const closeDetails = () => { setDetailOpen(false); setDetailItem(null) }
  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(detailItem, null, 2))
      setMessage('Dettagli copiati')
    } catch {
      setMessage('Copia fallita')
    }
  }

  const downloadInteractions = async () => {
    try {
      const params = selectedLogDate ? `?date=${encodeURIComponent(selectedLogDate)}` : ''
      const res = await authFetch(`${BACKEND}/api/admin/logs/interactions/download${params}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `interactions_${selectedLogDate || 'latest'}.jsonl`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('Errore download interactions log')
    }
  }

  const downloadSystem = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/logs/system/download`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `system.log`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('Errore download system log')
    }
  }

  const openTimeline = async (requestId: string) => {
    try {
      const params = new URLSearchParams()
      if (selectedLogDate) params.set('date', selectedLogDate)
      params.set('limit', '1000')
      params.set('request_id', requestId)
      const res = await authFetch(`${BACKEND}/api/admin/logs/interactions?${params.toString()}`)
      const data = await res.json()
      setTimelineItems(data.items || [])
      setTimelineOpen(true)
    } catch {
      setMessage('Errore caricamento timeline')
    }
  }

  const saveUiSettings = async () => {
    try {
      setSavingUi(true)
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uiSettings)
      })
      const data = await res.json()
      if (!data.success) setMessage('Errore salvataggio impostazioni UI')
      else setMessage('Impostazioni UI salvate')
    } catch (e) {
      setMessage('Errore salvataggio impostazioni UI')
    } finally {
      setSavingUi(false)
    }
  }

  const loadUsage = async () => {
    try {
      setLoadingUsage(true)
      const qs = buildQuery()
      const res = await authFetch(`${BACKEND}/api/admin/usage?${qs}`)
      const data = await res.json()
      if (data.mode === 'query') {
        setUsageItems(data.items || [])
        setUsageDaily(data.daily || {})
        setUsageProviders(data.providers || {})
        setUsageModels(data.models || {})
        setTotalUsage(data.total || 0)
      } else {
        setUsageItems(data.items || [])
        setTotalUsage(data.items?.length || 0)
      }
      const statsRes = await authFetch(`${BACKEND}/api/admin/usage/stats`)
      const statsData = await statsRes.json()
      console.log('Usage stats loaded:', statsData)
      setUsageStats(statsData)
    } catch (e) {
      setMessage('Errore caricamento usage')
    } finally {
      setLoadingUsage(false)
    }
  }

  // Ricarica quando cambiano filtri/pagina intervalli o auto refresh tick
  useEffect(() => { loadUsage() }, [page, pageSize, refreshTick, filterProvider, filterModel, filterQ, filterDateFrom, filterDateTo])

  const presetRange = (type: string) => {
    const today = new Date()
    const toISODate = (d: Date) => d.toISOString().slice(0,10)
    if (type === 'oggi') {
      setFilterDateFrom(toISODate(today))
      setFilterDateTo(toISODate(today))
    } else if (type === 'ieri') {
      const y = new Date(today.getTime()-86400000)
      setFilterDateFrom(toISODate(y))
      setFilterDateTo(toISODate(y))
    } else if (type === '7g') {
      const s = new Date(today.getTime()-6*86400000)
      setFilterDateFrom(toISODate(s))
      setFilterDateTo(toISODate(today))
    } else if (type === '30g') {
      const s = new Date(today.getTime()-29*86400000)
      setFilterDateFrom(toISODate(s))
      setFilterDateTo(toISODate(today))
    } else if (type === 'clear') {
      setFilterDateFrom(''); setFilterDateTo('')
    }
    setPage(1)
    setTimeout(loadUsage, 0)
  }

  const exportUsage = async (format: 'csv' | 'jsonl') => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/usage/export?format=${format}`)
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `usage_export.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessage('Errore export')
    }
  }

  const resetUsage = async () => {
    if (!window.confirm('Sicuro di voler cancellare i log di utilizzo?')) return
    await authFetch(`${BACKEND}/api/admin/usage/reset`, { method: 'POST' })
    loadUsage()
  }

  // Rimosso: autenticazione via password. L'accesso al pannello è protetto a livello di route e token.

  const loadConfig = async () => {
    try {
      const response = await authFetch(`${BACKEND}/api/admin/config`)
      const data = await response.json()
      setConfig(data)
      
      // Carica impostazioni memoria
      const memorySettings = data.memory_settings || {}
      setMaxMessages(memorySettings.max_messages_per_session || 10)
      
      // Carica automaticamente i modelli per ogni provider abilitato
      if (data.ai_providers) {
        Object.keys(data.ai_providers).forEach(provider => {
          if (data.ai_providers[provider].enabled) {
            loadModels(provider)
          }
        })
      }
    } catch (error) {
      setMessage('Errore nel caricamento configurazione')
    }
  }

  const updatePromptStats = (text: string) => {
    setPromptChars(text.length)
    setPromptTokens(Math.max(1, Math.round(text.length / 4)))
  }

  const loadSystemPrompts = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/system-prompts`)
      if (res.ok) {
        const data = await res.json()
        const list = (data.prompts || []) as {id:string; name:string; text:string}[]
        const activeId = data.active_id as string
        setSystemPrompts(list)
        setActiveSystemPromptId(activeId)
        const current = list.find(p=>p.id===activeId) || list[0]
        if (current) {
          setSelectedSystemPromptId(current.id)
          setSelectedSystemPromptName(current.name)
          setSystemPrompt(current.text || '')
          updatePromptStats(current.text || '')
        }
        return
      }
    } catch {}
    // Fallback legacy single prompt
    try {
      const res = await authFetch(`${BACKEND}/api/admin/system-prompt`)
      const data = await res.json()
      const text = data.prompt || ''
      const fallback = [{id:'default', name:'Default', text}]
      setSystemPrompts(fallback)
      setActiveSystemPromptId('default')
      setSelectedSystemPromptId('default')
      setSelectedSystemPromptName('Default')
      setSystemPrompt(text)
      updatePromptStats(text)
    } catch (e) {
      setMessage('Errore caricamento system prompt')
    }
  }

  const saveSystemPrompt = async () => {
    try {
      setSavingPrompt(true)
      const payload = {
        id: selectedSystemPromptId || undefined,
        name: selectedSystemPromptName || 'Profilo',
        text: systemPrompt,
        set_active: false
      }
      const res = await authFetch(`${BACKEND}/api/admin/system-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Prompt salvato con successo')
        await loadSystemPrompts()
      } else setMessage('Errore salvataggio prompt')
      updatePromptStats(systemPrompt)
    } catch (e) {
      setMessage('Errore salvataggio prompt')
    } finally {
      setSavingPrompt(false)
    }
  }

  const setActiveSystemPrompt = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/system-prompts/activate?prompt_id=${encodeURIComponent(selectedSystemPromptId)}`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        setActiveSystemPromptId(selectedSystemPromptId)
        setMessage('Profilo attivato')
      } else setMessage('Errore attivazione profilo')
    } catch (e) {
      setMessage('Errore attivazione profilo')
    }
  }

  const createNewSystemPrompt = async () => {
    const baseName = 'Nuovo profilo'
    const name = window.prompt('Nome del nuovo profilo:', baseName) || baseName
    try {
      setSavingPrompt(true)
      const res = await authFetch(`${BACKEND}/api/admin/system-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text: '', set_active: false })
      })
      const data = await res.json()
      if (data.success) {
        // Optimistic update
        setSystemPrompts(prev => {
          const exists = prev.some(p => p.id === data.id)
          const next = exists ? prev.map(p => p.id === data.id ? ({...p, name, text: ''}) : p)
                               : [...prev, { id: data.id, name, text: '' }]
          return next
        })
        setSelectedSystemPromptId(data.id)
        setSelectedSystemPromptName(name)
        setSystemPrompt('')
        updatePromptStats('')
        // Refresh from server to ensure consistency
        await loadSystemPrompts()
      } else setMessage('Errore creazione profilo')
    } catch (e) {
      setMessage('Errore creazione profilo')
    } finally {
      setSavingPrompt(false)
    }
  }

  const deleteSystemPromptEntry = async () => {
    if (!selectedSystemPromptId) return
    if (!window.confirm('Eliminare questo profilo di prompt?')) return
    try {
      const res = await authFetch(`${BACKEND}/api/admin/system-prompts/${encodeURIComponent(selectedSystemPromptId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setMessage('Profilo eliminato')
        await loadSystemPrompts()
      } else setMessage('Errore eliminazione profilo')
    } catch (e) {
      setMessage('Errore eliminazione profilo')
    }
  }

  const resetSystemPrompt = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/system-prompt/reset`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSystemPrompt(data.prompt)
        updatePromptStats(data.prompt)
        setMessage('Prompt ripristinato')
      }
    } catch (e) { setMessage('Errore reset prompt') }
  }

  // Funzioni per gestire i riassunti
  const loadSummaryPrompt = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-prompt`)
      const data = await res.json()
      setSummaryPrompt(data.prompt || '')
    } catch (e) {
      setMessage('Errore caricamento summary prompt')
    }
  }

  const saveSummaryPrompt = async () => {
    try {
      setSavingSummaryPrompt(true)
      const res = await authFetch(`${BACKEND}/api/admin/summary-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: summaryPrompt })
      })
      const data = await res.json()
      if (data.success) setMessage('Summary prompt salvato con successo')
      else setMessage('Errore salvataggio summary prompt')
    } catch (e) {
      setMessage('Errore salvataggio summary prompt')
    } finally {
      setSavingSummaryPrompt(false)
    }
  }

  const loadSummarySettings = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/summary-settings`)
      const data = await res.json()
      setSummarySettings(data.settings || {provider: 'anthropic', enabled: true})
    } catch (e) {
      setMessage('Errore caricamento impostazioni summary')
    }
  }

  const saveSummarySettings = async () => {
    try {
      setSavingSummarySettings(true)
      const res = await authFetch(`${BACKEND}/api/admin/summary-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summarySettings)
      })
      const data = await res.json()
      if (data.success) setMessage('Impostazioni summary salvate con successo')
      else setMessage('Errore salvataggio impostazioni summary')
    } catch (e) {
      setMessage('Errore salvataggio impostazioni summary')
    } finally {
      setSavingSummarySettings(false)
    }
  }

  const loadPipeline = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline`)
      const data = await res.json()
      setPipelineConfig(data)
    } catch (e) {
      setMessage('Errore caricamento pipeline')
    }
  }

  const savePipeline = async () => {
    if (!pipelineConfig) return
    try {
      setSavingPipeline(true)
      const res = await authFetch(`${BACKEND}/api/admin/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineConfig)
      })
      const data = await res.json()
      if (data.success) setMessage('Pipeline salvata')
      else setMessage('Errore salvataggio pipeline')
    } catch (e) {
      setMessage('Errore salvataggio pipeline')
    } finally {
      setSavingPipeline(false)
    }
  }

  // Nuove funzioni CRUD per pipeline
  const addPipelineRoute = async (pattern: string, topic: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/route/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, topic })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Route aggiunta con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'aggiunta route')
      }
    } catch (e) {
      setMessage('Errore nell\'aggiunta route')
    }
  }

  const updatePipelineRoute = async (oldPattern: string, oldTopic: string, newPattern: string, newTopic: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/route/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_pattern: oldPattern,
          old_topic: oldTopic,
          new_pattern: newPattern,
          new_topic: newTopic
        })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Route aggiornata con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'aggiornamento route')
      }
    } catch (e) {
      setMessage('Errore nell\'aggiornamento route')
    }
  }

  const deletePipelineRoute = async (pattern: string, topic: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/route?pattern=${encodeURIComponent(pattern)}&topic=${encodeURIComponent(topic)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Route eliminata con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'eliminazione route')
      }
    } catch (e) {
      setMessage('Errore nell\'eliminazione route')
    }
  }

  const addPipelineFile = async (topic: string, filename: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/file/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, filename })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Mapping file aggiunto con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'aggiunta mapping file')
      }
    } catch (e) {
      setMessage('Errore nell\'aggiunta mapping file')
    }
  }

  const updatePipelineFile = async (oldTopic: string, newTopic: string, newFilename: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/file/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_topic: oldTopic,
          new_topic: newTopic,
          new_filename: newFilename
        })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Mapping file aggiornato con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'aggiornamento mapping file')
      }
    } catch (e) {
      setMessage('Errore nell\'aggiornamento mapping file')
    }
  }

  const deletePipelineFile = async (topic: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/file?topic=${encodeURIComponent(topic)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Mapping file eliminato con successo')
        await loadPipeline()
      } else {
        setMessage(data.detail || 'Errore nell\'eliminazione mapping file')
      }
    } catch (e) {
      setMessage('Errore nell\'eliminazione mapping file')
    }
  }

  const loadAvailableFiles = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/files/available`)
      const data = await res.json()
      return data.files || []
    } catch (e) {
      setMessage('Errore nel caricamento file disponibili')
      return []
    }
  }

  const openFileEditor = async (filename: string) => {
    try {
      setFileEditorLoading(true)
      setFileEditorFilename(filename)
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/file/content?filename=${encodeURIComponent(filename)}`)
      const data = await res.json()
      if (res.ok) {
        setFileEditorContent(data.content || '')
        setFileEditorOpen(true)
      } else {
        setMessage(data.detail || 'Errore apertura file')
      }
    } catch (e) {
      setMessage('Errore apertura file')
    } finally {
      setFileEditorLoading(false)
    }
  }

  const saveFileEditor = async () => {
    try {
      setFileEditorSaving(true)
      const res = await authFetch(`${BACKEND}/api/admin/pipeline/file/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileEditorFilename, content: fileEditorContent })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessage('File salvato')
        setFileEditorOpen(false)
      } else {
        setMessage(data.detail || 'Errore salvataggio file')
      }
    } catch (e) {
      setMessage('Errore salvataggio file')
    } finally {
      setFileEditorSaving(false)
    }
  }

  const uploadPipelineFile = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await authFetch(`${BACKEND}/api/admin/pipeline/file/upload`, { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.success) {
          setMessage('File caricato')
          const files = await loadAvailableFiles()
          setAvailableFiles(files)
        } else {
          setMessage(data.detail || 'Errore upload file')
        }
      } catch (e) {
        setMessage('Errore upload file')
      }
    }
    input.click()
  }

  const loadAvatars = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/avatars`)
      const data = await res.json()
      setAvatars(data.avatars || [])
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    loadConfig()
    loadStats()
    loadSystemPrompts()
    loadPersonalities()
    loadPipeline()
    loadUsage()
    loadMemoryStats()
    loadWhisperModels()
    loadUiSettings()
    loadSystemLog()
    loadLogDates()
    loadInteractions()
    loadLogFilters()
    // Carica i file disponibili per la pipeline
    loadAvailableFiles().then(files => setAvailableFiles(files))
  }, [])

  useEffect(() => { if (selectedLogDate) { setLogEvent(''); loadLogFilters(); loadInteractions(); } }, [selectedLogDate])

  // Aggiorna filtri e date quando si apre il pannello Log & Interazioni
  useEffect(() => {
    if (expandedPanels.logs) {
      loadLogDates()
      loadLogFilters()
      loadInteractions()
    }
  }, [expandedPanels.logs])

  // Ricarica modelli Whisper quando la config cambia
  useEffect(() => {
    if (config) {
      loadWhisperModels()
    }
  }, [config])

  const loadMemoryStats = async () => {
    try {
      setLoadingMemory(true)
      const res = await authFetch(`${BACKEND}/api/admin/memory/stats`)
      const data = await res.json()
      setMemoryStats(data)
    } catch (e) {
      setMessage('Errore caricamento statistiche memoria')
    } finally {
      setLoadingMemory(false)
    }
  }

  const updateMemoryConfig = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/memory/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_messages: maxMessages })
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Configurazione memoria salvata')
        loadMemoryStats()
      } else {
        setMessage(data.message || 'Errore salvataggio memoria')
      }
    } catch (e) {
      setMessage('Errore aggiornamento memoria')
    }
  }

  const loadPersonalities = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/personalities`)
      const data = await res.json()
      const list = data.personalities || []
      setPersonalities(list)
      setDefaultPersonalityId(data.default_id || '')
      if (list.length > 0) {
        const first = list.find((p:any)=>p.id===data.default_id) || list[0]
        setSelectedPersonalityId(first.id)
        setPersonalityName(first.name)
        setPersonalityProvider(first.provider)
        setPersonalityModel(first.model)
        setPersonalityPromptId(first.system_prompt_id)
        // ensure models list loaded for selected provider
        if (getProviderModels(first.provider).length === 0) {
          loadModels(first.provider)
        }
      }
    } catch (e) {
      setMessage('Errore caricamento personalità')
    }
  }

  const getProviderModels = (prov: string): string[] => {
    const m = (config?.ai_providers as any)?.[prov]?.models
    return Array.isArray(m) ? m : []
  }

  const savePersonality = async () => {
    try {
      const payload = {
        id: selectedPersonalityId || undefined,
        name: personalityName || 'Nuova personalità',
        provider: personalityProvider || 'openai',
        model: personalityModel || getProviderModels(personalityProvider)[0] || 'gpt-4o-mini',
        system_prompt_id: personalityPromptId || activeSystemPromptId || (systemPrompts[0]?.id || 'default'),
      }
      const res = await authFetch(`${BACKEND}/api/admin/personalities`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessage('Personalità salvata')
        await loadPersonalities()
        setSelectedPersonalityId(data.id)
      } else setMessage(data.detail || 'Errore salvataggio personalità')
    } catch (e:any) {
      setMessage(e?.message || 'Errore salvataggio personalità')
    }
  }

  const createPersonality = async () => {
    const name = window.prompt('Nome personalità:', 'Tutor') || 'Tutor'
    try {
      const defaultModel = getProviderModels('openai')[0] || 'gpt-4o-mini'
      const sysId = activeSystemPromptId || (systemPrompts[0]?.id||'default')
      const res = await authFetch(`${BACKEND}/api/admin/personalities`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, provider:'openai', model: defaultModel, system_prompt_id: sysId, avatar: personalityAvatar || undefined }) })
      const data = await res.json()
      if (res.ok && data.success) { setMessage('Personalità creata'); await loadPersonalities() }
      else setMessage(data.detail || 'Errore creazione personalità')
    } catch (e:any) { setMessage(e?.message || 'Errore creazione personalità') }
  }

  const deletePersonality = async () => {
    if (!selectedPersonalityId) return
    if (!window.confirm('Eliminare questa personalità?')) return
    try {
      const res = await authFetch(`${BACKEND}/api/admin/personalities/${encodeURIComponent(selectedPersonalityId)}`, { method:'DELETE' })
      const data = await res.json()
      if (data.success) { setMessage('Personalità eliminata'); await loadPersonalities() }
      else setMessage('Errore eliminazione personalità')
    } catch { setMessage('Errore eliminazione personalità') }
  }

  const setDefaultPersonality = async () => {
    if (!selectedPersonalityId) return
    try {
      const res = await authFetch(`${BACKEND}/api/admin/personalities/default?personality_id=${encodeURIComponent(selectedPersonalityId)}`, { method:'POST' })
      const data = await res.json()
      if (data.success) { setMessage('Default aggiornato'); setDefaultPersonalityId(selectedPersonalityId) }
      else setMessage('Errore impostazione default')
    } catch { setMessage('Errore impostazione default') }
  }

  const clearMemory = async (sessionId?: string) => {
    const confirmMsg = sessionId ? 
      `Vuoi cancellare la sessione ${sessionId}?` : 
      'Vuoi cancellare tutte le sessioni dalla memoria?'
    
    if (!window.confirm(confirmMsg)) return
    
    try {
      const url = sessionId ? 
        `${BACKEND}/api/admin/memory/clear?session_id=${sessionId}` :
        `${BACKEND}/api/admin/memory/clear`
      
      const res = await authFetch(url, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message)
        loadMemoryStats()
      }
    } catch (e) {
      setMessage('Errore cancellazione memoria')
    }
  }

  const loadStats = async () => {
    try {
      const response = await fetch(`${BACKEND}/api/feedback/stats`)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      setMessage('Errore nel caricamento statistiche')
    }
  }

  const loadModels = async (provider: string) => {
    setLoadingModels(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await authFetch(`${BACKEND}/api/admin/models/${provider}`)
      const data = await response.json()
      
      if (config) {
        const updatedConfig = { ...config }
        // Estrai l'array models dalla risposta {models: [...]}
        const models = data.models || []
        updatedConfig.ai_providers[provider as keyof AdminConfig['ai_providers']].models = models
        setConfig(updatedConfig)
      }
    } catch (error) {
      console.error('Errore caricamento modelli:', error)
      setMessage('Errore nel caricamento dei modelli')
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }))
    }
  }

  const handleModelChange = (provider: keyof AdminConfig['ai_providers'], model: string) => {
    if (config) {
      const updatedConfig = { ...config }
      updatedConfig.ai_providers[provider].selected_model = model
      setConfig(updatedConfig)
    }
  }

  const testModel = async (provider: string, model: string) => {
    setTestingModels(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await authFetch(`${BACKEND}/api/admin/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model })
      })
      
      const result = await response.json()
      setModelTestResults(prev => ({
        ...prev,
        [provider]: {
          success: result.success,
          message: result.message || (result.success ? 'Test completato con successo' : 'Test fallito')
        }
      }))
    } catch (error) {
      setModelTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          message: 'Errore durante il test del modello'
        }
      }))
    } finally {
      setTestingModels(prev => ({ ...prev, [provider]: false }))
    }
  }

  const saveConfig = async () => {
    if (!config) return
    
    setLoading(true)
    try {
      await authFetch(`${BACKEND}/api/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      setMessage('Configurazione salvata con successo')
    } catch (error) {
      setMessage('Errore nel salvataggio')
    }
    setLoading(false)
  }

  // Funzioni aggiunte per compatibilità
  const updateConfig = (key: string, value: any) => {
    if (!config) return
    setConfig({
      ...config,
      [key]: value
    })
  }

  const updateTTSProvider = (provider: string, key: string, value: any) => {
    if (!config) return
    const updatedConfig = { ...config }
    ;(updatedConfig.tts_providers as any)[provider][key] = value
    setConfig(updatedConfig)
  }

  const loadVoices = async (provider: string) => {
    setLoadingVoices(prev => ({ ...prev, [provider]: true }))
    try {
      const response = await authFetch(`${BACKEND}/api/admin/tts/voices/${provider}`)
      const data = await response.json()
      
      if (config && data.voices) {
        const updatedConfig = { ...config }
        ;(updatedConfig.tts_providers as any)[provider].voices = data.voices
        setConfig(updatedConfig)
      }
    } catch (error) {
      setMessage('Errore nel caricamento voci')
    } finally {
      setLoadingVoices(prev => ({ ...prev, [provider]: false }))
    }
  }

  const testVoice = async (provider: string) => {
    try {
      const response = await authFetch(`${BACKEND}/api/admin/tts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider,
          text: 'Questo è un test della voce.' 
        })
      })
      
      if (response.ok) {
        setMessage('Test voce completato')
      } else {
        setMessage('Errore test voce')
      }
    } catch (error) {
      setMessage('Errore test voce')
    }
  }

  const testTokens = async () => {
    setTestingTokens(true)
    try {
      const response = await authFetch(`${BACKEND}/api/admin/test-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Test di conteggio token.' })
      })
      
      const result = await response.json()
      setMessage(`Token contati: ${result.tokens || 'N/A'}`)
    } catch (error) {
      setMessage('Errore test token')
    } finally {
      setTestingTokens(false)
    }
  }

  // Funzioni per gestione modelli Whisper
  const loadWhisperModels = async () => {
    try {
      console.log('Caricamento modelli Whisper...')
      const response = await authFetch(`${BACKEND}/api/admin/whisper/models`)
      const data = await response.json()
      
      console.log('Risposta backend:', data)
      
      if (data.models) {
        setWhisperModels(data.models)
        setSelectedWhisperModel(data.current_model || '')
        setWhisperModelStatus(data.status || {})
      } else {
        // Fallback: prova a caricare dalla configurazione principale
        console.log('Tentativo fallback con config principale')
        if (config && (config as any).whisper) {
          const whisperConfig = (config as any).whisper
          if (whisperConfig.model) {
            setSelectedWhisperModel(whisperConfig.model)
            setWhisperModels([whisperConfig.model])
          }
        }
      }
    } catch (error) {
      console.error('Errore nel caricamento modelli Whisper:', error)
      // Fallback: prova a caricare dalla configurazione principale
      if (config && (config as any).whisper) {
        const whisperConfig = (config as any).whisper
        if (whisperConfig.model) {
          setSelectedWhisperModel(whisperConfig.model)
          setWhisperModels([whisperConfig.model])
        }
      }
      setMessage('Errore nel caricamento modelli Whisper')
    }
  }

  const downloadWhisperModel = async (modelName: string) => {
    setDownloadingModel(modelName)
    try {
      const response = await authFetch(`${BACKEND}/api/admin/whisper/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      
      const result = await response.json()
      if (result.success) {
        setMessage(`Modello ${modelName} scaricato con successo`)
        loadWhisperModels() // Ricarica la lista
      } else {
        setMessage(result.message || 'Errore nel download')
      }
    } catch (error) {
      setMessage('Errore nel download del modello')
    } finally {
      setDownloadingModel(null)
    }
  }

  const setWhisperModel = async (modelName: string) => {
    try {
      const response = await authFetch(`${BACKEND}/api/admin/whisper/set-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      
      const result = await response.json()
      if (result.success) {
        setSelectedWhisperModel(modelName)
        setMessage(`Modello ${modelName} impostato come predefinito`)
      } else {
        setMessage(result.message || 'Errore nell\'impostazione del modello')
      }
    } catch (error) {
      setMessage('Errore nell\'impostazione del modello')
    }
  }

  const updateProvider = (provider: string, field: string, value: any) => {
    if (!config) return
    
    // Non permettere la modifica delle API key dall'interfaccia
    if (field === 'api_key') return
    
    setConfig({
      ...config,
      ai_providers: {
        ...config.ai_providers,
        [provider]: {
          ...config.ai_providers[provider as keyof typeof config.ai_providers],
          [field]: value
        }
      }
    })
  }

  const updateTTS = (provider: string, field: string, value: any) => {
    if (!config) return
    setConfig({
      ...config,
      tts_providers: {
        ...config.tts_providers,
        [provider]: {
          ...config.tts_providers[provider as keyof typeof config.tts_providers],
          [field]: value
        }
      }
    })
  }

  const testTTSProvider = async (provider: string, voice?: string) => {
    try {
      setMessage(`Testando ${provider} con voce ${voice}...`)
      
      const response = await fetch(`${BACKEND}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Ciao, questo è un test della voce selezionata per il provider " + provider,
          provider: provider,
          voice: voice
        })
      })

      if (response.ok) {
        // Riproduci l'audio
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        audio.play()
        
        setMessage(`Test ${provider} completato con successo`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage(`Errore nel test ${provider}: ${response.statusText}`)
      }
    } catch (error) {
      setMessage(`Errore nel test ${provider}: ${error}`)
    }
  }

  const runTokenTest = async () => {
    if (!tokenTestInput.trim()) return
    setTestingTokens(true)
    setTokenTestResult(null)
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': config?.default_provider || 'local'
        },
        body: JSON.stringify({ message: tokenTestInput })
      })
      const data = await res.json()
      setTokenTestResult(data)
    } catch (e) {
      setTokenTestResult({ error: 'Errore chiamata' })
    } finally {
      setTestingTokens(false)
    }
  }

  // Rimosso lo schermo "Inserisci la password": il pannello è protetto dal login/ruolo a livello di route

  // Pipeline Dialog Components
  function PipelineRouteAddDialog() {
    const [pattern, setPattern] = useState('')
    const [topic, setTopic] = useState('')

    const handleSubmit = () => {
      if (pattern.trim() && topic.trim()) {
        addPipelineRoute(pattern.trim(), topic.trim())
        setPattern('')
        setTopic('')
        setPipelineDialogs({...pipelineDialogs, addRoute: false})
      }
    }

    const handleClose = () => {
      setPipelineDialogs({...pipelineDialogs, addRoute: false})
      setPattern('')
      setTopic('')
    }

    return (
      <Dialog open={pipelineDialogs.addRoute} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Aggiungi Nuova Route</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Pattern Regex"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              fullWidth
              placeholder="\\b(parola|frase)\\b"
              helperText="Inserisci un pattern regex valido per il matching"
            />
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic per questa route"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!pattern.trim() || !topic.trim()}
          >
            Aggiungi
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  function PipelineRouteEditDialog() {
    const [pattern, setPattern] = useState('')
    const [topic, setTopic] = useState('')

    useEffect(() => {
      if (selectedPipelineRoute) {
        setPattern(selectedPipelineRoute.pattern)
        setTopic(selectedPipelineRoute.topic)
      }
    }, [selectedPipelineRoute])

    const handleSubmit = () => {
      if (selectedPipelineRoute && pattern.trim() && topic.trim()) {
        updatePipelineRoute(selectedPipelineRoute.pattern, selectedPipelineRoute.topic, pattern.trim(), topic.trim())
        setPattern('')
        setTopic('')
        setPipelineDialogs({...pipelineDialogs, editRoute: false})
        setSelectedPipelineRoute(null)
      }
    }

    const handleClose = () => {
      setPipelineDialogs({...pipelineDialogs, editRoute: false})
      setSelectedPipelineRoute(null)
      setPattern('')
      setTopic('')
    }

    return (
      <Dialog open={pipelineDialogs.editRoute} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Modifica Route</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Pattern Regex"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              fullWidth
              placeholder="\\b(parola|frase)\\b"
              helperText="Inserisci un pattern regex valido per il matching"
            />
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic per questa route"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!pattern.trim() || !topic.trim()}
          >
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  function PipelineFileAddDialog() {
    const [topic, setTopic] = useState('')
    const [filename, setFilename] = useState('')

    const handleSubmit = () => {
      if (topic.trim() && filename.trim()) {
        addPipelineFile(topic.trim(), filename.trim())
        setTopic('')
        setFilename('')
        setPipelineDialogs({...pipelineDialogs, addFile: false})
      }
    }

    const handleClose = () => {
      setPipelineDialogs({...pipelineDialogs, addFile: false})
      setTopic('')
      setFilename('')
    }

    return (
      <Dialog open={pipelineDialogs.addFile} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Aggiungi Mapping File</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic da associare al file"
            />
            <FormControl fullWidth>
              <InputLabel>File</InputLabel>
              <Select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                label="File"
              >
                {availableFiles.map((file) => (
                  <MenuItem key={file} value={file}>{file}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!topic.trim() || !filename.trim()}
          >
            Aggiungi
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  function PipelineFileEditDialog() {
    const [topic, setTopic] = useState('')
    const [filename, setFilename] = useState('')

    useEffect(() => {
      if (selectedPipelineFile) {
        setTopic(selectedPipelineFile.topic)
        setFilename(selectedPipelineFile.filename)
      }
    }, [selectedPipelineFile])

    const handleSubmit = () => {
      if (selectedPipelineFile && topic.trim() && filename.trim()) {
        updatePipelineFile(selectedPipelineFile.topic, topic.trim(), filename.trim())
        setTopic('')
        setFilename('')
        setPipelineDialogs({...pipelineDialogs, editFile: false})
        setSelectedPipelineFile(null)
      }
    }

    const handleClose = () => {
      setPipelineDialogs({...pipelineDialogs, editFile: false})
      setSelectedPipelineFile(null)
      setTopic('')
      setFilename('')
    }

    return (
      <Dialog open={pipelineDialogs.editFile} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Modifica Mapping File</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic da associare al file"
            />
            <FormControl fullWidth>
              <InputLabel>File</InputLabel>
              <Select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                label="File"
              >
                {availableFiles.map((file) => (
                  <MenuItem key={file} value={file}>{file}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!topic.trim() || !filename.trim()}
          >
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {authWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={()=> { logout(); window.location.href = '/admin' }}>Rilogga</Button>}
        >
          Sessione scaduta o permessi insufficienti. Accedi di nuovo come amministratore.
        </Alert>
      )}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4">
          <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Pannello Amministratore
        </Typography>
        <Button variant="outlined" onClick={() => { logout(); window.location.href = '/'; }}>
          Esci
        </Button>
      </Stack>

      {message && (
        <Alert severity={message.includes('successo') ? 'success' : 'error'} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      {/* Pannelli Accordion - Tutti collassabili */}
      <Stack spacing={2}>
        
        {/* Pannello Provider AI */}
        <Accordion 
          expanded={expandedPanels.ai_providers} 
          onChange={handlePanelExpansion('ai_providers')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <AIIcon color="primary" />
              <Typography variant="h6">Provider AI</Typography>
              {config && (
                <>
                  <Chip label={`Attivi: ${Object.values(config.ai_providers).filter((p:any)=>p.enabled).length}`} size="small" color="primary" />
                  {(() => {
                    const providers = Object.values(config.ai_providers) as any[]
                    const keys = providers.filter(p=> 'api_key_status' in p && p.api_key_status === 'configured').length
                    const models = providers.reduce((sum,p)=> sum + (Array.isArray(p.models)? p.models.length:0), 0)
                    return (
                      <>
                        <Chip label={`API keys: ${keys}`} size="small" variant="outlined" />
                        <Chip label={`Modelli: ${models}`} size="small" variant="outlined" />
                      </>
                    )
                  })()}
                </>
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {config && Object.entries(config.ai_providers).map(([key, provider]) => (
              <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {provider.name}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={provider.enabled}
                        onChange={(e) => updateProvider(key, 'enabled', e.target.checked)}
                      />
                    }
                    label="Attivo"
                  />
                </Stack>

                {'api_key_status' in provider && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      API Key:
                    </Typography>
                    <Chip
                      size="small"
                      label={provider.api_key_status === 'configured' ? 'Configurata' : 'Mancante'}
                      color={provider.api_key_status === 'configured' ? 'success' : 'error'}
                      variant="outlined"
                    />
                    {provider.api_key_masked && (
                      <Typography variant="caption" color="text.secondary">
                        {provider.api_key_masked}
                      </Typography>
                    )}
                  </Box>
                )}

                {provider.enabled && (
                  <>
                    {'base_url' in provider && (
                      <TextField
                        label="Base URL"
                        value={provider.base_url}
                        onChange={(e) => updateProvider(key, 'base_url', e.target.value)}
                        size="small"
                        fullWidth
                        sx={{ mb: 1 }}
                      />
                    )}

                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Modello</InputLabel>
                        <Select
                          value={provider.selected_model}
                          onChange={(e) => updateProvider(key, 'selected_model', e.target.value)}
                        >
                          {provider.models.map((model) => (
                            <MenuItem key={model} value={model}>{model}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => loadModels(key)}
                        disabled={loadingModels[key]}
                      >
                        {loadingModels[key] ? 'Caricamento...' : 'Ricarica Modelli'}
                      </Button>

                      <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        onClick={() => testModel(key, provider.selected_model)}
                        disabled={testingModels[key]}
                      >
                        {testingModels[key] ? 'Test...' : 'Test Modello'}
                      </Button>
                    </Stack>

                    {modelTestResults[key] && (
                      <Alert 
                        severity={modelTestResults[key].success ? 'success' : 'error'} 
                        sx={{ mt: 1 }}
                      >
                        {modelTestResults[key].message}
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            ))}

            {/* Configurazione Predefinita AI */}
            {config && Object.keys(config.ai_providers).filter(key => (config.ai_providers as any)[key].enabled).length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Provider AI Predefinito
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider AI Predefinito</InputLabel>
                  <Select
                    value={config.default_provider}
                    onChange={(e) => updateConfig('default_provider', e.target.value)}
                  >
                    {Object.entries(config.ai_providers)
                      .filter(([, provider]) => provider.enabled)
                      .map(([key, provider]) => (
                        <MenuItem key={key} value={key}>
                          {provider.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Provider TTS */}
        <Accordion 
          expanded={expandedPanels.tts_providers} 
          onChange={handlePanelExpansion('tts_providers')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <VolumeIcon color="primary" />
              <Typography variant="h6">Provider TTS</Typography>
              {config && (
                <>
                  <Chip label={`Attivi: ${Object.values(config.tts_providers).filter((p:any)=>p.enabled).length}`} size="small" color="primary" />
                  {(() => {
                    const providers = Object.values(config.tts_providers) as any[]
                    const keys = providers.filter(p=> 'api_key_status' in p && p.api_key_status === 'configured').length
                    const voices = providers.reduce((sum,p)=> sum + (Array.isArray(p.voices)? p.voices.length:0), 0)
                    return (
                      <>
                        <Chip label={`API keys: ${keys}`} size="small" variant="outlined" />
                        <Chip label={`Voci: ${voices}`} size="small" variant="outlined" />
                      </>
                    )
                  })()}
                </>
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {config && Object.entries(config.tts_providers).map(([key, provider]) => (
              <Box key={key} sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    {provider.name || key}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={provider.enabled}
                        onChange={(e) => updateTTSProvider(key, 'enabled', e.target.checked)}
                      />
                    }
                    label="Attivo"
                  />
                </Stack>

                {'api_key_status' in provider && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="body2" color="textSecondary">
                      API Key: {provider.api_key_masked || 'Non configurata'}
                      <Chip
                        label={provider.api_key_status}
                        size="small"
                        color={provider.api_key_status === 'configured' ? 'success' : 'error'}
                        sx={{ ml: 1 }}
                      />
                    </Typography>
                  </Box>
                )}

                {provider.enabled && (
                  <>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Voce</InputLabel>
                        <Select
                          value={provider.selected_voice}
                          onChange={(e) => updateTTSProvider(key, 'selected_voice', e.target.value)}
                        >
                          {provider.voices.map((voice) => (
                            <MenuItem key={voice} value={voice}>{voice}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => loadVoices(key)}
                        disabled={loadingVoices[key]}
                      >
                        {loadingVoices[key] ? 'Caricamento...' : 'Ricarica Voci'}
                      </Button>

                      <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        onClick={() => testVoice(key)}
                        disabled={testingVoices[key]}
                      >
                        {testingVoices[key] ? 'Test...' : 'Test Voce'}
                      </Button>
                    </Stack>

                    {voiceTestResults[key] && (
                      <Alert 
                        severity={voiceTestResults[key].success ? 'success' : 'error'} 
                        sx={{ mt: 1 }}
                      >
                        {voiceTestResults[key].message}
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            ))}

            {/* Configurazione Predefinita TTS */}
            {config && Object.keys(config.tts_providers).filter(key => (config.tts_providers as any)[key].enabled).length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Provider TTS Predefinito
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Provider TTS Predefinito</InputLabel>
                  <Select
                    value={config.default_tts}
                    onChange={(e) => updateConfig('default_tts', e.target.value)}
                  >
                    {Object.entries(config.tts_providers)
                      .filter(([, provider]: [string, any]) => provider.enabled)
                      .map(([key, provider]: [string, any]) => (
                        <MenuItem key={key} value={key}>
                          {provider.name || key}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Whisper */}
        <Accordion 
          expanded={expandedPanels.whisper} 
          onChange={handlePanelExpansion('whisper')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <MicIcon color="primary" />
              <Typography variant="h6">Gestione Modelli Whisper</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              Gestisci i modelli Whisper per la trascrizione vocale.
            </Typography>

            {/* Modello attualmente selezionato */}
            {selectedWhisperModel && (
              <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Modello Attivo: {selectedWhisperModel}
                </Typography>
              </Box>
            )}

            {/* Lista modelli scaricati */}
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
              Modelli Scaricati
            </Typography>
            {whisperModels.length > 0 ? (
              <Box sx={{ mb: 3 }}>
                {whisperModels.map((model) => (
                  <Box key={model} sx={{ mb: 1, p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: selectedWhisperModel === model ? 'bold' : 'normal' }}>
                        {model}
                        {selectedWhisperModel === model && (
                          <Chip label="Attivo" size="small" color="primary" sx={{ ml: 1 }} />
                        )}
                      </Typography>
                      {selectedWhisperModel !== model && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setWhisperModel(model)}
                        >
                          Imposta come Predefinito
                        </Button>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                Nessun modello scaricato
              </Typography>
            )}

            {/* Scarica nuovi modelli */}
            <Typography variant="subtitle2" gutterBottom>
              Scarica Modelli
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {availableWhisperModels.map((model) => {
                const isDownloaded = whisperModels.includes(model)
                const isDownloading = downloadingModel === model
                
                return (
                  <Button
                    key={model}
                    variant={isDownloaded ? "outlined" : "contained"}
                    size="small"
                    onClick={() => !isDownloaded && downloadWhisperModel(model)}
                    disabled={isDownloaded || isDownloading}
                    startIcon={isDownloaded ? <CheckIcon /> : (isDownloading ? <CircularProgress size={16} /> : <DownloadIcon />)}
                  >
                    {model}
                    {isDownloading && ' (Download...)'}
                    {isDownloaded && ' (Scaricato)'}
                  </Button>
                )
              })}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Statistiche */}
        <Accordion 
          expanded={expandedPanels.stats} 
          onChange={handlePanelExpansion('stats')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StatsIcon color="primary" />
              <Typography variant="h6">Statistiche Utilizzo</Typography>
              <Chip 
                label={stats ? stats.total : 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {/* Statistiche di Utilizzo */}
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Statistiche di Utilizzo
            </Typography>
            
            {usageStats && (
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light' }}>
                    <Typography variant="h4" color="primary.main">
                      {usageStats.total_requests || 0}
                    </Typography>
                    <Typography variant="body2">Richieste Totali</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                    <Typography variant="h4" color="success.main">
                      {usageStats.total_tokens || 0}
                    </Typography>
                    <Typography variant="body2">Token Utilizzati</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                    <Typography variant="h4" color="warning.main">
                      ${(usageStats.total_cost || 0).toFixed(4)}
                    </Typography>
                    <Typography variant="body2">Costo Totale</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                    <Typography variant="h4" color="info.main">
                      {usageStats.today?.requests || 0}
                    </Typography>
                    <Typography variant="body2">Richieste Oggi</Typography>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {/* Statistiche per Provider */}
            {usageStats && usageStats.by_provider && Object.keys(usageStats.by_provider).length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Utilizzo per Provider AI
                </Typography>
                <Grid container spacing={2}>
                  {Object.entries(usageStats.by_provider).map(([provider, data]: [string, any]) => (
                    <Grid item xs={12} sm={6} md={4} key={provider}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          {provider}
                        </Typography>
                        <Typography variant="body2">
                          Richieste: {data.requests || 0}
                        </Typography>
                        <Typography variant="body2">
                          Token: {data.tokens || 0}
                        </Typography>
                        <Typography variant="body2">
                          Costo: ${(data.cost || 0).toFixed(4)}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            {/* Tabella Richieste Dettagliate */}
            {usageItems && usageItems.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Richieste Dettagliate ({usageItems.length} di {totalUsage} totali)
                </Typography>
                
                {/* Filtri */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Provider</InputLabel>
                      <Select
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                        label="Provider"
                      >
                        <MenuItem value="">Tutti</MenuItem>
                        <MenuItem value="openai">OpenAI</MenuItem>
                        <MenuItem value="claude">Claude</MenuItem>
                        <MenuItem value="gemini">Gemini</MenuItem>
                        <MenuItem value="openrouter">OpenRouter</MenuItem>
                        <MenuItem value="local">Local</MenuItem>
                        <MenuItem value="ollama">Ollama</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Modello</InputLabel>
                      <Select
                        value={filterModel}
                        onChange={(e) => setFilterModel(e.target.value)}
                        label="Modello"
                      >
                        <MenuItem value="">Tutti</MenuItem>
                        {Object.keys(usageModels).map((model) => (
                          <MenuItem key={model} value={model}>
                            {model} ({usageModels[model]})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Data Da"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Data A"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>
                
                {/* Pulsanti di controllo filtri */}
                <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setFilterProvider('')
                      setFilterModel('')
                      setFilterDateFrom('')
                      setFilterDateTo('')
                    }}
                  >
                    Pulisci Filtri
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={loadUsage}
                    disabled={loadingUsage}
                  >
                    {loadingUsage ? 'Caricamento...' : 'Aggiorna'}
                  </Button>
                </Box>
                
                <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Data/Ora</TableCell>
                        <TableCell>Provider</TableCell>
                        <TableCell>Modello</TableCell>
                        <TableCell>Topic</TableCell>
                        <TableCell align="right">Token Input</TableCell>
                        <TableCell align="right">Token Output</TableCell>
                        <TableCell align="right">Token Totali</TableCell>
                        <TableCell align="right">Durata (ms)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {usageItems.slice().reverse().map((item, index) => (
                        <TableRow key={index} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {item.ts ? new Date(item.ts).toLocaleString('it-IT') : 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={item.provider || 'unknown'} 
                              size="small" 
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {item.model || 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {item.topic || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.tokens?.input_tokens || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.tokens?.output_tokens || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {item.tokens?.total || 0}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.duration_ms || 0}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            
            {!usageStats && usageItems.length === 0 && (
              <Typography variant="body2" color="textSecondary">
                Nessuna statistica disponibile
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Statistiche Feedback */}
        <Accordion 
          expanded={expandedPanels.feedback} 
          onChange={handlePanelExpansion('feedback')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StatsIcon color="primary" />
              <Typography variant="h6">Statistiche Feedback</Typography>
              <Chip 
                label={stats ? stats.total : 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {stats && (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {stats.total}
                    </Typography>
                    <Typography variant="body2">Feedback Totali</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {stats.likes}
                    </Typography>
                    <Typography variant="body2">Like</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="error.main">
                      {stats.dislikes}
                    </Typography>
                    <Typography variant="body2">Dislike</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Feedback per Provider
                  </Typography>
                  {Object.entries(stats.by_provider).map(([provider, data]: [string, any]) => (
                    <Box key={provider} sx={{ mb: 1 }}>
                      <Typography variant="subtitle2">{provider}</Typography>
                      <Grid container spacing={1}>
                        <Grid item xs={4}>
                          <Chip label={`Like: ${data.likes}`} size="small" color="success" />
                        </Grid>
                        <Grid item xs={4}>
                          <Chip label={`Dislike: ${data.dislikes}`} size="small" color="error" />
                        </Grid>
                        <Grid item xs={4}>
                          <Chip 
                            label={`${data.likes + data.dislikes > 0 ? Math.round(data.likes / (data.likes + data.dislikes) * 100) : 0}%`} 
                            size="small" 
                            color={data.likes > data.dislikes ? 'success' : 'warning'} 
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  ))}
                </Grid>
              </Grid>
            )}
            
            {!stats && (
              <Typography variant="body2" color="textSecondary">
                Nessuna statistica feedback disponibile
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Pannello Gestione Prompts */}
        <Accordion 
          expanded={expandedPanels.personalities} 
          onChange={handlePanelExpansion('personalities')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <PsychologyIcon color="primary" />
              <Typography variant="h6">Gestione Prompts</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              {/* Prompt Sistema */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle1">Prompt Sistema</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={selectedSystemPromptId}
                      onChange={(e)=>{
                        const id = e.target.value
                        setSelectedSystemPromptId(id)
                        const p = systemPrompts.find(sp=>sp.id===id)
                        if (p) { setSelectedSystemPromptName(p.name); setSystemPrompt(p.text || ''); updatePromptStats(p.text || '') }
                      }}
                    >
                      {systemPrompts.map(p=> (
                        <option key={p.id} value={p.id}>{p.name}{p.id===activeSystemPromptId?' (attivo)':''}</option>
                      ))}
                    </select>
                    <Button variant="outlined" size="small" onClick={createNewSystemPrompt}>Nuovo</Button>
                    <Button variant="outlined" size="small" color="error" onClick={deleteSystemPromptEntry} disabled={systemPrompts.length<=1}>Elimina</Button>
                    <Button variant="contained" size="small" onClick={setActiveSystemPrompt} disabled={!selectedSystemPromptId || selectedSystemPromptId===activeSystemPromptId}>Imposta Attivo</Button>
                    <Typography variant="caption" color="textSecondary">Righe:</Typography>
                    <IconButton size="small" onClick={() => setSystemPromptRows(Math.max(3, systemPromptRows - 2))} disabled={systemPromptRows <= 3}><RemoveIcon /></IconButton>
                    <Typography variant="caption" sx={{ minWidth: '20px', textAlign: 'center' }}>{systemPromptRows}</Typography>
                    <IconButton size="small" onClick={() => setSystemPromptRows(Math.min(30, systemPromptRows + 2))} disabled={systemPromptRows >= 30}><AddIcon /></IconButton>
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  label="Nome profilo"
                  value={selectedSystemPromptName}
                  onChange={(e)=> setSelectedSystemPromptName(e.target.value)}
                  sx={{ mb: 1 }}
                />
                <TextField
                  fullWidth
                  multiline
                  rows={systemPromptRows}
                  value={systemPrompt}
                  onChange={(e) => {
                    setSystemPrompt(e.target.value)
                    setPromptChars(e.target.value.length)
                    setPromptTokens(Math.ceil(e.target.value.length / 4))
                  }}
                  placeholder="Inserisci il prompt sistema..."
                />
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="textSecondary">
                    Caratteri: {promptChars} | Token stimati: {promptTokens}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={saveSystemPrompt}
                    disabled={savingPrompt}
                  >
                    {savingPrompt ? 'Salvataggio...' : 'Salva Prompt Sistema'}
                  </Button>
                </Box>
              </Box>

              {/* Token Estimator */}
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Token Estimator
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  value={tokenTestInput}
                  onChange={(e) => setTokenTestInput(e.target.value)}
                  placeholder="Inserisci testo per calcolare i token..."
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="outlined"
                  onClick={testTokens}
                  disabled={testingTokens || !tokenTestInput.trim()}
                  sx={{ mb: 2 }}
                >
                  {testingTokens ? 'Calcolo...' : 'Calcola Token'}
                </Button>
                {tokenTestResult && (
                  <Alert severity="info">
                    <Typography variant="body2">
                      <strong>Caratteri:</strong> {tokenTestResult.characters}<br/>
                      <strong>Token stimati:</strong> {tokenTestResult.estimated_tokens}<br/>
                      <strong>Parole:</strong> {tokenTestResult.words}
                    </Typography>
                  </Alert>
                )}
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Personalità (Preset) */}
        <Accordion 
          expanded={expandedPanels.personalities} 
          onChange={handlePanelExpansion('personalities')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <PsychologyIcon color="primary" />
              <Typography variant="h6">Personalità (Preset)</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Box sx={{ display:'flex', gap:1, alignItems:'center', flexWrap:'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel>Personalità</InputLabel>
                  <Select
                    label="Personalità"
                    value={selectedPersonalityId}
                    onChange={(e)=>{
                      const id = e.target.value as string; setSelectedPersonalityId(id);
                      const p = personalities.find(pp=>pp.id===id); if(p){
                        setPersonalityName(p.name); setPersonalityProvider(p.provider); setPersonalityModel(p.model); setPersonalityPromptId(p.system_prompt_id);
                      }
                    }}
                  >
                    {personalities.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        <Typography variant="body2">{p.name}{p.id===defaultPersonalityId?' (default)':''}</Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button size="small" variant="outlined" onClick={createPersonality}>Nuova</Button>
                <Button size="small" color="error" variant="outlined" onClick={deletePersonality} disabled={!selectedPersonalityId}>Elimina</Button>
                <Button size="small" variant="contained" onClick={setDefaultPersonality} disabled={!selectedPersonalityId || selectedPersonalityId===defaultPersonalityId}>Imposta Default</Button>
              </Box>
              <TextField label="Nome" size="small" fullWidth value={personalityName} onChange={(e)=>setPersonalityName(e.target.value)} />
              <Box sx={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                <FormControl size="small" sx={{ minWidth:160 }}>
                  <InputLabel>Provider</InputLabel>
                  <Select label="Provider" value={personalityProvider} onChange={(e)=>{
                    const val = e.target.value as string
                    setPersonalityProvider(val)
                    // If models available for provider, pick the first by default
                    const models = getProviderModels(val)
                    if (models.length>0) setPersonalityModel(models[0])
                    else {
                      // try loading models from backend for this provider
                      loadModels(val)
                    }
                  }}>
                    {config && Object.keys(config.ai_providers).map(pk=> (
                      <MenuItem key={pk} value={pk}>{pk}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {/* Modello: dropdown se disponibile, altrimenti input libero */}
                {(() => {
                  const models = getProviderModels(personalityProvider)
                  if (models.length > 0) {
                    return (
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Modello</InputLabel>
                        <Select
                          label="Modello"
                          value={models.includes(personalityModel) ? personalityModel : models[0]}
                          onChange={(e)=> setPersonalityModel(e.target.value as string)}
                        >
                          {models.map(m => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                        </Select>
                      </FormControl>
                    )
                  }
                  return (
                    <TextField label="Modello" size="small" value={personalityModel} onChange={(e)=>setPersonalityModel(e.target.value)} />
                  )
                })()}
                <FormControl size="small" sx={{ minWidth:200 }}>
                  <InputLabel>System Prompt</InputLabel>
                  <Select label="System Prompt" value={personalityPromptId} onChange={(e)=>setPersonalityPromptId(e.target.value as string)}>
                    {systemPrompts.map(sp=> (
                      <MenuItem key={sp.id} value={sp.id}>{sp.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Box>
                <Button variant="contained" onClick={savePersonality}>Salva Personalità</Button>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Pipeline */}
        <Accordion 
          expanded={expandedPanels.pipeline} 
          onChange={handlePanelExpansion('pipeline')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <SettingsIcon color="primary" />
              <Typography variant="h6">Pipeline Configurazione</Typography>
              <Chip 
                label={pipelineConfig?.routes?.length || 0} 
                size="small" 
                color="info" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {pipelineConfig && (
              <Grid container spacing={3}>
                {/* Gestione Route */}
                <Grid item xs={12} md={6}>
                  <Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                        Route ({pipelineConfig.routes?.length || 0})
                      </Typography>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setPipelineDialogs({...pipelineDialogs, addRoute: true})}
                      >
                        Aggiungi Route
                      </Button>
                    </Box>
                    
                    <TableContainer sx={{ maxHeight: 300 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Pattern</TableCell>
                            <TableCell>Topic</TableCell>
                            <TableCell width={100}>Azioni</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pipelineConfig.routes?.map((route, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Tooltip title={route.pattern}>
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {route.pattern.length > 20 ? 
                                      route.pattern.substring(0, 20) + '...' : 
                                      route.pattern
                                    }
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                <Chip size="small" label={route.topic} />
                              </TableCell>
                              <TableCell>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSelectedPipelineRoute(route);
                                    setPipelineDialogs({...pipelineDialogs, editRoute: true});
                                  }}
                                >
                                  <EditIcon />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => deletePipelineRoute(route.pattern, route.topic)}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Grid>

                {/* Gestione File */}
                <Grid item xs={12} md={6}>
                  <Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                        File Mapping ({Object.keys(pipelineConfig.files || {}).length})
                      </Typography>
                      <Box sx={{ display:'flex', gap:1 }}>
                        <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setPipelineDialogs({...pipelineDialogs, addFile: true})}
                      >
                        Aggiungi File
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<UploadIcon />}
                          onClick={uploadPipelineFile}
                        >
                          Carica File
                        </Button>
                      </Box>
                    </Box>
                    
                    <TableContainer sx={{ maxHeight: 300 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Topic</TableCell>
                            <TableCell>File</TableCell>
                            <TableCell width={100}>Azioni</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(pipelineConfig.files || {}).map(([topic, filename]) => (
                            <TableRow key={topic}>
                              <TableCell>
                                <Chip size="small" label={topic} />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                  {filename}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSelectedPipelineFile({ topic, filename });
                                    setPipelineDialogs({...pipelineDialogs, editFile: true});
                                  }}
                                >
                                  <EditIcon />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  title="Modifica contenuto"
                                  onClick={() => openFileEditor(filename)}
                                >
                                  <DescriptionIcon />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => deletePipelineFile(topic)}
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                </Grid>
              </Grid>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Impostazioni UI */}
        <Accordion 
          expanded={expandedPanels.ui_settings} 
          onChange={handlePanelExpansion('ui_settings')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <SettingsIcon color="primary" />
              <Typography variant="h6">Impostazioni Interfaccia</Typography>
              <Chip 
                label={uiSettings.arena_public ? 'Arena pubblica' : 'Solo admin'} 
                size="small" 
                color={uiSettings.arena_public ? 'success' : 'default'} 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControlLabel
                control={<Switch checked={uiSettings.arena_public} onChange={(e)=> setUiSettings({...uiSettings, arena_public: e.target.checked})} />}
                label="Rendi la pagina Arena visibile a tutti gli utenti"
              />
              <Box>
                <Button variant="contained" onClick={saveUiSettings} disabled={savingUi}>
                  {savingUi ? 'Salvataggio...' : 'Salva Impostazioni UI'}
                </Button>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Log & Interazioni */}
        <Accordion 
          expanded={expandedPanels.logs} 
          onChange={handlePanelExpansion('logs')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StatsIcon color="primary" />
              <Typography variant="h6">Log & Interazioni</Typography>
              <Chip label={`${interactionsTotal} eventi`} size="small" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              {/* System Log */}
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Log di Sistema</Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <TextField label="Ultime righe" size="small" type="number" value={systemTail} onChange={e=> setSystemTail(parseInt(e.target.value||'300',10))} sx={{ width: 140 }} />
                  <Button variant="outlined" size="small" onClick={loadSystemLog}>Aggiorna</Button>
                  <Button variant="contained" size="small" onClick={downloadSystem} startIcon={<DownloadIcon/>}>Scarica</Button>
                </Stack>
                <Box component="pre" sx={{ bgcolor: '#0d1117', color: '#c9d1d9', p: 1.5, borderRadius: 1, maxHeight: 240, overflow: 'auto', fontSize: 12 }}>
                  {systemLog.join('\n') || 'Nessun log disponibile'}
                </Box>
              </Box>

              {/* Interactions Log */}
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>Log Interazioni Modelli</Typography>
                <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Data</InputLabel>
                      <Select value={selectedLogDate} label="Data" onChange={e=> setSelectedLogDate(e.target.value)}>
                        {logDates.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={groupByRequest} onChange={e=> { setGroupByRequest(e.target.checked); setTimeout(loadInteractions, 0) }} />} label="Raggruppa per Request ID" />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={logsAutoRefresh} onChange={e=> setLogsAutoRefresh(e.target.checked)} />} label="Auto refresh (10s)" />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Provider</InputLabel>
                      <Select label="Provider" value={logProvider} onChange={e=> setLogProvider(e.target.value)}>
                        <MenuItem value=""><em>Tutti</em></MenuItem>
                        {logOptions.providers.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={logsAutoRefresh} onChange={e=> setLogsAutoRefresh(e.target.checked)} />} label="Auto refresh (10s)" />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Evento</InputLabel>
                      <Select label="Evento" value={logEvent} onChange={e=> setLogEvent(e.target.value)}>
                        <MenuItem value=""><em>Tutti</em></MenuItem>
                        {logOptions.events.map(ev => <MenuItem key={ev} value={ev}>{ev}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={logsAutoRefresh} onChange={e=> setLogsAutoRefresh(e.target.checked)} />} label="Auto refresh (10s)" />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Personalità</InputLabel>
                      <Select label="Personalità" value={logPersonalityId} onChange={e=> setLogPersonalityId(e.target.value)}>
                        <MenuItem value=""><em>Tutte</em></MenuItem>
                        {logOptions.personalities.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.id}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Modello</InputLabel>
                      <Select label="Modello" value={logModel} onChange={e=> setLogModel(e.target.value)}>
                        <MenuItem value=""><em>Tutti</em></MenuItem>
                        {logOptions.models.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Conversazione</InputLabel>
                      <Select label="Conversazione" value={logConversationId} onChange={e=> setLogConversationId(e.target.value)}>
                        <MenuItem value=""><em>Tutte</em></MenuItem>
                        {logOptions.conversation_ids.map(id => <MenuItem key={id} value={id}>{id}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={logsAutoRefresh} onChange={e=> setLogsAutoRefresh(e.target.checked)} />} label="Auto refresh (10s)" />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Utente ID</InputLabel>
                      <Select label="Utente ID" value={logUserId} onChange={e=> setLogUserId(e.target.value)}>
                        <MenuItem value=""><em>Tutti</em></MenuItem>
                        {logOptions.user_ids.map((id) => <MenuItem key={String(id)} value={String(id)}>{String(id)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <FormControlLabel control={<Switch checked={logsAutoRefresh} onChange={e=> setLogsAutoRefresh(e.target.checked)} />} label="Auto refresh (10s)" />
                  </Grid>
                  <Grid item xs={6} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Topic</InputLabel>
                      <Select label="Topic" value={logTopic} onChange={e=> setLogTopic(e.target.value)}>
                        <MenuItem value=""><em>Tutti</em></MenuItem>
                        {logOptions.topics.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <Stack direction="row" spacing={3} alignItems="center" sx={{ mt: 1 }}>
                      <Box sx={{ width: 260 }}>
                        <Typography variant="caption" color="text.secondary">Durata (ms)</Typography>
                        <Slider value={durationRange} onChange={(_,v)=> setDurationRange(v as number[])} valueLabelDisplay="auto" min={0} max={600000} step={100} />
                      </Box>
                      <Box sx={{ width: 260 }}>
                        <Typography variant="caption" color="text.secondary">Token</Typography>
                        <Slider value={tokensRange} onChange={(_,v)=> setTokensRange(v as number[])} valueLabelDisplay="auto" min={0} max={200000} step={100} />
                      </Box>
                      <Button variant="outlined" size="small" onClick={()=>{ loadLogDates(); loadLogFilters(); loadInteractions(); }}>Aggiorna</Button>
                      <Button variant="contained" size="small" onClick={downloadInteractions} startIcon={<DownloadIcon/>}>Scarica JSONL</Button>
                      <Button variant="outlined" size="small" onClick={downloadInteractionsCsv}>Esporta CSV</Button>
                      <Button variant="text" size="small" onClick={()=>{ setLogProvider(''); setLogEvent(''); setLogPersonalityId(''); setLogModel(''); setLogConversationId(''); setLogUserId(''); setLogTopic(''); setRagFilter(''); setDurationRange([0,600000]); setTokensRange([0,200000]); }}>Reset filtri</Button>
                    </Stack>
                  </Grid>
                </Grid>
                {interactionsLoading && <LinearProgress sx={{ mb: 1 }} />}
                <Table size="small">
                  <TableHead>
                    {groupByRequest ? (
                      <TableRow>
                        <TableCell>Start</TableCell>
                        <TableCell>End</TableCell>
                        <TableCell>Request ID</TableCell>
                        <TableCell>Provider</TableCell>
                        <TableCell>Modello</TableCell>
                        <TableCell>Personalità</TableCell>
                        <TableCell>Topic</TableCell>
                        <TableCell align="right">Dur. (ms)</TableCell>
                        <TableCell align="right">Token</TableCell>
                        <TableCell>RAG</TableCell>
                        <TableCell>RAG Preview</TableCell>
                        <TableCell>Azioni</TableCell>
                      </TableRow>
                    ) : (
                      <TableRow>
                        <TableCell>TS</TableCell>
                        <TableCell>Request ID</TableCell>
                        <TableCell>Evento</TableCell>
                        <TableCell>Provider</TableCell>
                        <TableCell>Modello</TableCell>
                        <TableCell>Personalità</TableCell>
                        <TableCell>Topic</TableCell>
                        <TableCell align="right">Dur. (ms)</TableCell>
                        <TableCell align="right">Token</TableCell>
                        <TableCell>RAG</TableCell>
                        <TableCell>RAG Preview</TableCell>
                        <TableCell>Azioni</TableCell>
                      </TableRow>
                    )}
                  </TableHead>
                  <TableBody>
                    {interactions.map((it, idx) => {
                      const tokens = (it.tokens?.total_tokens ?? it.tokens?.total ?? 0) as number
                      const pers = it.personality_name || it.personality_id || '-'
                      const providerDisp = (it.provider || it.provider_header || '-') as string
                      const modelDisp = (it.model || '-') as string
                      if (groupByRequest) {
                        const tok = (it.tokens_total ?? tokens) as number
                        return (
                          <TableRow key={idx} hover>
                            <TableCell>{it.start_ts || '-'}</TableCell>
                            <TableCell>{it.end_ts || '-'}</TableCell>
                            <TableCell>{it.request_id || '-'}</TableCell>
                            <TableCell>{providerDisp}</TableCell>
                            <TableCell>{modelDisp}</TableCell>
                            <TableCell>{pers}</TableCell>
                            <TableCell>{it.topic || '-'}</TableCell>
                            <TableCell align="right">{it.duration_ms ?? '-'}</TableCell>
                            <TableCell align="right">{tok || '-'}</TableCell>
                            <TableCell>{it.rag_used ? <Chip label="RAG" size="small" color="success" /> : '-'}</TableCell>
                            <TableCell>
                              {(it.rag_preview || []).map((r:any, idx:number)=> (
                                <Typography key={idx} variant="caption" display="block">{r.filename || 'file'}#{r.chunk_index} ({(r.similarity??0).toFixed ? r.similarity.toFixed(2) : r.similarity})</Typography>
                              ))}
                            </TableCell>
                            <TableCell>
                              <Button size="small" variant="text" onClick={()=> openTimeline(it.request_id)}>Timeline</Button>
                              <Button size="small" variant="text" onClick={()=> openDetails(it)}>Dettagli</Button>
                            </TableCell>
                          </TableRow>
                        )
                      } else {
                        return (
                          <TableRow key={idx} hover>
                            <TableCell>{it.ts || '-'}</TableCell>
                            <TableCell>{it.request_id || '-'}</TableCell>
                            <TableCell>{it.event || '-'}</TableCell>
                            <TableCell>{providerDisp}</TableCell>
                            <TableCell>{modelDisp}</TableCell>
                            <TableCell>{pers}</TableCell>
                            <TableCell>{it.topic || '-'}</TableCell>
                            <TableCell align="right">{it.duration_ms ?? '-'}</TableCell>
                            <TableCell align="right">{tokens}</TableCell>
                            <TableCell>{it.rag_used ? <Chip label="RAG" size="small" color="success" /> : '-'}</TableCell>
                            <TableCell>
                              {(it.rag_preview || []).map((r:any, idx:number)=> (
                                <Typography key={idx} variant="caption" display="block">{r.filename || 'file'}#{r.chunk_index} ({(r.similarity??0).toFixed ? r.similarity.toFixed(2) : r.similarity})</Typography>
                              ))}
                            </TableCell>
                            <TableCell>
                              <Button size="small" variant="text" onClick={()=> openDetails(it)}>Dettagli</Button>
                            </TableCell>
                          </TableRow>
                        )
                      }
                    })}
                  </TableBody>
                </Table>
                <Typography variant="caption" color="text.secondary">Totale: {interactionsTotal}</Typography>
                {interactionsTotal === 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Nessun evento trovato per i filtri selezionati. Prova a rimuovere il filtro Evento o cambiare Data.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Pannello Riassunti */}
        <Accordion 
          expanded={expandedPanels.summaries} 
          onChange={handlePanelExpansion('summaries')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <SecurityIcon color="primary" />
              <Typography variant="h6">Impostazioni Riassunti Chat</Typography>
              <Chip 
                label={summarySettings.enabled ? 'Attivo' : 'Disattivo'} 
                size="small" 
                color={summarySettings.enabled ? 'success' : 'default'} 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={3}>
              {/* Impostazioni Provider */}
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                  Provider per Riassunti
                </Typography>
                
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Provider AI</InputLabel>
                  <Select
                    value={summarySettings.provider}
                    onChange={(e) => setSummarySettings({...summarySettings, provider: e.target.value})}
                    label="Provider AI"
                  >
                    <MenuItem value="anthropic">Claude (Anthropic)</MenuItem>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="openrouter">OpenRouter</MenuItem>
                    <MenuItem value="gemini">Google Gemini</MenuItem>
                    <MenuItem value="ollama">Ollama</MenuItem>
                  </Select>
                </FormControl>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={summarySettings.enabled}
                      onChange={(e) => setSummarySettings({...summarySettings, enabled: e.target.checked})}
                    />
                  }
                  label="Abilita riassunti automatici delle conversazioni"
                />
              </Box>

              {/* Configurazione Prompt */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    Prompt per Riassunti
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">
                      Righe:
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSummaryPromptRows(Math.max(3, summaryPromptRows - 2))}
                      disabled={summaryPromptRows <= 3}
                    >
                      <RemoveIcon />
                    </IconButton>
                    <Typography variant="caption" sx={{ minWidth: '20px', textAlign: 'center' }}>
                      {summaryPromptRows}
                    </Typography>
                    <IconButton 
                      size="small" 
                      onClick={() => setSummaryPromptRows(Math.min(25, summaryPromptRows + 2))}
                      disabled={summaryPromptRows >= 25}
                    >
                      <AddIcon />
                    </IconButton>
                  </Box>
                </Box>
                
                <TextField
                  fullWidth
                  multiline
                  rows={summaryPromptRows}
                  value={summaryPrompt}
                  onChange={(e) => setSummaryPrompt(e.target.value)}
                  placeholder="Inserisci il prompt per i riassunti..."
                  label="Prompt personalizzato per la generazione dei riassunti"
                />
                
                <Button
                  variant="contained"
                  onClick={saveSummaryPrompt}
                  disabled={savingSummaryPrompt}
                  sx={{ mt: 2 }}
                >
                  {savingSummaryPrompt ? 'Salvataggio...' : 'Salva Prompt Riassunti'}
                </Button>
              </Box>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {/* Pannello RAG Management */}
        <Accordion 
          expanded={expandedPanels.rag_management} 
          onChange={handlePanelExpansion('rag_management')}
          sx={{ borderRadius: 4, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" gap={1}>
              <StorageIcon color="primary" />
              <Typography variant="h6">Gestione RAG</Typography>
              <Chip 
                label="Documenti" 
                size="small" 
                color="primary" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <AdminRAGManagement />
          </AccordionDetails>
        </Accordion>

        {/* User Management Panel */}
        <Accordion expanded={expandedPanels.user_management} onChange={handlePanelExpansion('user_management')}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon />
              <Typography>Gestione Utenti</Typography>
              <Chip 
                label="Account" 
                size="small" 
                color="secondary" 
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <UserManagementComponent />
          </AccordionDetails>
        </Accordion>

      </Stack>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button 
          variant="contained" 
          size="large" 
          onClick={saveConfig}
          disabled={loading || !config}
        >
          {loading ? 'Salvataggio...' : 'Salva Configurazione'}
        </Button>
      </Box>

      {/* Dialog Dettagli Log */}
      <Dialog open={detailOpen} onClose={closeDetails} maxWidth="md" fullWidth>
        <DialogTitle>Dettagli evento</DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{ bgcolor: '#0d1117', color: '#c9d1d9', p: 1.5, borderRadius: 1, maxHeight: 480, overflow: 'auto', fontSize: 12 }}>
            {detailItem ? JSON.stringify(detailItem, null, 2) : ''}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={copyDetails} startIcon={<DownloadIcon/>} variant="outlined">Copia JSON</Button>
          <Button onClick={closeDetails} variant="contained">Chiudi</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Timeline */}
      <Dialog open={timelineOpen} onClose={()=> setTimelineOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Timeline richiesta</DialogTitle>
        <DialogContent dividers>
          {(() => {
            const rows = (timelineItems || []).slice().sort((a:any,b:any)=> (a.ts||'').localeCompare(b.ts||''))
            const start = rows.length > 0 ? new Date(rows[0].ts) : null
            const delta = (ts:string) => {
              if (!start || !ts) return '-'
              const d = new Date(ts).getTime() - start.getTime()
              return d >= 0 ? d : '-'
            }
            return (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>TS</TableCell>
                    <TableCell align="right">Δ (ms)</TableCell>
                    <TableCell>Evento</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Modello</TableCell>
                    <TableCell>Dur. (ms)</TableCell>
                    <TableCell>Token</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((ev:any, i:number) => {
                    const tokens = ev.tokens?.total_tokens ?? ev.tokens?.total ?? ''
                    return (
                      <TableRow key={i}>
                        <TableCell>{ev.ts || '-'}</TableCell>
                        <TableCell align="right">{delta(ev.ts)}</TableCell>
                        <TableCell>{ev.event || '-'}</TableCell>
                        <TableCell>{ev.provider || ev.provider_header || '-'}</TableCell>
                        <TableCell>{ev.model || '-'}</TableCell>
                        <TableCell>{ev.duration_ms ?? '-'}</TableCell>
                        <TableCell>{tokens}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          })()}
          <Box component="pre" sx={{ bgcolor: '#0d1117', color: '#c9d1d9', p: 1.5, borderRadius: 1, maxHeight: 240, overflow: 'auto', fontSize: 12, mt: 2 }}>
            {timelineItems && timelineItems.length > 0 ? JSON.stringify(timelineItems, null, 2) : 'Nessun evento trovato per questa richiesta.'}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setTimelineOpen(false)} variant="contained">Chiudi</Button>
        </DialogActions>
      </Dialog>

      {/* Pipeline Dialogs */}
      <PipelineRouteAddDialog />
      <PipelineRouteEditDialog />
      <PipelineFileAddDialog />
      <PipelineFileEditDialog />
      {/* File Editor Dialog */}
      <Dialog open={fileEditorOpen} onClose={()=> setFileEditorOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Modifica file: {fileEditorFilename}</DialogTitle>
        <DialogContent>
          {fileEditorLoading ? (
            <Box sx={{ py:2, display:'flex', justifyContent:'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <TextField
              fullWidth
              multiline
              minRows={20}
              value={fileEditorContent}
              onChange={(e)=> setFileEditorContent(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setFileEditorOpen(false)}>Chiudi</Button>
          <Button variant="contained" onClick={saveFileEditor} disabled={fileEditorSaving || fileEditorLoading}>{fileEditorSaving ? 'Salvataggio...' : 'Salva'}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}
