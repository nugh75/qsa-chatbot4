import React, { useEffect, useState } from 'react'
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

// Tipo minimo per dati estratti (placeholder se non definito altrove)
type ExtractedData = {
  tables?: { image_num: number; source: string; data: string }[]
  images?: { image_num: number; source: string; full_description: string }[]
}

type Msg = { 
  role:'user'|'assistant'|'system', 
  content:string, 
  ts:number
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
  return [{role:'assistant', content:'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nPrima di iniziare, ricorda che ciò che condivido sono solo suggerimenti orientativi: per decisioni e approfondimenti rivolgiti sempre ai tuoi professori, ai tutor/orientatori e alle altre figure di supporto del tuo istituto.\n\nHo visto che hai completato il QSA – che esperienza interessante!\n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', ts:Date.now()}]
  })
  const [input,setInput] = useState('')
  const [provider,setProvider] = useState<'local'|'gemini'|'claude'|'openai'|'openrouter'|'ollama'>('local')
  const [personalities, setPersonalities] = useState<{id:string; name:string; provider:string; model:string; system_prompt_id:string; avatar_url?: string | null}[]>([])
  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('')
  const [error,setError] = useState<string|undefined>()
  const [loading,setLoading] = useState(false)
  const [ttsProvider, setTtsProvider] = useState<'edge'|'elevenlabs'|'openai'>('edge')
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

  // Converte Markdown in testo semplice per TTS (rimuove tag e simboli)
  const sanitizeMarkdownToPlainText = (input: string): string => {
    let text = input
    // Rimuovi blocchi di codice ``` ```
    text = text.replace(/```[\s\S]*?```/g, ' ')
    // Rimuovi inline code `code`
    text = text.replace(/`([^`]+)`/g, '$1')
    // Immagini: mantieni solo alt text
    text = text.replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    // Link: mantieni solo il testo
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1')
    // Header markdown # ## ### -> rimuovi i #
    text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Citazioni >
    text = text.replace(/^\s{0,3}>\s?/gm, '')
    // Liste - * + e numerate
    text = text.replace(/^\s{0,3}[-*+]\s+/gm, '')
    text = text.replace(/^\s{0,3}\d+\.\s+/gm, '')
    // Tabelle: rimuovi righe separatrici e sostituisci pipe con spazi puntati
    text = text.replace(/^\s*\|?\s*:?[-]{2,}:?\s*(\|\s*:?[-]{2,}:?\s*)+\|?\s*$/gm, '')
    text = text.replace(/^\s*[-]{3,}\s*$/gm, '')
    text = text.replace(/\|/g, ' • ')
    // Rimuovi tag HTML
    text = text.replace(/<[^>]+>/g, '')
    // Grassetto/corsivo
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
    text = text.replace(/\*([^*]+)\*/g, '$1')
    text = text.replace(/__([^_]+)__/g, '$1')
    text = text.replace(/_([^_]+)_/g, '$1')
    // Comprimi spazi
    text = text.replace(/[ \t\f\v]+/g, ' ')
    // Normalizza nuove righe multiple
    text = text.replace(/\n{3,}/g, '\n\n')
    return text.trim()
  }

  // Normalizza il Markdown per la visualizzazione: sblocca tabelle accidentalmente racchiuse in ```
  const normalizeMarkdownForDisplay = (md: string): string => {
    if (!md) return md
    // 1) Sblocca tabelle dentro code fence
    let out = md.replace(/```[a-zA-Z]*\n([\s\S]*?)\n```/g, (match, inner) => {
      // Se il blocco contiene una tabella GFM (riga con '|' seguita da riga di separatori '---'), rimuovi i backtick
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
    // 2) Converte semplici tabelle "a trattini" senza pipe in GFM
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
  const assistantAvatarSrc = '/volto.png'

  // Load public configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { apiService } = await import('./apiService')
        const response = await apiService.getPublicConfig()
        if (response.success && response.data) {
          setEnabledProviders(response.data.enabled_providers)
          setEnabledTtsProviders(response.data.enabled_tts_providers)
          setEnabledAsrProviders(response.data.enabled_asr_providers)
          setDefaultProvider(response.data.default_provider)
          setDefaultTts(response.data.default_tts)
          setDefaultAsr(response.data.default_asr)
          setArenaPublic(Boolean(response.data.ui_settings?.arena_public))
          
          // Set default values if current selections are not enabled
          if (!response.data.enabled_providers.includes(provider)) {
            setProvider(response.data.default_provider as any)
          }
          if (!response.data.enabled_tts_providers.includes(ttsProvider)) {
            setTtsProvider(response.data.default_tts as any)
          }
          if (!response.data.enabled_asr_providers.includes(asrProvider)) {
            setAsrProvider(response.data.default_asr as any)
          }
        }
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
        }
      } catch (error) {
        console.error('Error loading config:', error)
      }
    }
    loadConfig()
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
        const recentHistory = messages.slice(-8).map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        
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
        // conserva l'ultima se incompleta
        buffer = parts.pop() || ''
        for(const part of parts){
          const line = part.trim()
          if(!line.startsWith('data:')) continue
          const jsonStr = line.slice(5).trim()
          try {
            const evt = JSON.parse(jsonStr)
            if(evt.delta){ commitDelta(evt.delta) }
            if(evt.error){ setError(evt.error) }
            if(evt.done){
              if(evt.reply){ commitDelta('') /* reply già completa */ }
            }
          } catch(e){ /* ignora parse */ }
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
          voice: ttsProvider === 'edge' ? 'it-IT-ElsaNeural' : undefined
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

  // Routing semplice basato sull'URL
  if (window.location.pathname === '/admin') {
    return <AdminPanel />
  }

  return (
    <Container maxWidth={isMobile ? 'sm' : 'xl'} sx={{ py: isMobile ? 1 : 3, px: isMobile ? 1 : 2, pb: isMobile ? 10 : 3 }}>
      {/* Unified responsive header bar with personality, voice and download */}
      <HeaderBar
        personalities={personalities}
        selectedPersonalityId={selectedPersonalityId}
        onChangePersonality={(id)=>{
          setSelectedPersonalityId(id)
          const p = personalities.find(pp=>pp.id===id)
          if (p && enabledProviders.includes(p.provider)) setProvider(p.provider as any)
        }}
        ttsProviders={enabledTtsProviders}
        ttsProvider={ttsProvider}
        onChangeTts={(p)=> setTtsProvider(p as any)}
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
        onNewChat={()=>{
          setMessages([{ 
            role: 'assistant', 
            content: 'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nPrima di iniziare, ricorda che ciò che condivido sono solo suggerimenti orientativi: per decisioni e approfondimenti rivolgiti sempre ai tuoi professori, ai tutor/orientatori e alle altre figure di supporto del tuo istituto.\n\nHo visto che hai completato il QSA – che esperienza interessante!\n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', 
            ts: Date.now()
          }]);
          setCurrentConversationId(null);
        }}
        onShowGuide={()=> setShowHelp(true)}
        onOpenArena={()=> window.location.href = '/arena'}
        showArena={user?.is_admin || arenaPublic}
        isAuthenticated={isAuthenticated}
        onLogin={()=> setShowLoginDialog(true)}
        onLogout={handleLogout}
        dense={isMobile}
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
      
  {/* Legacy top bar simplified: only left chat title/menu and mobile/overflow controls; desktop actions moved to HeaderBar */}
  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:2, flexWrap: 'nowrap' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth:0 }}>
          <Tooltip title="Menu conversazioni">
            <IconButton
              size="small"
              onClick={() => setSidebarOpen(true)}
              sx={{ color: 'primary.main' }}
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <ChatAvatar key={selectedPersonalityId || 'default'} src={assistantAvatarSrc} />
          {!isVerySmall && <Typography variant="h6" noWrap>Counselorbot</Typography>}
          {user?.is_admin && (
            <Chip
              component="a"
              href="/admin"
              label="Admin"
              color="warning"
              size="small"
              clickable
              sx={{ ml: 1 }}
            />
          )}
        </Stack>
  {/* Controlli principali (pruned: personality, voice now in HeaderBar) */}
  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap:'nowrap', overflow:'hidden' }}>
          {/* Desktop action buttons removed (now in HeaderBar). */}
          {/* Login/Logout */}
          {/* Menu overflow mobile */}
          {isMobile && (
            <>
              <IconButton size="small" onClick={handleOpenMore} sx={{ color:'primary.main' }}>
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={moreAnchor} open={openMore} onClose={handleCloseMore} keepMounted>
                <MenuItem onClick={() => { handleCloseMore(); setShowHelp(true) }}>
                  <ListItemIcon><HelpOutlineIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Guida</ListItemText>
                </MenuItem>
                {(user?.is_admin || arenaPublic) && (
                  <MenuItem component="a" href="/arena" onClick={handleCloseMore}>
                    <ListItemText>Arena</ListItemText>
                  </MenuItem>
                )}
                <MenuItem onClick={() => { handleCloseMore(); setMessages([{ role:'assistant', content:'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nPrima di iniziare, ricorda che ciò che condivido sono solo suggerimenti orientativi: per decisioni e approfondimenti rivolgiti sempre ai tuoi professori, ai tutor/orientatori e alle altre figure di supporto del tuo istituto.\n\nHo visto che hai completato il QSA – che esperienza interessante!\n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', ts:Date.now()}]); setCurrentConversationId(null) }}>
                  <ListItemText>Nuova conversazione</ListItemText>
                </MenuItem>
                {isAuthenticated ? (
                  <MenuItem onClick={() => { handleCloseMore(); handleLogout() }}>
                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Logout</ListItemText>
                  </MenuItem>
                ) : (
                  <MenuItem onClick={() => { handleCloseMore(); setShowLoginDialog(true) }}>
                    <ListItemIcon><LoginIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Login</ListItemText>
                  </MenuItem>
                )}
              </Menu>
            </>
          )}
          {/* Desktop login/logout moved to HeaderBar */}
        </Stack>
      </Stack>

      {!isAuthenticated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center" sx={{ gap: 1 }}>
            <Typography sx={{ lineHeight: 1.4 }}>
              Accedi per salvare le conversazioni e usare la crittografia end-to-end
            </Typography>
          </Box>
        </Alert>
      )}

  <Paper variant="outlined" sx={{ p: isMobile ? 1.5 : 3, minHeight: isMobile ? 'calc(100vh - 230px)' : 600, position: 'relative', bgcolor: '#fafafa', borderRadius: 2, overflow:'hidden' }}>
        {/* messages stack */}
        <Stack spacing={isMobile ? 2 : 3} sx={{ pb: isMobile ? 6 : 0 }}>
          {messages.map((m,i)=>(
            <Box key={i} display="flex" flexDirection="column" gap={1} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
              {/* Messaggio principale */}
              <Box display="flex" gap={2} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
                {/* Avatar per l'assistente a sinistra */}
                {m.role === 'assistant' && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                    <ChatAvatar key={`msg-${selectedPersonalityId || 'default'}`} src={assistantAvatarSrc} />
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
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {normalizeMarkdownForDisplay(m.content)}
                    </ReactMarkdown>
                  </Box>
                
                {/* Piccole icone in basso per messaggi dell'assistente */}
                {m.role === 'assistant' && !(isStreaming && streamingAssistantIndex === i) && (
                  <Box sx={{ 
                    display: 'flex', 
                    gap: 0.5, 
                    mt: 1, 
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
                      title={playingMessageIndex === i ? "Ferma audio" : `Ascolta (${ttsProvider})`}
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
                        padding: '3px',  // Aumentato padding
                        borderRadius: '6px',  // Angoli più arrotondati
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
                <ChatAvatar key={`typing-${selectedPersonalityId || 'default'}`} src={assistantAvatarSrc} />
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
                  Riproduzione audio ({ttsProvider})...
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

      {/* RAG Context Selector */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display:'flex', alignItems:'center', gap:1, mb: 0.5 }}>
          <TableChartIcon sx={{ color:'text.secondary' }} fontSize="small" />
          <Typography variant="body2" color="text.secondary">Contesto documenti</Typography>
          <Tooltip title="Attiva uno o più contesti per risposte basate sui documenti selezionati.">
            <HelpOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          </Tooltip>
        </Box>
        <RAGContextSelector 
          compact={true}
          onContextChange={(selectedGroups) => {
            setRAGContextActive(selectedGroups.length > 0);
          }}
        />
      </Box>

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
        onNewConversation={() => {
            setMessages([{
            role: 'assistant',
            content: 'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nPrima di iniziare, ricorda che ciò che condivido sono solo suggerimenti orientativi: per decisioni e approfondimenti rivolgiti sempre ai tuoi professori, ai tutor/orientatori e alle altre figure di supporto del tuo istituto.\n\nHo visto che hai completato il QSA – che esperienza interessante!\n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?',
            ts: Date.now()
            }]);
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
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Come usare il chatbot</DialogTitle>
        <DialogContent>
          <Box sx={{ display:'flex', flexDirection:'column', gap: 1 }}>
            <Typography variant="body2">- Scrivi e invia: digita il messaggio e premi Invio (Shift+Invio va a capo).</Typography>
            <Typography variant="body2">- Personalità: in alto puoi scegliere una personalità diversa (icona persona). Cambia lo stile della conversazione e l’avatar dell’assistente.</Typography>
            <Typography variant="body2">- Allegati: carica PDF o immagini dalla sezione “Allegati” sotto la chat; il chatbot userà i contenuti nelle risposte.</Typography>
            <Typography variant="body2">- Contesto documenti: attiva i contesti per risposte basate sui file selezionati.</Typography>
            <Typography variant="body2">- Voce: ascolta le risposte (icona altoparlante) o registra un messaggio vocale (icona microfono).</Typography>
            <Typography variant="body2">- Conversazioni: apri il menu (☰) per creare, rinominare o eliminare le chat.</Typography>
            <Typography variant="body2">- Esporta: scarica la chat o la chat con report quando ti serve.</Typography>
            <Typography variant="body2">- Feedback: usa pollice su/giù per dirci se la risposta è utile.</Typography>
            <Typography variant="body2">- Privacy: evita di condividere dati personali o sensibili.</Typography>
          </Box>
        </DialogContent>
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
