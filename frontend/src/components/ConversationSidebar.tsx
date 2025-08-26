/**
 * ConversationSidebar component - ChatGPT-style conversation list
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  IconButton,
  Button,
  TextField,
  Menu,
  MenuItem,
  Alert,
  Tooltip,
  Chip,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Sync as SyncIcon,
  Close as CloseIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
import { apiService, ConversationData } from '../apiService';
import CryptoUnlockDialog from './CryptoUnlockDialog';
import { useAuth } from '../contexts/AuthContext';

interface ConversationSidebarProps {
  open: boolean;
  onClose: () => void;
  currentConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  drawerWidth?: number;
}

interface DecryptedConversation {
  id: string;
  title_encrypted: string;
  title_hash?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  device_id?: string;
  title_decrypted: string;
  decryption_error?: boolean;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  open,
  onClose,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  drawerWidth = 280,
}) => {
  const theme = useTheme();
  const [conversations, setConversations] = useState<DecryptedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const { crypto: userCrypto, needsCryptoReauth } = useAuth();

  // Carica conversazioni
  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Caricamento conversazioni...');
      console.log('🔑 UserCrypto disponibile:', !!userCrypto);
      console.log('🔐 UserCrypto inizializzato:', userCrypto?.isKeyInitialized());
      
      const response = await apiService.getConversations();
      console.log('📥 Risposta API conversazioni:', response);
      
      if (response.success && response.data) {
        // Decripta i titoli delle conversazioni
        const decryptedConversations = await Promise.all(
          response.data.map(async (conv: ConversationData): Promise<DecryptedConversation> => {
            try {
              if (userCrypto?.isKeyInitialized()) {
                const decryptedTitle = await userCrypto.decryptMessage(conv.title_encrypted);
                return {
                  ...conv,
                  title_decrypted: decryptedTitle,
                  decryption_error: false,
                };
              } else {
                // Nessuna chiave crypto disponibile - mostra un fallback user-friendly
                const fallbackTitle = `Conversazione ${conv.id.slice(-8)} (${conv.message_count} messaggi)`;
                return {
                  ...conv,
                  title_decrypted: fallbackTitle,
                  decryption_error: false, // Non è un errore, è solo che non abbiamo la chiave
                };
              }
            } catch (error) {
              console.warn(`Failed to decrypt title for conversation ${conv.id}:`, error);
              // Solo qui è un vero errore di decriptazione
              return {
                ...conv,
                title_decrypted: `Conversazione ${conv.id.slice(-8)}`,
                decryption_error: true,
              };
            }
          })
        );
        
        setConversations(decryptedConversations);
        setError('');
        console.log('✅ Conversazioni caricate e decrittate:', decryptedConversations.length);
      } else {
        console.warn('❌ Errore nel caricamento conversazioni:', response.error);
        setError(response.error || 'Errore nel caricamento conversazioni');
      }
    } catch (error) {
      console.error('💥 Errore nel caricamento conversazioni:', error);
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carica conversazioni all'apertura
  useEffect(() => {
    if (open) {
      loadConversations();
    }
  }, [open, loadConversations]);

  // Filtra conversazioni per ricerca
  const filteredConversations = conversations.filter(conv =>
    conv.title_decrypted.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Gestione menu contestuale
  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, conversationId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedConvId(conversationId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedConvId(null);
  };

  // Inizia modifica titolo
  const startEditing = (conversation: DecryptedConversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title_decrypted);
    handleMenuClose();
  };

  // Salva titolo modificato
  const saveTitle = async () => {
    if (!editingId || !editTitle.trim()) return;
    
    if (!userCrypto?.isKeyInitialized()) {
      setError('Crittografia non disponibile. Effettua nuovamente il login.');
      return;
    }

    try {
      const encryptedTitle = await userCrypto.encryptMessage(editTitle.trim());
      const response = await apiService.updateConversationTitle(editingId, encryptedTitle);
      
      if (response.success) {
        // Aggiorna lista locale
        setConversations(prev =>
          prev.map(conv =>
            conv.id === editingId
              ? { ...conv, title_decrypted: editTitle.trim(), title_encrypted: encryptedTitle }
              : conv
          )
        );
        setEditingId(null);
        setEditTitle('');
      } else {
        setError(response.error || 'Errore nell\'aggiornamento titolo');
      }
    } catch (error) {
      setError('Errore nella crittografia del titolo');
    }
  };

  // Annulla modifica
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // Elimina conversazione
  const deleteConversation = async () => {
    if (!selectedConvId) return;

    try {
      const response = await apiService.deleteConversation(selectedConvId);
      
      if (response.success) {
        setConversations(prev => prev.filter(conv => conv.id !== selectedConvId));
        
        // Se è la conversazione corrente, deseleziona
        if (selectedConvId === currentConversationId) {
          onNewConversation();
        }
      } else {
        setError(response.error || 'Errore nell\'eliminazione');
      }
    } catch (error) {
      setError('Errore di connessione');
    } finally {
      handleMenuClose();
    }
  };

  // Sincronizzazione manuale
  const handleSync = async () => {
    setSyncing(true);
    await loadConversations();
    setSyncing(false);
  };

  // Nuova conversazione
  const handleNewConversation = () => {
    onNewConversation();
    onClose(); // Chiudi sidebar su mobile
  };

  // Seleziona conversazione
  const handleConversationSelect = (conversationId: string) => {
    onConversationSelect(conversationId);
    onClose(); // Chiudi sidebar su mobile
  };

  // Gestione Enter per salvataggio titolo
  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      saveTitle();
    } else if (event.key === 'Escape') {
      cancelEdit();
    }
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChatIcon />
            Conversazioni
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Sincronizza">
              <IconButton onClick={handleSync} disabled={syncing} size="small">
                <SyncIcon sx={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Nuova conversazione */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleNewConversation}
          sx={{ mb: 2 }}
        >
          Nuova Chat
        </Button>

        {/* Ricerca */}
        <TextField
          fullWidth
          size="small"
          placeholder="Cerca conversazioni..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
        />
      </Box>

      {/* Errori */}
      {error && (
        <Alert severity="error" sx={{ m: 1 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Avviso crypto re-auth */}
      {needsCryptoReauth && conversations.length > 0 && (
        <Alert 
          severity="warning" 
          sx={{ m: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => setUnlockOpen(true)}>
              Sblocca
            </Button>
          }
        >
          Conversazioni crittografate. Sblocca per decrittare i titoli.
        </Alert>
      )}

      {/* Lista conversazioni */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : filteredConversations.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            {searchTerm ? 'Nessuna conversazione trovata' : 'Nessuna conversazione ancora'}
          </Box>
        ) : (
          <List dense>
            {filteredConversations.map((conversation) => (
              <ListItem key={conversation.id} disablePadding>
                <ListItemButton
                  selected={conversation.id === currentConversationId}
                  onClick={() => handleConversationSelect(conversation.id)}
                  sx={{
                    borderRadius: 1,
                    mx: 1,
                    mb: 0.5,
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.15),
                      },
                    },
                  }}
                >
                  {editingId === conversation.id ? (
                    <TextField
                      fullWidth
                      size="small"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={handleKeyPress}
                      onBlur={saveTitle}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {/* Icona lucchetto solo se serve re-auth crypto e non è un errore di decriptazione */}
                            {needsCryptoReauth && !conversation.decryption_error && (
                              <Box component="span" sx={{ display:'inline-flex', alignItems:'center' }}>
                                <Box component="span" sx={{ width:14, height:14, mr:0.5, opacity:0.7 }}>
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                  </svg>
                                </Box>
                              </Box>
                            )}
                            <Typography variant="body2" noWrap>{conversation.title_decrypted}</Typography>
                            {/* Chip errore solo per veri errori di decriptazione */}
                            {conversation.decryption_error && (
                              <Chip
                                label="Errore"
                                size="small"
                                color="warning"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {conversation.message_count} messaggi • {new Date(conversation.updated_at).toLocaleDateString()}
                          </Typography>
                        }
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, conversation.id)}
                        sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Footer con info */}
      <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {conversations.length} conversazioni • Crittografate
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <Drawer
        anchor="left"
        open={open}
        onClose={onClose}
        variant="temporary"
        sx={{
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Menu contestuale */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => {
          const conv = conversations.find(c => c.id === selectedConvId);
          if (conv) startEditing(conv);
        }}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Rinomina
        </MenuItem>
        <MenuItem onClick={deleteConversation} sx={{ color: 'error.main' }}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Elimina
        </MenuItem>
      </Menu>

      {/* Stile per animazione sincronizzazione */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
  <CryptoUnlockDialog open={unlockOpen} onClose={() => setUnlockOpen(false)} onUnlocked={loadConversations} />
    </>
  );
};
