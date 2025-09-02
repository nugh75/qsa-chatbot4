import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Card, CardContent, Typography, Stack, TextField, Button, IconButton, Chip, LinearProgress, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Alert, Divider, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, List, ListItemButton, ListItemText, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon, Refresh as RefreshIcon, FileOpen as FileOpenIcon, Close as CloseIcon, Edit as EditIcon, NoteAdd as NoteAddIcon, HelpOutline as HelpOutlineIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSlugLocal from '../utils/remarkSlugLocal';
import { apiService } from '../apiService';
// DebugPipelineTest removed per nuova specifica

interface PatternIssue { pattern: string; topic?: string; severity: 'INFO'|'WARN'|'ERROR'; code: string; message: string }
interface PipelineConfigData { routes: { pattern: string; topic: string }[]; files: Record<string,string>; validation?: { issues: PatternIssue[]; counts: { ERROR:number; WARN:number; INFO:number } } }

interface EditingRoute { mode: 'add' | 'edit'; old_pattern?: string; old_topic?: string; pattern: string; topic: string; }

const emptyRoute: EditingRoute = { mode: 'add', pattern: '', topic: '' };

const PipelinePanel: React.FC = () => {
  const [tab, setTab] = useState(0); // 0: Routes, 1: File Editor
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<PipelineConfigData | null>(null);
  const [validation, setValidation] = useState<{ issues: PatternIssue[]; counts: { ERROR:number; WARN:number; INFO:number } }|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [editingRoute, setEditingRoute] = useState<EditingRoute>(emptyRoute);
  const [selectedRouteKeys, setSelectedRouteKeys] = useState<Set<string>>(new Set());
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  // Route modal & new file within route
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [createNewFileInRoute, setCreateNewFileInRoute] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [selectedExistingFile, setSelectedExistingFile] = useState('');
  // File creation dialog (File Editor tab)
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [newStandaloneFileName, setNewStandaloneFileName] = useState('');
  const [newStandaloneFileContent, setNewStandaloneFileContent] = useState('');
  const [fileEditorName, setFileEditorName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [savingFileContent, setSavingFileContent] = useState(false);
  // uploading logic removed with Files tab
  const [regexTestInput, setRegexTestInput] = useState('');
  const [regexMatches, setRegexMatches] = useState<string[]>([]);
  const [regexError, setRegexError] = useState<string|null>(null);
  const [filter, setFilter] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContent, setGuideContent] = useState<string>('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string|null>(null);
  const [guideSource, setGuideSource] = useState<string>('');
  const [guideSearch, setGuideSearch] = useState('');
  const [guideToc, setGuideToc] = useState<{id:string; level:number; title:string}[]>([]);
  const [activeGuideHeading, setActiveGuideHeading] = useState('');
  const guideContainerRef = React.useRef<HTMLDivElement|null>(null);
  const [revalidating, setRevalidating] = useState(false);
  // Pipeline settings flags
  const [forceCaseInsensitive, setForceCaseInsensitive] = useState<boolean|undefined>(undefined);
  const [normalizeAccents, setNormalizeAccents] = useState<boolean|undefined>(undefined);
  const [savingSettings, setSavingSettings] = useState(false);
  const theme = useTheme();

  const openGuide = async () => {
    setGuideOpen(true);
    if (!guideContent && !guideLoading) {
      setGuideLoading(true);
      setGuideError(null);
      const res = await apiService.getPipelineRegexGuide();
      if (res.success && (res.data as any)?.content) {
        const dataAny: any = res.data;
        setGuideContent(dataAny.content);
        if (dataAny.source) setGuideSource(String(dataAny.source));
      } else {
        setGuideError(res.error || 'Errore nel caricamento della guida');
      }
      setGuideLoading(false);
    }
  };

  // Build TOC when guide content changes
  useEffect(() => {
    if (!guideContent) { setGuideToc([]); return; }
    const lines = guideContent.split(/\n/);
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
    setGuideToc(toc);
  }, [guideContent]);

  // Scroll spy
  useEffect(() => {
    if (!guideOpen) return;
    const el = guideContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const headings = Array.from(el.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[];
      const top = el.scrollTop;
      let current = '';
      for (const h of headings) {
        if (h.offsetTop - 80 <= top) current = h.id || '';
        else break;
      }
      if (current && current !== activeGuideHeading) setActiveGuideHeading(current);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [guideOpen, guideContent, activeGuideHeading]);

  // Search highlight processing
  const filteredGuideMarkdown = useMemo(() => {
    if (!guideSearch) return guideContent;
    try {
      const re = new RegExp(`(${guideSearch.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')})`, 'ig');
      return guideContent.replace(re, '===$1===');
    } catch { return guideContent; }
  }, [guideContent, guideSearch]);

  const renderers = useMemo(() => ({
    text: (props: any) => {
      const parts = String(props.children).split(/===/g);
      if (parts.length === 1) return <>{props.children}</>;
      return <>{parts.map((p,i) => i%2===1 ? <mark key={i} style={{ background:'#ffc107', color:'#000', padding:'0 2px' }}>{p}</mark> : p)}</>;
    }
  }), []);

  const revalidate = async () => {
    setRevalidating(true);
    try {
      const res = await apiService.validatePipeline();
      if (res.success) setValidation(res.data as any);
    } finally {
      setRevalidating(false);
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      console.log('[PipelinePanel] Loading config and files...');
      const cfgRes = await apiService.getPipelineConfig();
      console.log('[PipelinePanel] Config result:', cfgRes);
      if (cfgRes.success) {
        setConfig(cfgRes.data as any);
        if ((cfgRes.data as any).validation) {
          setValidation((cfgRes.data as any).validation);
        }
      }
      else setError(cfgRes.error||'Errore caricamento config');
      // Load pipeline settings (independent)
      const settingsRes = await apiService.getPipelineSettings();
      if (settingsRes.success) {
        setForceCaseInsensitive((settingsRes.data as any)?.settings?.force_case_insensitive);
        setNormalizeAccents((settingsRes.data as any)?.settings?.normalize_accents);
      }
  const filesRes = await apiService.listAvailablePipelineFiles();
  if (filesRes.success) setAvailableFiles(filesRes.data?.files||[]);
    } catch (e:any) { 
      console.error('[PipelinePanel] Load error:', e);
      setError(e?.message||'Errore'); 
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddRoute = () => { setEditingRoute({ ...emptyRoute, mode:'add' }); };
  const handleEditRoute = (r: { pattern: string; topic: string }) => { setEditingRoute({ mode:'edit', old_pattern: r.pattern, old_topic: r.topic, pattern: r.pattern, topic: r.topic }); };
  const cancelEditRoute = () => setEditingRoute(emptyRoute);
  const handleSubmitRoute = async () => {
    if (!editingRoute.pattern || !editingRoute.topic) {
      setError('Pattern e Topic sono obbligatori');
      return;
    }
    try {
      console.log(`[PipelinePanel] Submit route: mode=${editingRoute.mode}, pattern="${editingRoute.pattern}", topic="${editingRoute.topic}"`);
      if (editingRoute.mode === 'add') {
        const res = await apiService.addPipelineRoute(editingRoute.pattern, editingRoute.topic);
        console.log('[PipelinePanel] Add route result:', res);
        if (!res.success) return setError(res.error||'Errore aggiunta route');
      } else {
        const res = await apiService.updatePipelineRoute(editingRoute.old_pattern!, editingRoute.old_topic!, editingRoute.pattern, editingRoute.topic);
        console.log('[PipelinePanel] Update route result:', res);
        if (!res.success) return setError(res.error||'Errore update route');
      }
      setEditingRoute(emptyRoute);
      loadAll();
    } catch (e) {
      console.error('[PipelinePanel] Submit route error:', e);
      setError(e instanceof Error ? e.message : 'Errore durante il salvataggio');
    }
  };
  const handleDeleteRoute = async (r: { pattern: string; topic: string }) => {
    if (!window.confirm('Eliminare questa route?')) return;
    const res = await apiService.deletePipelineRoute(r.pattern, r.topic);
    if (!res.success) return setError(res.error||'Errore delete');
    loadAll();
  };
  const handleBulkDeleteRoutes = async () => {
    if (selectedRouteKeys.size===0) return;
    if (!window.confirm(`Eliminare ${selectedRouteKeys.size} route selezionate?`)) return;
    for (const key of selectedRouteKeys) {
      const [pattern, topic] = key.split('\u0001');
      const res = await apiService.deletePipelineRoute(pattern, topic);
      if (!res.success) { setError(res.error||'Errore delete'); break; }
    }
    setSelectedRouteKeys(new Set());
    loadAll();
  };

  // --- Route modal handlers ---
  const openAddRouteModal = () => { setEditingRoute({ ...emptyRoute, mode:'add' }); resetRouteModalFileFields(); setRouteDialogOpen(true); };
  const openEditRouteModal = (r: { pattern: string; topic: string }) => {
    setEditingRoute({ mode:'edit', old_pattern: r.pattern, old_topic: r.topic, pattern: r.pattern, topic: r.topic });
    // Pre-fill file association
    const existingFile = config?.files?.[r.topic];
    setSelectedExistingFile(existingFile||'');
    setCreateNewFileInRoute(false);
    setNewFileName(''); setNewFileContent('');
    setRouteDialogOpen(true);
  };
  const resetRouteModalFileFields = () => {
    setCreateNewFileInRoute(false);
    setSelectedExistingFile('');
    setNewFileName('');
    setNewFileContent('');
  };
  const closeRouteDialog = () => { setRouteDialogOpen(false); setEditingRoute(emptyRoute); resetRouteModalFileFields(); };

  const ensureMdExtension = (name: string) => name.endsWith('.md') ? name : name + '.md';

  const saveRouteAndFile = async () => {
    if (!editingRoute.pattern || !editingRoute.topic) { setError('Pattern e Topic richiesti'); return; }
    try {
      // Manage file mapping if needed
      let targetFilename = selectedExistingFile;
      if (createNewFileInRoute) {
        if (!newFileName) { setError('Nome file richiesto'); return; }
        const fname = ensureMdExtension(newFileName.trim());
        const saveRes = await apiService.savePipelineFileContent(fname, newFileContent||'');
        if (!saveRes.success) { setError(saveRes.error||'Errore salvataggio nuovo file'); return; }
        targetFilename = fname;
      }
      if (targetFilename) {
        const existingMappingFilename = config?.files?.[editingRoute.topic];
        if (!existingMappingFilename) {
          // add mapping
            const addMap = await apiService.addPipelineFile(editingRoute.topic, targetFilename);
            if (!addMap.success) { setError(addMap.error||'Errore mapping file'); return; }
        } else if (existingMappingFilename !== targetFilename || (editingRoute.mode==='edit' && editingRoute.old_topic!==editingRoute.topic)) {
          // update mapping (topic changed or filename changed)
          const updMap = await apiService.updatePipelineFile(editingRoute.old_topic||editingRoute.topic, editingRoute.topic, targetFilename);
          if (!updMap.success) { setError(updMap.error||'Errore update mapping'); return; }
        }
      }
      // Save route
      if (editingRoute.mode==='add') {
        const addRes = await apiService.addPipelineRoute(editingRoute.pattern, editingRoute.topic);
        if (!addRes.success) { setError(addRes.error||'Errore aggiunta route'); return; }
      } else {
        const updRes = await apiService.updatePipelineRoute(editingRoute.old_pattern!, editingRoute.old_topic!, editingRoute.pattern, editingRoute.topic);
        if (!updRes.success) { setError(updRes.error||'Errore modifica route'); return; }
      }
      closeRouteDialog();
      await loadAll();
    } catch (e:any) {
      setError(e?.message||'Errore salvataggio route');
    }
  };

  const openFileEditor = async (filename: string) => {
    setFileEditorName(filename); setFileContent('');
    const res = await apiService.getPipelineFileContent(filename);
    if (res.success) setFileContent(res.data!.content);
    else setError(res.error||'Errore caricamento file');
    // File Editor tab index is 1 after removing Files tab
    setTab(1);
  };
  const saveFile = async () => {
    setSavingFileContent(true);
    const res = await apiService.savePipelineFileContent(fileEditorName, fileContent);
    if (!res.success) setError(res.error||'Errore salvataggio file');
    setSavingFileContent(false);
  };
  // Upload disabilitato nella pipeline regex: solo mapping e editing file esistenti
  // Se serve upload, usare sezione file mapping, non regex pipeline

  // Mostra errore specifico se upload fallisce per file system read-only
  // Standalone new file creation (File Editor tab)
  const createStandaloneFile = async () => {
    if (!newStandaloneFileName) { setError('Nome file richiesto'); return; }
    const fname = ensureMdExtension(newStandaloneFileName.trim());
    const res = await apiService.savePipelineFileContent(fname, newStandaloneFileContent||'');
    if (!res.success) { setError(res.error||'Errore salvataggio file'); return; }
    setFileDialogOpen(false);
    setNewStandaloneFileName(''); setNewStandaloneFileContent('');
    await loadAll();
    openFileEditor(fname);
  };

  // Regex live test: test all patterns over input, show topics matched
  useEffect(() => {
    if (!regexTestInput || !config) { setRegexMatches([]); setRegexError(null); return; }
    const matches: string[] = [];
    for (const r of config.routes) {
      try { if (new RegExp(r.pattern, 'i').test(regexTestInput)) matches.push(r.topic); }
      catch (e:any) { setRegexError(`Errore pattern: ${r.pattern}`); }
    }
    setRegexError(null); setRegexMatches(matches);
  }, [regexTestInput, config]);

  const filteredRoutes = useMemo(() => !filter ? config?.routes||[] : (config?.routes||[]).filter(r => r.pattern.includes(filter) || r.topic.includes(filter)), [filter, config]);

  // Helper to determine if pattern matches current test input
  const patternMatchesTest = (pattern: string) => {
    if (!regexTestInput) return false;
    try { return new RegExp(pattern, 'i').test(regexTestInput); } catch { return false; }
  };

  const toggleSelectRoute = (r: {pattern:string; topic:string}) => {
    const key = r.pattern+'\u0001'+r.topic;
    setSelectedRouteKeys(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  return (
  <Stack spacing={2}>
      {loading && <LinearProgress />}
      {error && <Alert severity="error" onClose={()=> setError(null)}>{error}</Alert>}
      <Tabs value={tab} onChange={(_,v)=> setTab(v)} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Routes" />
        <Tab label="File Editor" />
      </Tabs>

      {tab===0 && (
        <Card sx={{ display:'flex', flexDirection:'column' }}>
          <CardContent sx={{ pb:1 }}>
            <Alert severity="info" sx={{ mb:2 }}>
              <Typography variant="body2">
                Guida rapida regex disponibile nel file <strong>PIPELINE_REGEX_GUIDE.md</strong> (root progetto). Evita pattern con alternativa vuota (es. <code>|</code> finale) o troppo generici. Usa <code>\\b</code> per limitare le parole. I log mostrano <code>topics_patterns</code> per audit.
              </Typography>
            </Alert>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb:1 }}>
              <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAddRouteModal}>Aggiungi Route</Button>
              <IconButton size="small" onClick={openGuide}><HelpOutlineIcon fontSize="small" /></IconButton>
              {validation && (
                <Chip size="small" color={validation.counts.ERROR>0? 'error': (validation.counts.WARN>0? 'warning':'default')} label={`Val: ${validation.counts.ERROR}E ${validation.counts.WARN}W ${validation.counts.INFO}I`} />
              )}
              <Button size="small" variant="outlined" onClick={revalidate} disabled={revalidating} startIcon={<RefreshIcon fontSize="inherit" />}>{revalidating? '...' : 'Rivalida'}</Button>
              <TextField size="small" label="Filtro" value={filter} onChange={e=> setFilter(e.target.value)} sx={{ width:160 }} />
              <TextField size="small" label="Test regex" value={regexTestInput} onChange={e=> setRegexTestInput(e.target.value)} sx={{ flex:1, minWidth:200 }} />
              <IconButton size="small" onClick={loadAll}><RefreshIcon fontSize="small" /></IconButton>
              {regexMatches.length>0 && <Chip color="success" label={`Match: ${regexMatches.length}`} size="small" />}
              {selectedRouteKeys.size>0 && (
                <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={handleBulkDeleteRoutes}>
                  Elimina ({selectedRouteKeys.size})
                </Button>
              )}
              <Divider flexItem orientation="vertical" sx={{ mx:1 }} />
              <FormControlLabel sx={{ m:0 }} control={<Switch size="small" disabled={forceCaseInsensitive===undefined||savingSettings} checked={!!forceCaseInsensitive} onChange={async e=> {
                const val = e.target.checked; setForceCaseInsensitive(val); setSavingSettings(true);
                const res = await apiService.updatePipelineSettings(val, !!normalizeAccents);
                if (!res.success) { setError(res.error||'Errore salvataggio settings'); }
                setSavingSettings(false);
              }} />} label={<Typography variant="caption">Case Insens.</Typography>} />
              <FormControlLabel sx={{ m:0 }} control={<Switch size="small" disabled={normalizeAccents===undefined||savingSettings} checked={!!normalizeAccents} onChange={async e=> {
                const val = e.target.checked; setNormalizeAccents(val); setSavingSettings(true);
                const res = await apiService.updatePipelineSettings(!!forceCaseInsensitive, val);
                if (!res.success) { setError(res.error||'Errore salvataggio settings'); }
                setSavingSettings(false);
              }} />} label={<Typography variant="caption">Normalizza Acc.</Typography>} />
              {savingSettings && <Chip size="small" label="Salvataggio..." />}
            </Stack>
            <Divider sx={{ mb:1 }} />
            <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" indeterminate={selectedRouteKeys.size>0 && selectedRouteKeys.size<filteredRoutes.length} checked={filteredRoutes.length>0 && selectedRouteKeys.size===filteredRoutes.length} onChange={e=> {
                        if (e.target.checked) setSelectedRouteKeys(new Set(filteredRoutes.map(r=> r.pattern+'\u0001'+r.topic)));
                        else setSelectedRouteKeys(new Set());
                      }} />
                    </TableCell>
                    <TableCell>Pattern</TableCell>
                    <TableCell>Val</TableCell>
                    <TableCell>Topic</TableCell>
                    <TableCell>File</TableCell>
                  <TableCell width={90}>Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRoutes.map(r => {
                    const key = r.pattern+':'+r.topic;
                    const selKey = r.pattern+'\u0001'+r.topic;
                    const selected = selectedRouteKeys.has(selKey);
                    const highlight = patternMatchesTest(r.pattern);
                    const issues = (validation?.issues||[]).filter(i => i.pattern===r.pattern);
                    const worst = issues.find(i=> i.severity==='ERROR') || issues.find(i=> i.severity==='WARN') || issues.find(i=> i.severity==='INFO');
                    const sevBg = worst?.severity==='ERROR' ? 'rgba(244,67,54,0.15)' : worst?.severity==='WARN' ? 'rgba(255,152,0,0.12)' : worst?.severity==='INFO' ? 'rgba(33,150,243,0.10)' : undefined;
                    return (
                      <TableRow key={key} hover selected={selected} sx={{ bgcolor: highlight? (theme.palette.mode==='dark' ? 'rgba(76,175,80,0.25)' : 'rgba(76,175,80,0.18)') : sevBg, outline: highlight? '2px solid rgba(76,175,80,0.6)': undefined, outlineOffset: -2 }}>
                        <TableCell padding="checkbox" onClick={(e)=> { e.stopPropagation(); toggleSelectRoute(r); }}>
                          <Checkbox size="small" checked={selected} />
                        </TableCell>
                        <TableCell><Typography variant="body2" component="span" sx={{ fontFamily:'monospace' }}>{r.pattern}</Typography></TableCell>
                        <TableCell>
                          {worst && (
                            <Tooltip title={issues.map(i=> `${i.severity}: ${i.message}`).join('\n')}>
                              <Chip size="small" label={worst.severity} color={worst.severity==='ERROR'? 'error': (worst.severity==='WARN'? 'warning':'default')} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell><Chip size="small" label={r.topic} /></TableCell>
                        <TableCell>
                          {config?.files && config.files[r.topic] ? (
                            <Button size="small" onClick={(e)=> { e.stopPropagation(); openFileEditor(config!.files[r.topic]); }} startIcon={<FileOpenIcon fontSize="inherit" />}>{config!.files[r.topic]}</Button>
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={()=> openEditRouteModal(r)}><EditIcon fontSize="inherit" /></IconButton>
                          <IconButton size="small" onClick={(e)=> { e.stopPropagation(); handleDeleteRoute(r); }}>
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredRoutes.length===0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Nessuna route</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
          </CardContent>
        </Card>
      )}

      {tab===1 && (
        <Card sx={{ display:'flex', flexDirection:'row', minHeight:400 }}>
          <Box sx={{ width:260, borderRight:'1px solid', borderColor:'divider', p:1, display:'flex', flexDirection:'column' }}>
            <Stack direction="row" spacing={1} sx={{ mb:1 }}>
              <IconButton size="small" onClick={loadAll}><RefreshIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={()=> setFileDialogOpen(true)}><NoteAddIcon fontSize="small" /></IconButton>
            </Stack>
            <List dense sx={{ flex:1, overflowY:'auto' }}>
              {availableFiles.map(f => (
                <ListItemButton key={f} selected={f===fileEditorName} onClick={()=> openFileEditor(f)}>
                  <ListItemText primaryTypographyProps={{ fontSize:13 }} primary={f} />
                </ListItemButton>
              ))}
              {availableFiles.length===0 && <Typography variant="caption" color="text.secondary" sx={{ p:1 }}>Nessun file</Typography>}
            </List>
          </Box>
          <Box sx={{ flex:1, p:2 }}>
            {!fileEditorName ? <Typography variant="body2" color="text.secondary">Seleziona un file dalla lista.</Typography> : (
              <Stack spacing={2} sx={{ height:'100%' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ flex:1 }}>Modifica file: {fileEditorName}</Typography>
                  <Button size="small" variant="contained" onClick={saveFile} disabled={savingFileContent}>Salva</Button>
                  <Button size="small" variant="outlined" onClick={()=> openFileEditor(fileEditorName)}>Ricarica</Button>
                </Stack>
                <TextField multiline minRows={20} fullWidth value={fileContent} onChange={e=> setFileContent(e.target.value)} />
              </Stack>
            )}
          </Box>
        </Card>
      )}

      {/* Route Dialog */}
      <Dialog open={routeDialogOpen} onClose={closeRouteDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingRoute.mode==='add'? 'Nuova Route':'Modifica Route'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Pattern" value={editingRoute.pattern} onChange={e=> setEditingRoute(r=> ({...r, pattern:e.target.value}))} fullWidth multiline minRows={3} />
            <TextField label="Topic" value={editingRoute.topic} onChange={e=> setEditingRoute(r=> ({...r, topic:e.target.value}))} fullWidth />
            {regexTestInput && editingRoute.pattern && (
              <Alert severity={patternMatchesTest(editingRoute.pattern)? 'success':'warning'} variant="outlined">
                {patternMatchesTest(editingRoute.pattern)? 'Il test input corrisponde a questo pattern':'Il test input non corrisponde a questo pattern'}
              </Alert>
            )}
            <Divider />
            <Typography variant="subtitle2">File associato</Typography>
            <FormControlLabel control={<Switch checked={createNewFileInRoute} onChange={e=> { setCreateNewFileInRoute(e.target.checked); if (e.target.checked) setSelectedExistingFile(''); }} />} label="Crea nuovo file" />
            {!createNewFileInRoute && (
              <TextField select SelectProps={{ native:true }} label="File esistente" value={selectedExistingFile} onChange={e=> setSelectedExistingFile(e.target.value)} fullWidth>
                <option value="">(Nessun file)</option>
                {Array.from(new Set(Object.values(config?.files||{}))).map(f => <option key={f} value={f}>{f}</option>)}
              </TextField>
            )}
            {createNewFileInRoute && (
              <Stack spacing={1}>
                <TextField label="Nome file (.md)" value={newFileName} onChange={e=> setNewFileName(e.target.value)} fullWidth />
                <TextField label="Contenuto" value={newFileContent} onChange={e=> setNewFileContent(e.target.value)} multiline minRows={6} fullWidth />
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<CloseIcon />} onClick={closeRouteDialog}>Annulla</Button>
          <Button startIcon={<SaveIcon />} variant="contained" onClick={saveRouteAndFile}>Salva</Button>
        </DialogActions>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={fileDialogOpen} onClose={()=> setFileDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Nuovo File Markdown</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Nome file (.md)" value={newStandaloneFileName} onChange={e=> setNewStandaloneFileName(e.target.value)} fullWidth />
            <TextField label="Contenuto" value={newStandaloneFileContent} onChange={e=> setNewStandaloneFileContent(e.target.value)} multiline minRows={12} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setFileDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={createStandaloneFile}>Crea</Button>
        </DialogActions>
      </Dialog>

      {/* Regex Guide Dialog with TOC & Search */}
      <Dialog open={guideOpen} onClose={()=> setGuideOpen(false)} fullScreen>
        <DialogTitle sx={{ pr:2 }}>Guida Regex Pipeline</DialogTitle>
        <DialogContent
          dividers
          sx={{
            bgcolor: theme.palette.mode==='dark'? '#0f1115' : '#fafafa',
            color: theme.palette.mode==='dark'? 'rgba(255,255,255,0.87)' : 'rgba(0,0,0,0.87)',
            p:0,
            display:'flex', flexDirection:'row', height:'100%'
          }}
        >
          {guideLoading && <LinearProgress sx={{ position:'absolute', left:0, right:0, top:0 }} />}
          {!guideLoading && guideError && (
            <Box sx={{ p:3 }}>
              <Alert severity="error" sx={{ mb:2 }}>{guideError}</Alert>
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={()=> { setGuideContent(''); openGuide(); }}>Riprova</Button>
            </Box>
          )}
          {!guideLoading && !guideError && (
            <>
              <Box sx={{ width:250, borderRight:'1px solid', borderColor:'divider', display:'flex', flexDirection:'column', bgcolor: theme.palette.mode==='dark'? '#11171d':'#f1f3f5', p:1 }}>
                <TextField size="small" label="Cerca" value={guideSearch} onChange={e=> setGuideSearch(e.target.value)} sx={{ mb:1 }} />
                {guideSource && <Chip size="small" label={guideSource.replace(/^.*\/storage\//,'storage/')} sx={{ mb:1 }} />}
                <Button size="small" variant="outlined" startIcon={<FileOpenIcon />} sx={{ mb:1 }} onClick={()=> {
                  const fname = guideSource.split('/').slice(-1)[0];
                  if (fname) {
                    if (availableFiles.includes(fname)) { openFileEditor(fname); setGuideOpen(false); }
                    else {
                      (async ()=> {
                        const fr = await apiService.listAvailablePipelineFiles();
                        if (fr.success && fr.data?.files?.includes(fname)) { openFileEditor(fname); setGuideOpen(false); }
                        else setError('File guida non presente nella lista editing');
                      })();
                    }
                  }
                }}>Apri nel File Editor</Button>
                <Box sx={{ flex:1, overflow:'auto' }}>
                  {guideToc.map(item => (
                    <Box key={item.id} sx={{ pl:(item.level-1)*1.2, py:0.25 }}>
                      <Button onClick={() => {
                        const el = guideContainerRef.current?.querySelector('#'+item.id);
                        if (el && guideContainerRef.current) {
                          guideContainerRef.current.scrollTo({ top: (el as HTMLElement).offsetTop - 60, behavior:'smooth' });
                        }
                      }} size="small" variant={activeGuideHeading===item.id? 'contained':'text'} color={activeGuideHeading===item.id? 'primary':'inherit'} sx={{ justifyContent:'flex-start', textTransform:'none', fontSize:12, width:'100%' }}>{item.title}</Button>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box ref={guideContainerRef} sx={{ flex:1, overflow:'auto', px:3, py:2, maxWidth: 1150, mx:'auto', '& h1': { mt:2, fontSize:'1.9rem' }, '& h2': { mt:3 }, '& h3': { mt:2 }, '& code': { bgcolor: theme.palette.mode==='dark'? '#1e2530':'#eceff1', px:0.6, py:0.25, borderRadius:0.5, fontSize:'0.85em' }, '& pre': { bgcolor: theme.palette.mode==='dark'? '#1e2530':'#eceff1', p:1.5, borderRadius:1, overflow:'auto' } }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkSlugLocal]} components={renderers}>{filteredGuideMarkdown}</ReactMarkdown>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: theme.palette.mode==='dark'? '#101418':'#f5f5f5' }}>
          <Button startIcon={<CloseIcon />} onClick={()=> setGuideOpen(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default PipelinePanel;
