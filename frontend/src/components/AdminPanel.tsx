import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
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
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Tabs,
  Tab,
  Avatar,
  LinearProgress,
  Tooltip,
  CircularProgress,
  Badge,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  FormControlLabel,
  Checkbox,
  Divider
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Devices as DevicesIcon,
  Sync as SyncIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Block as BlockIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  Computer as ComputerIcon,
  Phone as PhoneIcon,
  Tablet as TabletIcon,
  Storage as StorageIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon,
  AdminPanelSettings as AdminIcon,
  Description as DescriptionIcon,
  Save as SaveIcon,
  RestartAlt as RestartAltIcon
} from '@mui/icons-material';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

// Import servizi
import { apiService } from '../apiService';

interface AdminStats {
  total_users: number;
  active_users: number;
  total_devices: number;
  active_devices: number;
  total_conversations: number;
  total_messages: number;
  sync_operations_today: number;
  storage_usage_mb: number;
  avg_messages_per_user: number;
  avg_devices_per_user: number;
}

interface UserInfo {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  device_count: number;
  conversation_count: number;
  message_count: number;
}

interface DeviceInfo {
  id: string;
  user_id: string;
  device_name: string;
  device_type: string;
  fingerprint: string;
  last_sync: string;
  created_at: string;
  is_active: boolean;
  sync_count: number;
  user_email?: string;
  user_username?: string;
}

interface SyncActivity {
  id: string;
  user_id: string;
  device_id: string;
  operation_type: string;
  timestamp: string;
  status: string;
  details?: string;
  user_email?: string;
  device_name?: string;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State per dati
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [syncActivity, setSyncActivity] = useState<SyncActivity[]>([]);

  // State per filtri e paginazione
  const [userSearch, setUserSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());

  // State per dialoghi
  const [deviceActionDialog, setDeviceActionDialog] = useState(false);
  const [deviceDetailsDialog, setDeviceDetailsDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);

  // Prompt state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptMessage, setPromptMessage] = useState<string | null>(null);

  // Carica dati iniziali
  useEffect(() => {
    if (isOpen) {
      loadAdminData();
      loadPrompts();
    }
  }, [isOpen]);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsRes, usersRes, devicesRes, syncRes] = await Promise.all([
        apiService.get('/admin/stats'),
        apiService.get('/admin/users?limit=100'),
        apiService.get('/admin/devices?limit=200'),
        apiService.get('/admin/sync-activity?hours=24')
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data);
      setDevices(devicesRes.data);
      setSyncActivity(syncRes.data);

    } catch (err) {
      setError('Errore nel caricamento dati admin');
      console.error('Admin data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPrompts = async () => {
    setPromptLoading(true);
    setPromptMessage(null);
    try {
      const systemRes = await apiService.get('/admin/system-prompt');
      const summaryRes = await apiService.get('/admin/summary-prompt');
      if (systemRes?.data?.prompt) setSystemPrompt(systemRes.data.prompt);
      if (summaryRes?.data?.prompt) setSummaryPrompt(summaryRes.data.prompt);
    } catch (e) {
      setPromptMessage('Errore nel caricamento dei prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleSavePrompts = async () => {
    setPromptLoading(true);
    setPromptMessage(null);
    try {
      if (systemPrompt) await apiService.post('/admin/system-prompt', { prompt: systemPrompt });
      if (summaryPrompt) await apiService.post('/admin/summary-prompt', { prompt: summaryPrompt });
      setPromptMessage('Prompt salvati');
    } catch (e) {
      setPromptMessage('Errore nel salvataggio');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleResetSummaryPrompt = async () => {
    setPromptLoading(true);
    setPromptMessage(null);
    try {
      const res = await apiService.post('/admin/summary-prompt/reset');
      if (res?.data?.prompt) setSummaryPrompt(res.data.prompt);
      setPromptMessage('Prompt riassunto resettato');
    } catch (e) {
      setPromptMessage('Errore reset prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const PromptsTab = () => (
    <Box>
      <Box display="flex" alignItems="center" mb={2} gap={1}>
        <DescriptionIcon />
        <Typography variant="h6">Gestione Prompt</Typography>
      </Box>
      {promptLoading && <LinearProgress sx={{ mb:2 }} />}
      {promptMessage && (
        <Alert severity={promptMessage.includes('Errore') ? 'error':'success'} sx={{ mb:2 }}>
          {promptMessage}
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="System Prompt" subheader="Istruzioni di base per il modello" />
            <CardContent>
              <TextField
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                multiline
                minRows={12}
                fullWidth
                variant="outlined"
                placeholder="Inserisci il system prompt..."
              />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Prompt Riassunto Chat" subheader="Usato per generare il report allegato" />
            <CardContent>
              <TextField
                value={summaryPrompt}
                onChange={e => setSummaryPrompt(e.target.value)}
                multiline
                minRows={12}
                fullWidth
                variant="outlined"
                placeholder="Inserisci il prompt di riassunto..."
              />
              <Box mt={2} display="flex" gap={1}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSavePrompts} disabled={promptLoading}>Salva</Button>
                <Button variant="outlined" color="warning" startIcon={<RestartAltIcon />} onClick={handleResetSummaryPrompt} disabled={promptLoading}>Reset Riassunto</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  // Gestione azioni dispositivi
  const handleDeviceAction = async (action: string, deviceIds: string[], reason?: string) => {
    try {
      const response = await apiService.post('/admin/devices/action', {
        action,
        device_ids: deviceIds,
        reason
      });

      // Ricarica dispositivi
      await loadAdminData();
      setDeviceActionDialog(false);
      setSelectedDevices(new Set());

      return response.data;
    } catch (err) {
      throw new Error('Errore nell\'esecuzione azione');
    }
  };

  // Funzioni di utilità
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
      case 'smartphone':
        return <PhoneIcon />;
      case 'tablet':
        return <TabletIcon />;
      default:
        return <ComputerIcon />;
    }
  };

  const getStatusColor = (isActive: boolean, lastActivity?: string) => {
    if (!isActive) return 'error';
    if (!lastActivity) return 'warning';
    
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) return 'success';
    if (daysSince < 7) return 'warning';
    return 'error';
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Componente Dashboard
  const DashboardTab = () => (
    <Grid container spacing={3}>
      {/* Statistiche principali */}
      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                <PeopleIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{stats?.total_users || 0}</Typography>
                <Typography color="text.secondary">Utenti Totali</Typography>
                <Typography variant="caption" color="success.main">
                  {stats?.active_users || 0} attivi
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                <DevicesIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{stats?.total_devices || 0}</Typography>
                <Typography color="text.secondary">Dispositivi</Typography>
                <Typography variant="caption" color="success.main">
                  {stats?.active_devices || 0} attivi
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                <SyncIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{stats?.sync_operations_today || 0}</Typography>
                <Typography color="text.secondary">Sync Oggi</Typography>
                <Typography variant="caption" color="text.secondary">
                  Operazioni
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center">
              <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                <StorageIcon />
              </Avatar>
              <Box>
                <Typography variant="h4">{stats ? formatBytes(stats.storage_usage_mb * 1024 * 1024) : '0 B'}</Typography>
                <Typography color="text.secondary">Storage</Typography>
                <Typography variant="caption" color="text.secondary">
                  Utilizzato
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Grafici e attività recenti */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardHeader title="Attività di Sincronizzazione Recente" />
          <CardContent>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Dispositivo</TableCell>
                    <TableCell>Utente</TableCell>
                    <TableCell>Operazione</TableCell>
                    <TableCell>Stato</TableCell>
                    <TableCell>Timestamp</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {syncActivity.slice(0, 10).map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>{activity.device_name || activity.device_id.slice(0, 8)}</TableCell>
                      <TableCell>{activity.user_email}</TableCell>
                      <TableCell>{activity.operation_type}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={activity.status}
                          color={activity.status === 'success' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>
                        {formatDistanceToNow(parseISO(activity.timestamp), { 
                          addSuffix: true,
                          locale: it 
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card>
          <CardHeader title="Metriche Sistema" />
          <CardContent>
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Media messaggi per utente
              </Typography>
              <Typography variant="h6">
                {stats?.avg_messages_per_user?.toFixed(1) || '0'}
              </Typography>
            </Box>
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Media dispositivi per utente
              </Typography>
              <Typography variant="h6">
                {stats?.avg_devices_per_user?.toFixed(1) || '0'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Conversazioni totali
              </Typography>
              <Typography variant="h6">
                {stats?.total_conversations || 0}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // Componente Gestione Utenti
  const UsersTab = () => (
    <Box>
      <Box mb={3} display="flex" gap={2} alignItems="center">
        <TextField
          placeholder="Cerca utenti..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          size="small"
          sx={{ minWidth: 300 }}
        />
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadAdminData}
        >
          Aggiorna
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Utente</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Stato</TableCell>
              <TableCell>Dispositivi</TableCell>
              <TableCell>Conversazioni</TableCell>
              <TableCell>Messaggi</TableCell>
              <TableCell>Ultimo Login</TableCell>
              <TableCell>Azioni</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users
              .filter(user => 
                userSearch === '' || 
                user.username.toLowerCase().includes(userSearch.toLowerCase()) ||
                user.email.toLowerCase().includes(userSearch.toLowerCase())
              )
              .map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Avatar sx={{ mr: 2, width: 32, height: 32 }}>
                        {user.username[0].toUpperCase()}
                      </Avatar>
                      {user.username}
                    </Box>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={user.is_active ? 'Attivo' : 'Inattivo'}
                      color={user.is_active ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge badgeContent={user.device_count} color="primary">
                      <DevicesIcon />
                    </Badge>
                  </TableCell>
                  <TableCell>{user.conversation_count}</TableCell>
                  <TableCell>{user.message_count}</TableCell>
                  <TableCell>
                    {user.last_login ? 
                      formatDistanceToNow(parseISO(user.last_login), { 
                        addSuffix: true,
                        locale: it 
                      }) : 
                      'Mai'
                    }
                  </TableCell>
                  <TableCell>
                    <IconButton size="small">
                      <SettingsIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // Componente Gestione Dispositivi
  const DevicesTab = () => (
    <Box>
      <Box mb={3} display="flex" gap={2} alignItems="center" flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Filtro</InputLabel>
          <Select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value as any)}
            label="Filtro"
          >
            <MenuItem value="all">Tutti</MenuItem>
            <MenuItem value="active">Attivi</MenuItem>
            <MenuItem value="inactive">Inattivi</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadAdminData}
        >
          Aggiorna
        </Button>

        {selectedDevices.size > 0 && (
          <Button
            variant="contained"
            color="warning"
            startIcon={<SettingsIcon />}
            onClick={() => setDeviceActionDialog(true)}
          >
            Azioni ({selectedDevices.size})
          </Button>
        )}
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedDevices.size > 0 && selectedDevices.size < devices.length}
                  checked={devices.length > 0 && selectedDevices.size === devices.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDevices(new Set(devices.map(d => d.id)));
                    } else {
                      setSelectedDevices(new Set());
                    }
                  }}
                />
              </TableCell>
              <TableCell>Dispositivo</TableCell>
              <TableCell>Utente</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Stato</TableCell>
              <TableCell>Ultimo Sync</TableCell>
              <TableCell>Sync Count</TableCell>
              <TableCell>Azioni</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices
              .filter(device => {
                if (deviceFilter === 'active') return device.is_active;
                if (deviceFilter === 'inactive') return !device.is_active;
                return true;
              })
              .map((device) => (
                <TableRow key={device.id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedDevices.has(device.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedDevices);
                        if (e.target.checked) {
                          newSelected.add(device.id);
                        } else {
                          newSelected.delete(device.id);
                        }
                        setSelectedDevices(newSelected);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      {getDeviceIcon(device.device_type)}
                      <Box ml={1}>
                        <Typography variant="body2">{device.device_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {device.fingerprint.slice(0, 8)}...
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{device.user_username}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {device.user_email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={device.device_type} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={device.is_active ? 'Attivo' : 'Inattivo'}
                      color={getStatusColor(device.is_active, device.last_sync)}
                    />
                  </TableCell>
                  <TableCell>
                    {device.last_sync ? 
                      formatDistanceToNow(parseISO(device.last_sync), { 
                        addSuffix: true,
                        locale: it 
                      }) : 
                      'Mai'
                    }
                  </TableCell>
                  <TableCell>{device.sync_count}</TableCell>
                  <TableCell>
                    <IconButton 
                      size="small"
                      onClick={() => {
                        setSelectedDevice(device);
                        setDeviceDetailsDialog(true);
                      }}
                    >
                      <SettingsIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // Dialog per azioni dispositivi
  const DeviceActionDialog = () => (
    <Dialog open={deviceActionDialog} onClose={() => setDeviceActionDialog(false)}>
      <DialogTitle>Azioni Dispositivi ({selectedDevices.size} selezionati)</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={2}>
          <Button
            variant="outlined"
            startIcon={<BlockIcon />}
            onClick={() => handleDeviceAction('deactivate', Array.from(selectedDevices))}
          >
            Disattiva Dispositivi
          </Button>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => handleDeviceAction('force_sync', Array.from(selectedDevices))}
          >
            Forza Sincronizzazione
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => handleDeviceAction('reset', Array.from(selectedDevices))}
          >
            Reset Contatori
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => handleDeviceAction('delete', Array.from(selectedDevices))}
          >
            Elimina Dispositivi
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeviceActionDialog(false)}>Annulla</Button>
      </DialogActions>
    </Dialog>
  );

  if (!isOpen) return null;

  return (
    <Dialog 
      open={isOpen} 
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { height: '90vh' } }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <AdminIcon sx={{ mr: 2 }} />
          Admin Panel - Sistema QSA Chatbot
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading && <LinearProgress />}
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Dashboard" icon={<DashboardIcon />} />
            <Tab label="Utenti" icon={<PeopleIcon />} />
            <Tab label="Dispositivi" icon={<DevicesIcon />} />
            <Tab label="Prompt" icon={<DescriptionIcon />} />
        </Tabs>

        <Box sx={{ minHeight: 400 }}>
          {currentTab === 0 && <DashboardTab />}
          {currentTab === 1 && <UsersTab />}
          {currentTab === 2 && <DevicesTab />}
          {currentTab === 3 && <PromptsTab />}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActions>

      <DeviceActionDialog />
    </Dialog>
  );
};

export default AdminPanel;
