import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Card, CardContent, Typography, Stack, TextField, Button, IconButton, Tooltip, Chip, Divider, LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Alert } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon, Save as SaveIcon, Refresh as RefreshIcon, UploadFile as UploadIcon, FileOpen as FileOpenIcon } from '@mui/icons-material';
import { apiService } from '../apiService';
import DebugPipelineTest from './DebugPipelineTest';

interface PipelineConfigData { routes: { pattern: string; topic: string }[]; files: Record<string,string>; }

interface EditingRoute { mode: 'add' | 'edit'; old_pattern?: string; old_topic?: string; pattern: string; topic: string; }
interface EditingFile { mode: 'add' | 'edit'; old_topic?: string; topic: string; filename: string; }

const emptyRoute: EditingRoute = { mode: 'add', pattern: '', topic: '' };
const emptyFile: EditingFile = { mode: 'add', topic: '', filename: '' };

const PipelinePanel: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<PipelineConfigData | null>(null);
  const [error, setError] = useState<string|null>(null);
  const [editingRoute, setEditingRoute] = useState<EditingRoute>(emptyRoute);
  const [editingFile, setEditingFile] = useState<EditingFile>(emptyFile);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [fileEditorName, setFileEditorName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [savingFileContent, setSavingFileContent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [regexTestInput, setRegexTestInput] = useState('');
  const [regexMatches, setRegexMatches] = useState<string[]>([]);
  const [regexError, setRegexError] = useState<string|null>(null);
  const [filter, setFilter] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      console.log('[PipelinePanel] Loading config and files...');
      const cfgRes = await apiService.getPipelineConfig();
      console.log('[PipelinePanel] Config result:', cfgRes);
      if (cfgRes.success) setConfig(cfgRes.data as any);
      else setError(cfgRes.error||'Errore caricamento config');
      const filesRes = await apiService.listAvailablePipelineFiles();
      console.log('[PipelinePanel] Files result:', filesRes);
      if (filesRes.success) setAvailableFiles(filesRes.data?.files||[]);
    } catch (e:any) { 
      console.error('[PipelinePanel] Load error:', e);
      setError(e?.message||'Errore'); 
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddRoute = () => { setEditingRoute({ ...emptyRoute, mode:'add' }); };
  const handleEditRoute = (r: { pattern: string; topic: string }) => { setEditingRoute({ mode:'edit', old_pattern: r.pattern, old_topic: r.topic, pattern: r.pattern, topic: r.topic }); };
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

  const handleAddFile = () => setEditingFile({ ...emptyFile, mode:'add' });
  const handleEditFile = (topic: string, filename: string) => setEditingFile({ mode:'edit', old_topic: topic, topic, filename });
  const handleSubmitFile = async () => {
    if (!editingFile.topic || !editingFile.filename) return;
    let res;
    if (editingFile.mode === 'add') res = await apiService.addPipelineFile(editingFile.topic, editingFile.filename);
    else res = await apiService.updatePipelineFile(editingFile.old_topic!, editingFile.topic, editingFile.filename);
    if (!res.success) return setError(res.error||'Errore salvataggio file mapping');
    setEditingFile(emptyFile);
    loadAll();
  };
  const handleDeleteFile = async (topic: string) => {
    if (!window.confirm('Eliminare mapping file?')) return;
    const res = await apiService.deletePipelineFile(topic);
    if (!res.success) return setError(res.error||'Errore delete file mapping');
    loadAll();
  };

  const openFileEditor = async (filename: string) => {
    setFileEditorName(filename); setFileContent('');
    const res = await apiService.getPipelineFileContent(filename);
    if (res.success) setFileContent(res.data!.content);
    else setError(res.error||'Errore caricamento file');
    setTab(2);
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
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploading(true);
    const file = e.target.files[0];
    const res = await apiService.uploadPipelineFile(file);
    if (!res.success) {
      if (res.error && res.error.includes('Read-only file system')) {
        setError('Errore upload: il file system è in sola lettura. Verifica i volumi Docker e la directory di destinazione.');
      } else {
        setError(res.error||'Upload fallito');
      }
    } else loadAll();
    setUploading(false);
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

  return (
    <Stack spacing={2}>
      {/* Debug Test Component - Remove in production */}
      <DebugPipelineTest />
      
      {loading && <LinearProgress />}
      {error && <Alert severity="error" onClose={()=> setError(null)}>{error}</Alert>}
      <Tabs value={tab} onChange={(_,v)=> setTab(v)} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Routes" />
        <Tab label="Files" />
        <Tab label="File Editor" />
      </Tabs>

      {tab===0 && (
        <Card><CardContent>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb:2 }}>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleAddRoute}>Nuova Route</Button>
            <TextField size="small" label="Filtro" value={filter} onChange={e=> setFilter(e.target.value)} />
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>Refresh</Button>
            <TextField size="small" label="Testo per test regex" value={regexTestInput} onChange={e=> setRegexTestInput(e.target.value)} fullWidth />
            {regexMatches.length>0 && <Chip color="success" label={`Match: ${regexMatches.join(', ')}`} />}
          </Stack>
           {(editingRoute.mode==='add' || editingRoute.mode==='edit') && (
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1} sx={{ mb:2 }}>
              <TextField label="Pattern" size="small" value={editingRoute.pattern} onChange={e=> setEditingRoute(r=> ({...r, pattern:e.target.value}))} fullWidth />
              <TextField label="Topic" size="small" value={editingRoute.topic} onChange={e=> setEditingRoute(r=> ({...r, topic:e.target.value}))} fullWidth />
              <Button size="small" variant="contained" onClick={handleSubmitRoute} startIcon={<SaveIcon />}>{editingRoute.mode==='add'?'Aggiungi':'Salva'}</Button>
              <Button size="small" onClick={()=> setEditingRoute(emptyRoute)}>Annulla</Button>
            </Stack>) }
          <Table size="small">
            <TableHead><TableRow><TableCell>Pattern</TableCell><TableCell>Topic</TableCell><TableCell width={120}>Azioni</TableCell></TableRow></TableHead>
            <TableBody>
              {filteredRoutes.map(r => (
                <TableRow key={r.pattern+':'+r.topic}>
                  <TableCell><code>{r.pattern}</code></TableCell>
                  <TableCell>{r.topic}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={()=> handleEditRoute(r)}><EditIcon fontSize="inherit" /></IconButton>
                    <IconButton size="small" onClick={()=> handleDeleteRoute(r)}><DeleteIcon fontSize="inherit" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRoutes.length===0 && <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">Nessuna route</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {tab===1 && (
        <Card><CardContent>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb:2 }}>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleAddFile}>Nuovo Mapping</Button>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={loadAll}>Refresh</Button>
            <Button size="small" variant="outlined" component="label" startIcon={<UploadIcon />} disabled={uploading}>
              Upload
              <input type="file" hidden onChange={handleUpload} />
            </Button>
          </Stack>
          {editingFile.topic!=='' && (
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1} sx={{ mb:2 }}>
              <TextField label="Topic" size="small" value={editingFile.topic} onChange={e=> setEditingFile(f=> ({...f, topic:e.target.value}))} fullWidth />
              <TextField label="Filename" size="small" value={editingFile.filename} onChange={e=> setEditingFile(f=> ({...f, filename:e.target.value}))} fullWidth />
              <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSubmitFile}>{editingFile.mode==='add'?'Aggiungi':'Salva'}</Button>
              <Button size="small" onClick={()=> setEditingFile(emptyFile)}>Annulla</Button>
            </Stack> )}
          <Table size="small">
            <TableHead><TableRow><TableCell>Topic</TableCell><TableCell>Filename</TableCell><TableCell width={160}>Azioni</TableCell></TableRow></TableHead>
            <TableBody>
              {config && Object.entries(config.files).map(([topic, filename]) => (
                <TableRow key={topic}>
                  <TableCell>{topic}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={()=> openFileEditor(filename)} startIcon={<FileOpenIcon fontSize="inherit" />}>{filename}</Button>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={()=> handleEditFile(topic, filename)}><EditIcon fontSize="inherit" /></IconButton>
                    <IconButton size="small" onClick={()=> handleDeleteFile(topic)}><DeleteIcon fontSize="inherit" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {config && Object.keys(config.files).length===0 && <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary">Nessun mapping file</Typography></TableCell></TableRow>}
            </TableBody>
          </Table>
          <Box sx={{ mt:2 }}>
            <Typography variant="subtitle2">File disponibili</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {availableFiles.map(f => <Chip key={f} label={f} onClick={()=> openFileEditor(f)} size="small" variant={f===fileEditorName? 'filled':'outlined'} />)}
              {availableFiles.length===0 && <Typography variant="caption" color="text.secondary">Nessun file trovato</Typography>}
            </Stack>
          </Box>
        </CardContent></Card>
      )}

      {tab===2 && (
        <Card><CardContent>
          {!fileEditorName ? <Typography variant="body2" color="text.secondary">Seleziona un file dalla tab Files.</Typography> : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="subtitle1">Modifica file: {fileEditorName}</Typography>
                <Button size="small" variant="contained" onClick={saveFile} disabled={savingFileContent}>Salva</Button>
                <Button size="small" variant="outlined" onClick={()=> openFileEditor(fileEditorName)}>Ricarica</Button>
              </Stack>
              <TextField multiline minRows={16} fullWidth value={fileContent} onChange={e=> setFileContent(e.target.value)} />
            </Stack>
          )}
        </CardContent></Card>
      )}
    </Stack>
  );
};

export default PipelinePanel;
