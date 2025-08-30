import React, { useEffect, useMemo, useState } from 'react'
import {
  Container, Paper, Typography, TextField, Button, Stack, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Card, CardContent, Grid, Divider, Alert, Chip, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, IconButton, CircularProgress,
  Tooltip, Slider, Tabs, Tab
} from '@mui/material'
import Avatar from '@mui/material/Avatar'
import { Settings as SettingsIcon, VolumeUp as VolumeIcon, Psychology as AIIcon, Analytics as StatsIcon, ExpandMore as ExpandMoreIcon, Mic as MicIcon, Key as KeyIcon, Storage as StorageIcon, Description as DescriptionIcon, Chat as ChatIcon, SportsKabaddi as ArenaIcon, Hub as HubIcon, CloudDownload as CloudDownloadIcon, Refresh as RefreshIcon, CheckCircle as CheckCircleIcon, HourglassBottom as HourglassBottomIcon, Error as ErrorIcon, Info as InfoIcon } from '@mui/icons-material'

import UserManagement from './components/UserManagement'
import ModelProvidersPanel from './components/ModelProvidersPanel'
import TTSProvidersPanel from './components/TTSProvidersPanel'
import WhisperPanel from './components/WhisperPanel'
import MemoryPanel from './components/MemoryPanel';
import UsagePanel from './components/UsagePanel';
import SystemPromptsPanel from './components/SystemPromptsPanel'
import SummaryPromptsPanel from './components/SummaryPromptsPanel'
import PersonalitiesPanel from './components/PersonalitiesPanel'
import APIDocsPanel from './components/APIDocsPanel'
import RagDocumentsPanel from './components/RagDocumentsPanel'
import WhisperHealthPanel from './components/WhisperHealthPanel'
import PipelinePanel from './components/PipelinePanel'
import EndpointsExplorer from './components/EndpointsExplorer'
import WelcomeGuidesPanel from './components/WelcomeGuidesPanel'
import { authFetch, BACKEND } from './utils/authFetch'
import FooterSettingsPanel from './components/FooterSettingsPanel'
import { apiService } from './apiService'
import type { AdminConfig, FeedbackStats } from './types/admin'

const AdminPanel: React.FC = () => {
  // Stato principale
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [arenaPublic, setArenaPublic] = useState<boolean>(false)
  const [contactEmail, setContactEmail] = useState<string>('')
  const [researchProject, setResearchProject] = useState<string>('')
  const [repositoryUrl, setRepositoryUrl] = useState<string>('')
  const [websiteUrl, setWebsiteUrl] = useState<string>('')
  const [infoPdfUrl, setInfoPdfUrl] = useState<string>('')
  const [footerTitle, setFooterTitle] = useState<string>('')
  const [footerText, setFooterText] = useState<string>('')
  const [showResearchProject, setShowResearchProject] = useState<boolean>(true)
  const [showRepositoryUrl, setShowRepositoryUrl] = useState<boolean>(true)
  const [showWebsiteUrl, setShowWebsiteUrl] = useState<boolean>(true)
  const [showInfoPdfUrl, setShowInfoPdfUrl] = useState<boolean>(true)
  const [showContactEmail, setShowContactEmail] = useState<boolean>(true)
  const [showFooterBlock, setShowFooterBlock] = useState<boolean>(true)
  const [savingArena, setSavingArena] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Categorie tematiche (definisce quali pannelli appaiono in ogni tab)
  const categories = [
    { id: 'provider', label: 'Modelli & Provider', panels: ['providers', 'tts'] },
    { id: 'conversation', label: 'Conversazione', panels: ['prompts', 'personalities', 'memory', 'welcome_guides'] },
    { id: 'audio', label: 'Audio', panels: ['transcription', 'whisper_health'] },
    { id: 'rag', label: 'RAG & Pipeline', panels: ['embedding', 'ragdocs', 'pipeline'] },
    { id: 'utenti', label: 'Utenti & Feedback', panels: ['user_management', 'usage'] },
    { id: 'footer', label: 'Footer & Info', panels: ['footer_settings'] },
    { id: 'api', label: 'API & Tecnico', panels: ['apidocs'] },
  ] as const

  const [selectedCategory, setSelectedCategory] = useState<string>('provider')

  // UI stato locale
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    providers: true,
    tts: false,
  transcription: false,
    prompts: false,
    personalities: false,
    user_management: true,
  usage: false,
  memory: false,
  apidocs: false,
  embedding: false,
  ragdocs: false,
  whisper_health: false,
  pipeline: false,
  welcome_guides: false,
  footer_settings: true,
  })

  // Token test
  const [tokenTestInput, setTokenTestInput] = useState<string>('Ciao! Questo è un test.')
  const [testingTokens, setTestingTokens] = useState<boolean>(false)
  const [tokenTestResult, setTokenTestResult] = useState<any>(null)

  // Embedding state
  const [embeddingConfig, setEmbeddingConfig] = useState<any>(null);
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [downloadTasks, setDownloadTasks] = useState<any[]>([]);
  const [startingDownload, setStartingDownload] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Memo per provider e voci disponibili
  const providerNames = useMemo(() => {
    if (!config) return []
    return Object.keys(config.ai_providers)
  }, [config])

  const ttsNames = useMemo(() => {
    if (!config) return []
    return Object.keys(config.tts_providers)
  }, [config])

  // Caricamenti
  const loadConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config`)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data: AdminConfig = await res.json()
      setConfig(data)
    } catch (e) {
      setError('Errore nel caricamento della configurazione')
    } finally {
      setLoading(false)
    }
  }

  const loadUsage = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/feedback/stats`)
      if (res.ok) {
        const data: FeedbackStats = await res.json()
        setFeedbackStats(data)
      }
    } catch {
      /* opzionale: silenzioso */
    }
  }

  const loadUiSettings = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`)
      if (res.ok) {
        const data = await res.json()
  setArenaPublic(Boolean(data?.settings?.arena_public))
  if (data?.settings?.contact_email) setContactEmail(data.settings.contact_email)
  if (data?.settings?.research_project) setResearchProject(data.settings.research_project)
  if (data?.settings?.repository_url) setRepositoryUrl(data.settings.repository_url)
  if (data?.settings?.website_url) setWebsiteUrl(data.settings.website_url)
  if (data?.settings?.info_pdf_url) setInfoPdfUrl(data.settings.info_pdf_url)
  if (data?.settings?.footer_title) setFooterTitle(data.settings.footer_title)
  if (data?.settings?.footer_text) setFooterText(data.settings.footer_text)
  if (typeof data?.settings?.show_research_project === 'boolean') setShowResearchProject(data.settings.show_research_project)
  if (typeof data?.settings?.show_repository_url === 'boolean') setShowRepositoryUrl(data.settings.show_repository_url)
  if (typeof data?.settings?.show_website_url === 'boolean') setShowWebsiteUrl(data.settings.show_website_url)
  if (typeof data?.settings?.show_info_pdf_url === 'boolean') setShowInfoPdfUrl(data.settings.show_info_pdf_url)
  if (typeof data?.settings?.show_contact_email === 'boolean') setShowContactEmail(data.settings.show_contact_email)
  if (typeof data?.settings?.show_footer_block === 'boolean') setShowFooterBlock(data.settings.show_footer_block)
      }
    } catch {/* ignore */}
  }

  useEffect(() => {
    loadConfig()
    loadUsage()
    loadUiSettings()
  }, [])

  const saveUiSettings = async (nextArena?: boolean, nextEmail?: string, extra?: Partial<{research_project:string;repository_url:string;website_url:string;info_pdf_url:string;footer_title:string;footer_text:string; show_research_project:boolean; show_repository_url:boolean; show_website_url:boolean; show_info_pdf_url:boolean; show_contact_email:boolean; show_footer_block:boolean;}>) => {
    setSavingArena(true)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          arena_public: nextArena ?? arenaPublic,
          contact_email: (nextEmail ?? contactEmail) || null,
          research_project: (extra?.research_project ?? researchProject) || null,
          repository_url: (extra?.repository_url ?? repositoryUrl) || null,
          website_url: (extra?.website_url ?? websiteUrl) || null,
          info_pdf_url: (extra?.info_pdf_url ?? infoPdfUrl) || null,
          footer_title: (extra?.footer_title ?? footerTitle) || null,
          footer_text: (extra?.footer_text ?? footerText) || null,
          show_research_project: extra?.show_research_project ?? showResearchProject,
          show_repository_url: extra?.show_repository_url ?? showRepositoryUrl,
          show_website_url: extra?.show_website_url ?? showWebsiteUrl,
          show_info_pdf_url: extra?.show_info_pdf_url ?? showInfoPdfUrl,
          show_contact_email: extra?.show_contact_email ?? showContactEmail,
          show_footer_block: extra?.show_footer_block ?? showFooterBlock,
        })
      })
      if (res.ok) {
        if (nextArena !== undefined) setArenaPublic(!!nextArena)
        if (nextEmail !== undefined) setContactEmail(nextEmail)
        if (extra?.research_project !== undefined) setResearchProject(extra.research_project)
        if (extra?.repository_url !== undefined) setRepositoryUrl(extra.repository_url)
        if (extra?.website_url !== undefined) setWebsiteUrl(extra.website_url)
        if (extra?.info_pdf_url !== undefined) setInfoPdfUrl(extra.info_pdf_url)
  if (extra?.footer_title !== undefined) setFooterTitle(extra.footer_title)
  if (extra?.footer_text !== undefined) setFooterText(extra.footer_text)
  if (extra?.show_research_project !== undefined) setShowResearchProject(extra.show_research_project)
  if (extra?.show_repository_url !== undefined) setShowRepositoryUrl(extra.show_repository_url)
  if (extra?.show_website_url !== undefined) setShowWebsiteUrl(extra.show_website_url)
  if (extra?.show_info_pdf_url !== undefined) setShowInfoPdfUrl(extra.show_info_pdf_url)
  if (extra?.show_contact_email !== undefined) setShowContactEmail(extra.show_contact_email)
  if (extra?.show_footer_block !== undefined) setShowFooterBlock(extra.show_footer_block)
      }
    } catch {/* noop */} finally { setSavingArena(false) }
  }

  const handlePanelExpansion = (panel: string) => (_: any, isExpanded: boolean) => {
    setExpandedPanels(prev => ({
      ...prev,
      [panel]: isExpanded
    }))
  }

  const runTokenTest = async () => {
    if (!tokenTestInput.trim()) return
    setTestingTokens(true)
    setTokenTestResult(null)
    try {
      const res = await authFetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-LLM-Provider': config?.default_provider || 'local'
        },
        body: JSON.stringify({ message: tokenTestInput })
      })
      const data = await res.json()
      setTokenTestResult(data)
    } catch {
      setTokenTestResult({ error: 'Errore chiamata' })
    } finally {
      setTestingTokens(false)
    }
  }

  const updateDefaultProvider = async (value: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config/default-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: value })
      })
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, default_provider: value } as AdminConfig : prev)
      }
    } catch {
      /* noop */
    }
  }

  const updateDefaultTTS = async (value: string) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/config/default-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tts: value })
      })
      if (res.ok) {
        setConfig(prev => prev ? { ...prev, default_tts: value } as AdminConfig : prev)
      }
    } catch {
      /* noop */
    }
  }

  // Embedding functions
  const loadEmbeddingData = async () => {
    setEmbeddingLoading(true);
    try {
      const [cfgRes, modelsRes, tasksRes] = await Promise.all([
        apiService.getEmbeddingConfig(),
        apiService.listLocalEmbeddingModels(),
        apiService.listEmbeddingDownloadTasks()
      ]);
      if (cfgRes.success) setEmbeddingConfig(cfgRes.data?.config || cfgRes.data);
      if (modelsRes.success) setEmbeddingModels(modelsRes.data?.models || []);
      if (tasksRes.success) setDownloadTasks(tasksRes.data?.tasks || []);
      if (cfgRes.success) {
        setSelectedModel(cfgRes.data?.config?.model_name || cfgRes.data?.model_name || '');
      }
    } catch {/* noop */} finally {
      setEmbeddingLoading(false);
    }
  };

  useEffect(() => {
    if (expandedPanels.embedding) {
      loadEmbeddingData();
      const id = setInterval(loadEmbeddingData, 4000);
      return () => clearInterval(id);
    }
  }, [expandedPanels.embedding]);

  const handleSetEmbeddingProvider = async () => {
    if (!selectedModel) return;
    setEmbeddingLoading(true);
    try {
      const res = await apiService.setEmbeddingProvider('local', selectedModel);
      if (res.success) {
        loadEmbeddingData();
      }
    } finally { setEmbeddingLoading(false); }
  };

  const handleStartDownload = async () => {
    if (!selectedModel) return;
    setStartingDownload(true);
    try {
      const res = await apiService.startEmbeddingDownload(selectedModel);
      if (res.success) {
        loadEmbeddingData();
      }
    } finally { setStartingDownload(false); }
  };

  const activePanels = (categories.find(c => c.id === selectedCategory)?.panels ?? []) as readonly string[]
  const panelVisible = (key: string) => (activePanels as readonly string[]).includes(key)

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <SettingsIcon />
        <Typography variant="h5" sx={{ mr: 2 }}>Pannello di amministrazione</Typography>
        <Button size="small" startIcon={<ChatIcon />} href="/" variant="outlined">Chat</Button>
        <Button size="small" startIcon={<ArenaIcon />} href="/arena" variant="outlined">Arena</Button>
  <FormControlLabel sx={{ ml: 1 }} control={<Switch size="small" checked={arenaPublic} onChange={(e)=> saveUiSettings(e.target.checked, undefined)} />} label={savingArena ? 'Arena…' : 'Arena pubblica'} />
        {loading && <LinearProgress sx={{ flexBasis: '100%', mt: 1 }} />}
      </Stack>

      {/* Tabs categorie */}
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs
          value={selectedCategory}
          onChange={(_, v) => setSelectedCategory(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {categories.map(cat => (
            <Tab key={cat.id} value={cat.id} label={cat.label} />
          ))}
        </Tabs>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Providers */}
      {/* Nota: quando si cambiano welcome/guides in altre sezioni (non ancora implementate qui), si potrebbe impostare: localStorage.setItem('welcome_guides_version', Date.now().toString()) per forzare il refresh lato chat. */}
      {panelVisible('providers') && (
      <Accordion expanded={expandedPanels.providers} onChange={handlePanelExpansion('providers')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon fontSize="small" />
            <Typography variant="h6">Modelli e provider</Typography>
            {config && <Chip size="small" label={config.default_provider ? `default: ${config.default_provider}` : 'default: -'} />}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Card>
            <CardContent>
              {!config ? (
                <Typography color="text.secondary">Caricamento configurazione…</Typography>
              ) : (
                <>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="default-provider-label">Provider predefinito</InputLabel>
                        <Select
                          labelId="default-provider-label"
                          label="Provider predefinito"
                          value={config.default_provider || ''}
                          onChange={(e) => updateDefaultProvider(e.target.value)}
                        >
                          {providerNames.map(p => (
                            <MenuItem key={p} value={p}>{p}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={5}>
                      <TextField size="small" fullWidth label="Email contatto ricerca" value={contactEmail} onChange={e=> setContactEmail(e.target.value)} placeholder="es. ricerca@example.org" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3} sx={{ display:'flex', alignItems:'center' }}>
                      <Button size="small" variant="outlined" disabled={savingArena} onClick={()=> saveUiSettings(undefined, contactEmail)}>Salva contatto</Button>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField size="small" fullWidth label="Titolo progetto ricerca" value={researchProject} onChange={e=> setResearchProject(e.target.value)} placeholder="es. Progetto QSA" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField size="small" fullWidth label="Repository URL" value={repositoryUrl} onChange={e=> setRepositoryUrl(e.target.value)} placeholder="https://github.com/..." />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField size="small" fullWidth label="Sito Web" value={websiteUrl} onChange={e=> setWebsiteUrl(e.target.value)} placeholder="https://example.org" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={6}>
                      <TextField size="small" fullWidth label="Informativa PDF URL" value={infoPdfUrl} onChange={e=> setInfoPdfUrl(e.target.value)} placeholder="https://example.org/informativa.pdf" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={6} sx={{ display:'flex', alignItems:'center' }}>
                      <Button size="small" variant="outlined" disabled={savingArena} onClick={()=> saveUiSettings(undefined, undefined, {research_project: researchProject, repository_url: repositoryUrl, website_url: websiteUrl, info_pdf_url: infoPdfUrl})}>Salva campi ricerca</Button>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField size="small" fullWidth label="Footer titolo" value={footerTitle} onChange={e=> setFooterTitle(e.target.value)} placeholder="es. Informazioni" />
                    </Grid>
                    <Grid item xs={12} sm={12} md={8}>
                      <TextField size="small" fullWidth multiline minRows={2} label="Footer testo" value={footerText} onChange={e=> setFooterText(e.target.value)} placeholder="Testo descrittivo (markdown semplice)" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={6} sx={{ display:'flex', alignItems:'center' }}>
                      <Button size="small" variant="outlined" disabled={savingArena} onClick={()=> saveUiSettings(undefined, undefined, {footer_title: footerTitle, footer_text: footerText})}>Salva footer</Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Divider sx={{ my:1 }} />
                      <Typography variant="subtitle2" sx={{ mb:1 }}>Visibilità sezione questionario</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showFooterBlock} onChange={e=> saveUiSettings(undefined, undefined, {show_footer_block: e.target.checked})} />} label="Mostra blocco footer" /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showResearchProject} onChange={e=> saveUiSettings(undefined, undefined, {show_research_project: e.target.checked})} />} label="Mostra progetto" /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showRepositoryUrl} onChange={e=> saveUiSettings(undefined, undefined, {show_repository_url: e.target.checked})} />} label="Mostra repository" /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showWebsiteUrl} onChange={e=> saveUiSettings(undefined, undefined, {show_website_url: e.target.checked})} />} label="Mostra sito web" /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showInfoPdfUrl} onChange={e=> saveUiSettings(undefined, undefined, {show_info_pdf_url: e.target.checked})} />} label="Mostra PDF" /></Grid>
                    <Grid item xs={12} sm={6} md={4}><FormControlLabel control={<Switch size="small" checked={showContactEmail} onChange={e=> saveUiSettings(undefined, undefined, {show_contact_email: e.target.checked})} />} label="Mostra email contatto" /></Grid>
                  </Grid>
                  <ModelProvidersPanel config={config as any} onConfigUpdate={(next) => setConfig(prev => prev ? ({ ...prev, ...next } as any) : prev)} />
                </>
              )}
            </CardContent>
          </Card>
        </AccordionDetails>
      </Accordion>
          )}

  {/* TTS */}
  {panelVisible('tts') && (
  <Accordion expanded={expandedPanels.tts} onChange={handlePanelExpansion('tts')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VolumeIcon fontSize="small" />
            <Typography variant="h6">Sintesi vocale (TTS)</Typography>
            {config && <Chip size="small" label={config.default_tts ? `default: ${config.default_tts}` : 'default: -'} />}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Card>
            <CardContent>
              {!config ? (
                <Typography color="text.secondary">Caricamento…</Typography>
              ) : (
                <>
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="default-tts-label">TTS predefinito</InputLabel>
                        <Select
                          labelId="default-tts-label"
                          label="TTS predefinito"
                          value={config.default_tts || ''}
                          onChange={(e) => updateDefaultTTS(e.target.value)}
                        >
                          {ttsNames.map(t => (
                            <MenuItem key={t} value={t}>{t}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  <TTSProvidersPanel config={config as any} onConfigUpdate={(next) => setConfig(prev => prev ? ({ ...prev, ...next } as any) : prev)} />
                </>
              )}
            </CardContent>
          </Card>
        </AccordionDetails>
      </Accordion>
  )}

  {/* Gestione Utenti */}
  {panelVisible('user_management') && (
  <Accordion expanded={expandedPanels.user_management} onChange={handlePanelExpansion('user_management')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon fontSize="small" />
            <Typography variant="h6">Gestione Utenti</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <UserManagement />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Utilizzo & Feedback panel nuovo */}
  {panelVisible('usage') && (
  <Accordion expanded={expandedPanels.usage} onChange={handlePanelExpansion('usage')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatsIcon fontSize="small" />
            <Typography variant="h6">Utilizzo & Feedback</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <UsagePanel />
        </AccordionDetails>
      </Accordion>
  )}


  {/* Memoria conversazioni */}
  {panelVisible('memory') && (
  <Accordion expanded={expandedPanels.memory} onChange={handlePanelExpansion('memory')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon fontSize="small" />
            <Typography variant="h6">Memoria</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <MemoryPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Trascrizione (Whisper) */}
  {panelVisible('transcription') && (
  <Accordion expanded={expandedPanels.transcription} onChange={handlePanelExpansion('transcription')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MicIcon fontSize="small" />
            <Typography variant="h6">Trascrizione (Whisper)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <WhisperPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Whisper Health */}
  {panelVisible('whisper_health') && (
  <Accordion expanded={expandedPanels.whisper_health} onChange={handlePanelExpansion('whisper_health')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StorageIcon fontSize="small" />
            <Typography variant="h6">Whisper Health</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <WhisperHealthPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Prompts (System & Summary) */}
  {panelVisible('prompts') && (
  <Accordion expanded={expandedPanels.prompts} onChange={handlePanelExpansion('prompts')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Prompts (System & Summary)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <SystemPromptsPanel />
            <SummaryPromptsPanel />
          </Stack>
        </AccordionDetails>
      </Accordion>
  )}

  {/* Welcome & Guides */}
  {panelVisible('welcome_guides') && (
  <Accordion expanded={expandedPanels.welcome_guides} onChange={handlePanelExpansion('welcome_guides')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Welcome & Guide</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <WelcomeGuidesPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Personalità */}
  {/* Footer Settings */}
  {panelVisible('footer_settings') && (
  <Accordion expanded={expandedPanels.footer_settings} onChange={handlePanelExpansion('footer_settings')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <InfoIcon fontSize="small" />
            <Typography variant="h6">Footer & Informazioni</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <FooterSettingsPanel />
        </AccordionDetails>
      </Accordion>
  )}
  {panelVisible('personalities') && (
  <Accordion expanded={expandedPanels.personalities} onChange={handlePanelExpansion('personalities')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AIIcon fontSize="small" />
            <Typography variant="h6">Personalità</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <PersonalitiesPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* FastAPI Endpoints */}
      {panelVisible('apidocs') && (
      <Accordion expanded={expandedPanels.apidocs} onChange={handlePanelExpansion('apidocs')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon fontSize="small" />
    <Typography variant="h6">FastAPI Endpoints</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <EndpointsExplorer />
          <APIDocsPanel />
        </AccordionDetails>
      </Accordion>
      )}

  {/* Embedding Management */}
  {panelVisible('embedding') && (
  <Accordion expanded={expandedPanels.embedding} onChange={handlePanelExpansion('embedding')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <HubIcon fontSize="small" />
            <Typography variant="h6">RAG Embedding</Typography>
            {embeddingConfig && <Chip size="small" label={embeddingConfig.model_name || embeddingConfig?.config?.model_name} />}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Card>
            <CardContent>
              {embeddingLoading && <LinearProgress sx={{ mb:2 }} />}
              {!embeddingConfig ? (
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadEmbeddingData}>Ricarica configurazione</Button>
              ) : (
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>Modello attivo</Typography>
                    <Typography variant="body2">{embeddingConfig?.config?.model_name || embeddingConfig.model_name} ({embeddingConfig?.config?.dimension || embeddingConfig.dimension || 'dim ?'})</Typography>
                  </Box>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="embedding-model-label">Modello locale</InputLabel>
                    <Select labelId="embedding-model-label" label="Modello locale" value={selectedModel} onChange={(e)=> setSelectedModel(e.target.value)}>
                      {embeddingModels.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Stack direction="row" spacing={2}>
                    <Button variant="contained" size="small" disabled={!selectedModel || embeddingLoading} onClick={handleSetEmbeddingProvider}>Imposta provider</Button>
                    <Button variant="outlined" size="small" startIcon={<CloudDownloadIcon />} disabled={!selectedModel || startingDownload} onClick={handleStartDownload}>Scarica / Warm</Button>
                    <IconButton size="small" onClick={loadEmbeddingData} disabled={embeddingLoading}><RefreshIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>Download tasks</Typography>
                    <Stack spacing={1}>
                      {downloadTasks.length === 0 && <Typography variant="body2" color="text.secondary">Nessun task</Typography>}
                      {downloadTasks.map(t => {
                        let icon = <HourglassBottomIcon fontSize="small" color="action" />;
                        if (t.status === 'completed') icon = <CheckCircleIcon fontSize="small" color="success" />;
                        if (t.status === 'failed') icon = <ErrorIcon fontSize="small" color="error" />;
                        return (
                          <Paper key={t.id} variant="outlined" sx={{ p:1, display:'flex', alignItems:'center', gap:1 }}>
                            {icon}
                            <Box sx={{ flexGrow:1 }}>
                              <Typography variant="caption">{t.model_name}</Typography>
                              <LinearProgress variant="determinate" value={t.progress||0} sx={{ height:6, borderRadius:1, mt:0.5 }} />
                            </Box>
                            <Chip size="small" label={t.status} />
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Box>
                  {embeddingConfig?.runtime_error && <Alert severity="warning">{embeddingConfig.runtime_error}</Alert>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </AccordionDetails>
      </Accordion>
  )}

  {/* RAG Documenti */}
  {panelVisible('ragdocs') && (
  <Accordion expanded={expandedPanels.ragdocs} onChange={handlePanelExpansion('ragdocs')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">RAG Documenti</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <RagDocumentsPanel />
        </AccordionDetails>
      </Accordion>
  )}

  {/* Pipeline / Regex Management */}
  {panelVisible('pipeline') && (
  <Accordion expanded={expandedPanels.pipeline} onChange={handlePanelExpansion('pipeline')}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}> 
          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
            <DescriptionIcon fontSize="small" />
            <Typography variant="h6">Pipeline (Regex & Files)</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <PipelinePanel />
        </AccordionDetails>
      </Accordion>
  )}
    </Container>
  )
}

export default AdminPanel
