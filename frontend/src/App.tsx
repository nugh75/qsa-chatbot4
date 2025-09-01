import React, { useEffect, useState } from 'react'
import type { PersonalityEntry } from './types/admin'
import { Container, Box, Paper, Typography, TextField, IconButton, Stack, Select, MenuItem, Avatar, Tooltip, Drawer, Button, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Collapse, Card, CardContent, Chip, FormControl, CircularProgress, Link, Menu, ListItemIcon, ListItemText } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import PersonIcon from '@mui/icons-material/Person'
// VolumeUpIcon removed from inline usage (handled by HeaderBar)
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
import VoiceRecordingAnimation from './components/VoiceRecordingAnimation'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { createApiService } from './types/api'
import AdminPanel from './AdminPanel'
import { ThemeProvider } from '@mui/material/styles'
import { appTheme } from './theme'
import RAGContextSelector from './components/RAGContextSelector'
import SurveyForm from './SurveyForm'
// (SurveyLink rimosso: inline link custom)
import SurveyResults from './SurveyResults'
import { authFetch } from './utils/authFetch'
import ReactMarkdown from 'react-markdown'
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

// Nuova struttura fonti consolidata dal backend (source_docs)
type SourceDocs = {
  rag_chunks?: { chunk_index?: number; filename?: string; similarity?: number; preview?: string; content?: string; document_id?: any; stored_filename?: string }[]
  pipeline_topics?: { name: string; description?: string | null }[]
  rag_groups?: { id: any; name: string }[]
}

type Msg = { 
  role:'user'|'assistant'|'system', 
  content:string, 
  ts:number,
  topic?: string,
  // Nuova chiave unificata
  source_docs?: SourceDocs | null,
  __sourcesExpanded?: boolean
  // (Campi legacy rimossi: rag_results, pipeline_topics, rag_group_names)
}

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
                  🖼️ Descrizioni Immagini
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
  const [ttsProvider, setTtsProvider] = useState<'edge'|'elevenlabs'|'openai'|'piper'>('edge')
  const [ttsVoice, setTtsVoice] = useState<string | undefined>(undefined)
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
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

  // Build aggregated content for a document name from rag chunks
  const normalizeDocName = (raw: string): string => {
    return raw
      .toLowerCase()
      .replace(/%20/g,' ')
      .replace(/[\s_-]+/g,' ') // uniforma separatori
      .replace(/\.pdf$|\.md$|\.markdown$|\.txt$/,'')
      .trim()
  }
  const buildDocumentAggregate = (name: string, ragChunks?: SourceDocs['rag_chunks']): string => {
    if (!ragChunks) return ''
    const decoded = decodeURIComponent(name)
    const target = normalizeDocName(decoded)
    const related = ragChunks.filter(c => {
      const fn = c.filename || ''
      const base = fn.split('/').pop() || fn
      const cleaned = normalizeDocName(base.split('_').pop() || base)
      return cleaned && (cleaned === target || cleaned.includes(target) || target.includes(cleaned))
    })
    if (!related.length) return ''
    related.sort((a,b)=> (a.chunk_index||0) - (b.chunk_index||0))
    return related.map(c => `### Chunk ${c.chunk_index}\n${c.content || c.preview || ''}` ).join('\n\n')
  }

  // Inject links for bare [📄 filename] citations (no existing (url))
  const injectDocLinks = (md: string, ragChunks?: SourceDocs['rag_chunks']): string => {
    if (!md) return md
    const normSet = new Set((ragChunks||[]).map(c => {
      const fn = c.filename || ''
      const base = fn.split('/').pop() || fn
      return normalizeDocName(base.split('_').pop() || base)
    }))
    return md.replace(/\[📄\s+([^\]\(]+?)\](?!\()/g, (match, inner) => {
      const raw = inner.trim()
      const norm = normalizeDocName(raw)
      const has = Array.from(normSet).some(f => f && (f === norm || f.includes(norm) || norm.includes(f)))
      if (!has) return match
      return `[📄 ${raw}](doc://${encodeURIComponent(raw)})`
    })
  }

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
        const lower = href.toLowerCase()
        let type: 'pdf' | 'markdown' | 'text' = 'text'
        if (lower.endsWith('.pdf')) type = 'pdf'
        else if (lower.endsWith('.md') || lower.endsWith('.markdown')) type = 'markdown'
        else if (lower.endsWith('.txt')) type = 'text'
        else if (/\/api\/rag\/download\//.test(href)) type = 'pdf'
        setPreviewType(type)
        const res = await fetch(href)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (type === 'pdf') {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
        } else {
          const text = await res.text()
          const max = 200 * 1024
          const truncated = text.length > max ? text.slice(0, max) + '\n\n[contenuto troncato]' : text
          setPreviewContent(truncated)
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
  const sanitizeMarkdownToPlainText = (input: string): string => {
    let text = input
    text = text.replace(/```[\s\S]*?```/g, ' ')
    text = text.replace(/`([^`]+)`/g, '$1')
    text = text.replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1')
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
    text = text.replace(/^\s{0,3}>\s?/gm, '')
    text = text.replace(/^\s{0,3}[-*+]\s+/gm, '')
    text = text.replace(/^\s{0,3}\d+\.\s+/gm, '')
    text = text.replace(/^\s*\|?\s*:?[-]{2,}:?\s*(\|\s*:?[-]{2,}:?\s*)+\|?\s*$/gm, '')
    text = text.replace(/^\s*[-]{3,}\s*$/gm, '')
    text = text.replace(/\|/g, ' • ')
    text = text.replace(/<[^>]+>/g, '')
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
    text = text.replace(/\*([^*]+)\*/g, '$1')
    text = text.replace(/__([^_]+)__/g, '$1')
    text = text.replace(/_([^_]+)_/g, '$1')
    text = text.replace(/[ \t\f\v]+/g, ' ')
    text = text.replace(/\n{3,}/g, '\n\n')
    return text.trim()
  }

  const normalizeMarkdownForDisplay = (md: string): string => {
    if (!md) return md
    let out = md.replace(/```[a-zA-Z]*\n([\s\S]*?)\n```/g, (match, inner) => {
      const lines = inner.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].includes('|')) {
          const sep = lines[i + 1]?.trim() || ''
          if (/^[:\-| ]+$/.test(sep) && sep.includes('-')) {
            return inner
          }
        }
      }
      return match
    })
    const lines = out.split('\n')
    const converted: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i]
      const nxt = lines[i + 1] || ''
      if (/^\s*-{2,}(?:\s+-{2,})+\s*$/.test(nxt)) {
        const headers = cur.trim().split(/\s{2,}/).filter(Boolean)
        const seps = nxt.trim().split(/\s{2,}/).filter(Boolean)
        if (headers.length >= 2 && seps.length === headers.length) {
          const headerRow = `| ${headers.join(' | ')} |`
          const sepRow = `| ${seps.map(() => '---').join(' | ')} |`
          const bodyRows: string[] = []
          let j = i + 2
          while (j < lines.length) {
            const row = lines[j]
            if (!row.trim()) break
            const cols = row.trim().split(/\s{2,}/).filter(Boolean)
            if (cols.length === headers.length) {
              bodyRows.push(`| ${cols.join(' | ')} |`)
              j++
            } else {
              break
            }
          }
          converted.push(headerRow, sepRow, ...bodyRows)
          i = j - 1
          continue
        }
      }
      converted.push(cur)
    }
    out = converted.join('\n')
    return out
  }

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
    'piper': 'Piper'
  }

  const asrLabels: Record<string, string> = {
    'openai': 'OpenAI Whisper',
    'local': 'Whisper Locale'
  }
  useEffect(()=>{ localStorage.setItem('chat_messages', JSON.stringify(messages)) },[messages])

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
              if (prev.length > 1 || (prev[0] && prev[0].content && prev[0].content !== 'Caricamento messaggio di benvenuto…')) return prev
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
          if (defId) setSelectedPersonalityId(defId)
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
          if (def && messages.length <= 1 && messages[0].content === 'Caricamento messaggio di benvenuto…') {
            const welcomeText = def.welcome_message_content || def.welcome_message
            if (welcomeText) {
              setMessages([{ role:'assistant', content: welcomeText, ts: Date.now() }])
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
    setMessages([{
      role: 'assistant', 
      content: 'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nPrima di iniziare, ricorda che ciò che condivido sono solo suggerimenti orientativi: per decisioni e approfondimenti rivolgiti sempre ai tuoi professori, ai tutor/orientatori e alle altre figure di supporto del tuo istituto.\n\nHo visto che hai completato il QSA – che esperienza interessante!\n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', 
      ts: Date.now()
    }]);
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

  const send = async ()=>{
    const text = input.trim()
    if(!text) return
  const next: Msg[] = [...messages, {role:'user' as const, content:text, ts:Date.now()}]
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
          
          // Critta il titolo se abbiamo la chiave crypto
          if (crypto && crypto.isKeyInitialized()) {
            titleToSend = await crypto.encryptMessage(title);
          }

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
        console.log('🔄 Continuo conversazione esistente:', conversationId);
      }

      // Il messaggio viene sempre inviato in chiaro al backend per l'elaborazione LLM
      const messageToSend = text;
      
      // Se l'utente è autenticato, prepara anche la versione crittografata per il database
      let messageEncrypted = null;
      if (isAuthenticated && crypto && crypto.isKeyInitialized()) {
        try {
          messageEncrypted = await crypto.encryptMessage(text);
        } catch (cryptoError) {
          console.warn('Failed to encrypt message for database storage:', cryptoError);
        }
      }
      
      const requestBody: any = { 
        message: messageToSend,  // Messaggio in chiaro per LLM
        sessionId: 'dev' 
      };
      
      // Aggiungi messaggio crittografato se disponibile
      if (messageEncrypted) {
        requestBody.message_encrypted = messageEncrypted;
      }
      
      // Aggiungi allegati se presenti
      if (attachedFiles.length > 0) {
        requestBody.attachments = attachedFiles.map(file => {
          const att: any = {
            id: file.id,
            filename: file.filename,
            file_type: file.file_type,
            content: file.content
          }
          if (file.base64_data) att.base64_data = file.base64_data
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
        const recentHistory = historySource.slice(- (cw ? cw : 8)).map(msg => ({
            role: msg.role,
            content: msg.content
        }))
        
        requestBody.conversation_history = recentHistory;
        console.log('📝 Invio cronologia recente:', recentHistory.length, 'messaggi');
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
        if(done) break
        buffer += decoder.decode(value, {stream:true})

        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for(const part of parts){
          const line = part.trim()
            if(!line.startsWith('data:')) continue
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

      if (!response.ok) throw new Error('Errore TTS')
      
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

          const response = await authFetch(`${BACKEND}/api/transcribe`, {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            throw new Error('Errore nella trascrizione')
          }

          const result = await response.json()
          if (result.text) {
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
        onDownloadChat={messages.length ? ()=>{
          const blob = new Blob([messages.map(m=>`[${new Date(m.ts).toLocaleString()}] ${m.role}: ${m.content}`).join('\n\n')], { type:'text/plain' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'chat.txt'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
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
              if (wg.success) setActiveGuide(wg.data?.guide?.content)
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
              Accedi per salvare le conversazioni e usare la crittografia end-to-end
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
                  maxWidth: '85%',
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
                    '& table': { width: '100%', borderCollapse: 'collapse', my: 1 },
                    '& th, & td': { border: '1px solid rgba(0,0,0,0.15)', padding: '6px 8px', textAlign: 'left' },
                    '& thead th': { bgcolor: 'rgba(0,0,0,0.04)' },
                    '& code': { bgcolor: 'rgba(0,0,0,0.06)', px: 0.5, py: 0.1, borderRadius: 0.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
                    '& pre > code': { display: 'block', p: 1, overflowX: 'auto' },
                    '& p': { m: 0 },
                  }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                      a: ({node, href, children, ...props}) => {
                        const h = href || ''
                        const isDoc = /^doc:\/\//.test(h) || /\.(pdf|md|markdown|txt)$/i.test(h) || /\/api\/rag\/download\//.test(h)
                        if (!isDoc) {
                          return <a href={h} {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                        }
                        return <a href={h} {...props} onClick={(e)=>{ e.preventDefault(); openPreviewForLink(h, (children as any)?.toString?.() || h, m.source_docs?.rag_chunks) }} style={{ cursor:'pointer', textDecoration:'underline' }}>{children}</a>
                      }
                    }}>
                      {injectDocLinks(normalizeMarkdownForDisplay(m.content), m.source_docs?.rag_chunks)}
                    </ReactMarkdown>
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
                      onClick={() => playTTS(sanitizeMarkdownToPlainText(m.content), i)}
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
                    {m.role==='assistant' && m.source_docs && (m.source_docs.rag_chunks?.length || m.source_docs.pipeline_topics?.length || m.source_docs.rag_groups?.length) && (
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
                              {m.source_docs.rag_chunks?.length ? (
                                <Box sx={{ mb:0.5 }}>
                                  <Link component="button" type="button" underline="hover" sx={{ fontSize:'0.6rem', opacity:0.8 }} onClick={()=> setMinRagSimilarity(s=> s ? 0 : 0.5)}>
                                    {minRagSimilarity ? `Filtro similarità ≥ ${(minRagSimilarity*100).toFixed(0)}% (clic per mostrare tutti)` : 'Applica filtro similarità ≥50%'}
                                  </Link>
                                </Box>
                              ) : null}
                              <Stack spacing={0.75} sx={{ maxWidth: '100%' }}>
                                {/* Topic pipeline */}
                                {m.source_docs.pipeline_topics && m.source_docs.pipeline_topics.map((pt,idx)=>(
                                  <Box key={`pt-${idx}`} sx={{ fontSize:'0.7rem', lineHeight:1.3 }}>
                                    <strong style={{ color:'#ff9800' }}>Topic:</strong> {pt.name}{pt.description? <Tooltip title={<span style={{whiteSpace:'pre-line'}}>{pt.description}</span>} arrow><sup style={{marginLeft:4,cursor:'help',color:'#ff9800'}}>?</sup></Tooltip>:null}
                                  </Box>
                                ))}
                                {/* Gruppi RAG selezionati */}
                                {m.source_docs.rag_groups && m.source_docs.rag_groups.length>0 && (
                                  <Box sx={{ fontSize:'0.7rem', lineHeight:1.3 }}>
                                    <strong style={{ color:'#558b2f' }}>Gruppi:</strong> {m.source_docs.rag_groups.map(g=>g.name).join(', ')}
                                  </Box>
                                )}
                                {/* Documenti con grouping chunks */}
                                {m.source_docs.rag_chunks && m.source_docs.rag_chunks.length>0 && (()=>{
                                  const sorted = [...m.source_docs.rag_chunks].sort((a,b)=> (b.similarity||0) - (a.similarity||0));
                                  const filtered = sorted.filter(r=> !minRagSimilarity || (r.similarity || 0) >= minRagSimilarity);
                                  // Group by document_id if available, else by filename
                                  const groupsByDoc = {} as Record<string,{document_id:any; stored_filename?:string; filename?:string; maxSim:number; chunks:any[]}>;
                                  filtered.forEach(ch => {
                                    const key = (ch.document_id || ch.filename || 'unknown') + '';
                                    if(!groupsByDoc[key]) groupsByDoc[key] = { document_id: ch.document_id, stored_filename: ch.stored_filename, filename: ch.filename, maxSim: ch.similarity||0, chunks: [] };
                                    groupsByDoc[key].chunks.push(ch);
                                    if((ch.similarity||0) > groupsByDoc[key].maxSim) groupsByDoc[key].maxSim = ch.similarity||0;
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
                                                <Box sx={{ fontSize:'0.65rem', fontWeight:600, color:'#1976d2' }}>
                                                  {baseName}
                                                  {d.maxSim ? <Box component="span" sx={{ ml:1, fontWeight:400, color:'#555' }}>max {(d.maxSim*100).toFixed(1)}%</Box> : null}
                                                </Box>
                                                {d.stored_filename && d.document_id && (
                                                  <Tooltip title="Scarica PDF originale"><IconButton size="small" onClick={()=> window.open(`/admin/rag/documents/${d.document_id}/download`, '_blank')} sx={{ p:0.3 }}>
                                                    <SmallDownloadIcon size={14} />
                                                  </IconButton></Tooltip>
                                                )}
                                              </Stack>
                                              <Box sx={{ display:'flex', flexWrap:'wrap', gap:0.4 }}>
                                                {d.chunks.slice(0,6).map((r,ci)=>{
                                                  const preview = (r.preview || '').replace(/\s+/g,' ').trim();
                                                  const shortPrev = preview ? (preview.length>160 ? preview.slice(0,160)+'…' : preview) : '';
                                                  const tip = `Chunk ${r.chunk_index}${r.similarity? `\nSim: ${(r.similarity*100).toFixed(1)}%` : ''}${shortPrev?`\n---\n${shortPrev}`:''}`;
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
              />
            </Stack>
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
        />
      )}

      {/* File Manager */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display:'flex', alignItems:'center', gap:1, mb: 0.5 }}>
          <ImageIcon sx={{ color:'text.secondary' }} fontSize="small" />
          <Typography variant="body2" color="text.secondary">Allegati</Typography>
          <Tooltip title="Carica PDF o immagini: il chatbot userà i contenuti nelle risposte.">
            <HelpOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </Tooltip>
        </Box>
        <FileManagerCompact
          attachedFiles={attachedFiles}
          onFilesChange={setAttachedFiles}
          maxFiles={3}
          disabled={loading}
        />
      </Box>

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

  <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentConversationId={currentConversationId || undefined}
        onConversationSelect={async (id) => {
          setCurrentConversationId(id);
          setLoading(true);
          
          try {
            // Carica i messaggi della conversazione selezionata
            if (isAuthenticated && crypto && crypto.isKeyInitialized()) {
              const apiService = await import('./apiService').then(m => m.apiService);
              const response = await apiService.getConversationMessages(id);
              
              if (response.success && response.data) {
                // Decripta e carica i messaggi
                const decryptedMessages = await Promise.all(
                  response.data.map(async (msg: any) => {
                    try {
                      const decryptedContent = msg.role === 'user' 
                        ? await crypto.decryptMessage(msg.content_encrypted)
                        : msg.content_encrypted; // Messaggi assistant in chiaro
                      
                      return {
                        role: msg.role,
                        content: decryptedContent,
                        ts: new Date(msg.timestamp).getTime()
                      };
                    } catch (error) {
                      console.warn('Failed to decrypt message:', error);
                      return {
                        role: msg.role,
                        content: '[Messaggio crittografato - Login per decrittare]',
                        ts: new Date(msg.timestamp).getTime()
                      };
                    }
                  })
                );
                
                setMessages(decryptedMessages);
              } else {
                setError('Errore nel caricamento dei messaggi');
              }
            } else {
              // Utente non autenticato - mostra messaggio generico
              setMessages([{
                role: 'assistant' as const,
                content: 'Questa conversazione è crittografata. Effettua il login per visualizzare i messaggi.',
                ts: Date.now()
              }]);
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeGuide}</ReactMarkdown>
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
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
