import React, { useEffect, useState } from 'react'
import { Container, Box, Paper, Typography, TextField, IconButton, Stack, Select, MenuItem, Avatar, Tooltip, Drawer, Button, Alert, Dialog, DialogTitle, DialogContent, Collapse, Card, CardContent, Chip } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import PersonIcon from '@mui/icons-material/Person'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import CheckIcon from '@mui/icons-material/Check'
import MenuIcon from '@mui/icons-material/Menu'
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
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { createApiService } from './types/api'
import AdminPanel from './AdminPanel'

type Msg = { 
  role:'user'|'assistant'|'system', 
  content:string, 
  ts:number
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8005'

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
                {extractedData.tables.map((table, idx) => (
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
                {extractedData.images.map((img, idx) => (
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
  const { user, crypto, isAuthenticated, isLoading, login, logout, needsCryptoReauth } = useAuth();
  
  const [messages,setMessages] = useState<Msg[]>(()=>{
    const saved = localStorage.getItem('chat_messages')
    if(saved){
      try { return JSON.parse(saved) }
      catch { localStorage.removeItem('chat_messages') }
    }
  return [{role:'assistant', content:'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nHo visto che hai completato il QSA - che esperienza interessante! \n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', ts:Date.now()}]
  })
  const [input,setInput] = useState('')
  const [provider,setProvider] = useState<'local'|'gemini'|'claude'|'openai'|'openrouter'|'ollama'>('local')
  const [error,setError] = useState<string|undefined>()
  const [loading,setLoading] = useState(false)
  const [ttsProvider, setTtsProvider] = useState<'edge'|'elevenlabs'|'openai'>('edge')
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [feedback, setFeedback] = useState<{[key: number]: 'like' | 'dislike'}>({})
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<ProcessedFile[]>([])
  useEffect(()=>{ localStorage.setItem('chat_messages', JSON.stringify(messages)) },[messages])

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
      content: 'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nHo visto che hai completato il QSA - che esperienza interessante! \n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', 
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

          const convResponse = await fetch(`${BACKEND}/api/conversations`, {
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
        requestBody.attachments = attachedFiles.map(file => ({
          id: file.id,
          filename: file.filename,
          file_type: file.file_type,
          content: file.content,
          base64_data: file.base64_data
        }));
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
      
      const r = await fetch(`${BACKEND}/api/chat`, {
        method:'POST',
        headers,
        body: JSON.stringify(requestBody)
      })
      if(!r.ok){ throw new Error(`HTTP ${r.status}`) }
      const data = await r.json()
      
      setMessages([...next, { 
        role:'assistant' as const, 
        content:data.reply, 
        ts:Date.now()
      }])
      
      // Pulisci gli allegati dopo l'invio riuscito
      setAttachedFiles([])
    } catch(e:any){
      setError(e.message || 'Errore di rete')
      // ripristina input per ritentare
      setInput(text)
      setMessages(messages)
    } finally {
      setLoading(false)
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
      const response = await fetch(`${BACKEND}/api/tts`, {
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
      // Placeholder per ora - implementare con Web Audio API
      setTimeout(() => {
        setIsRecording(false)
        setInput("Trascrizione vocale non ancora implementata")
      }, 2000)
    } catch (error) {
      console.error('Errore registrazione:', error)
      setIsRecording(false)
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
      await fetch(`${BACKEND}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messageIndex, 
          feedback: type, 
          timestamp: Date.now(),
          provider: provider 
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
    <Container maxWidth="md" sx={{ py: 3 }}>
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
      
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Menu conversazioni">
            <IconButton
              size="small"
              onClick={() => setSidebarOpen(true)}
              sx={{ color: 'primary.main' }}
            >
              <MenuIcon />
            </IconButton>
          </Tooltip>
          <ChatAvatar />
          <Typography variant="h6">Counselorbot – QSA Chatbot</Typography>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Select size="small" value={provider} onChange={e=>setProvider(e.target.value as any)}>
            <MenuItem value="local">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                Local
              </Box>
            </MenuItem>
            <MenuItem value="gemini">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                Gemini
              </Box>
            </MenuItem>
            <MenuItem value="claude">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                Claude
              </Box>
            </MenuItem>
            <MenuItem value="openai">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                OpenAI
              </Box>
            </MenuItem>
            <MenuItem value="openrouter">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                OpenRouter
              </Box>
            </MenuItem>
            <MenuItem value="ollama">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AIIcon size={16} />
                Ollama
              </Box>
            </MenuItem>
          </Select>
          
          <Select size="small" value={ttsProvider} onChange={e=>setTtsProvider(e.target.value as any)}>
            <MenuItem value="edge">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeakerIcon size={16} />
                Edge TTS
              </Box>
            </MenuItem>
            <MenuItem value="elevenlabs">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeakerIcon size={16} />
                ElevenLabs
              </Box>
            </MenuItem>
            <MenuItem value="openai">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeakerIcon size={16} />
                OpenAI Voice
              </Box>
            </MenuItem>
            <MenuItem value="piper">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeakerIcon size={16} />
                Piper TTS
              </Box>
            </MenuItem>
          </Select>
          
          <DownloadChatButton messages={messages} conversationId={currentConversationId} />
          
          {/* Rimosso pulsante di ricerca su richiesta */}
          
          {isAuthenticated ? (
            <Tooltip title={`Logout (${user?.email})`}>
              <IconButton
                size="small"
                onClick={handleLogout}
                sx={{ color: 'error.main' }}
              >
                <LogoutIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Login">
              <IconButton
                size="small"
                onClick={() => setShowLoginDialog(true)}
                sx={{ color: 'primary.main' }}
              >
                <LoginIcon />
              </IconButton>
            </Tooltip>
          )}
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

      <Paper variant="outlined" sx={{ p: 3, minHeight: 420, position: 'relative', bgcolor: '#fafafa' }}>
        {error && (
          <Box sx={{ position:'absolute', top:8, right:8, bgcolor:'#ffe6e6', border:'1px solid #ffb3b3', px:1.5, py:0.5, borderRadius:1 }}>
            <Typography variant="caption" color="error">{error}</Typography>
          </Box>
        )}
        <Stack spacing={3}>
          {messages.map((m,i)=>(
            <Box key={i} display="flex" flexDirection="column" gap={1} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
              {/* Messaggio principale */}
              <Box display="flex" gap={2} justifyContent={m.role === 'user' ? 'flex-end' : 'flex-start'}>
                {/* Avatar per l'assistente a sinistra */}
                {m.role === 'assistant' && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                    <ChatAvatar />
                  </Box>
                )}
                
                {/* Bolla del messaggio - aumentata la dimensione */}
                <Box sx={{ 
                  maxWidth: '80%',  // Aumentato da 75% a 80%
                  bgcolor: m.role === 'assistant' ? '#e3f2fd' : '#1976d2',
                  color: m.role === 'assistant' ? '#000' : '#fff',
                  p: 2.5,  // Aumentato il padding
                  borderRadius: 3,
                  borderTopLeftRadius: m.role === 'assistant' ? 1 : 3,
                  borderTopRightRadius: m.role === 'user' ? 1 : 3,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  position: 'relative',
                }}>
                  <Typography variant="body1" sx={{ 
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,  // Aumentato line-height
                    fontSize: '1rem'  // Aumentato font-size
                  }}>
                    {/* Rimuove i marcatori markdown e mostra testo pulito */}
                    {m.content
                      .replace(/\*\*(.*?)\*\*/g, '$1')  // Rimuove **grassetto**
                      .replace(/\*(.*?)\*/g, '$1')      // Rimuove *corsivo*
                      .replace(/`(.*?)`/g, '$1')        // Rimuove `codice`
                      .replace(/#{1,6}\s/g, '')         // Rimuove # headers
                      .replace(/\[.*?\]\(.*?\)/g, '')   // Rimuove link markdown
                    }
                  </Typography>
                
                {/* Piccole icone in basso per messaggi dell'assistente */}
                {m.role === 'assistant' && (
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
                      onClick={() => playTTS(m.content, i)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                      }}
                      title={playingMessageIndex === i ? "Ferma audio" : `Ascolta (${ttsProvider})`}
                    >
                      {playingMessageIndex === i ? <SmallStopIcon size={12} /> : <SpeakerIcon size={12} />}
                    </Box>

                    {/* Copia */}
                    <Box 
                      component="button" 
                      onClick={() => copyMessage(m.content, i)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: copiedMessage === i ? '#4caf50' : 'inherit'
                      }}
                      title={copiedMessage === i ? "Copiato!" : "Copia messaggio"}
                    >
                      {copiedMessage === i ? <SmallCheckIcon size={12} /> : <CopyIcon size={12} />}
                    </Box>

                    {/* Download */}
                    <Box 
                      component="button" 
                      onClick={() => downloadMessage(m.content)}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                      }}
                      title="Scarica messaggio"
                    >
                      <SmallDownloadIcon size={12} />
                    </Box>

                    {/* Like */}
                    <Box 
                      component="button" 
                      onClick={() => giveFeedback(i, 'like')}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: feedback[i] === 'like' ? '#4caf50' : 'inherit'
                      }}
                      title="Mi piace"
                    >
                      <LikeIcon size={12} />
                    </Box>

                    {/* Dislike */}
                    <Box 
                      component="button" 
                      onClick={() => giveFeedback(i, 'dislike')}
                      sx={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        padding: '2px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                        color: feedback[i] === 'dislike' ? '#f44336' : 'inherit'
                      }}
                      title="Non mi piace"
                    >
                      <DislikeIcon size={12} />
                    </Box>
                  </Box>
                )}
              </Box>
              
              {/* Avatar per l'utente a destra */}
              {m.role === 'user' && (
                <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Avatar sx={{ width: 40, height: 40, bgcolor: '#1976d2' }}>
                    <PersonIcon sx={{ fontSize: 24 }} />
                  </Avatar>
                </Box>
              )}
            </Box>
            
            {/* Dati estratti rimossi - elaborazione semplificata */}
          </Box>
          ))}
          
          {/* Indicatore di typing quando sta caricando */}
          {loading && (
            <Box display="flex" gap={2} justifyContent="flex-start">
              <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
                <ChatAvatar />
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

      <Paper elevation={2} sx={{ mt: 2, p: 1, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField 
            fullWidth 
            placeholder="Scrivi un messaggio…" 
            value={input} 
            onChange={e=>setInput(e.target.value)} 
            onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }}}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                '& fieldset': { border: 'none' },
              }
            }}
            multiline
            maxRows={4}
          />
          
          {/* Componente upload file */}
          <FileUpload 
            onFilesProcessed={handleFilesProcessed}
            disabled={loading}
            maxFiles={3}
          />
          
          {/* Pulsante microfono */}
          <Tooltip title={isRecording ? "Registrando..." : "Registra messaggio vocale"}>
            <span style={{ display: 'inline-flex' }}>
              <IconButton 
                onClick={startRecording}
                disabled={isRecording}
                sx={{ 
                  bgcolor: isRecording ? 'error.main' : 'grey.300',
                  color: isRecording ? 'white' : 'grey.600',
                  '&:hover': { bgcolor: isRecording ? 'error.dark' : 'grey.400' },
                  borderRadius: 2,
                  width: 45,
                  height: 45
                }}
              >
                {isRecording ? <StopIcon /> : <MicIcon />}
              </IconButton>
            </span>
          </Tooltip>
          
          {/* Pulsante invio */}
          <span style={{ display: 'inline-flex' }}>
            <IconButton 
              color="primary" 
              onClick={send} 
              disabled={loading || !input.trim()}
              sx={{ 
                bgcolor: loading || !input.trim() ? 'grey.300' : 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
                borderRadius: 2,
                width: 45,
                height: 45
              }}
            >
              <SendIcon />
            </IconButton>
          </span>
        </Stack>
        
        {/* Indicatori di stato */}
        {(isRecording || playingMessageIndex !== null) && (
          <Box sx={{ mt: 1, px: 1 }}>
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

      {/* Barra di feedback globale */}
      <Paper elevation={1} sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: '#f5f5f5' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="text.secondary">
            Come valuti questa conversazione?
          </Typography>
          
          <Stack direction="row" spacing={0.5} alignItems="center">
            {/* Copia conversazione */}
            <Box 
              component="button" 
              onClick={() => {
                const allMessages = messages.map(m => `${m.role === 'user' ? 'Tu' : 'Counselorbot'}: ${m.content}`).join('\n\n')
                copyMessage(allMessages, -1)
              }}
              sx={{ 
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '12px',
                color: copiedMessage === -1 ? '#4caf50' : '#666',
                bgcolor: copiedMessage === -1 ? '#e8f5e8' : 'white',
                '&:hover': { bgcolor: copiedMessage === -1 ? '#e8f5e8' : '#f0f0f0' }
              }}
              title="Copia tutta la conversazione"
            >
              {copiedMessage === -1 ? <SmallCheckIcon size={14} /> : <CopyIcon size={14} />}
              Copia
            </Box>

            {/* Scarica conversazione */}
            <Box 
              component="button" 
              onClick={() => {
                const allMessages = messages.map(m => `${m.role === 'user' ? 'Tu' : 'Counselorbot'}: ${m.content}`).join('\n\n')
                downloadMessage(allMessages)
              }}
              sx={{ 
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '12px',
                color: '#666',
                bgcolor: 'white',
                '&:hover': { bgcolor: '#f0f0f0' }
              }}
              title="Scarica conversazione completa"
            >
              <SmallDownloadIcon size={14} />
              Scarica
            </Box>

            {/* Like conversazione */}
            <Box 
              component="button" 
              onClick={() => giveFeedback(-1, 'like')}
              sx={{ 
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '12px',
                color: feedback[-1] === 'like' ? '#4caf50' : '#666',
                bgcolor: feedback[-1] === 'like' ? '#e8f5e8' : 'white',
                '&:hover': { bgcolor: feedback[-1] === 'like' ? '#e8f5e8' : '#f0f0f0' }
              }}
              title="Mi è piaciuta questa conversazione"
            >
              <LikeIcon size={14} />
              Mi piace
            </Box>

            {/* Dislike conversazione */}
            <Box 
              component="button" 
              onClick={() => giveFeedback(-1, 'dislike')}
              sx={{ 
                background: 'none',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: '12px',
                color: feedback[-1] === 'dislike' ? '#f44336' : '#666',
                bgcolor: feedback[-1] === 'dislike' ? '#ffebee' : 'white',
                '&:hover': { bgcolor: feedback[-1] === 'dislike' ? '#ffebee' : '#f0f0f0' }
              }}
              title="Non mi è piaciuta questa conversazione"
            >
              <DislikeIcon size={14} />
              Non mi piace
            </Box>
          </Stack>
        </Stack>
      </Paper>
      
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
            content: 'Ciao! Sono Counselorbot, il tuo compagno di apprendimento!\n\nHo visto che hai completato il QSA - che esperienza interessante! \n\nPer iniziare, mi piacerebbe conoscere la tua impressione generale: cosa hai pensato durante la compilazione del questionario? C\'è qualcosa che ti ha colpito o sorpreso nei risultati?', 
            ts: Date.now()
          }]);
          setCurrentConversationId(null);
          setSidebarOpen(false);
        }}
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
    </Container>
  );
};

// App wrapper con AuthProvider
export default function App() {
  // Routing semplice basato sull'URL
  if (window.location.pathname === '/admin') {
    return <AdminPanel />
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
