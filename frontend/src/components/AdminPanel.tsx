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
  RestartAlt as RestartAltIcon,
  HelpOutline as HelpOutlineIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSlugLocal from '../utils/remarkSlugLocal';
import { prepareChatMarkdown } from '../utils/markdownPipeline';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

// Import servizi
import { apiService } from '../apiService';
import RagDocumentsPanel from './RagDocumentsPanel';
// import AdminUserManagement from './AdminUserManagement';

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

interface PipelineRoute {
  pattern: string;
  topic: string;
}

interface PipelineFile {
  topic: string;
  filename: string;
}

interface PipelineConfig {
  routes: PipelineRoute[];
  files: Record<string, string>;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SummarySettings {
  provider: string;
  enabled: boolean;
  model?: string | null;
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

  // Pipeline state
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  // Regex guide dialog state (lightweight inline version for AdminPanel)
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string|null>(null);
  const [guideContent, setGuideContent] = useState('');
  const [guideSource, setGuideSource] = useState('');
  // Admin guide state
  const [adminGuideOpen, setAdminGuideOpen] = useState(false);
  const [adminGuideLoading, setAdminGuideLoading] = useState(false);
  const [adminGuideError, setAdminGuideError] = useState<string|null>(null);
  const [adminGuideContent, setAdminGuideContent] = useState('');
  const [adminGuideSource, setAdminGuideSource] = useState('');
  const [adminGuideSearch, setAdminGuideSearch] = useState('');
  const [adminGuideToc, setAdminGuideToc] = useState<{id:string; level:number; title:string}[]>([]);
  const adminGuideContainerRef = React.useRef<HTMLDivElement|null>(null);
  const [activeAdminHeading, setActiveAdminHeading] = useState<string>('');
  // Parse TOC when content changes
  useEffect(() => {
    if (!adminGuideContent) { setAdminGuideToc([]); return; }
    const lines = adminGuideContent.split(/\n/);
    const toc: {id:string; level:number; title:string}[] = [];
    lines.forEach(l => {
      const m = /^(#{1,4})\s+(.*)$/.exec(l.trim());
      if (m) {
        const level = m[1].length;
        const raw = m[2].replace(/[`*_]+/g,'').trim();
        const id = raw.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        toc.push({ id, level, title: raw });
      }
    });
    setAdminGuideToc(toc);
  }, [adminGuideContent]);

  // Scroll spy
  useEffect(() => {
    if (!adminGuideOpen) return;
    const el = adminGuideContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const headings = Array.from(el.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[];
      const top = el.scrollTop;
      let current = '';
      for (const h of headings) {
        if (h.offsetTop - 80 <= top) current = h.id || '';
        else break;
      }
      if (current && current !== activeAdminHeading) setActiveAdminHeading(current);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [adminGuideOpen, adminGuideContent, activeAdminHeading]);

  const filteredAdminHtml = React.useMemo(() => {
    if (!adminGuideSearch) return adminGuideContent;
    try {
      const re = new RegExp(`(${adminGuideSearch.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')})`, 'ig');
      return adminGuideContent.replace(re, '===$1==='); // markers
    } catch { return adminGuideContent; }
  }, [adminGuideContent, adminGuideSearch]);

  // Custom component to highlight search markers
  const renderers = React.useMemo(() => ({
    text: (props: any) => {
      const parts = String(props.children).split(/===/g);
      if (parts.length === 1) return <>{props.children}</>;
      return <>{parts.map((p,i) => i%2===1 ? <mark key={i} style={{ background:'#ffc107', color:'#000', padding:'0 2px' }}>{p}</mark> : p)}</>;
    }
  }), []);

  // State per filtri e paginazione
  const [userSearch, setUserSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());

  // State per dialoghi
  const [deviceActionDialog, setDeviceActionDialog] = useState(false);
  const [deviceDetailsDialog, setDeviceDetailsDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  
  // Pipeline dialogs
  const [addRouteDialog, setAddRouteDialog] = useState(false);
  const [editRouteDialog, setEditRouteDialog] = useState(false);
  const [addFileDialog, setAddFileDialog] = useState(false);
  const [editFileDialog, setEditFileDialog] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<PipelineRoute | null>(null);
  const [selectedFileMapping, setSelectedFileMapping] = useState<{topic: string, filename: string} | null>(null);

  // Prompt state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptMessage, setPromptMessage] = useState<string | null>(null);

  // Welcome & Guides state
  const [welcomeMessages, setWelcomeMessages] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [activeWelcomeId, setActiveWelcomeId] = useState<string|null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string|null>(null);
  const [wgLoading, setWgLoading] = useState(false);
  const [wgMessage, setWgMessage] = useState<string|null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editKind, setEditKind] = useState<'welcome'|'guide'>('welcome');
  const [editId, setEditId] = useState<string|null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');

  // Summary settings state
  const [summarySettings, setSummarySettings] = useState<SummarySettings | null>(null);
  const [summaryProviders, setSummaryProviders] = useState<string[]>([]);
  const [summaryModels, setSummaryModels] = useState<string[]>([]);
  const [summarySaveMessage, setSummarySaveMessage] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ---- Summary Settings Helpers ----
  const loadSummarySettings = async () => {
    try {
      setSummarySaveMessage(null);
      const res = await apiService.get('/admin/summary-settings');
      if (res?.data?.settings) {
        setSummarySettings(res.data.settings);
      }
      // Load providers/models from config if endpoint exists
      try {
        const cfg = await apiService.get('/config');
        if (cfg?.data?.ai_providers) {
          const providers = Object.keys(cfg.data.ai_providers).filter(p => p !== 'local');
            setSummaryProviders(providers);
            const currentProv = (res?.data?.settings?.provider) || providers[0];
            if (currentProv && cfg.data.ai_providers[currentProv]?.models) {
              setSummaryModels(cfg.data.ai_providers[currentProv].models || []);
            } else {
              setSummaryModels([]);
            }
        }
      } catch (e) {
        // Silently ignore if /config not available
      }
    } catch (e) {
      setSummarySaveMessage('Errore caricamento impostazioni riassunto');
    }
  };

  const handleChangeSummaryProvider = async (prov: string) => {
    setSummarySettings(s => s ? { ...s, provider: prov, model: '' } : { provider: prov, enabled: true, model: '' });
    try {
      const cfg = await apiService.get('/config');
      if (cfg?.data?.ai_providers?.[prov]?.models) {
        setSummaryModels(cfg.data.ai_providers[prov].models || []);
      } else {
        setSummaryModels([]);
      }
    } catch {
      setSummaryModels([]);
    }
  };

  const handleSaveSummarySettings = async () => {
    if (!summarySettings) return;
    setSummaryLoading(true);
    setSummarySaveMessage(null);
    try {
      await apiService.post('/admin/summary-settings', {
        provider: summarySettings.provider,
        enabled: summarySettings.enabled,
        model: summarySettings.model || null
      });
      setSummarySaveMessage('Impostazioni riassunto salvate');
    } catch (e: any) {
      setSummarySaveMessage(e?.response?.data?.detail || 'Errore salvataggio impostazioni riassunto');
    } finally {
      setSummaryLoading(false);
    }
  };

  // Carica dati iniziali
  useEffect(() => {
    if (isOpen) {
      loadAdminData();
      loadPrompts();
      loadPipelineData();
      loadWelcomeGuides();
      loadSummarySettings();
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

  // Pipeline functions
  const loadPipelineData = async () => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      const [configRes, filesRes] = await Promise.all([
        apiService.get('/admin/pipeline'),
        apiService.get('/admin/pipeline/files/available')
      ]);
      
      if (configRes?.data) {
        setPipelineConfig({
          routes: configRes.data.routes || [],
          files: configRes.data.files || {}
        });
      }
      
      if (filesRes?.data?.files) {
        setAvailableFiles(filesRes.data.files);
      }
    } catch (e) {
      setPipelineMessage('Errore nel caricamento dati pipeline');
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleAddRoute = async (pattern: string, topic: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.post('/admin/pipeline/route/add', { pattern, topic });
      setPipelineMessage('Route aggiunta con successo');
      await loadPipelineData();
      setAddRouteDialog(false);
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'aggiunta route');
    } finally {
      setPipelineLoading(false);
    }
  };

  const openRegexGuide = async () => {
    setGuideOpen(true);
    if (!guideContent && !guideLoading) {
      setGuideLoading(true); setGuideError(null);
      const res = await apiService.getPipelineRegexGuide();
      if (res.success && (res.data as any)?.content) {
        const d:any = res.data; setGuideContent(prepareChatMarkdown(d.content)); if (d.source) setGuideSource(String(d.source));
      } else {
        setGuideError(res.error || 'Errore caricamento guida');
      }
      setGuideLoading(false);
    }
  };

  const openAdminGuide = async () => {
    setAdminGuideOpen(true);
    if (!adminGuideContent && !adminGuideLoading) {
      setAdminGuideLoading(true); setAdminGuideError(null);
      const res = await apiService.getAdminGuide();
      if (res.success && (res.data as any)?.content) {
        const d:any = res.data; setAdminGuideContent(prepareChatMarkdown(d.content)); if (d.source) setAdminGuideSource(String(d.source));
      } else {
        setAdminGuideError(res.error || 'Errore caricamento guida admin');
      }
      setAdminGuideLoading(false);
    }
  };

  const handleUpdateRoute = async (oldPattern: string, oldTopic: string, newPattern: string, newTopic: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.post('/admin/pipeline/route/update', {
        old_pattern: oldPattern,
        old_topic: oldTopic,
        new_pattern: newPattern,
        new_topic: newTopic
      });
      setPipelineMessage('Route aggiornata con successo');
      await loadPipelineData();
      setEditRouteDialog(false);
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'aggiornamento route');
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleDeleteRoute = async (pattern: string, topic: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.delete(`/admin/pipeline/route?pattern=${encodeURIComponent(pattern)}&topic=${encodeURIComponent(topic)}`);
      setPipelineMessage('Route eliminata con successo');
      await loadPipelineData();
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'eliminazione route');
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleAddFile = async (topic: string, filename: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.post('/admin/pipeline/file/add', { topic, filename });
      setPipelineMessage('Mapping file aggiunto con successo');
      await loadPipelineData();
      setAddFileDialog(false);
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'aggiunta mapping file');
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleUpdateFile = async (oldTopic: string, newTopic: string, newFilename: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.post('/admin/pipeline/file/update', {
        old_topic: oldTopic,
        new_topic: newTopic,
        new_filename: newFilename
      });
      setPipelineMessage('Mapping file aggiornato con successo');
      await loadPipelineData();
      setEditFileDialog(false);
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'aggiornamento mapping file');
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleDeleteFile = async (topic: string) => {
    setPipelineLoading(true);
    setPipelineMessage(null);
    try {
      await apiService.delete(`/admin/pipeline/file?topic=${encodeURIComponent(topic)}`);
      setPipelineMessage('Mapping file eliminato con successo');
      await loadPipelineData();
    } catch (e: any) {
      setPipelineMessage(e.response?.data?.detail || 'Errore nell\'eliminazione mapping file');
    } finally {
      setPipelineLoading(false);
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

      {/* Summary Settings Card */}
      <Card sx={{ mt:3 }}>
        <CardHeader title="Impostazioni Riassunto" subheader="Provider e modello per generare il riassunto esportazioni" />
        <CardContent>
          {summarySaveMessage && (
            <Alert severity={summarySaveMessage.includes('Errore') ? 'error':'success'} sx={{ mb:2 }}>{summarySaveMessage}</Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Provider</InputLabel>
                <Select
                  label="Provider"
                  value={summarySettings?.provider || ''}
                  onChange={e => handleChangeSummaryProvider(e.target.value)}
                >
                  {summaryProviders.map(p => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small" disabled={!summaryModels.length}>
                <InputLabel>Modello</InputLabel>
                <Select
                  label="Modello"
                  value={summarySettings?.model || ''}
                  onChange={e => setSummarySettings(s => s ? { ...s, model: e.target.value } : s)}
                >
                  {summaryModels.map(m => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={<Switch checked={summarySettings?.enabled || false} onChange={e => setSummarySettings(s => s ? { ...s, enabled: e.target.checked } : s)} />}
                label="Riassunto Abilitato"
              />
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" gap={1}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveSummarySettings} disabled={summaryLoading || !summarySettings?.provider}>Salva</Button>
                <Button variant="outlined" onClick={loadSummarySettings} disabled={summaryLoading}>Ricarica</Button>
              </Box>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>
            Il provider 'local' è escluso automaticamente. Inclusi: openrouter, openai, gemini, ollama se configurati.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );

  // Pipeline Tab Component
  const PipelineTab = () => (
    <Box>
      <Box display="flex" alignItems="center" mb={2} gap={1}>
        <SettingsIcon />
        <Typography variant="h6">Gestione Pipeline</Typography>
      </Box>
      
      {pipelineLoading && <LinearProgress sx={{ mb: 2 }} />}
      
      {pipelineMessage && (
        <Alert 
          severity={pipelineMessage.includes('Errore') ? 'error' : 'success'} 
          sx={{ mb: 2 }}
        >
          {pipelineMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Route Management */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Gestione Route" 
              subheader="Pattern regex per il routing dei messaggi"
              action={<Box display="flex" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<HelpOutlineIcon />}
                  onClick={openRegexGuide}
                  disabled={pipelineLoading}
                >
                  Guida
                </Button>
                <Button
                  variant="contained"
                  startIcon={<SettingsIcon />}
                  onClick={() => setAddRouteDialog(true)}
                  disabled={pipelineLoading}
                >
                  Aggiungi Route
                </Button>
              </Box>}
            />
            <CardContent>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pattern</TableCell>
                      <TableCell>Topic</TableCell>
                      <TableCell>Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pipelineConfig?.routes.map((route, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Tooltip title={route.pattern}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {route.pattern.length > 30 ? 
                                route.pattern.substring(0, 30) + '...' : 
                                route.pattern
                              }
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={route.topic} />
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedRoute(route);
                              setEditRouteDialog(true);
                            }}
                            disabled={pipelineLoading}
                          >
                            <SettingsIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteRoute(route.pattern, route.topic)}
                            disabled={pipelineLoading}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* File Mapping Management */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader 
              title="Mappatura File" 
              subheader="Associazione topic -> file di contenuto"
              action={
                <Button
                  variant="contained"
                  startIcon={<DescriptionIcon />}
                  onClick={() => setAddFileDialog(true)}
                  disabled={pipelineLoading}
                >
                  Aggiungi Mapping
                </Button>
              }
            />
            <CardContent>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Topic</TableCell>
                      <TableCell>File</TableCell>
                      <TableCell>Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pipelineConfig && Object.entries(pipelineConfig.files).map(([topic, filename]) => (
                      <TableRow key={topic}>
                        <TableCell>
                          <Chip size="small" label={topic} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {filename}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedFileMapping({ topic, filename });
                              setEditFileDialog(true);
                            }}
                            disabled={pipelineLoading}
                          >
                            <SettingsIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteFile(topic)}
                            disabled={pipelineLoading}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
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

  // Pipeline Dialogs
  const AddRouteDialog = () => {
    const [pattern, setPattern] = useState('');
    const [topic, setTopic] = useState('');

    const handleSubmit = () => {
      if (pattern.trim() && topic.trim()) {
        handleAddRoute(pattern.trim(), topic.trim());
        setPattern('');
        setTopic('');
      }
    };

    const handleClose = () => {
      setAddRouteDialog(false);
      setPattern('');
      setTopic('');
    };

    return (
      <Dialog open={addRouteDialog} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Aggiungi Nuova Route</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Pattern Regex"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              fullWidth
              placeholder="\\b(parola|frase)\\b"
              helperText="Inserisci un pattern regex valido per il matching"
            />
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic per questa route"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!pattern.trim() || !topic.trim() || pipelineLoading}
          >
            Aggiungi
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const EditRouteDialog = () => {
    const [pattern, setPattern] = useState(selectedRoute?.pattern || '');
    const [topic, setTopic] = useState(selectedRoute?.topic || '');

    useEffect(() => {
      if (selectedRoute) {
        setPattern(selectedRoute.pattern);
        setTopic(selectedRoute.topic);
      }
    }, [selectedRoute]);

    const handleSubmit = () => {
      if (selectedRoute && pattern.trim() && topic.trim()) {
        handleUpdateRoute(selectedRoute.pattern, selectedRoute.topic, pattern.trim(), topic.trim());
        setPattern('');
        setTopic('');
      }
    };

    const handleClose = () => {
      setEditRouteDialog(false);
      setSelectedRoute(null);
      setPattern('');
      setTopic('');
    };

    return (
      <Dialog open={editRouteDialog} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Modifica Route</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Pattern Regex"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              fullWidth
              placeholder="\\b(parola|frase)\\b"
              helperText="Inserisci un pattern regex valido per il matching"
            />
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic per questa route"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!pattern.trim() || !topic.trim() || pipelineLoading}
          >
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const AddFileDialog = () => {
    const [topic, setTopic] = useState('');
    const [filename, setFilename] = useState('');

    const handleSubmit = () => {
      if (topic.trim() && filename.trim()) {
        handleAddFile(topic.trim(), filename.trim());
        setTopic('');
        setFilename('');
      }
    };

    const handleClose = () => {
      setAddFileDialog(false);
      setTopic('');
      setFilename('');
    };

    return (
      <Dialog open={addFileDialog} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Aggiungi Mapping File</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic da associare al file"
            />
            <FormControl fullWidth>
              <InputLabel>File</InputLabel>
              <Select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                label="File"
              >
                {availableFiles.map((file) => (
                  <MenuItem key={file} value={file}>{file}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!topic.trim() || !filename.trim() || pipelineLoading}
          >
            Aggiungi
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const EditFileDialog = () => {
    const [topic, setTopic] = useState(selectedFileMapping?.topic || '');
    const [filename, setFilename] = useState(selectedFileMapping?.filename || '');

    useEffect(() => {
      if (selectedFileMapping) {
        setTopic(selectedFileMapping.topic);
        setFilename(selectedFileMapping.filename);
      }
    }, [selectedFileMapping]);

    const handleSubmit = () => {
      if (selectedFileMapping && topic.trim() && filename.trim()) {
        handleUpdateFile(selectedFileMapping.topic, topic.trim(), filename.trim());
        setTopic('');
        setFilename('');
      }
    };

    const handleClose = () => {
      setEditFileDialog(false);
      setSelectedFileMapping(null);
      setTopic('');
      setFilename('');
    };

    return (
      <Dialog open={editFileDialog} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Modifica Mapping File</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              fullWidth
              placeholder="nome_topic"
              helperText="Nome del topic da associare al file"
            />
            <FormControl fullWidth>
              <InputLabel>File</InputLabel>
              <Select
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                label="File"
              >
                {availableFiles.map((file) => (
                  <MenuItem key={file} value={file}>{file}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!topic.trim() || !filename.trim() || pipelineLoading}
          >
            Salva
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const loadWelcomeGuides = async () => {
    setWgLoading(true); setWgMessage(null);
    try {
      const stateRes = await apiService.get('/welcome-guides/state');
      if (stateRes?.data) {
        setWelcomeMessages(stateRes.data.welcome?.messages || []);
        setGuides(stateRes.data.guides?.guides || []);
        setActiveWelcomeId(stateRes.data.welcome?.active_id || null);
        setActiveGuideId(stateRes.data.guides?.active_id || null);
      }
    } catch (e) {
      setWgMessage('Errore caricamento welcome/guide');
    } finally { setWgLoading(false); }
  };

  useEffect(() => { if (isOpen) loadWelcomeGuides(); }, [isOpen]);

  const openCreate = (kind: 'welcome'|'guide') => {
    setEditKind(kind); setEditId(null); setEditTitle(''); setEditContent(''); setEditDialogOpen(true);
  };
  const openEdit = (kind: 'welcome'|'guide', item: any) => {
    setEditKind(kind); setEditId(item.id); setEditTitle(item.title||''); setEditContent(item.content||''); setEditDialogOpen(true);
  };
  const saveItem = async () => {
    setWgLoading(true); setWgMessage(null);
    try {
      const payload = { title: editTitle||null, content: editContent };
      if (!editId) {
        if (editKind==='welcome') await apiService.createWelcomeMessage(payload);
        else await apiService.createGuide(payload);
      } else {
        if (editKind==='welcome') await apiService.updateWelcomeMessage(editId, payload);
        else await apiService.updateGuide(editId, payload);
      }
      setEditDialogOpen(false);
      await loadWelcomeGuides();
      setWgMessage('Salvato');
    } catch (e:any) { setWgMessage('Errore salvataggio'); } finally { setWgLoading(false); }
  };
  const deleteItem = async (kind: 'welcome'|'guide', id: string) => {
    if (!confirm('Eliminare elemento?')) return;
    setWgLoading(true); setWgMessage(null);
    try {
      if (kind==='welcome') await apiService.deleteWelcomeMessage(id); else await apiService.deleteGuide(id);
      await loadWelcomeGuides();
      setWgMessage('Eliminato');
    } catch { setWgMessage('Errore eliminazione'); } finally { setWgLoading(false); }
  };
  const activateItem = async (kind: 'welcome'|'guide', id: string) => {
    setWgLoading(true); setWgMessage(null);
    try {
      if (kind==='welcome') await apiService.activateWelcome(id); else await apiService.activateGuide(id);
      await loadWelcomeGuides();
      setWgMessage('Attivato');
    } catch { setWgMessage('Errore attivazione'); } finally { setWgLoading(false); }
  };

  const WelcomeGuidesTab = () => (
    <Box>
      <Box display="flex" alignItems="center" mb={2} gap={1}><DescriptionIcon /><Typography variant="h6">Welcome & Guide</Typography></Box>
      {wgLoading && <LinearProgress sx={{ mb:2 }} />}
      {wgMessage && <Alert severity={wgMessage.includes('Errore')? 'error':'success'} sx={{ mb:2 }}>{wgMessage}</Alert>}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Messaggi di Benvenuto" action={<Button size="small" onClick={()=>openCreate('welcome')}>Nuovo</Button>} />
            <CardContent>
              <List dense>
                {welcomeMessages.map(m => (
                  <ListItem key={m.id} secondaryAction={<Box display="flex" gap={1}>
                    <Button size="small" variant={m.id===activeWelcomeId? 'contained':'outlined'} onClick={()=>activateItem('welcome', m.id)}>Attiva</Button>
                    <Button size="small" onClick={()=>openEdit('welcome', m)}>Modifica</Button>
                    <Button size="small" color="error" onClick={()=>deleteItem('welcome', m.id)}>Del</Button>
                  </Box>}>
                    <ListItemText primary={(m.title||'(senza titolo)') + (m.id===activeWelcomeId ? ' (attivo)':'')} secondary={m.content.slice(0,100)+(m.content.length>100?'...':'')} />
                  </ListItem>
                ))}
                {welcomeMessages.length===0 && <Typography variant="body2" color="text.secondary">Nessun messaggio</Typography>}
              </List>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Guide" action={<Button size="small" onClick={()=>openCreate('guide')}>Nuova</Button>} />
            <CardContent>
              <List dense>
                {guides.map(g => (
                  <ListItem key={g.id} secondaryAction={<Box display="flex" gap={1}>
                    <Button size="small" variant={g.id===activeGuideId? 'contained':'outlined'} onClick={()=>activateItem('guide', g.id)}>Attiva</Button>
                    <Button size="small" onClick={()=>openEdit('guide', g)}>Modifica</Button>
                    <Button size="small" color="error" onClick={()=>deleteItem('guide', g.id)}>Del</Button>
                  </Box>}>
                    <ListItemText primary={(g.title||'(senza titolo)') + (g.id===activeGuideId ? ' (attiva)':'')} secondary={g.content.slice(0,100)+(g.content.length>100?'...':'')} />
                  </ListItem>
                ))}
                {guides.length===0 && <Typography variant="body2" color="text.secondary">Nessuna guida</Typography>}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Dialog open={editDialogOpen} onClose={()=>setEditDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editId? 'Modifica':'Nuovo'} {editKind==='welcome'? 'Messaggio di Benvenuto':'Guida'}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField label="Titolo" value={editTitle} onChange={e=>setEditTitle(e.target.value)} fullWidth />
            <TextField label="Contenuto" value={editContent} onChange={e=>setEditContent(e.target.value)} multiline minRows={10} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setEditDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" onClick={saveItem} disabled={wgLoading || !editContent.trim()}>Salva</Button>
        </DialogActions>
      </Dialog>
    </Box>
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
          <Tab label="Pipeline" icon={<SettingsIcon />} />
          <Tab label="RAG" icon={<StorageIcon />} />
          <Tab label="Prompt" icon={<DescriptionIcon />} />
          <Tab label="Welcome" icon={<DescriptionIcon />} />
          <Button size="small" variant="outlined" sx={{ ml: 'auto', alignSelf:'center' }} onClick={openAdminGuide}>Guida Admin</Button>
        </Tabs>

        <Box sx={{ minHeight: 400 }}>
          {currentTab === 0 && <DashboardTab />}
          {currentTab === 1 && <UsersTab />}
          {currentTab === 2 && <DevicesTab />}
          {currentTab === 3 && <PipelineTab />}
          {currentTab === 4 && <RagDocumentsPanel />}
          {currentTab === 5 && <PromptsTab />}
          {currentTab === 6 && <WelcomeGuidesTab />}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActions>

      <DeviceActionDialog />
      {/* Regex Guide Dialog */}
      <Dialog open={guideOpen} onClose={()=> setGuideOpen(false)} fullScreen>
        <DialogTitle>Guida Regex Pipeline</DialogTitle>
        <DialogContent dividers sx={{ bgcolor:'#0f1115', p:0, display:'flex', flexDirection:'column' }}>
          {guideLoading && <LinearProgress />}
          {!guideLoading && guideError && (
            <Box p={3}>
              <Alert severity="error" sx={{ mb:2 }}>{guideError}</Alert>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={()=> { setGuideContent(''); openRegexGuide(); }}>Riprova</Button>
            </Box>
          )}
          {!guideLoading && !guideError && (
            <Box sx={{ flex:1, overflow:'auto', px:3, py:2, maxWidth:1100, mx:'auto', '& code': { bgcolor:'#1e2530', px:0.6, py:0.25, borderRadius:0.5, fontSize:'0.85em' }, '& pre': { bgcolor:'#1e2530', p:1.5, borderRadius:1, overflow:'auto' } }}>
              {guideSource && <Chip size="small" label={guideSource.replace(/^.*\/storage\//,'storage/')} sx={{ mb:1 }} />}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{guideContent}</ReactMarkdown>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setGuideOpen(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
      {/* Admin General Guide Dialog */}
      <Dialog open={adminGuideOpen} onClose={()=> setAdminGuideOpen(false)} fullScreen>
        <DialogTitle>Guida Amministratore</DialogTitle>
        <DialogContent dividers sx={{ bgcolor:'#0f1115', p:0, display:'flex', flexDirection:'row', height:'100%' }}>
          {adminGuideLoading && <LinearProgress />}
          {!adminGuideLoading && adminGuideError && (
            <Box p={3}>
              <Alert severity="error" sx={{ mb:2 }}>{adminGuideError}</Alert>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={()=> { setAdminGuideContent(''); openAdminGuide(); }}>Riprova</Button>
            </Box>
          )}
          {!adminGuideLoading && !adminGuideError && (
            <>
              <Box sx={{ width:260, borderRight:'1px solid', borderColor:'divider', display:'flex', flexDirection:'column', bgcolor:'#11171d', p:1 }}>
                <TextField size="small" label="Cerca" value={adminGuideSearch} onChange={e=> setAdminGuideSearch(e.target.value)} sx={{ mb:1 }} />
                <Box sx={{ flex:1, overflow:'auto', pr:1 }}>
                  {adminGuideToc.map(item => (
                    <Box key={item.id} sx={{ pl:(item.level-1)*1.2, py:0.3 }}>
                      <Button onClick={() => {
                        const el = adminGuideContainerRef.current?.querySelector('#'+item.id);
                        if (el && adminGuideContainerRef.current) {
                          adminGuideContainerRef.current.scrollTo({ top: (el as HTMLElement).offsetTop - 60, behavior:'smooth' });
                        }
                      }} size="small" variant={activeAdminHeading===item.id? 'contained':'text'} color={activeAdminHeading===item.id? 'primary':'inherit'} sx={{ justifyContent:'flex-start', textTransform:'none', fontSize:12, width:'100%' }}>{item.title}</Button>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box ref={adminGuideContainerRef} sx={{ flex:1, overflow:'auto', px:3, py:2, '& code': { bgcolor:'#1e2530', px:0.6, py:0.25, borderRadius:0.5, fontSize:'0.85em' }, '& pre': { bgcolor:'#1e2530', p:1.5, borderRadius:1, overflow:'auto' } }}>
                {adminGuideSource && <Chip size="small" label={adminGuideSource.replace(/^.*\/storage\//,'storage/')} sx={{ mb:1 }} />}
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkSlugLocal]} components={renderers}>{filteredAdminHtml}</ReactMarkdown>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setAdminGuideOpen(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
      
      {/* Pipeline Dialogs */}
      <AddRouteDialog />
      <EditRouteDialog />
      <AddFileDialog />
      <EditFileDialog />
    </Dialog>
  );
};

export default AdminPanel;
