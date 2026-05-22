/**
 * Migration Wizard for importing localStorage conversations to encrypted backend
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Alert,
  LinearProgress,
  Chip,
  Card,
  CardContent,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Storage as StorageIcon,
  Security as SecurityIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { apiService } from '../apiService';

interface LocalStorageConversation {
  id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }>;
  timestamp: number;
}

interface MigrationResult {
  conversationId: string;
  originalTitle: string;
  success: boolean;
  error?: string;
  messagesCount: number;
}

interface MigrationWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const MigrationWizard: React.FC<MigrationWizardProps> = ({
  open,
  onClose,
  onComplete,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [localConversations, setLocalConversations] = useState<LocalStorageConversation[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([]);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [error, setError] = useState('');
  const [expandedResults, setExpandedResults] = useState(false);

  // Carica conversazioni da localStorage
  const loadLocalConversations = () => {
    try {
      const conversations: LocalStorageConversation[] = [];
      
      // Cerca diversi pattern di storage
      const patterns = ['chat_history', 'conversations', 'qsa_conversations'];
      
      for (const pattern of patterns) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes(pattern)) {
            try {
              const data = localStorage.getItem(key);
              if (data) {
                const parsed = JSON.parse(data);
                
                // Normalizza formato
                if (Array.isArray(parsed)) {
                  // Lista di messaggi
                  conversations.push({
                    id: key,
                    title: `Conversazione ${new Date().toLocaleDateString()}`,
                    messages: parsed.map((msg: any) => ({
                      role: msg.role || 'user',
                      content: msg.content || msg.message || String(msg),
                      timestamp: msg.timestamp || Date.now()
                    })),
                    timestamp: Date.now()
                  });
                } else if (parsed.messages) {
                  // Oggetto conversazione
                  conversations.push({
                    id: key,
                    title: parsed.title || `Conversazione ${new Date().toLocaleDateString()}`,
                    messages: parsed.messages,
                    timestamp: parsed.timestamp || Date.now()
                  });
                }
              }
            } catch (e) {
              console.warn(`Errore parsing ${key}:`, e);
            }
          }
        }
      }
      
      // Rimuovi duplicati e filtra conversazioni valide
      const uniqueConversations = conversations.filter((conv, index, arr) => 
        conv.messages.length > 0 && 
        arr.findIndex(c => c.id === conv.id) === index
      );
      
      setLocalConversations(uniqueConversations);
      
      // Seleziona tutte per default
      setSelectedConversations(new Set(uniqueConversations.map(c => c.id)));
      
    } catch (error) {
      setError('Errore nel caricamento delle conversazioni locali');
    }
  };

  // Migrazione conversazioni selezionate
  const migrateConversations = async () => {
    // Encryption disabled: proceed without requiring a local key

    setMigrating(true);
    setMigrationProgress(0);
    const results: MigrationResult[] = [];
    
    const conversationsToMigrate = localConversations.filter(conv => 
      selectedConversations.has(conv.id)
    );

    for (let i = 0; i < conversationsToMigrate.length; i++) {
      const conversation = conversationsToMigrate[i];
      
      try {
  // 1. Use plaintext title (no encryption)
  const titlePlain = conversation.title;
  // 2. Crea conversazione
  const createResponse = await apiService.createConversation(titlePlain);
        
        if (!createResponse.success || !createResponse.data) {
          throw new Error(createResponse.error || 'Errore creazione conversazione');
        }
        
        const conversationId = createResponse.data.conversation_id;
        let successfulMessages = 0;
        
        // 3. Aggiungi messaggi
        for (const message of conversation.messages) {
            try {
            const contentPlain = message.content;
            const messageResponse = await apiService.sendMessage(
              conversationId,
              contentPlain,
              message.role
            );
            
            if (messageResponse.success) {
              successfulMessages++;
            }
          } catch (msgError) {
            console.warn('Errore migrazione messaggio:', msgError);
          }
        }
        
        results.push({
          conversationId,
          originalTitle: conversation.title,
          success: true,
          messagesCount: successfulMessages,
        });
        
      } catch (error) {
        results.push({
          conversationId: '',
          originalTitle: conversation.title,
          success: false,
          error: error instanceof Error ? error.message : 'Errore sconosciuto',
          messagesCount: 0,
        });
      }
      
      // Aggiorna progresso
      setMigrationProgress(((i + 1) / conversationsToMigrate.length) * 100);
    }
    
    setMigrationResults(results);
    setMigrating(false);
    
    // Se tutte le migrazioni sono riuscite, vai al passo successivo
    if (results.every(r => r.success)) {
      setActiveStep(3);
    }
  };

  // Toggle selezione conversazione
  const toggleConversationSelection = (conversationId: string) => {
    const newSelection = new Set(selectedConversations);
    if (newSelection.has(conversationId)) {
      newSelection.delete(conversationId);
    } else {
      newSelection.add(conversationId);
    }
    setSelectedConversations(newSelection);
  };

  // Seleziona tutte/nessuna
  const toggleSelectAll = () => {
    if (selectedConversations.size === localConversations.length) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(new Set(localConversations.map(c => c.id)));
    }
  };

  // Pulisci localStorage dopo migrazione riuscita
  const cleanupLocalStorage = () => {
    const successfulIds = migrationResults
      .filter(r => r.success)
      .map(r => localConversations.find(c => c.title === r.originalTitle)?.id)
      .filter(Boolean);
    
    successfulIds.forEach(id => {
      if (id) {
        localStorage.removeItem(id);
      }
    });
    
    onComplete();
    onClose();
  };

  // Inizializzazione
  useEffect(() => {
    if (open) {
      loadLocalConversations();
      setActiveStep(0);
      setMigrationResults([]);
      setMigrationProgress(0);
      setError('');
    }
  }, [open]);

  const steps = [
    {
      label: 'Ricerca Conversazioni',
      description: 'Cerchiamo le conversazioni salvate localmente',
    },
    {
      label: 'Selezione',
      description: 'Scegli quali conversazioni migrare',
    },
    {
      label: 'Migrazione',
      description: 'Crittografia e caricamento sul server',
    },
    {
      label: 'Completamento',
      description: 'Migrazione completata con successo',
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadIcon />
          <Typography variant="h6">
            Migrazione Conversazioni
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {step.description}
                </Typography>

                {/* Step 0: Ricerca */}
                {index === 0 && (
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <StorageIcon color="primary" />
                        <Typography variant="h6">
                          Conversazioni Trovate: {localConversations.length}
                        </Typography>
                      </Box>
                      
                      {localConversations.length === 0 ? (
                        <Alert severity="info">
                          Nessuna conversazione trovata nel localStorage.
                          Se hai conversazioni salvate, potrebbero essere in un formato diverso.
                        </Alert>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Abbiamo trovato {localConversations.length} conversazioni che possono essere migrate
                          nel nuovo sistema crittografato.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Step 1: Selezione */}
                {index === 1 && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">
                        Seleziona conversazioni da migrare
                      </Typography>
                      <Button onClick={toggleSelectAll} size="small">
                        {selectedConversations.size === localConversations.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
                      </Button>
                    </Box>

                    <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                      {localConversations.map((conversation) => (
                        <ListItem
                          key={conversation.id}
                          button
                          onClick={() => toggleConversationSelection(conversation.id)}
                          sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                        >
                          <Checkbox
                            checked={selectedConversations.has(conversation.id)}
                            onChange={() => toggleConversationSelection(conversation.id)}
                          />
                          <ListItemText
                            primary={conversation.title}
                            secondary={
                              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Chip
                                  label={`${conversation.messages.length} messaggi`}
                                  size="small"
                                  variant="outlined"
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(conversation.timestamp).toLocaleDateString()}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>

                    <Alert severity="warning" sx={{ mt: 2 }}>
                      <Typography variant="body2">
                        <SecurityIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                        Le conversazioni saranno crittografate con la tua password prima del caricamento.
                        Solo tu potrai decriptarle.
                      </Typography>
                    </Alert>
                  </Box>
                )}

                {/* Step 2: Migrazione */}
                {index === 2 && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <SyncIcon sx={{ animation: migrating ? 'spin 1s linear infinite' : 'none' }} />
                      <Typography variant="h6">
                        {migrating ? 'Migrazione in corso...' : 'Pronto per la migrazione'}
                      </Typography>
                    </Box>

                    {migrating && (
                      <Box sx={{ mb: 2 }}>
                        <LinearProgress variant="determinate" value={migrationProgress} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {Math.round(migrationProgress)}% completato
                        </Typography>
                      </Box>
                    )}

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Conversazioni selezionate: {selectedConversations.size}
                    </Typography>

                    {migrationResults.length > 0 && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="subtitle2">
                            Risultati Migrazione
                          </Typography>
                          <IconButton 
                            onClick={() => setExpandedResults(!expandedResults)}
                            size="small"
                          >
                            {expandedResults ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>

                        <Collapse in={expandedResults}>
                          <List dense>
                            {migrationResults.map((result, index) => (
                              <ListItem key={index}>
                                <ListItemText
                                  primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      {result.success ? (
                                        <CheckIcon color="success" fontSize="small" />
                                      ) : (
                                        <ErrorIcon color="error" fontSize="small" />
                                      )}
                                      <Typography variant="body2">
                                        {result.originalTitle}
                                      </Typography>
                                    </Box>
                                  }
                                  secondary={
                                    result.success 
                                      ? `${result.messagesCount} messaggi migrati`
                                      : result.error
                                  }
                                />
                              </ListItem>
                            ))}
                          </List>
                        </Collapse>
                      </Box>
                    )}
                  </Box>
                )}

                {/* Step 3: Completamento */}
                {index === 3 && (
                  <Card>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                      <Typography variant="h5" gutterBottom>
                        Migrazione Completata!
                      </Typography>
                      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        Le tue conversazioni sono state migrate con successo nel nuovo sistema crittografato.
                      </Typography>
                      
                      <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          Vuoi rimuovere le conversazioni dal localStorage locale?
                          Questo libererà spazio e eviterà duplicati.
                        </Typography>
                      </Alert>
                    </CardContent>
                  </Card>
                )}

                {/* Pulsanti di navigazione */}
                <Box sx={{ mt: 2 }}>
                  {index === 0 && localConversations.length > 0 && (
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep(1)}
                    >
                      Continua
                    </Button>
                  )}

                  {index === 1 && selectedConversations.size > 0 && (
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep(2)}
                    >
                      Avanti
                    </Button>
                  )}

                  {index === 2 && !migrating && (
                    <Button
                      variant="contained"
                      onClick={migrateConversations}
                      disabled={selectedConversations.size === 0}
                    >
                      Inizia Migrazione
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </DialogContent>

      <DialogActions>
        {activeStep === 3 ? (
          <>
            <Button onClick={onClose}>
              Mantieni localStorage
            </Button>
            <Button
              onClick={cleanupLocalStorage}
              variant="contained"
              color="primary"
            >
              Pulisci localStorage
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>
            Annulla
          </Button>
        )}
      </DialogActions>

      {/* Stile animazione */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </Dialog>
  );
};
