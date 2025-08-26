import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  Badge,
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
  Computer as ComputerIcon,
  Phone as PhoneIcon,
  Tablet as TabletIcon,
  Storage as StorageIcon,
  AdminPanelSettings as AdminIcon,
  Description as DescriptionIcon,
  Save as SaveIcon,
  RestartAlt as RestartAltIcon
} from '@mui/icons-material';

// Utility per formattazione date senza date-fns
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'ora';
  if (diffMinutes < 60) return `${diffMinutes} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;
  return date.toLocaleDateString('it-IT');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

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

interface SimpleAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiService: any;
}

const SimpleAdminPanel: React.FC<SimpleAdminPanelProps> = ({ 
  isOpen, 
  onClose, 
  apiService 
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State per dati
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [syncActivity, setSyncActivity] = useState<SyncActivity[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [summarySettings, setSummarySettings] = useState({ provider: 'anthropic', enabled: true });
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSavedMsg, setPromptSavedMsg] = useState<string|null>(null);

  // State per UI
  const [userSearch, setUserSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [actionDialog, setActionDialog] = useState(false);

  // Carica dati
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

  useEffect(() => {
    if (isOpen) {
      loadAdminData();
      // Carica prompts
      (async () => {
        try {
          setPromptLoading(true);
          const [sysRes, sumRes, sumSettingsRes] = await Promise.all([
            apiService.get('/admin/system-prompt'),
            apiService.get('/admin/summary-prompt'),
            apiService.get('/admin/summary-settings')
          ]);
          setSystemPrompt(sysRes.data?.prompt || '');
          setSummaryPrompt(sumRes.data?.prompt || '');
          setSummarySettings(sumSettingsRes.data?.settings || { provider: 'anthropic', enabled: true });
        } catch (e) {
          console.warn('Errore caricamento prompt', e);
        } finally {
          setPromptLoading(false);
        }
      })();
    }
  }, [isOpen]);

  // Gestione azioni dispositivi
  const handleDeviceAction = async (action: string) => {
    try {
      await apiService.post('/admin/devices/action', {
        action,
        device_ids: Array.from(selectedDevices),
        reason: `Admin action: ${action}`
      });

      await loadAdminData();
      setActionDialog(false);
      setSelectedDevices(new Set());
    } catch (err) {
      setError('Errore nell\'esecuzione azione');
    }
  };

  // Utilità
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

  const getStatusColor = (isActive: boolean, lastActivity?: string): 'success' | 'warning' | 'error' => {
    if (!isActive) return 'error';
    if (!lastActivity) return 'warning';
    
    const daysSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) return 'success';
    if (daysSince < 7) return 'warning';
    return 'error';
  };

  // Dashboard Tab
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
                <Typography color="text.secondary">Utenti</Typography>
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
                <Typography variant="h4">
                  {stats ? formatBytes(stats.storage_usage_mb * 1024 * 1024) : '0 B'}
                </Typography>
                <Typography color="text.secondary">Storage</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Attività recenti */}
      <Grid item xs={12}>
        <Card>
          <CardHeader title="Attività Recenti" />
          <CardContent>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Dispositivo</TableCell>
                    <TableCell>Utente</TableCell>
                    <TableCell>Operazione</TableCell>
                    <TableCell>Stato</TableCell>
                    <TableCell>Tempo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {syncActivity.slice(0, 8).map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>
                        {activity.device_name || activity.device_id.slice(0, 8) + '...'}
                      </TableCell>
                      <TableCell>{activity.user_email}</TableCell>
                      <TableCell>{activity.operation_type}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={activity.status}
                          color={activity.status === 'success' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>{formatTimeAgo(activity.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // Users Tab
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
              <TableCell>Ultimo Login</TableCell>
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
                  <TableCell>
                    {user.last_login ? formatTimeAgo(user.last_login) : 'Mai'}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // Devices Tab
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
            onClick={() => setActionDialog(true)}
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
                    {device.last_sync ? formatTimeAgo(device.last_sync) : 'Mai'}
                  </TableCell>
                  <TableCell>{device.sync_count}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  // Prompts Tab
  const PromptsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>Gestione Prompt</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb:2 }}>
        Modifica il prompt di sistema (identità e stile) e il prompt di riassunto (usato per generare i report delle conversazioni). I cambiamenti hanno effetto sulle richieste successive.
      </Typography>
      {promptLoading && <LinearProgress sx={{ mb:2 }} />}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="System Prompt" subheader="Comportamento generale" />
            <CardContent>
              <TextField multiline minRows={10} fullWidth value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} placeholder="System prompt..." />
              <Box mt={2} display="flex" gap={1}>
                <Button variant="contained" startIcon={<SaveIcon/>} size="small" onClick={async()=>{ try { await apiService.post('/admin/system-prompt',{prompt:systemPrompt}); setPromptSavedMsg('System prompt salvato'); setTimeout(()=>setPromptSavedMsg(null),2500);} catch { setPromptSavedMsg('Errore salvataggio system prompt'); } }}>Salva</Button>
                <Button variant="outlined" startIcon={<RestartAltIcon/>} size="small" color="warning" onClick={async()=>{ try { const r = await apiService.post('/admin/system-prompt/reset'); setSystemPrompt(r.data?.prompt || ''); } catch {} }}>Reset</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Summary Prompt" subheader="Report conversazioni" />
            <CardContent>
              <Box mb={2}>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Provider per Summary</InputLabel>
                  <Select 
                    value={summarySettings.provider} 
                    onChange={e => setSummarySettings({...summarySettings, provider: e.target.value})}
                  >
                    <MenuItem value="anthropic">Anthropic Claude</MenuItem>
                    <MenuItem value="openai">OpenAI</MenuItem>
                    <MenuItem value="gemini">Google Gemini</MenuItem>
                    <MenuItem value="openrouter">OpenRouter</MenuItem>
                    <MenuItem value="ollama">Ollama</MenuItem>
                  </Select>
                </FormControl>
                <Box display="flex" alignItems="center" gap={1}>
                  <Checkbox 
                    checked={summarySettings.enabled} 
                    onChange={e => setSummarySettings({...summarySettings, enabled: e.target.checked})}
                  />
                  <Typography variant="body2">Abilita generazione automatica summary</Typography>
                </Box>
              </Box>
              <TextField multiline minRows={10} fullWidth value={summaryPrompt} onChange={e=>setSummaryPrompt(e.target.value)} placeholder="Summary prompt..." />
              <Box mt={2} display="flex" gap={1}>
                <Button variant="contained" startIcon={<SaveIcon/>} size="small" onClick={async()=>{ try { await apiService.post('/admin/summary-prompt',{prompt:summaryPrompt}); setPromptSavedMsg('Summary prompt salvato'); setTimeout(()=>setPromptSavedMsg(null),2500);} catch { setPromptSavedMsg('Errore salvataggio summary prompt'); } }}>Salva Prompt</Button>
                <Button variant="contained" startIcon={<SettingsIcon/>} size="small" color="secondary" onClick={async()=>{ try { await apiService.post('/admin/summary-settings', summarySettings); setPromptSavedMsg('Impostazioni summary salvate'); setTimeout(()=>setPromptSavedMsg(null),2500);} catch { setPromptSavedMsg('Errore salvataggio impostazioni summary'); } }}>Salva Config</Button>
                <Button variant="outlined" startIcon={<RestartAltIcon/>} size="small" color="warning" onClick={async()=>{ try { const r = await apiService.post('/admin/summary-prompt/reset'); setSummaryPrompt(r.data?.prompt || ''); } catch {} }}>Reset</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {promptSavedMsg && <Alert sx={{ mt:2 }} severity={promptSavedMsg.includes('Errore')? 'error':'success'}>{promptSavedMsg}</Alert>}
    </Box>
  );

  // Action Dialog
  const ActionDialog = () => (
    <Dialog open={actionDialog} onClose={() => setActionDialog(false)}>
      <DialogTitle>Azioni Dispositivi ({selectedDevices.size} selezionati)</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={2}>
          <Button
            variant="outlined"
            startIcon={<BlockIcon />}
            onClick={() => handleDeviceAction('deactivate')}
          >
            Disattiva Dispositivi
          </Button>
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => handleDeviceAction('force_sync')}
          >
            Forza Sincronizzazione
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => handleDeviceAction('reset')}
          >
            Reset Contatori
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => handleDeviceAction('delete')}
          >
            Elimina Dispositivi
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setActionDialog(false)}>Annulla</Button>
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
          Admin Panel - QSA Chatbot
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
          <Tab label="Prompts" icon={<DescriptionIcon />} />
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

      <ActionDialog />
    </Dialog>
  );
};

export default SimpleAdminPanel;
