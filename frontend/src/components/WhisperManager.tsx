import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Mic as MicIcon,
} from '@mui/icons-material';

interface WhisperModel {
  name: string;
  size: string;
  accuracy: string;
  speed: string;
  memory: string;
  disk_space: string;
  downloaded: boolean;
  download_progress?: number;
}

interface WhisperManagerProps {
  apiService: any;
}

const WhisperManager: React.FC<WhisperManagerProps> = ({ apiService }) => {
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; model: string; action: 'download' | 'delete' }>({
    open: false,
    model: '',
    action: 'download'
  });

  // Carica la lista dei modelli
  const loadModels = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.get('/whisper/models');
      setModels(response.data.models || []);
    } catch (err) {
      setError('Errore nel caricamento dei modelli Whisper');
      console.error('Error loading Whisper models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // Download di un modello
  const downloadModel = async (modelName: string) => {
    setDownloading(modelName);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiService.post(`/whisper/models/${modelName}/download`);
      
      if (response.data.success) {
        setSuccess(`Modello ${modelName} scaricato con successo!`);
        await loadModels(); // Ricarica la lista
      } else {
        setError(`Errore nel download del modello ${modelName}`);
      }
    } catch (err) {
      setError(`Errore nel download del modello ${modelName}: ${err}`);
      console.error('Error downloading model:', err);
    } finally {
      setDownloading(null);
    }
  };

  // Eliminazione di un modello
  const deleteModel = async (modelName: string) => {
    setDeleting(modelName);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiService.delete(`/whisper/models/${modelName}`);
      
      if (response.data.success) {
        setSuccess(`Modello ${modelName} eliminato con successo!`);
        await loadModels(); // Ricarica la lista
      } else {
        setError(`Errore nell'eliminazione del modello ${modelName}`);
      }
    } catch (err) {
      setError(`Errore nell'eliminazione del modello ${modelName}: ${err}`);
      console.error('Error deleting model:', err);
    } finally {
      setDeleting(null);
    }
  };

  // Conferma azione
  const handleConfirmAction = () => {
    const { model, action } = confirmDialog;
    setConfirmDialog({ open: false, model: '', action: 'download' });

    if (action === 'download') {
      downloadModel(model);
    } else if (action === 'delete') {
      deleteModel(model);
    }
  };

  // Chip per l'accuratezza
  const getAccuracyChip = (accuracy: string) => {
    const color = 
      accuracy === 'Highest' ? 'success' :
      accuracy === 'High' ? 'info' :
      accuracy === 'Medium' ? 'warning' :
      'error';
    
    return <Chip label={accuracy} color={color} size="small" />;
  };

  // Chip per la velocità
  const getSpeedChip = (speed: string) => {
    const speedNum = parseInt(speed.replace('x', ''));
    const color = 
      speedNum >= 7 ? 'success' :
      speedNum >= 4 ? 'info' :
      speedNum >= 2 ? 'warning' :
      'error';
    
    return <Chip label={speed} color={color} size="small" />;
  };

  return (
    <Box>
      <Card sx={{ borderRadius: 4 }}>
        <CardHeader 
          title={
            <Box display="flex" alignItems="center" gap={1}>
              <MicIcon />
              <Typography variant="h6">Gestione Modelli Whisper</Typography>
            </Box>
          }
          action={
            <Button
              variant="outlined"
              onClick={loadModels}
              disabled={loading}
              sx={{ borderRadius: 3 }}
            >
              Aggiorna
            </Button>
          }
        />
        <CardContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
              {success}
            </Alert>
          )}

          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Modello</strong></TableCell>
                    <TableCell><strong>Dimensione</strong></TableCell>
                    <TableCell><strong>Accuratezza</strong></TableCell>
                    <TableCell><strong>Velocità</strong></TableCell>
                    <TableCell><strong>Memoria</strong></TableCell>
                    <TableCell><strong>Spazio Disco</strong></TableCell>
                    <TableCell><strong>Stato</strong></TableCell>
                    <TableCell><strong>Azioni</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {models.map((model) => (
                    <TableRow key={model.name}>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {model.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{model.size}</TableCell>
                      <TableCell>{getAccuracyChip(model.accuracy)}</TableCell>
                      <TableCell>{getSpeedChip(model.speed)}</TableCell>
                      <TableCell>{model.memory}</TableCell>
                      <TableCell>{model.disk_space}</TableCell>
                      <TableCell>
                        {model.downloaded ? (
                          <Chip 
                            icon={<CheckCircleIcon />}
                            label="Scaricato" 
                            color="success" 
                            size="small" 
                          />
                        ) : (
                          <Chip 
                            icon={<WarningIcon />}
                            label="Non scaricato" 
                            color="warning" 
                            size="small" 
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1}>
                          {!model.downloaded ? (
                            <IconButton
                              color="primary"
                              onClick={() => setConfirmDialog({ 
                                open: true, 
                                model: model.name, 
                                action: 'download' 
                              })}
                              disabled={downloading === model.name}
                              title="Scarica modello"
                            >
                              {downloading === model.name ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DownloadIcon />
                              )}
                            </IconButton>
                          ) : (
                            <IconButton
                              color="error"
                              onClick={() => setConfirmDialog({ 
                                open: true, 
                                model: model.name, 
                                action: 'delete' 
                              })}
                              disabled={deleting === model.name}
                              title="Elimina modello"
                            >
                              {deleting === model.name ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DeleteIcon />
                              )}
                            </IconButton>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Progress bar per download */}
          {downloading && (
            <Box mt={2}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Download in corso del modello {downloading}...
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Dialog di conferma */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, model: '', action: 'download' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {confirmDialog.action === 'download' ? 'Conferma Download' : 'Conferma Eliminazione'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {confirmDialog.action === 'download' 
              ? `Sei sicuro di voler scaricare il modello ${confirmDialog.model}?`
              : `Sei sicuro di voler eliminare il modello ${confirmDialog.model}? Questa azione non può essere annullata.`
            }
          </Typography>
          {confirmDialog.action === 'download' && (
            <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>
              Il download potrebbe richiedere diversi minuti a seconda della dimensione del modello e della velocità di connessione.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setConfirmDialog({ open: false, model: '', action: 'download' })}
            sx={{ borderRadius: 3 }}
          >
            Annulla
          </Button>
          <Button 
            onClick={handleConfirmAction}
            color={confirmDialog.action === 'download' ? 'primary' : 'error'}
            variant="contained"
            sx={{ borderRadius: 3 }}
          >
            {confirmDialog.action === 'download' ? 'Scarica' : 'Elimina'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WhisperManager;
