import React, { useState, useEffect, useCallback } from 'react';
import { ApiService, ConversationSummary } from '../types/api';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  TextField,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Divider,
  Chip,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  CloudDownload as ExportIcon,
  CloudUpload as ImportIcon,
  GetApp as DownloadIcon,
  Publish as UploadIcon,
  Description as FileIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Schedule as ProgressIcon,
  Folder as FolderIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon
} from '@mui/icons-material';

// Utility per formattazione file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Utility per formattazione tempo
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMinutes < 1) return 'ora';
  if (diffMinutes < 60) return `${diffMinutes} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  return date.toLocaleDateString('it-IT');
}

interface ExportOptions {
  format: 'json' | 'csv' | 'txt' | 'zip';
  conversation_ids?: string[];
  include_metadata: boolean;
  decrypt_content: boolean;
  date_from?: string;
  date_to?: string;
  compression: boolean;
}

interface ImportOptions {
  format: 'json' | 'csv' | 'txt';
  duplicate_handling: 'skip' | 'overwrite' | 'create_new';
  encrypt_content: boolean;
  preserve_timestamps: boolean;
  create_backup: boolean;
}

interface ImportProgress {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_conversations: number;
  processed_conversations: number;
  total_messages: number;
  processed_messages: number;
  errors: string[];
  start_time: string;
  completion_time?: string;
}

interface SupportedFormats {
  export_formats: Record<string, {
    name: string;
    description: string;
    supports_encryption: boolean;
    supports_metadata: boolean;
  }>;
  import_formats: string[];
  duplicate_handling: string[];
}

interface ImportExportManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiService: ApiService;
  conversations?: ConversationSummary[];
}

const ImportExportManager: React.FC<ImportExportManagerProps> = ({
  isOpen,
  onClose,
  apiService,
  conversations = []
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Export state
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    include_metadata: true,
    decrypt_content: false,
    compression: false
  });
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());
  const [exportProgress, setExportProgress] = useState(false);

  // Import state
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    format: 'json',
    duplicate_handling: 'skip',
    encrypt_content: true,
    preserve_timestamps: true,
    create_backup: true
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importTaskId, setImportTaskId] = useState<string | null>(null);

  // General state
  const [supportedFormats, setSupportedFormats] = useState<SupportedFormats | null>(null);

  // Carica formati supportati
  useEffect(() => {
    if (isOpen) {
      loadSupportedFormats();
    }
  }, [isOpen]);

  // Polling per import progress
  useEffect(() => {
    let interval: number | undefined;
    
    if (importTaskId && importProgress?.status === 'processing') {
      interval = setInterval(async () => {
        try {
          const response = await apiService.get(`/api/import-export/import/progress/${importTaskId}`);
          setImportProgress(response.data);
          
          if (response.data.status === 'completed' || response.data.status === 'failed') {
            setImportTaskId(null);
          }
        } catch (err) {
          console.error('Error fetching import progress:', err);
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [importTaskId, importProgress?.status, apiService]);

  const loadSupportedFormats = async () => {
    try {
      const response = await apiService.get('/api/import-export/formats');
      setSupportedFormats(response.data);
    } catch (err) {
      setError('Errore nel caricamento formati supportati');
    }
  };

  // Gestione export
  const handleExport = async () => {
    setExportProgress(true);
    setError(null);

    try {
      const exportData: ExportOptions = {
        ...exportOptions,
        conversation_ids: selectedConversations.size > 0 ? Array.from(selectedConversations) : undefined
      };

      const response = await apiService.post('/api/import-export/export', exportData, {
        responseType: 'blob'
      });

      // Scarica file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const fileExtension = exportOptions.format === 'zip' ? 'zip' : 
                           exportOptions.format === 'csv' ? 'csv' :
                           exportOptions.format === 'txt' ? 'txt' : 'json';
      
      link.setAttribute('download', `conversations_export.${fileExtension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      setError('Errore durante l\'export');
      console.error('Export error:', err);
    } finally {
      setExportProgress(false);
    }
  };

  // Gestione import
  const handleImport = async () => {
    if (!importFile) {
      setError('Seleziona un file da importare');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('options', JSON.stringify(importOptions));

      const response = await apiService.post('/api/import-export/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setImportTaskId(response.data.task_id);
      setImportProgress({
        task_id: response.data.task_id,
        status: 'pending',
        total_conversations: 0,
        processed_conversations: 0,
        total_messages: 0,
        processed_messages: 0,
        errors: [],
        start_time: new Date().toISOString()
      });

    } catch (err) {
      setError('Errore durante l\'avvio import');
      console.error('Import error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      
      // Auto-detect format from file extension
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'json') {
        setImportOptions(prev => ({ ...prev, format: 'json' }));
      } else if (extension === 'csv') {
        setImportOptions(prev => ({ ...prev, format: 'csv' }));
      } else if (extension === 'txt') {
        setImportOptions(prev => ({ ...prev, format: 'txt' }));
      }
    }
  };

  // Export Tab Component
  const ExportTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Esporta Conversazioni
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardHeader title="Opzioni Export" />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={3}>
            {/* Formato */}
            <FormControl fullWidth>
              <InputLabel>Formato</InputLabel>
              <Select
                value={exportOptions.format}
                onChange={(e) => setExportOptions(prev => ({ 
                  ...prev, 
                  format: e.target.value as any 
                }))}
                label="Formato"
              >
                {supportedFormats?.export_formats ? Object.entries(supportedFormats.export_formats).map(([key, format]) => (
                  <MenuItem key={key} value={key}>
                    <Box>
                      <Typography variant="body1">{format.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {format.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                )) : (
                  <MenuItem value="json">
                    <Typography>Caricamento formati...</Typography>
                  </MenuItem>
                )}
              </Select>
            </FormControl>

            {/* Conversazioni da esportare */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Conversazioni da esportare
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedConversations.size === 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedConversations(new Set());
                      }
                    }}
                  />
                }
                label="Tutte le conversazioni"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedConversations.size > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedConversations(new Set(conversations.map(c => c.id)));
                      } else {
                        setSelectedConversations(new Set());
                      }
                    }}
                  />
                }
                label={`Conversazioni selezionate (${selectedConversations.size})`}
              />
            </Box>

            {/* Filtri data */}
            <Box display="flex" gap={2}>
              <TextField
                type="date"
                label="Data inizio"
                size="small"
                value={exportOptions.date_from || ''}
                onChange={(e) => setExportOptions(prev => ({ 
                  ...prev, 
                  date_from: e.target.value || undefined 
                }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date"
                label="Data fine"
                size="small"
                value={exportOptions.date_to || ''}
                onChange={(e) => setExportOptions(prev => ({ 
                  ...prev, 
                  date_to: e.target.value || undefined 
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Box>

            {/* Opzioni contenuto */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Opzioni Contenuto
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.include_metadata}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      include_metadata: e.target.checked 
                    }))}
                  />
                }
                label="Includi metadata (date, descrizioni)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.decrypt_content}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      decrypt_content: e.target.checked 
                    }))}
                  />
                }
                label="Decritta contenuto (export in chiaro)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.compression}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      compression: e.target.checked 
                    }))}
                  />
                }
                label="Comprimi file"
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Bottone export */}
      <Box display="flex" justifyContent="center">
        <Button
          variant="contained"
          size="large"
          startIcon={exportProgress ? <CircularProgress size={20} /> : <DownloadIcon />}
          onClick={handleExport}
          disabled={exportProgress}
        >
          {exportProgress ? 'Esportando...' : 'Esporta Conversazioni'}
        </Button>
      </Box>
    </Box>
  );

  // Import Tab Component
  const ImportTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Importa Conversazioni
      </Typography>

      {/* Selezione file */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Seleziona File" />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={2}>
            <input
              type="file"
              accept=".json,.csv,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="import-file-input"
            />
            <label htmlFor="import-file-input">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadIcon />}
                fullWidth
              >
                Seleziona File da Importare
              </Button>
            </label>
            
            {importFile && (
              <Paper elevation={1} sx={{ p: 2 }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <FileIcon />
                  <Box flexGrow={1}>
                    <Typography variant="body2">{importFile.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(importFile.size)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => setImportFile(null)}
                  >
                    <CloseIcon />
                  </IconButton>
                </Box>
              </Paper>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Opzioni import */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Opzioni Import" />
        <CardContent>
          <Box display="flex" flexDirection="column" gap={3}>
            {/* Formato */}
            <FormControl fullWidth>
              <InputLabel>Formato File</InputLabel>
              <Select
                value={importOptions.format}
                onChange={(e) => setImportOptions(prev => ({ 
                  ...prev, 
                  format: e.target.value as any 
                }))}
                label="Formato File"
              >
                {supportedFormats?.import_formats ? supportedFormats.import_formats.map(format => (
                  <MenuItem key={format} value={format}>
                    {format.toUpperCase()}
                  </MenuItem>
                )) : (
                  <MenuItem value="json">
                    <Typography>Caricamento formati...</Typography>
                  </MenuItem>
                )}
              </Select>
            </FormControl>

            {/* Gestione duplicati */}
            <FormControl fullWidth>
              <InputLabel>Gestione Duplicati</InputLabel>
              <Select
                value={importOptions.duplicate_handling}
                onChange={(e) => setImportOptions(prev => ({ 
                  ...prev, 
                  duplicate_handling: e.target.value as any 
                }))}
                label="Gestione Duplicati"
              >
                <MenuItem value="skip">Salta duplicati</MenuItem>
                <MenuItem value="overwrite">Sovrascrivi duplicati</MenuItem>
                <MenuItem value="create_new">Crea nuovi</MenuItem>
              </Select>
            </FormControl>

            {/* Opzioni */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Opzioni Avanzate
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importOptions.encrypt_content}
                    onChange={(e) => setImportOptions(prev => ({ 
                      ...prev, 
                      encrypt_content: e.target.checked 
                    }))}
                  />
                }
                label="Critta contenuto importato"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importOptions.preserve_timestamps}
                    onChange={(e) => setImportOptions(prev => ({ 
                      ...prev, 
                      preserve_timestamps: e.target.checked 
                    }))}
                  />
                }
                label="Preserva timestamp originali"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importOptions.create_backup}
                    onChange={(e) => setImportOptions(prev => ({ 
                      ...prev, 
                      create_backup: e.target.checked 
                    }))}
                  />
                }
                label="Crea backup prima import"
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Progress import */}
      {importProgress && (
        <Card sx={{ mb: 3 }}>
          <CardHeader title="Progresso Import" />
          <CardContent>
            <Box display="flex" flexDirection="column" gap={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <Chip
                  label={importProgress.status}
                  color={
                    importProgress.status === 'completed' ? 'success' :
                    importProgress.status === 'failed' ? 'error' :
                    importProgress.status === 'processing' ? 'warning' : 'default'
                  }
                />
                {importProgress.status === 'processing' && <CircularProgress size={20} />}
              </Box>

              {importProgress.total_conversations > 0 && (
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Conversazioni: {importProgress.processed_conversations} / {importProgress.total_conversations}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(importProgress.processed_conversations / importProgress.total_conversations) * 100}
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="body2" gutterBottom>
                    Messaggi: {importProgress.processed_messages} / {importProgress.total_messages}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(importProgress.processed_messages / importProgress.total_messages) * 100}
                  />
                </Box>
              )}

              {importProgress.errors.length > 0 && (
                <Alert severity="warning">
                  {importProgress.errors.length} errori durante l'import
                </Alert>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Bottone import */}
      <Box display="flex" justifyContent="center">
        <Button
          variant="contained"
          size="large"
          startIcon={loading ? <CircularProgress size={20} /> : <ImportIcon />}
          onClick={handleImport}
          disabled={!importFile || loading || importProgress?.status === 'processing'}
        >
          {loading ? 'Avviando Import...' : 'Importa Conversazioni'}
        </Button>
      </Box>
    </Box>
  );

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '70vh' } }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <FolderIcon sx={{ mr: 2 }} />
          Import/Export Conversazioni
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Export" icon={<ExportIcon />} />
          <Tab label="Import" icon={<ImportIcon />} />
        </Tabs>

        {currentTab === 0 && <ExportTab />}
        {currentTab === 1 && <ImportTab />}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportExportManager;
