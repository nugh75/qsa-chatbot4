/**
 * Multi-Device Synchronization Manager
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Computer as ComputerIcon,
  Phone as PhoneIcon,
  Tablet as TabletIcon,
  Sync as SyncIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CloudSync as CloudSyncIcon,
} from '@mui/icons-material';
import { apiService } from '../apiService';
import { DeviceManager } from '../crypto';

interface Device {
  id: string;
  device_name: string;
  device_fingerprint: string;
  last_sync: string;
  last_ip?: string;
  user_agent?: string;
  is_active: boolean;
  created_at: string;
}

interface DeviceManagerProps {
  open: boolean;
  onClose: () => void;
}

export const DeviceManagerComponent: React.FC<DeviceManagerProps> = ({ open, onClose }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');

  // Carica dispositivi
  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUserDevices();
      
      if (response.success && response.data) {
        const deviceList = (response.data as any).devices || response.data || [];
        setDevices(deviceList);
        setError('');
      } else {
        setError(response.error || 'Errore nel caricamento dispositivi');
      }
    } catch (error) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  // Sincronizzazione forzata
  const handleForceSync = async () => {
    setSyncing(true);
    try {
      // Registra dispositivo corrente se non presente
      const deviceId = DeviceManager.generateDeviceId();
      const deviceFingerprint = await DeviceManager.generateDeviceFingerprint();
      
      await apiService.registerDevice({
        device_id: deviceId,
        device_name: DeviceManager.getDeviceName(),
        device_fingerprint: deviceFingerprint
      });
      
      // Ricarica lista
      await loadDevices();
    } catch (error) {
      setError('Errore durante la sincronizzazione');
    } finally {
      setSyncing(false);
    }
  };

  // Conferma eliminazione dispositivo
  const confirmDeleteDevice = (device: Device) => {
    setDeviceToDelete(device);
    setDeleteDialogOpen(true);
  };

  // Elimina dispositivo
  const deleteDevice = async () => {
    if (!deviceToDelete) return;

    try {
      // TODO: Implementare endpoint per eliminazione dispositivo
      // const response = await apiService.deleteDevice(deviceToDelete.id);
      
      // Per ora rimuovi dalla lista locale
      setDevices(prev => prev.filter(d => d.id !== deviceToDelete.id));
      setDeleteDialogOpen(false);
      setDeviceToDelete(null);
    } catch (error) {
      setError('Errore nell\'eliminazione dispositivo');
    }
  };

  // Ottieni icona dispositivo
  const getDeviceIcon = (deviceName: string, userAgent?: string) => {
    const name = deviceName.toLowerCase();
    const agent = userAgent?.toLowerCase() || '';
    
    if (name.includes('phone') || agent.includes('mobile')) {
      return <PhoneIcon />;
    } else if (name.includes('tablet') || name.includes('ipad')) {
      return <TabletIcon />;
    } else {
      return <ComputerIcon />;
    }
  };

  // Determina se è il dispositivo corrente
  const isCurrentDevice = (device: Device) => {
    return device.id === currentDeviceId;
  };

  // Inizializzazione
  useEffect(() => {
    if (open) {
      const currentId = DeviceManager.generateDeviceId();
      setCurrentDeviceId(currentId);
      loadDevices();
    }
  }, [open]);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Gestione Dispositivi</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Aggiorna lista">
                <IconButton onClick={loadDevices} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Sincronizzazione forzata">
                <IconButton onClick={handleForceSync} disabled={syncing}>
                  <SyncIcon sx={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Le tue conversazioni sono sincronizzate automaticamente tra tutti i dispositivi.
            Puoi gestire l'accesso ai tuoi dati da qui.
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : devices.length === 0 ? (
            <Card sx={{ textAlign: 'center', p: 3 }}>
              <CloudSyncIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Nessun dispositivo registrato
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accedi al tuo account da altri dispositivi per vederli qui
              </Typography>
            </Card>
          ) : (
            <List>
              {devices.map((device) => (
                <ListItem
                  key={device.id}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    mb: 1,
                    backgroundColor: isCurrentDevice(device) ? 'action.selected' : 'background.paper',
                  }}
                >
                  <ListItemIcon>
                    {getDeviceIcon(device.device_name, device.user_agent)}
                  </ListItemIcon>
                  
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1">
                          {device.device_name}
                        </Typography>
                        {isCurrentDevice(device) && (
                          <Chip label="Questo dispositivo" size="small" color="primary" />
                        )}
                        {!device.is_active && (
                          <Chip label="Inattivo" size="small" color="warning" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Ultima sincronizzazione: {new Date(device.last_sync).toLocaleString()}
                        </Typography>
                        {device.last_ip && (
                          <Typography variant="caption" color="text.secondary">
                            IP: {device.last_ip}
                          </Typography>
                        )}
                        <Typography variant="caption" display="block" color="text.secondary">
                          Registrato: {new Date(device.created_at).toLocaleDateString()}
                        </Typography>
                      </Box>
                    }
                  />

                  {!isCurrentDevice(device) && (
                    <IconButton
                      onClick={() => confirmDeleteDevice(device)}
                      color="error"
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </ListItem>
              ))}
            </List>
          )}

          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Sicurezza:</strong> I tuoi messaggi sono crittografati end-to-end.
              Solo i dispositivi autenticati con la tua password possono decriptarli.
            </Typography>
          </Alert>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>
            Chiudi
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Rimuovi Dispositivo</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler rimuovere il dispositivo "{deviceToDelete?.device_name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Il dispositivo non potrà più accedere alle conversazioni finché non effettui di nuovo l'accesso.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Annulla
          </Button>
          <Button onClick={deleteDevice} color="error" variant="contained">
            Rimuovi
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stile animazione */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );
};

/**
 * Hook per gestione automatica della sincronizzazione
 */
export const useDeviceSync = () => {
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  // Registra dispositivo automaticamente
  const registerCurrentDevice = async () => {
    try {
      const deviceId = DeviceManager.generateDeviceId();
      const deviceFingerprint = await DeviceManager.generateDeviceFingerprint();
      
      const response = await apiService.registerDevice({
        device_id: deviceId,
        device_name: DeviceManager.getDeviceName(),
        device_fingerprint: deviceFingerprint
      });

      if (response.success) {
        setLastSyncTime(new Date());
        setSyncStatus('idle');
      } else {
        setSyncStatus('error');
      }
    } catch (error) {
      setSyncStatus('error');
    }
  };

  // Sincronizzazione periodica (ogni 5 minuti)
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) { // Solo se online
        registerCurrentDevice();
      }
    }, 5 * 60 * 1000); // 5 minuti

    // Sincronizzazione iniziale
    registerCurrentDevice();

    return () => clearInterval(interval);
  }, []);

  return {
    lastSyncTime,
    syncStatus,
    forceSync: registerCurrentDevice,
  };
};
