import React, { useEffect, useState } from 'react'
import type { PersonalityEntry } from './types/admin'
import type Msg from './types/message'
import type { SourceDocs } from './types/message'
import { Container, Box, Paper, Typography, TextField, IconButton, Stack, Select, MenuItem, Avatar, Tooltip, Drawer, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Collapse, Card, CardContent, Chip, FormControl, CircularProgress, Link, Menu, ListItemIcon, ListItemText, LinearProgress } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import PersonIcon from '@mui/icons-material/Person'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import CheckIcon from '@mui/icons-material/Check'
import MenuIcon from '@mui/icons-material/Menu'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import TableChartIcon from '@mui/icons-material/TableChart'
import ImageIcon from '@mui/icons-material/Image'
import ChatAvatar from './components/ChatAvatar'
import { DownloadChatButton } from './components/DownloadChatButton'
import { CopyIcon, DownloadIcon as SmallDownloadIcon, LikeIcon, DislikeIcon, CheckIcon as SmallCheckIcon, SpeakerIcon, StopIcon as SmallStopIcon, MicIcon as SmallMicIcon, AIIcon } from './components/SmallIcons'
import { ConversationSidebar } from './components/ConversationSidebar'
import ConversationSearch from './components/ConversationSearch'
import LoginDialog from './components/LoginDialog'
import FileUpload, { ProcessedFile } from './components/FileUpload'
import FileManagerCompact from './components/FileManagerCompact'
import ChatToolbar from './components/ChatToolbar'
import FormRunnerDialog from './components/FormRunnerDialog'
import FormResultRenderer from './components/FormResultRenderer'
import VoiceRecordingAnimation from './components/VoiceRecordingAnimation'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { createApiService } from './types/api'
import AdminPanel from './AdminPanel'
import { ThemeProvider } from '@mui/material/styles'
import { appTheme } from './theme'
import RAGContextSelector from './components/RAGContextSelector'
import SurveyForm from './SurveyForm'
import SurveyResults from './SurveyResults'
import { authFetch } from './utils/authFetch'
import ReactMarkdown from 'react-markdown'
import { prepareChatMarkdown, toPlainText } from './utils/markdownPipeline'
import { buildDocumentAggregate, detectPreviewType, fetchTextTruncated, normalizeDocName } from './utils/ragPreview'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { useTheme, useMediaQuery } from '@mui/material'
import MobileChatBar from './components/MobileChatBar'
import HeaderBar from './components/HeaderBar'
import SiteFooter from './components/SiteFooter'

// Tipo minimo per dati estratti (placeholder se non definito altrove)
type ExtractedData = {
  tables?: { image_num: number; source: string; data: string }[]
  images?: { image_num: number; source: string; full_description: string }[]
}

type RAGResult = {
  chunk_id?: any
  document_id?: any
  filename?: string
  chunk_index?: number
  similarity?: number
  preview?: string
  content?: string
}

// SourceDocs moved to shared types (`./types/message`)

/* Msg type imported from ./types/message */

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005')

// Componente per box dati estratti espandibile
const ExtractedDataBox: React.FC<{extractedData: ExtractedData, messageIndex: number}> = ({extractedData, messageIndex}) => {
  const [expanded, setExpanded] = useState(false)
  
  const hasData = (extractedData.tables && extractedData.tables.length > 0) || 
                  (extractedData.images && extractedData.images.length > 0)
  
  if (!hasData) return null
  
  return (
    <Box sx={{ maxWidth: '80%', ml: 7 }}>  {/* Always left margin for assistant messages */}
      <Card sx={{ 
        bgcolor: '#f5f5f5', 
        border: '1px solid #e0e0e0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 1.5, 
            cursor: 'pointer',
            '&:hover': { bgcolor: '#eeeeee' }
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            {extractedData.tables && extractedData.tables.length > 0 && (
              <Chip 
                icon={<TableChartIcon />} 
                label={`${extractedData.tables.length} Valori`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
            {extractedData.images && extractedData.images.length > 0 && (
              <Chip 
                icon={<ImageIcon />} 
                label={`${extractedData.images.length} Testi`}
                size="small"
                color="secondary"
                variant="outlined"
              />
            )}
          </Box>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
        
        <Collapse in={expanded}>
          <CardContent sx={{ pt: 0 }}>
            {extractedData.tables && extractedData.tables.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: '#1976d2' }}>
                  � Valori Numerici Estratti
                </Typography>
                {extractedData.tables.map((table: { image_num: number; source: string; data: string }, idx: number) => (
                  <Box key={idx} sx={{ mb: 1.5, p: 1.5, bgcolor: '#ffffff', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                    <Typography variant="caption" color="text.secondary">
                      Immagine {table.image_num} ({table.source})
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.5, color: '#1976d2', fontWeight: 'bold' }}>
                      {table.data}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            
            {extractedData.images && extractedData.images.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: '#9c27b0' }}>
                  Descrizioni Immagini
                </Typography>
                {extractedData.images.map((img: { image_num: number; source: string; full_description: string }, idx: number) => (
                  <Box key={idx} sx={{ mb: 1.5, p: 1.5, bgcolor: '#ffffff', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                    <Typography variant="caption" color="text.secondary">
                      Immagine {img.image_num} ({img.source})
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {img.full_description}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Collapse>
      </Card>
    </Box>
  )
}

// Componente App interno che usa AuthContext
const AppContent: React.FC = () => {
  const { user, crypto, isAuthenticated, isLoading, login, logout, needsCryptoReauth, mustChangePassword, checkAuthStatus } = useAuth();
  const [forcePwdOpen, setForcePwdOpen] = useState(false)
  const [forceNewPwd, setForceNewPwd] = useState('')
  const [forceNewPwd2, setForceNewPwd2] = useState('')
  const [forcePwdError, setForcePwdError] = useState<string|undefined>()
  
  const [messages,setMessages] = useState<Msg[]>(()=>{
    const saved = localStorage.getItem('chat_messages')
    if(saved){
      try { return JSON.parse(saved) }
      catch { localStorage.removeItem('chat_messages') }
    }
    // Placeholder provvisorio; sarà sostituito se esiste un welcome attivo
    return [{role:'assistant', content:'Caricamento messaggio di benvenuto…', ts:Date.now()}]
  })
  const [welcomeLoaded, setWelcomeLoaded] = useState(false)
  const [activeGuide, setActiveGuide] = useState<string|undefined>()
  const [input,setInput] = useState('')
  const [provider,setProvider] = useState<'local'|'gemini'|'claude'|'openai'|'openrouter'|'ollama'>('local')
  const [personalities, setPersonalities] = useState<PersonalityEntry[]>([])
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('')
  const [error,setError] = useState<string|undefined>()
  const [loading,setLoading] = useState(false)
  const [ttsProvider, setTtsProvider] = useState<'edge'|'elevenlabs'|'openai'|'piper'|'coqui'>('edge')
  const [ttsVoice, setTtsVoice] = useState<string | undefined>(undefined)
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  // Whisper async model loading states
  const [whisperModalOpen, setWhisperModalOpen] = useState(false)
  const [whisperStage, setWhisperStage] = useState<'downloading'|'loading'|null>(null)
  const [whisperProgress, setWhisperProgress] = useState<number>(0)
  const [whisperModel, setWhisperModel] = useState<string>('small')
  const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob|null>(null)
  const whisperPollRef = React.useRef<number|undefined>(undefined)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [feedback, setFeedback] = useState<{[key: number]: 'like' | 'dislike'}>({})
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [guideLoading, setGuideLoading] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<ProcessedFile[]>([])
  const [userAvatar, setUserAvatar] = useState<string | null>(()=>{ try { return localStorage.getItem('user_avatar') } catch { return null } })
  const [enabledProviders, setEnabledProviders] = useState<string[]>([])
  const [enabledTtsProviders, setEnabledTtsProviders] = useState<string[]>([])
  const [enabledAsrProviders, setEnabledAsrProviders] = useState<string[]>([])
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultTts, setDefaultTts] = useState('')
  const [defaultAsr, setDefaultAsr] = useState('')
  const [arenaPublic, setArenaPublic] = useState(false)
  const [asrProvider, setAsrProvider] = useState<'openai'|'local'>('openai')
  const [showRAGSelector, setShowRAGSelector] = useState(false)
  const [ragContextActive, setRAGContextActive] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingAssistantIndex, setStreamingAssistantIndex] = useState<number | null>(null)
  const [showSurvey, setShowSurvey] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [showFormDialog, setShowFormDialog] = useState(false)
  // Traccia file già annunciati in chat per non duplicare il riepilogo
  const announcedUploadIdsRef = React.useRef<Set<string>>(new Set())
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isVerySmall = useMediaQuery('(max-width:420px)')
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null)
  const openMore = Boolean(moreAnchor)
  const handleOpenMore = (e: React.MouseEvent<HTMLElement>) => setMoreAnchor(e.currentTarget)
  const handleCloseMore = () => setMoreAnchor(null)

  // Preview dialog state for document links (txt, md, pdf)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewType, setPreviewType] = useState<'pdf' | 'markdown' | 'text' | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string>('')
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null) // object URL for pdf
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  // Filtro similarità minima per visualizzare chunk/documenti (0 = disattivato)
  const [minRagSimilarity, setMinRagSimilarity] = useState<number>(0)

  // Build aggregated content for a document name from rag chunks (moved to utils)

  // (doc:// link injection is handled by prepareChatMarkdown)

  const openPreviewForLink = async (href: string, title: string, ragChunksForContext?: SourceDocs['rag_chunks']) => {
    console.debug('[preview] openPreviewForLink', { href, title, chunkCount: ragChunksForContext?.length })
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setPreviewOpen(true)
    setPreviewTitle(title || href)
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewContent('')
    try {
      if (href.startsWith('doc://')) {
        const name = href.slice('doc://'.length)
        const agg = buildDocumentAggregate(name, ragChunksForContext)
        if (!agg) {
          // Fallback: mostra elenco chunk candidati per debug
          const candidates = (ragChunksForContext||[]).filter(c=>{
            const fn = c.filename || ''
            const base = fn.split('/').pop() || fn
            const cleaned = normalizeDocName(base.split('_').pop() || base)
            return cleaned.includes(normalizeDocName(decodeURIComponent(name)))
          })
          setPreviewType('markdown')
          setPreviewContent(`# ${decodeURIComponent(name)}\n\nNessun aggregato completo trovato.\n\nChunk candidati trovati: ${candidates.length}\n\n` + candidates.map(c=>`### Chunk ${c.chunk_index} (${c.filename})\n${c.preview || c.content || '(vuoto)'}\n`).join('\n'))
        } else {
          setPreviewType('markdown')
          setPreviewContent(`# ${decodeURIComponent(name)}\n\n${agg}`)
        }
      } else {
        const type = detectPreviewType(href)
        setPreviewType(type)
        if (type === 'pdf') {
          const res = await fetch(href)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
        } else {
          const text = await fetchTextTruncated(href)
          setPreviewContent(text)
        }
      }
    } catch (e: any) {
      console.warn('[preview] error', e)
      setPreviewError(e?.message || 'Errore caricamento documento')
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreviewOpen(false)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setPreviewType(null)
    setPreviewContent('')
    setPreviewError(null)
  }

  // Helpers markdown (reinserted here so they're in scope before usage)
  // (plain-text conversion moved to utils/markdownPipeline.ts)

  // (markdown normalization handled by utils/markdownPipeline.ts)

  // Migliora ulteriormente le tabelle markdown:
  // - Aggiunge riga separatrice se manca (caso: modello produce solo header + righe dati senza ---)
  // - Normalizza spazi superflui attorno alle pipes
  

  // Provider mappings
  const providerLabels: Record<string, string> = {
    'local': 'Locale',
    'gemini': 'Gemini',
    'claude': 'Claude',
    'openai': 'GPT',
    'openrouter': 'OpenRouter',
    'ollama': 'Ollama'
  }

  const ttsLabels: Record<string, string> = {
    'edge': 'Edge',
    'elevenlabs': 'ElevenLabs',
    'openai': 'OpenAI',
    'piper': 'Piper',
    'coqui': 'Coqui'
  }

  const asrLabels: Record<string, string> = {
    'openai': 'OpenAI Whisper',
    'local': 'Whisper Locale'
  }
  useEffect(()=>{ localStorage.setItem('chat_messages', JSON.stringify(messages)) },[messages])

  // (Removed) previously used DOM event flow for structured form results. FormRunnerDialog now calls back via onPostStructured.

  // (Rimossa) Bolla iniziale "Ho caricato X file" – manteniamo solo il riepilogo dettagliato

  // Avatar assistente: fisso (rimuoviamo avatar legati alla personalità)
  // Avatar dinamico: se personalità ha avatar_url usa quello, altrimenti fallback statico
  const selectedPersonality = personalities.find(p=> p.id === selectedPersonalityId)
  const assistantAvatarSrc = selectedPersonality?.avatar_url || '/volto.png'

  // Carica configurazione pubblica e welcome/guide attivi
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { apiService } = await import('./apiService')
        const response = await apiService.getPublicConfig()
        if (response.success && response.data) {
          // Coalesce undefined/null arrays to [] for safety
          const ep = Array.isArray(response.data.enabled_providers) ? response.data.enabled_providers : []
          const etts = Array.isArray(response.data.enabled_tts_providers) ? response.data.enabled_tts_providers : []
          const easr = Array.isArray(response.data.enabled_asr_providers) ? response.data.enabled_asr_providers : []
          const defProv = response.data.default_provider || ep[0] || 'local'
          const defTts = response.data.default_tts || etts[0] || 'edge'
          const defAsr = response.data.default_asr || easr[0] || 'openai'
          setEnabledProviders(ep)
          setEnabledTtsProviders(etts)
          setEnabledAsrProviders(easr)
            setDefaultProvider(defProv)
          setDefaultTts(defTts)
          setDefaultAsr(defAsr)
          setArenaPublic(Boolean(response.data.ui_settings?.arena_public))

          // Adjust current selections only if they are no longer valid
          if (!ep.includes(provider)) {
            setProvider(defProv as any)
          }
          if (!etts.includes(ttsProvider)) {
            setTtsProvider(defTts as any)
          }
          if (!easr.includes(asrProvider)) {
            setAsrProvider(defAsr as any)
          }
        }
        // Fetch welcome + guide attivi (solo se non già persistiti in localStorage o non caricati)
        try {
          const wg = await apiService.getPublicWelcomeGuide()
          if (wg.success && wg.data) {
            const welcomeText = wg.data.welcome?.content
            const guideText = wg.data.guide?.content
            setActiveGuide(guideText)
            setMessages(prev => {
              // Se l'utente ha già iniziato una conversazione non sovrascrivere
              if (prev.length > 1 || (prev[0] && prev[0].content && prev[0].content !== 'Caricamento messaggio di benvenuto…')) {
                return prev
              }
              if (welcomeText) {
                return [{ role:'assistant', content: welcomeText, ts: Date.now() }]
              }
              return prev
            })
          }
        } catch(e){ /* ignora */ }
        // Load personalities after config
        const pers = await apiService.getPersonalities()
        if (pers.success && pers.data) {
          setPersonalities(pers.data.personalities || [])
          const defId = pers.data.default_id || (pers.data.personalities?.[0]?.id || '')
          if (defId) {
            setSelectedPersonalityId(defId)
          }
          // If a default personality exists, prefer its provider
          const def = (pers.data.personalities || []).find(p => p.id === defId)
          if (def && response?.data?.enabled_providers?.includes(def.provider)) {
            setProvider(def.provider as any)
          }
          if (def?.tts_provider) {
            setTtsProvider(def.tts_provider as any)
          }
          if (def?.tts_voice) {
            setTtsVoice(def.tts_voice)
          }
          // Se la chat è allo stato iniziale, sostituisci welcome con quello della personalità
          if (def && messages.length <= 1) {
            const currentFirst = messages[0]?.content || '';
            if (toPlainText(currentFirst).trim().toLowerCase() === toPlainText('Caricamento messaggio di benvenuto…').trim().toLowerCase()) {
              const welcomeText = def.welcome_message_content || def.welcome_message
              if (welcomeText) {
                setMessages([{ role:'assistant', content: welcomeText, ts: Date.now() }])
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading config:', error)
      }
    }
  loadConfig().finally(()=> setWelcomeLoaded(true))
  }, [])

  // Disabilitato: non aprire più il dialog di cambio password forzato
  useEffect(() => {
    // Intenzionalmente non mostra nulla anche se mustChangePassword è true
  }, [isAuthenticated, mustChangePassword])

  useEffect(()=>{
    const handler = ()=>{
      localStorage.removeItem('chat_messages')
      navigator.sendBeacon(`${BACKEND}/api/chat/end-session`)
    }
    window.addEventListener('beforeunload', handler)
    return ()=> window.removeEventListener('beforeunload', handler)
  },[])

  // Funzione di logout personalizzata che azzera l'interfaccia
  const handleLogout = () => {
    // Chiama il logout del contesto auth
    logout();
    
    // Azzera tutto lo stato dell'interfaccia
  // Usa il placeholder di caricamento: verrà sostituito dal welcome pubblico o dalla personalità al caricamento
  setMessages([{ role: 'assistant', content: 'Caricamento messaggio di benvenuto…', ts: Date.now() }]);
    setInput('');
    setError(undefined);
    setLoading(false);
    setCurrentConversationId(null);
    setPlayingMessageIndex(null);
    setIsRecording(false);
    setCurrentAudio(null);
    setFeedback({});
    setCopiedMessage(null);
    setSidebarOpen(false);
    setShowLoginDialog(false);
    setShowSearch(false);
    setAttachedFiles([]);
    
    // Pulisci localStorage
    localStorage.removeItem('chat_messages');
  };

  const handleFilesProcessed = (files: ProcessedFile[]) => {
    setAttachedFiles(files);
  };

  // Quando vengono aggiunti nuovi PDF/TXT, inserisci un messaggio di riepilogo con toggle testo completo
  useEffect(() => {
    if (!attachedFiles || attachedFiles.length === 0) return;
    const newlyAdded = attachedFiles.filter(f => {
      const already = announcedUploadIdsRef.current.has(f.id)
      const ft = (f.file_type || '').toLowerCase()
      return !already && (ft === 'pdf' || ft === 'txt')
    })
    if (newlyAdded.length === 0) return;
    // segna come annunciati
    newlyAdded.forEach(f => announcedUploadIdsRef.current.add(f.id))
    // costruisci riepilogo
    const summary = newlyAdded.map(f => ({ id: f.id, filename: f.filename, size: f.size, file_type: f.file_type, content: f.content || '' }))
    setMessages(prev => ([
      ...prev,
      {
        role: 'assistant' as const,
        content: summary.length === 1 ? `Ho elaborato il file «${summary[0].filename}».` : `Ho elaborato ${summary.length} file.`,
        ts: Date.now(),
        uploadSummary: summary,
        __uploadExpanded: {}
      }
    ]))
  }, [attachedFiles])

  const send = async ()=>{
    const text = input.trim()
    if(!text) {
      return
    }
    // Prepara testo combinato da mostrare nella bolla utente (include testo estratto dagli allegati)
    const attachmentTextParts = (attachedFiles || [])
      .filter(f => (f && typeof f.content === 'string' && f.content.trim().length > 0))
      .map(f => `\n\n[Contenuto di ${f.filename}]:\n${f.content}`)
    const combinedForDisplay = text + (attachmentTextParts.length ? attachmentTextParts.join('') : '')
    // Auto-open form dialog when user replies "no" after summary confirmation prompt
    try {
      const t = text.toLowerCase()
      const wantsResubmit = /^(no[\s\.!\)]*|non\s+(va\s+bene|corretto|giusto)|sbagliato|correggi|reinvia)/.test(t)
      if (wantsResubmit) {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
        const la = (lastAssistant?.content || '').toLowerCase()
        const isConfirmationContext = la.includes('i dati sono corretti?') || la.includes('riepilogo del tuo invio') || la.includes('grazie per i dati inviati')
        if (isConfirmationContext) {
          setShowFormDialog(true)
          setInput('')
          return
        }
      }
    } catch {}
  const next: Msg[] = [...messages, {role:'user' as const, content: combinedForDisplay, ts:Date.now()}]
  setMessages(next); setInput('')
  setLoading(true); setError(undefined)
    try {
      // Ottieni il token di accesso per l'autenticazione
      const accessToken = localStorage.getItem('qsa_access_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'X-LLM-Provider': provider
      };
      if (selectedPersonalityId) {
        headers['X-Personality-Id'] = selectedPersonalityId
      }
      // Applica temperatura personalità come header opzionale per potenziale uso backend
      const personality = personalities.find(p=> p.id === selectedPersonalityId)
      if (personality?.tts_provider) {
        setTtsProvider(personality.tts_provider as any)
      }
      if (personality?.tts_voice) {
        setTtsVoice(personality.tts_voice)
      }
      if (personality?.temperature != null) {
        headers['X-LLM-Temperature'] = String(personality.temperature)
      }
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Gestione conversation_id: riutilizza quello esistente o crea nuovo se necessario
      let conversationId = currentConversationId;
      
      // Crea nuova conversazione SOLO se l'utente è autenticato E non esiste già una conversazione
      if (isAuthenticated && !conversationId) {
        try {
          // Genera titolo dalla prima parte del messaggio
          const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
          let titleToSend = title;
          
          // Title sent as plaintext (encryption disabled)
          titleToSend = title;

          const convResponse = await authFetch(`${BACKEND}/api/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              title_encrypted: titleToSend
            })
          });

          if (convResponse.ok) {
            const convData = await convResponse.json();
            conversationId = convData.conversation_id;
            setCurrentConversationId(conversationId);
            console.log('✅ Nuova conversazione creata:', conversationId);
          }
        } catch (convError) {
          console.warn('Failed to create conversation:', convError);
          // Continua senza conversation_id per mantenere funzionalità
        }
      } else if (conversationId) {
  console.log('Continuo conversazione esistente:', conversationId);
      }

  // Il messaggio viene sempre inviato in chiaro al backend per l'elaborazione LLM
  // (Non includere qui il testo degli allegati per evitare duplicazioni: il backend li aggiunge al prompt)
  const messageToSend = text;
      
      // Se l'utente è autenticato, prepara anche la versione crittografata per il database
  // No client-side encryption: store/display plaintext
  let messageEncrypted = null;
      const requestBody: any = { 
        message: messageToSend,  // Messaggio in chiaro per LLM
        sessionId: 'dev' 
      };
      
  // No client-side encryption: do not send message_encrypted
      
      // Aggiungi allegati se presenti
      if (attachedFiles.length > 0) {
        requestBody.attachments = attachedFiles.map(file => {
          const att: any = {
            id: file.id,
            filename: file.filename,
            file_type: file.file_type,
            content: file.content
          }
          if (file.base64_data) {
            att.base64_data = file.base64_data
          }
          return att
        });
      }
      
      // Aggiungi conversation_id se disponibile
      if (conversationId) {
        requestBody.conversation_id = conversationId;
        
        // Invia anche la cronologia recente per fornire contesto al LLM
        // Prendi gli ultimi 8 messaggi (4 scambi utente-assistente) per mantenere il contesto
        // Context window: se definito nella personalità, limita il numero di messaggi precedenti
        let historySource = messages
        const cw = personality?.context_window
        if (cw && cw > 0) {
          // cw rappresenta il numero massimo di messaggi (user+assistant) da includere (escludendo il system che è lato server)
            historySource = messages.slice(-cw)
        }
        // Fallback: al massimo 8 se nessun cw
  const recentHistory = historySource.slice(-(cw || 8)).map(msg => ({
            role: msg.role,
            content: msg.content
        }))
        
        requestBody.conversation_history = recentHistory;
  console.log('Invio cronologia recente:', recentHistory.length, 'messaggi');
      }
      
  // Streaming: crea placeholder messaggio assistant (unica bolla) con testo iniziale
  let assistantIndex = next.length
  const placeholder = '… sto pensando'
  setMessages([...next, { role:'assistant', content: placeholder, ts:Date.now() }])
  setIsStreaming(true)
  setStreamingAssistantIndex(assistantIndex)

      const streamResp = await authFetch(`${BACKEND}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      })
      if(!streamResp.ok){ throw new Error(`HTTP ${streamResp.status}`) }

      const reader = streamResp.body?.getReader()
      if(!reader){ throw new Error('Streaming non supportato') }
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

  // Non mostrare il bubble "sta scrivendo" separato mentre streamma
  setLoading(false)

      const commitDelta = (delta: string) => {
        setMessages(prev => {
          const updated = [...prev]
          const current = updated[assistantIndex]
          if(current){
            if(current.content === placeholder) {
              // sostituisce il placeholder col primo delta
              updated[assistantIndex] = { ...current, content: delta }
            } else {
              updated[assistantIndex] = { ...current, content: current.content + delta }
            }
          }
          return updated
        })
      }

      while(true){
        const {done, value} = await reader.read()
        if(done) {
          break
        }
        buffer += decoder.decode(value, {stream:true})

        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for(const part of parts){
          const line = part.trim()
            if(!line.startsWith('data:')) {
              continue
            }
            const jsonStr = line.slice(5).trim()
            try {
              const evt = JSON.parse(jsonStr)
              if(evt.meta){
                setMessages(prev => {
                  const updated = [...prev]
                  const current = updated[assistantIndex]
                  if(current){
                    updated[assistantIndex] = { ...current, topic: evt.topic, source_docs: evt.source_docs || null }
                  }
                  return updated
                })
              }
              if(evt.delta){ commitDelta(evt.delta) }
              if(evt.error){ setError(evt.error) }
              if(evt.done){
                if(evt.reply){ commitDelta('') }
                setMessages(prev => {
                  const updated = [...prev]
                  const current = updated[assistantIndex]
                  if(current){
                    updated[assistantIndex] = { ...current, topic: evt.topic || current.topic, source_docs: evt.source_docs !== undefined ? evt.source_docs : current.source_docs }
                  }
                  return updated
                })
              }
            } catch(e){ /* ignore parse errors */ }
        }
      }

  // Allegati usati una volta
      setAttachedFiles([])
    } catch(e:any){
      setError(e.message || 'Errore di rete')
      // ripristina input per ritentare
      setInput(text)
      setMessages(messages)
    } finally {
  setLoading(false)
  setIsStreaming(false)
  setStreamingAssistantIndex(null)
    }
  }

  const playTTS = async (text: string, messageIndex: number) => {
    if (playingMessageIndex === messageIndex) {
      stopAudio()
      return
    }

    // Se c'è già un altro audio in riproduzione, fermalo
    if (playingMessageIndex !== null) {
      stopAudio()
    }

    try {
      setPlayingMessageIndex(messageIndex)
      const response = await authFetch(`${BACKEND}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text,
          provider: ttsProvider,
          voice: selectedPersonality?.tts_voice || ttsVoice || (ttsProvider === 'edge' ? 'it-IT-ElsaNeural' : undefined)
        })
      })

      if (!response.ok) {
        throw new Error('Errore TTS')
      }
      
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      setCurrentAudio(audio)
      
      audio.onended = () => {
        setPlayingMessageIndex(null)
        setCurrentAudio(null)
        URL.revokeObjectURL(audioUrl)
      }
      
      await audio.play()
    } catch (error) {
      console.error('Errore TTS:', error)
      setPlayingMessageIndex(null)
    }
  }

  const stopAudio = () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setPlayingMessageIndex(null)
  }

  const startRecording = async () => {
    try {
      setIsRecording(true)
      setIsTranscribing(false)
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La registrazione audio non è supportata in questo browser')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const audioChunks: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      recorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)
        
        try {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.wav')
          formData.append('provider', asrProvider)

          // Funzione interna per inviare blob e gestire 202
          const attemptTranscription = async (blob: Blob) => {
            const fd = new FormData()
            fd.append('audio', blob, 'recording.wav')
            fd.append('provider', asrProvider)
            const resp = await authFetch(`${BACKEND}/api/transcribe`, { method: 'POST', body: fd })
            if (resp.status === 202) {
              const data = await resp.json()
              // Avvia modal progresso
              setPendingAudioBlob(blob)
              setWhisperModalOpen(true)
              setWhisperStage(data.status)
              setWhisperModel(data.model || asrProvider)
              setWhisperProgress( data.status === 'loading' ? 90 : 0 )
              // Avvia polling
              startWhisperPolling(data.status, data.task_id, data.model || asrProvider, blob)
              return null
            }
            if (!resp.ok) {
              const errTxt = await resp.text()
              throw new Error(errTxt || 'Errore nella trascrizione')
            }
            const result = await resp.json()
            return result
          }

          const result = await attemptTranscription(audioBlob)
          if (result && result.text) {
            setInput(prev => prev + (prev ? ' ' : '') + result.text)
          }
        } catch (error) {
          console.error('Errore trascrizione:', error)
          setError('Errore nella trascrizione audio')
        } finally {
          stream.getTracks().forEach(track => track.stop())
          setIsTranscribing(false)
          setMediaRecorder(null)
        }
      }

      recorder.start()
      setMediaRecorder(recorder)
      
      // Auto-stop dopo 30 secondi
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop()
        }
      }, 30000)
      
    } catch (error) {
      console.error('Errore registrazione:', error)
      setError(error instanceof Error ? error.message : 'Errore nella registrazione')
      setIsRecording(false)
    }
  }

  // Polling gestione modello whisper
  const startWhisperPolling = async (stage: 'downloading'|'loading', taskId: string, model: string, blob: Blob) => {
    // Cleanup eventuale polling precedente
    if (whisperPollRef.current) {
      clearTimeout(whisperPollRef.current)
    }
    const tick = async () => {
      try {
        if (stage === 'downloading') {
          // Task download
          const resp = await authFetch(`${BACKEND}/api/whisper/models/download-tasks/${taskId}`)
          if (resp.ok) {
            const data = await resp.json()
            if (typeof data.progress_pct === 'number') {
              setWhisperProgress(data.progress_pct)
            }
            if (['completed','skipped'].includes(data.status)) {
              // Passa a loading fase (caricamento in RAM)
              setWhisperStage('loading')
              setWhisperProgress(95)
              // Richiama transcribe per avviare eventuale load
              if (pendingAudioBlob) {
                // nuova richiesta -> se ancora 202 loading continueremo polling sotto
                const fd = new FormData()
                fd.append('audio', pendingAudioBlob, 'recording.wav')
                fd.append('provider', asrProvider)
                const r2 = await authFetch(`${BACKEND}/api/transcribe`, { method:'POST', body: fd })
                if (r2.status === 202) {
                  // continue polling via model status
                } else if (r2.ok) {
                  const resJson = await r2.json()
                  if (resJson.text) {
                    setInput(prev => prev + (prev ? ' ' : '') + resJson.text)
                  }
                  finalizeWhisperModal()
                  return
                } else {
                  finalizeWhisperModal()
                  return
                }
              }
            }
          }
        }
        // Poll stato modello per caricamento in RAM
        const statusResp = await authFetch(`${BACKEND}/api/whisper/models/${model}/status`)
        if (statusResp.ok) {
          const st = await statusResp.json()
            if (st.loaded) {
              // Modello pronto: invia trascrizione definitiva
              if (pendingAudioBlob) {
                const fd = new FormData()
                fd.append('audio', pendingAudioBlob, 'recording.wav')
                fd.append('provider', asrProvider)
                const finalResp = await authFetch(`${BACKEND}/api/transcribe`, { method:'POST', body: fd })
                if (finalResp.ok) {
                  const finalJson = await finalResp.json()
                  if (finalJson.text) {
                    setInput(prev => prev + (prev ? ' ' : '') + finalJson.text)
                  }
                }
              }
              finalizeWhisperModal()
              return
            }
        }
      } catch (e) {
        // Ignora errori transitori
      }
      whisperPollRef.current = window.setTimeout(tick, 1200)
    }
    whisperPollRef.current = window.setTimeout(tick, 1000)
  }

  const finalizeWhisperModal = () => {
    if (whisperPollRef.current) clearTimeout(whisperPollRef.current)
    whisperPollRef.current = undefined
    setWhisperStage(null)
    setWhisperProgress(0)
    setPendingAudioBlob(null)
    setWhisperModalOpen(false)
    setIsTranscribing(false)
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
      // Gli stati verranno aggiornati nel callback onstop
    }
  }

  const copyMessage = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessage(index)
      setTimeout(() => setCopiedMessage(null), 2000)
    } catch (error) {
      console.error('Errore copia:', error)
    }
  }

  const downloadMessage = (text: string) => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
  a.download = `messaggio_counselorbot_${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const giveFeedback = async (messageIndex: number, type: 'like' | 'dislike') => {
    setFeedback(prev => ({ ...prev, [messageIndex]: type }))
    
    // Invia feedback al backend (opzionale)
    try {
      const personality = personalities.find(p => p.id === selectedPersonalityId)
      await fetch(`${BACKEND}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messageIndex, 
          feedback: type, 
          timestamp: Date.now(),
          provider: provider,
          personality_id: personality?.id || null,
          personality_name: personality?.name || null,
          model: personality?.model || null
        })
      })
    } catch (error) {
      console.log('Feedback salvato localmente:', { messageIndex, type })
    }
  }
  // Routing semplice basato sull'URL (admin handled outside wrapper too but keep safeguard)
  if (window.location.pathname === '/admin') {
    return <AdminPanel />
  }

  const [selectedChunk, setSelectedChunk] = useState<RAGResult|null>(null)

  // --- MAIN RENDER ---
  return (
    <Container maxWidth="md" sx={{ pt: isMobile ? 1 : 2, pb: 6 }}>
      <HeaderBar
        onOpenSidebar={()=> setSidebarOpen(true)}
        isAdmin={!!user?.is_admin}
        onDownloadPdf={currentConversationId ? async ()=>{
          try {
            const { apiService } = await import('./apiService')
            const history = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content, timestamp: new Date(m.ts).toISOString() }))
            let blob: Blob
            try {
              blob = await apiService.downloadConversationWithReportPost(currentConversationId, history, 'pdf')
            } catch (e) {
              console.warn('[export] POST pdf fallback GET', e)
              blob = await apiService.downloadConversationPdf(currentConversationId)
            }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `conversation_${currentConversationId}.pdf`
            document.body.appendChild(a)
            a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
          } catch(e){ console.error(e) }
        } : undefined}
        onDownloadTxt={currentConversationId ? async ()=>{
          try {
            const { apiService } = await import('./apiService')
            const history = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({ role: m.role, content: m.content, timestamp: new Date(m.ts).toISOString() }))
            let blob: Blob
            try {
              blob = await apiService.downloadConversationWithReportPost(currentConversationId, history, 'txt')
            } catch (e) {
              console.warn('[export] POST txt fallback GET', e)
              blob = await apiService.downloadConversationTxt(currentConversationId)
            }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `conversation_${currentConversationId}.txt`
            document.body.appendChild(a)
            a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
          } catch(e){ console.error(e) }
        } : undefined}
        onDownloadReport={currentConversationId ? async ()=>{
          try {
            const { apiService } = await import('./apiService')
            // Costruisci la history plaintext corrente (esclude eventuali messaggi system e placeholder streaming)
            const history = messages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({
                role: m.role,
                content: m.content,
                // timestamp ISO per futura estensione (il backend lo ignora se non usato)
                timestamp: new Date(m.ts).toISOString()
              }))
            let blob: Blob
            try {
              // Tenta prima il nuovo endpoint POST con history in chiaro
              blob = await apiService.downloadConversationWithReportPost(currentConversationId, history, 'zip')
            } catch (e) {
              console.warn('[export] POST export-with-report fallito, fallback GET legacy', e)
              // Fallback al metodo legacy (GET) – potrebbe produrre report vuoto se DB ha ciphertext
              blob = await apiService.downloadConversationWithReport(currentConversationId)
            }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `conversation_${currentConversationId}.zip`
            document.body.appendChild(a)
            a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
          } catch(e){ console.error(e) }
        } : undefined}
        onNewChat={async ()=>{
          try {
            const { apiService } = await import('./apiService')
            const wg = await apiService.getPublicWelcomeGuide()
            if (wg.success && wg.data?.welcome?.content) {
              const p = personalities.find(pp=>pp.id===selectedPersonalityId)
              setMessages([{ role:'assistant', content: p?.welcome_message || wg.data.welcome.content, ts: Date.now() }])
            } else {
              const p = personalities.find(pp=>pp.id===selectedPersonalityId)
              setMessages([{ role:'assistant', content: p?.welcome_message || 'Nuova conversazione iniziata.', ts: Date.now() }])
            }
          } catch {
            const p = personalities.find(pp=>pp.id===selectedPersonalityId)
            setMessages([{ role:'assistant', content: p?.welcome_message || 'Nuova conversazione iniziata.', ts: Date.now() }])
          }
          setCurrentConversationId(null);
        }}
        onShowGuide={async ()=> {
          if (!guideLoading) {
            setGuideLoading(true)
            try {
              const { apiService } = await import('./apiService')
              const wg = await apiService.getPublicWelcomeGuide()
              if (wg.success) {
                setActiveGuide(wg.data?.guide?.content)
              }
            } catch { /* ignore */ } finally { setGuideLoading(false) }
          }
          setShowHelp(true)
        }}
        onOpenArena={()=> window.location.href = '/arena'}
        showArena={user?.is_admin || arenaPublic}
        isAuthenticated={isAuthenticated}
        onLogin={()=> setShowLoginDialog(true)}
        onLogout={handleLogout}
        dense={isMobile}
  personalities={personalities}
  selectedPersonalityId={selectedPersonalityId}
  onChangePersonality={(id)=> setSelectedPersonalityId(id)}
      />
      {/* Avviso rilogin per crittografia */}
      {needsCryptoReauth && (
        <Alert severity="warning" sx={{ mb: 2 }} action={
          <Button color="inherit" size="small" onClick={handleLogout}>
            Rilogga
          </Button>
        }>
          Per accedere alle conversazioni crittografate, è necessario effettuare nuovamente il login.
        </Alert>
      )}
      
  {/* Removed legacy top bar (menu + avatar + duplicate title) now merged into HeaderBar */}

      {!isAuthenticated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center" sx={{ gap: 1 }}>
            <Typography sx={{ lineHeight: 1.4 }}>
              Accedi per salvare le conversazioni e riprenderle da altri dispositivi.
            </Typography>
          </Box>
        </Alert>
      )}

  <Paper variant="outlined" sx={{ p: isMobile ? 1.5 : 3, minHeight: isMobile ? 'calc(100vh - 280px)' : 520, position: 'relative', bgcolor: '#fafafa', borderRadius: 2, overflow:'hidden' }}>
        {/* messages stack */}
        <Stack spacing={isMobile ? 2 : 3} sx={{ pb: isMobile ? 6 : 0 }}>
          {messages.map((m,i)=>(
            <Box key={i} display="flex" flexDirection="column" gap={1} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
              {/* Messaggio principale */}
              <Box display="flex" gap={2} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
                {/* Avatar per l'assistente a sinistra */}
                {m.role === 'assistant' && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                    <ChatAvatar
                      // Forza aggiornamento avatar quando cambia personalità o url
                      key={`msg-${i}-${selectedPersonalityId}-${assistantAvatarSrc}`}
                      src={assistantAvatarSrc}
                      alt={selectedPersonality?.name || 'Assistente'}
                      personalityId={selectedPersonalityId}
                    />
                  </Box>
                )}
                
                {/* Bolla del messaggio - aumentata la dimensione */}
                <Box sx={{ 
                  // Make bubble wider for structured form results; full width on very small screens
                  maxWidth: isVerySmall ? '100%' : (m.__formResult ? '92%' : '85%'),
                  bgcolor: m.role === 'assistant' ? '#e3f2fd' : '#1976d2',
                  color: m.role === 'assistant' ? '#000' : '#fff',
                  p: 2,
                  borderRadius: 3,
                  borderTopLeftRadius: m.role === 'assistant' ? 1 : 3,
                  borderTopRightRadius: m.role === 'user' ? 1 : 3,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  position: 'relative',
                }}>
                  <Box sx={{
                    // Relax table wrapper sizing for form result content
                    '& table': { width: '100%', maxWidth: '100%', borderCollapse: 'collapse', my: 1 },
                    '& th, & td': { border: '1px solid rgba(0,0,0,0.15)', padding: '6px 8px', textAlign: 'left' },
                    '& thead th': { bgcolor: 'rgba(0,0,0,0.04)' },
                    '& code': { bgcolor: 'rgba(0,0,0,0.06)', px: 0.5, py: 0.1, borderRadius: 0.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
                    '& pre > code': { display: 'block', p: 1, overflowX: 'auto' },
                    '& p': { m: 0 },
                   // If message is a form result, allow the inner content to expand more horizontally
                   ...(m.__formResult ? { maxWidth: '100%', '& .markdown-table-wrapper': { overflowX: 'auto' } } : {}),
                  }}>
                    {m.uploadSummary && m.uploadSummary.length > 0 ? (
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                          Riepilogo caricamento file ({m.uploadSummary.length})
                        </Typography>
                        <Stack spacing={1}>
                          {m.uploadSummary.map(f => {
                            const expanded = !!m.__uploadExpanded?.[f.id]
                            const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : (bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`)
                            const chars = (f.content || '').length
                            const preview = (f.content || '').slice(0, 240).replace(/\s+/g,' ').trim()
                            return (
                              <Paper key={f.id} variant="outlined" sx={{ p: 1, bgcolor: '#fff' }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{f.filename}</Typography>
                                    <Stack direction="row" spacing={0.8} sx={{ mt: 0.3 }}>
                                      <Chip size="small" label={f.file_type.toUpperCase()} variant="outlined" />
                                      <Chip size="small" label={sizeLabel(f.size)} variant="outlined" />
                                      <Chip size="small" color="success" label={`${chars} caratteri`} variant="outlined" />
                                    </Stack>
                                  </Box>
                                  <Button size="small" variant="text" onClick={() => {
                                    setMessages(prev => prev.map((mm, mi) => {
                                      if (mi !== i) return mm
                                      const next = { ...(mm as any) }
                                      next.__uploadExpanded = { ...(mm.__uploadExpanded || {}) }
                                      next.__uploadExpanded[f.id] = !expanded
                                      return next
                                    }))
                                  }}>
                                    {expanded ? 'Nascondi' : 'Mostra tutto'}
                                  </Button>
                                </Stack>
                                {!expanded && (
                                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    {preview}{(f.content || '').length > 240 ? '…' : ''}
                                  </Typography>
                                )}
                                {expanded && (
                                  <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1, maxHeight: 320, overflow: 'auto' }}>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                                      {f.content || '(contenuto non disponibile)'}
                                    </Typography>
                                  </Box>
                                )}
                              </Paper>
                            )
                          })}
                        </Stack>
                      </Box>
                    ) : (
                      // If message contains structured form result, render it using FormResultRenderer
                      m.__formResult ? (
                        <FormResultRenderer payload={m.__formResult} />
                      ) : (
                        <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks]}
                        components={{
                          a: ({node, href, children, ...props}) => {
                            const h = href || ''
                            const isDoc = /^doc:\/\//.test(h) || /\.(pdf|md|markdown|txt)$/i.test(h) || /\/api\/rag\/download\//.test(h)
                            if (!isDoc) {
                              return <a href={h} {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                            }
                            return <a href={h} {...props} onClick={(e)=>{ e.preventDefault(); openPreviewForLink(h, (children as any)?.toString?.() || h, m.source_docs?.rag_chunks) }} style={{ cursor:'pointer', textDecoration:'underline' }}>{children}</a>
                          },
                          table: ({node, ...props}) => (
                            <Box className="markdown-table-wrapper" sx={{ width:'100%', overflowX:'auto', my:1 }}>
                              <table {...props} />
                            </Box>
                          ),
                          th: ({node, ...props}) => <th {...props} style={{ ...props.style, background:'rgba(0,0,0,0.04)' }} />,
                          code: ({inline, className, children, ...props}: any) => {
                            const txt = String(children)
                            if (inline) return <code {...props}>{children}</code>
                            return (
                              <pre style={{ margin: '8px 0', padding: '8px', background:'rgba(0,0,0,0.06)', borderRadius:4, overflowX:'auto' }}>
                                <code>{txt}</code>
                              </pre>
                            )
                          }
                        }}
                      >
                        {prepareChatMarkdown(m.content, m.source_docs?.rag_chunks as any)}
                      </ReactMarkdown>
                    ))}
                  </Box>
                
                {/* Piccole icone in basso per messaggi dell'assistente */}
                {m.role === 'assistant' && !(isStreaming && streamingAssistantIndex === i) && (
                  <Box sx={{ display:'flex', flexDirection:'column', mt:1, gap:0.5 }}>
                    <Box sx={{ 
                      display: 'flex', 
                      gap: 0.5, 
                      justifyContent: 'flex-end',
                      opacity: 0.7,
                      '&:hover': { opacity: 1 }
                    }}>
                    {/* TTS */}
                    <Box 
                      component="button" 
                      onClick={() => playTTS(toPlainText(m.content), i)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '3px',  // Aumentato padding
                        borderRadius: '6px',  // Angoli più arrotondati
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                      }}
                      title={playingMessageIndex === i ? "Ferma audio" : `Ascolta (${ttsProvider}${(selectedPersonality?.tts_voice || ttsVoice) ? ' - ' + (selectedPersonality?.tts_voice || ttsVoice) : ''})`}
                    >
                      {playingMessageIndex === i ? <SmallStopIcon size={16} /> : <SpeakerIcon size={16} />}
                    </Box>

                    {/* Copia */}
                    <Box 
                      component="button" 
                      onClick={() => copyMessage(m.content, i)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '3px',  // Aumentato padding
                        borderRadius: '6px',  // Angoli più arrotondati
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: copiedMessage === i ? '#4caf50' : 'inherit'
                      }}
                      title={copiedMessage === i ? "Copiato!" : "Copia messaggio"}
                    >
                      {copiedMessage === i ? <SmallCheckIcon size={16} /> : <CopyIcon size={16} />}
                    </Box>

                    {/* Download */}
                    <Box 
                      component="button" 
                      onClick={() => downloadMessage(m.content)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '3px',  // Aumentato padding
                        borderRadius: '6px',  // Angoli più arrotondati
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                      }}
                      title="Scarica messaggio"
                    >
                      <SmallDownloadIcon size={16} />
                    </Box>

                    {/* Like */}
                    <Box 
                      component="button" 
                      onClick={() => giveFeedback(i, 'like')}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '3px',  // Aumentato padding
                        borderRadius: '6px',  // Angoli più arrotondati
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: feedback[i] === 'like' ? '#4caf50' : 'inherit'
                      }}
                      title="Mi piace"
                    >
                      <LikeIcon size={16} />
                    </Box>

                    {/* Dislike */}
                    <Box 
                      component="button" 
                      onClick={() => giveFeedback(i, 'dislike')}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '3px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: feedback[i] === 'dislike' ? '#f44336' : 'inherit'
                      }}
                      title="Non mi piace"
                    >
                      <DislikeIcon size={16} />
                    </Box>
                    </Box>
                    {/* Sezione Fonti (nuova) */}
                    {(() => {
                      const showTopics = (selectedPersonality as any)?.show_pipeline_topics !== false;
                      const showSources = (selectedPersonality as any)?.show_source_docs !== false;
                      const hasSources = !!(m.source_docs && ((showSources && (m.source_docs?.rag_chunks?.length || m.source_docs?.rag_groups?.length || m.source_docs?.data_tables?.length)) || (showTopics && m.source_docs?.pipeline_topics?.length)));
                      return m.role==='assistant' && hasSources;
                    })() && (
                      <Box sx={{ mt:1.5 }}>
                        <Paper variant="outlined" sx={{ p:1.1, bgcolor: '#f8fbff', border:'1px solid #d0e3f7', borderRadius:1.5 }}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: m.__sourcesExpanded ? 0.5 : 0 }}>
                            <Typography variant="caption" sx={{ fontWeight:'bold', color:'#1976d2' }}>Topic e Fonti</Typography>
                            <Button onClick={()=>{
                              setMessages(prev => prev.map((mm,mi)=> mi===i ? {...mm, __sourcesExpanded: !mm.__sourcesExpanded} : mm));
                            }} size="small" variant="text" sx={{ fontSize:'0.6rem', minWidth:0, p:0.5 }}>
                              {m.__sourcesExpanded ? 'Nascondi' : 'Mostra'}
                            </Button>
                          </Stack>
                          {m.__sourcesExpanded && (
                            <Box>
                              {m.source_docs?.rag_chunks?.length ? (
                                <Box sx={{ mb:0.5 }}>
                                  <Link component="button" type="button" underline="hover" sx={{ fontSize:'0.6rem', opacity:0.8 }} onClick={()=> setMinRagSimilarity(s=> s ? 0 : 0.5)}>
                                    {minRagSimilarity ? `Filtro similarità ≥ ${(minRagSimilarity*100).toFixed(0)}% (clic per mostrare tutti)` : 'Applica filtro similarità ≥50%'}
                                  </Link>
                                </Box>
                              ) : null}
                              <Stack spacing={0.75} sx={{ maxWidth: '100%' }}>
                                {/* Topic pipeline */}
                                {(selectedPersonality as any)?.show_pipeline_topics !== false && m.source_docs?.pipeline_topics && m.source_docs?.pipeline_topics.map((pt,idx)=>(
                                  <Box key={`pt-${idx}`} sx={{ fontSize:'0.7rem', lineHeight:1.3 }}>
                                    <strong style={{ color:'#ff9800' }}>Topic:</strong> {pt.name}{pt.description? <Tooltip title={<span style={{whiteSpace:'pre-line'}}>{pt.description}</span>} arrow><sup style={{marginLeft:4,cursor:'help',color:'#ff9800'}}>?</sup></Tooltip>:null}
                                  </Box>
                                ))}
                                {/* Gruppi RAG selezionati */}
                                {(selectedPersonality as any)?.show_source_docs !== false && ((m.source_docs?.rag_groups?.length ?? 0) > 0) && (
                                  <Box sx={{ fontSize:'0.7rem', lineHeight:1.3 }}>
                                    <strong style={{ color:'#558b2f' }}>Gruppi:</strong> {m.source_docs?.rag_groups?.map(g=>g.name).join(', ')}
                                  </Box>
                                )}
                                {/* Tabelle dati utilizzate */}
                                {(selectedPersonality as any)?.show_source_docs !== false && ((m.source_docs?.data_tables?.length ?? 0) > 0) && (
                                  <Box sx={{ fontSize:'0.7rem', lineHeight:1.3 }}>
                                    <strong style={{ color:'#6d4c41' }}>Tabelle:</strong>{' '}
                                    {m.source_docs?.data_tables?.map((t, idx)=> (
                                      <React.Fragment key={`dt-${t.table_id}`}>
                                        {idx>0 ? ', ' : ''}
                                        {t.download_url ? (
                                          <a href={t.download_url} target="_blank" rel="noreferrer" style={{ textDecoration:'underline' }}>{t.title || t.table_id}</a>
                                        ) : (
                                          <span>{t.title || t.table_id}</span>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </Box>
                                )}
                                {/* Documenti con grouping chunks */}
                                {(selectedPersonality as any)?.show_source_docs !== false && ((m.source_docs?.rag_chunks?.length ?? 0) > 0) && (()=>{
                                  const sorted = [...(m.source_docs?.rag_chunks || [])].sort((a,b)=> (b.similarity||0) - (a.similarity||0));
                                  const filtered = sorted.filter(r=> !minRagSimilarity || (r.similarity || 0) >= minRagSimilarity);
                                  // Group by document_id if available, else by filename
                                  const groupsByDoc = {} as Record<string,{document_id:any; stored_filename?:string; filename?:string; maxSim:number; chunks:any[]}>;
                                  filtered.forEach(ch => {
                                    const key = (ch.document_id || ch.filename || 'unknown') + '';
                                    if(!groupsByDoc[key]) {
                                      groupsByDoc[key] = { document_id: ch.document_id, stored_filename: ch.stored_filename, filename: ch.filename, maxSim: ch.similarity||0, chunks: [] };
                                    }
                                    groupsByDoc[key].chunks.push(ch);
                                    if((ch.similarity||0) > groupsByDoc[key].maxSim) {
                                      groupsByDoc[key].maxSim = ch.similarity||0;
                                    }
                                  });
                                  const docEntries = Object.values(groupsByDoc).sort((a,b)=> b.maxSim - a.maxSim);
                                  return (
                                    <Box>
                                      <Box sx={{ fontSize:'0.6rem', mb:0.3, color:'#1976d2' }}>Documenti ({docEntries.length}) ordinati per similarità</Box>
                                      <Stack spacing={0.5}>
                                        {docEntries.map((d,di)=>{
                                          const baseName = d.filename ? (d.filename.split('_').pop() || d.filename) : d.filename || 'Documento';
                                          return (
                                            <Paper key={di} variant="outlined" sx={{ p:0.6, bgcolor:'#fff' }}>
                                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:0.3 }}>
                                                <Box sx={{ display:'flex', alignItems:'center', gap:0.8 }}>
                                                  <Box sx={{ fontSize:'0.65rem', fontWeight:600, color:'#1976d2', display:'flex', alignItems:'center', gap:0.6 }}>
                                                    {d.stored_filename && d.document_id ? (
                                                      <Link href={d.chunks?.[0]?.download_url || `/api/rag/download/${d.document_id}`} target="_blank" rel="noopener" underline="hover" sx={{ fontSize:'0.65rem', fontWeight:600, color:'#1976d2' }}>
                                                        {baseName}
                                                      </Link>
                                                    ) : (
                                                      baseName
                                                    )}
                                                    {d.maxSim ? <Box component="span" sx={{ fontWeight:400, color:'#555' }}>max {(d.maxSim*100).toFixed(1)}%</Box> : null}
                                                  </Box>
                                                  {d.stored_filename && d.document_id && (
                                                    <Tooltip title="Scarica file originale"><IconButton size="small" onClick={()=> window.open(d.chunks?.[0]?.download_url || `/api/rag/download/${d.document_id}`,'_blank')} sx={{ p:0.3 }}>
                                                      <SmallDownloadIcon size={14} />
                                                    </IconButton></Tooltip>
                                                  )}
                                                </Box>
                                              </Stack>
                                              <Box sx={{ display:'flex', flexWrap:'wrap', gap:0.4 }}>
                                                {d.chunks.slice(0,6).map((r,ci)=>{
                                                  const preview = (r.preview || '').replace(/\s+/g,' ').trim();
                                                  const shortPrev = preview ? (preview.length>160 ? preview.slice(0,160)+'…' : preview) : '';
                                                  const tip = `${r.chunk_label || ('Chunk '+r.chunk_index)}${r.similarity? `\nSim: ${(r.similarity*100).toFixed(1)}%` : ''}${shortPrev?`\n---\n${shortPrev}`:''}`;
                                                  return (
                                                    <Tooltip key={ci} title={<span style={{ whiteSpace:'pre-line', maxWidth:260, display:'block' }}>{tip}</span>} arrow>
                                                      <Chip size="small" label={`#${r.chunk_index}`} onClick={()=> setSelectedChunk(r)} sx={{ cursor:'pointer', bgcolor:'#fff', border:'1px solid #b3e5fc', fontSize:'0.55rem', height:18 }} />
                                                    </Tooltip>
                                                  );
                                                })}
                                                {d.chunks.length>6 && (
                                                  <Tooltip title={d.chunks.slice(6).map(r=>`Chunk ${r.chunk_index}`).join(', ')} arrow>
                                                    <Chip size="small" label={`+${d.chunks.length-6}`} sx={{ bgcolor:'#fff', border:'1px solid #b3e5fc', fontSize:'0.55rem', height:18 }} />
                                                  </Tooltip>
                                                )}
                                              </Box>
                                              {/* Etichette chunk retrieval textual summary */}
                                              <Box sx={{ mt:0.5 }}>
                                                <Typography component="div" sx={{ fontSize:'0.55rem', color:'#666' }}>
                                                  {d.chunks.slice(0,6).map((c,i)=> c.chunk_label || `chunk_${c.chunk_index}`).join(' | ')}{d.chunks.length>6? ' | ...':''}
                                                </Typography>
                                              </Box>
                                            </Paper>
                                          );
                                        })}
                                      </Stack>
                                    </Box>
                                  );
                                })()}
                              </Stack>
                            </Box>
                          )}
                        </Paper>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
              
              {/* Avatar per l'utente a destra */}
                {m.role === 'user' && (
                <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                  {isAuthenticated && userAvatar ? (
                    <Avatar alt="Tu" src={userAvatar} sx={{ width: 40, height: 40 }} />
                  ) : (
                    <Avatar sx={{ width: 40, height: 40, bgcolor: '#1976d2' }}>
                      <PersonIcon sx={{ fontSize: 24 }} />
                    </Avatar>
                  )}
                </Box>
              )}
            </Box>
            
            {/* Dati estratti rimossi - elaborazione semplificata */}
          </Box>
          ))}
          
          {/* Indicatore di typing quando sta caricando */}
          {loading && !isStreaming && (
            <Box display="flex" gap={2} justifyContent="flex-start">
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <ChatAvatar key={`typing-${selectedPersonalityId}-${assistantAvatarSrc}`} src={assistantAvatarSrc} alt={selectedPersonality?.name || 'Assistente'} personalityId={selectedPersonalityId} />
              </Box>
              <Box sx={{
                bgcolor: '#e3f2fd',
                p: 2,
                borderRadius: 3,
                borderTopLeftRadius: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                <Typography variant="body2" color="text.secondary">
                  Counselorbot sta scrivendo...
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </Paper>


      {/* Feedback conversazione - in basso a destra */}
      <Box sx={{ mt: 1, mb: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Mi è piaciuta questa conversazione">
            <IconButton 
              onClick={() => giveFeedback(-1, 'like')}
              size="small" 
              sx={{ 
                color: feedback[-1] === 'like' ? '#4caf50' : '#666',
                bgcolor: feedback[-1] === 'like' ? '#e8f5e8' : '#f5f5f5',
                '&:hover': { bgcolor: feedback[-1] === 'like' ? '#e8f5e8' : '#e0e0e0' }
              }}
            >
              <LikeIcon size={16} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Non mi è piaciuta questa conversazione">
            <IconButton 
              onClick={() => giveFeedback(-1, 'dislike')}
              size="small" 
              sx={{ 
                color: feedback[-1] === 'dislike' ? '#f44336' : '#666',
                bgcolor: feedback[-1] === 'dislike' ? '#ffebee' : '#f5f5f5',
                '&:hover': { bgcolor: feedback[-1] === 'dislike' ? '#ffebee' : '#e0e0e0' }
              }}
            >
              <DislikeIcon size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Input Area */}
      {!isMobile && (
  <Paper elevation={2} sx={{ mt: 2, borderRadius: 2 }}>
          <Box sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="flex-end">
              <Box position="relative" flex={1}>
                <TextField 
                  fullWidth 
                  placeholder="Scrivi un messaggio…"
                  value={input} 
                  onChange={e=>setInput(e.target.value)} 
                  onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }}}
                  variant="outlined"
                  size="medium"
                  disabled={isRecording || isTranscribing}
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: 2 }
                  }}
                  multiline
                  maxRows={6}
                  minRows={2}
                />
                
                {/* Animazione onde dentro il TextField quando si registra */}
                {isRecording && (
                  <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    sx={{
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      pointerEvents: 'none'
                    }}
                  >
                    <MicIcon sx={{ color: 'error.main', fontSize: 24 }} />
                    <VoiceRecordingAnimation isRecording={isRecording} size={36} />
                    <Typography 
                      variant="body1" 
                      color="error.main"
                      sx={{ 
                        fontWeight: 600,
                        fontSize: '1rem'
                      }}
                    >
                      Sto ascoltando...
                    </Typography>
                  </Box>
                )}
                
                {/* Indicatore trascrizione */}
                {isTranscribing && (
                  <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    sx={{
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      pointerEvents: 'none'
                    }}
                  >
                    <CircularProgress size={24} color="primary" />
                    <Typography variant="body1" color="primary" sx={{ fontWeight: 600 }}>
                      Trascrizione in corso...
                    </Typography>
                  </Box>
                )}
              </Box>
              <ChatToolbar
                onSend={send}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
                canSend={!!input.trim() && !loading && !isRecording && !isTranscribing && !isStreaming}
                isRecording={isRecording}
                isLoading={loading || isTranscribing || isStreaming}
                onToggleAttachments={()=> setShowAttachments(o=> !o)}
                attachmentsCount={attachedFiles.length}
                attachmentsOpen={showAttachments}
                onOpenFormDialog={() => setShowFormDialog(true)}
              />
            </Stack>
            {/* Inline attachments area (collapsed) */}
            <Collapse in={showAttachments || attachedFiles.length>0} unmountOnExit timeout={220}>
              <Box sx={{ mt:1.5, borderTop:'1px solid #eee', pt:1 }}>
                <FileManagerCompact
                  attachedFiles={attachedFiles}
                  onFilesChange={(files)=> { setAttachedFiles(files); if(files.length===0) { setShowAttachments(false) } }}
                  maxFiles={3}
                  disabled={loading}
                />
              </Box>
            </Collapse>
          </Box>
          {(isRecording || playingMessageIndex !== null) && (
            <Box sx={{ px: 2, pb: 1 }}>
              {isRecording && (
                <Typography variant="caption" color="error" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ color: '#f44336', display: 'flex', alignItems: 'center' }}>
                    <SmallMicIcon size={12} />
                  </Box>
                  Registrazione in corso...
                </Typography>
              )}
              {playingMessageIndex !== null && (
                <Typography variant="caption" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ color: '#1976d2', display: 'flex', alignItems: 'center' }}>
                    <SpeakerIcon size={12} />
                  </Box>
                  Riproduzione audio ({ttsProvider}${(selectedPersonality?.tts_voice || ttsVoice) ? ' - ' + (selectedPersonality?.tts_voice || ttsVoice) : ''})...
                </Typography>
              )}
            </Box>
          )}
        </Paper>
      )}
      {isMobile && (
        <>
          <Collapse in={showAttachments || attachedFiles.length>0} unmountOnExit timeout={220}>
            <Box sx={{ position:'fixed', bottom:72, left:0, right:0, px:1, zIndex:(t)=> t.zIndex.appBar }}>
              <Paper sx={{ p:1, mx:'auto', maxWidth:600, borderRadius:2, border:'1px solid #e0e0e0' }} elevation={3}>
                <FileManagerCompact
                  attachedFiles={attachedFiles}
                  onFilesChange={(files)=> { setAttachedFiles(files); if(files.length===0) { setShowAttachments(false) } }}
                  maxFiles={3}
                  disabled={loading}
                />
              </Paper>
            </Box>
          </Collapse>
          <MobileChatBar
            value={input}
            onChange={setInput}
            onSend={send}
            canSend={!!input.trim() && !loading && !isRecording && !isTranscribing && !isStreaming}
            isRecording={isRecording}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            disabled={isTranscribing}
            isLoading={loading || isTranscribing || isStreaming}
            onToggleAttachments={()=> setShowAttachments(o=> !o)}
            attachmentsCount={attachedFiles.length}
            attachmentsOpen={showAttachments}
          />
        </>
      )}

  {/* (Old standalone Allegati section removed: now inline in input area) */}

  {/* RAG Context Selector removed per richiesta: la selezione contesti ora integrata nei metadati bubble */}

      {/* Survey link riposizionato: distanza maggiore e inline con stesso font */}
      <Box sx={{ mt: 4, display:'flex', flexWrap:'wrap', alignItems:'center', gap:1 }}>
        <Typography variant="body2" component="span">
          Hai 30 secondi per dirci se il chatbot ti sta aiutando?
        </Typography>
        <Link component="button" type="button" underline="hover" onClick={()=> setShowSurvey(true)} sx={{ fontSize: '0.875rem', p:0 }}>
          Compila il questionario anonimo
        </Link>
        <Typography variant="body2" component="span" sx={{ color:'text.secondary' }}>·</Typography>
        <Link href="/survey-results" underline="hover" sx={{ fontSize: '0.875rem', p:0 }}>
          Vedi risultati
        </Link>
      </Box>

      <FormRunnerDialog
        open={showFormDialog}
        onClose={()=> setShowFormDialog(false)}
        enabledFormIds={(selectedPersonality as any)?.enabled_forms || []}
        conversationId={currentConversationId || undefined}
        personalityId={selectedPersonality?.id || undefined}
        onPostSummary={(summary: string) => {
          setMessages(prev => [...prev, { role: 'assistant' as const, content: summary, ts: Date.now() }])
        }}
        onPostStructured={(payload:any) => {
          setMessages(prev => [...prev, { role: 'assistant' as const, content: 'Risultati form', ts: Date.now(), __formResult: payload }])
        }}
        onConversationReady={(cid: string) => {
          setCurrentConversationId(cid)
        }}
      />

  <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentConversationId={currentConversationId || undefined}
        onConversationSelect={async (id) => {
          setCurrentConversationId(id);
          setLoading(true);
          
          try {
            // Carica i messaggi della conversazione selezionata (senza decriptazione client-side)
            const apiService = await import('./apiService').then(m => m.apiService);
            const response = await apiService.getConversationMessages(id);
              if (response.success && response.data) {
              let normalized: Msg[] = response.data.map((msg: any) => {
                const ts = new Date(msg.timestamp).getTime();
                const serverPlain = (typeof msg.content === 'string' ? msg.content : '').trim();
                // Preferisci il contenuto fornito dal server; se mancante, usa content_encrypted se presente, altrimenti placeholder
                if (serverPlain) return { role: msg.role, content: serverPlain, ts };
                if (msg.content_encrypted) return { role: msg.role, content: msg.content_encrypted, ts };
                return { role: msg.role, content: '[Messaggio non disponibile]', ts };
              });

              try {
                // Recupera il welcome pubblico (o della personalità) e prepende alla cronologia se presente
                const { apiService } = await import('./apiService');
                const wg = await apiService.getPublicWelcomeGuide();
                let welcomeText: string | null = null;
                if (wg.success && wg.data?.welcome?.content) {
                  welcomeText = wg.data.welcome.content;
                } else {
                  const p = personalities.find(pp => pp.id === selectedPersonalityId);
                  welcomeText = p?.welcome_message || p?.welcome_message_content || null;
                }

                if (welcomeText) {
                  const first = normalized[0];
                  // Determine timestamp: place welcome just before first message if present, otherwise now
                  let welcomeTs = Date.now();
                  if (first && typeof first.ts === 'number') {
                    welcomeTs = Math.max(0, first.ts - 1);
                  }

                  // If the conversation already contains the public welcome as the first stored message
                  // and the selected personality provides its own welcome, replace the stored
                  // public welcome with the personality welcome so users see the configured personality text.
                  const publicWelcome = wg.success && wg.data?.welcome?.content ? wg.data.welcome.content : null;
                  const personalityWelcome = selectedPersonality ? (selectedPersonality.welcome_message_content || selectedPersonality.welcome_message) : null;

                  const firstPlain = first && first.content ? toPlainText(first.content).trim().toLowerCase() : '';
                  const publicPlain = publicWelcome ? toPlainText(publicWelcome).trim().toLowerCase() : '';
                  const personalityPlain = personalityWelcome ? toPlainText(personalityWelcome).trim().toLowerCase() : '';

                  // Debug info to help diagnose why a stored public welcome isn't being replaced
                  try {
                    console.debug('[welcome-debug] first:', first?.content);
                    console.debug('[welcome-debug] publicWelcome:', publicWelcome);
                    console.debug('[welcome-debug] personalityWelcome:', personalityWelcome);
                    console.debug('[welcome-debug] normalized forms:', { firstPlain, publicPlain, personalityPlain });
                  } catch (e) { /* ignore debug errors */ }

                  if (first && publicPlain && firstPlain === publicPlain && personalityWelcome) {
                    // replace stored public welcome with personality welcome
                    normalized[0] = { ...first, content: personalityWelcome, isWelcome: true } as Msg;
                  } else if (!first || firstPlain !== toPlainText(welcomeText).trim().toLowerCase()) {
                    normalized = [{ role: 'assistant' as const, content: welcomeText, ts: welcomeTs, isWelcome: true }, ...normalized];
                  } else {
                    // Fallback: if first assistant message mentions 'counselorbot' (legacy variants),
                    // prefer replacing it with the personality welcome when available.
                    if (first && first.role === 'assistant' && firstPlain.includes('counselorbot') && personalityWelcome) {
                      normalized[0] = { ...first, content: personalityWelcome, isWelcome: true } as Msg;
                    }
                  }
                }
              } catch (e) {
                // ignore welcome failures
              }

              setMessages(normalized);
            } else {
              setError('Errore nel caricamento dei messaggi');
            }
          } catch (error) {
            console.error('Failed to load conversation messages:', error);
            setError('Errore nel caricamento della conversazione');
          } finally {
            setLoading(false);
          }
          
          setSidebarOpen(false);
        }}
        onNewConversation={async () => {
          try {
            const { apiService } = await import('./apiService')
            const wg = await apiService.getPublicWelcomeGuide()
            if (wg.success && wg.data?.welcome?.content) {
              const p = personalities.find(pp=>pp.id===selectedPersonalityId)
              if (p?.welcome_message) {
                setMessages([{ role:'assistant', content: p.welcome_message, ts: Date.now() }])
              } else {
                setMessages([{ role:'assistant', content: wg.data.welcome.content, ts: Date.now() }])
              }
            } else {
              const p = personalities.find(pp=>pp.id===selectedPersonalityId)
              setMessages([{ role:'assistant', content: p?.welcome_message || 'Nuova conversazione iniziata.', ts: Date.now() }])
            }
          } catch {
            const p = personalities.find(pp=>pp.id===selectedPersonalityId)
            setMessages([{ role:'assistant', content: p?.welcome_message || 'Nuova conversazione iniziata.', ts: Date.now() }])
          }
          setCurrentConversationId(null);
          setSidebarOpen(false);
        }}
        userAvatar={userAvatar}
        isAuthenticated={isAuthenticated}
        onUserAvatarChange={(dataUrl)=> setUserAvatar(dataUrl)}
        drawerWidth={300}
        // Refresh sidebar quando viene creata una nuova conversazione
        key={currentConversationId || 'new'}
      />
      
      <LoginDialog
        open={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onLoginSuccess={(userInfo, cryptoInstance) => {
          login(userInfo, cryptoInstance);
          setShowLoginDialog(false);
        }}
      />
      
  <Dialog
        open={showHelp}
        onClose={() => setShowHelp(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Typography variant="h6" sx={{ fontSize: '1rem' }}>Guida</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" variant="outlined" disabled={guideLoading} onClick={async()=>{
              setGuideLoading(true)
              try {
                const { apiService } = await import('./apiService')
                const wg = await apiService.getPublicWelcomeGuide()
                if (wg.success) setActiveGuide(wg.data?.guide?.content)
              } catch {/* ignore */} finally { setGuideLoading(false) }
            }}>Ricarica</Button>
            <IconButton size="small" onClick={()=> setShowHelp(false)}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 260 }}>
          {guideLoading && (
            <Stack alignItems="center" justifyContent="center" sx={{ py:4 }}>
              <CircularProgress size={32} />
              <Typography variant="body2" sx={{ mt:2 }}>Caricamento guida…</Typography>
            </Stack>
          )}
          {!guideLoading && activeGuide && (
            <Box sx={{ '& h1,h2,h3':{ mt:2 }, '& p':{ mb:1 } }}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{prepareChatMarkdown(activeGuide)}</ReactMarkdown>
            </Box>
          )}
          {!guideLoading && !activeGuide && (
            <Box sx={{ display:'flex', flexDirection:'column', gap:1 }}>
              <Alert severity="info">Nessuna guida attiva impostata. L'amministratore può crearne una nella sezione Welcome del pannello.</Alert>
              <Box sx={{ display:'flex', flexDirection:'column', gap:0.5 }}>
                <Typography variant="body2">- Scrivi e invia: digita il messaggio e premi Invio.</Typography>
                <Typography variant="body2">- Allegati: carica PDF o immagini nella sezione allegati.</Typography>
                <Typography variant="body2">- Feedback: usa pollice su/giù per valutare.</Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog dettagli chunk RAG */}
  <Dialog open={!!selectedChunk} onClose={()=> setSelectedChunk(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr:2 }}>
          {selectedChunk ? `Chunk ${selectedChunk.chunk_index} – ${selectedChunk.filename}` : 'Fonte'}
        </DialogTitle>
        <DialogContent dividers>
          {selectedChunk && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Similarità: {selectedChunk.similarity ? (selectedChunk.similarity*100).toFixed(1)+'%' : 'n/d'}
              </Typography>
              <Box sx={{ p:1, bgcolor:'#fafafa', border:'1px solid #eee', borderRadius:1, fontSize:'0.8rem', maxHeight:300, overflow:'auto' }}>
                {selectedChunk.content || selectedChunk.preview || '(contenuto non disponibile)'}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setSelectedChunk(null)} size="small">Chiudi</Button>
        </DialogActions>
      </Dialog>

  <Dialog
        open={showSearch}
        onClose={() => setShowSearch(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { minHeight: '70vh' } }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <SearchIcon />
              Cerca Conversazioni
            </Box>
            <IconButton onClick={() => setShowSearch(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <ConversationSearch
            onResultSelect={(conversationId: string, messageId?: string) => {
              setCurrentConversationId(conversationId);
              // TODO: Load selected conversation and scroll to message if provided
              setShowSearch(false);
            }}
            selectedConversationId={currentConversationId || undefined}
            isCompact={false}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog obbligatorio cambio password */}
  <Dialog open={forcePwdOpen} onClose={() => {}} maxWidth="sm" fullWidth>
        <DialogTitle>Imposta una nuova password</DialogTitle>
        <DialogContent>
          {forcePwdError && <Alert severity="error" sx={{ mb:2 }}>{forcePwdError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField type="password" label="Nuova password" value={forceNewPwd} onChange={(e)=> setForceNewPwd(e.target.value)} fullWidth />
            <TextField type="password" label="Conferma nuova password" value={forceNewPwd2} onChange={(e)=> setForceNewPwd2(e.target.value)} fullWidth />
            <Alert severity="info">Per motivi di sicurezza, devi impostare una nuova password prima di continuare.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={async()=>{
              setForcePwdError(undefined)
              if (!forceNewPwd || forceNewPwd !== forceNewPwd2) { setForcePwdError('Le password non corrispondono'); return }
              try {
                const { apiService } = await import('./apiService')
                const resp = await apiService.forceChangePassword(forceNewPwd)
                if (resp.success) {
                  setForcePwdOpen(false)
                  setForceNewPwd(''); setForceNewPwd2('')
                  await checkAuthStatus()
                } else {
                  setForcePwdError(resp.error || 'Errore nel cambio password')
                }
              } catch (e:any) {
                setForcePwdError('Errore nel cambio password')
              }
            }}
          >Salva</Button>
        </DialogActions>
      </Dialog>

  <Dialog open={showSurvey} onClose={()=> setShowSurvey(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Valuta l'esperienza</DialogTitle>
        <DialogContent>
          <SurveyForm backendUrl={BACKEND} onSubmitted={()=> setTimeout(()=> setShowSurvey(false), 1500)} />
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={previewOpen} onClose={closePreview} fullWidth maxWidth={previewType==='pdf' ? 'lg' : 'md'}>
        <DialogTitle sx={{ pr: 6 }}>
          {previewTitle || 'Anteprima documento'}
          <IconButton onClick={closePreview} sx={{ position:'absolute', right:8, top:8 }} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: previewType==='pdf' ? 500 : 300, p:2 }}>
          {previewLoading && (
            <Box display="flex" alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
              <CircularProgress />
            </Box>
          )}
          {!previewLoading && previewError && (
            <Alert severity="error">{previewError}</Alert>
          )}
          {!previewLoading && !previewError && previewType === 'pdf' && previewUrl && (
            <Box sx={{ width:'100%', height: '100%', '& iframe': { border: 'none' } }}>
              <iframe src={previewUrl} style={{ width: '100%', height: 480 }} title={previewTitle} />
            </Box>
          )}
          {!previewLoading && !previewError && (previewType === 'markdown' || previewType === 'text') && (
            previewType === 'markdown' ? (
              <Box sx={{ '& h1,& h2,& h3': { mt:2 }, '& pre': { p:1, bgcolor:'#f5f5f5', overflowX:'auto' } }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{prepareChatMarkdown(previewContent)}</ReactMarkdown>
              </Box>
            ) : (
              <Box component="pre" sx={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'monospace', fontSize:'0.85rem', m:0 }}>
                {previewContent}
              </Box>
            )
          )}
        </DialogContent>
        <DialogActions>
          {previewType === 'markdown' && previewContent && previewContent.includes('### Chunk') && (
            <Button size="small" onClick={()=>{
              const blob = new Blob([previewContent], { type:'text/markdown' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = (previewTitle.replace(/\s+/g,'_') || 'documento') + '_aggregato.md'
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              setTimeout(()=> URL.revokeObjectURL(url), 2000)
            }}>Scarica aggregato</Button>
          )}
          {previewType && (
            <Button size="small" onClick={()=>{ if (previewType==='pdf' && previewUrl) window.open(previewUrl, '_blank'); else window.open(previewTitle, '_blank') }} disabled={previewLoading || !!previewError}>Apri originale</Button>
          )}
          <Button onClick={closePreview}>Chiudi</Button>
        </DialogActions>
      </Dialog>

      <SiteFooter />

      {/* Whisper progress modal */}
      <Dialog open={whisperModalOpen} onClose={()=>{ /* non chiudere manuale */ }} maxWidth="xs" fullWidth>
        <DialogTitle>Preparazione modello vocale</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb:1 }}>
            {whisperStage === 'downloading' ? 'Download modello Whisper in corso…' : 'Caricamento modello in memoria…'}
          </Typography>
          {whisperStage === 'downloading' && (
            <Box sx={{ display:'flex', alignItems:'center', gap:2 }}>
              <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, whisperProgress))} sx={{ flex:1 }} />
              <Typography variant="caption" sx={{ width:38, textAlign:'right' }}>{Math.round(whisperProgress)}%</Typography>
            </Box>
          )}
          {whisperStage === 'loading' && (
            <Box sx={{ display:'flex', alignItems:'center', gap:2 }}>
              <LinearProgress variant="indeterminate" sx={{ flex:1 }} />
              <Typography variant="caption" sx={{ width:58, textAlign:'right' }}>loading</Typography>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display:'block', mt:1 }}>
            Modello: {whisperModel} • L'operazione avviene una sola volta: i prossimi audio saranno trascritti immediatamente.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled size="small">Attendere…</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// App wrapper con AuthProvider



export default function App() {
  // Routing semplice basato sull'URL
  if (window.location.pathname === '/admin') {
    return <AdminPanel />
  }
  if (window.location.pathname === '/survey-results') {
    return (
      <AuthProvider>
        <SurveyResults />
      </AuthProvider>
    )
  }

  return (
    <ThemeProvider theme={appTheme}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
