import React, { useEffect, useState } from 'react';
import { apiService } from '../apiService';
import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, LinearProgress, List, ListItem, ListItemText as MUIListItemText,
  Stack, TextField, Typography, Tooltip, Chip, Divider, Paper, Table, TableHead, TableBody, TableRow, TableCell,
  Switch, FormControlLabel, Snackbar, Alert, Menu, MenuItem, Badge, ListItemIcon, ListItemText,
  Tabs, Tab, InputAdornment, FormControl, InputLabel, Select, Checkbox
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import StorageIcon from '@mui/icons-material/Storage';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import IosShareIcon from '@mui/icons-material/IosShare';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface RagGroup {
  id: number;
  name: string;
  description?: string;
  document_count?: number;
  chunk_count?: number;
  created_at?: string;
}

const RagDocumentsPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<RagGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<RagGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  // Support multi-file upload: keep both legacy single file (first element) and list
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const [advancedView, setAdvancedView] = useState(false);
  const [fixingOrphans, setFixingOrphans] = useState(false);
  const [recoveringGroups, setRecoveringGroups] = useState(false);
  const [cleaningOrphanDocs, setCleaningOrphanDocs] = useState(false);
  const [orphanChunks, setOrphanChunks] = useState<number>(0);
  const [snack, setSnack] = useState<{open:boolean; message:string; severity:'success'|'info'|'warning'|'error'}>({open:false,message:'',severity:'info'});
  const [actionsAnchor, setActionsAnchor] = useState<null | HTMLElement>(null);
  const openActions = Boolean(actionsAnchor);
  const handleOpenActions = (e: React.MouseEvent<HTMLElement>) => setActionsAnchor(e.currentTarget);
  const handleCloseActions = () => setActionsAnchor(null);
  // Tabs / global docs state
  const [tab, setTab] = useState<'collections'|'all'>('collections');
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allSearch, setAllSearch] = useState('');
  const [allGroupFilter, setAllGroupFilter] = useState<number|''>('');
  const [onlyOrphans, setOnlyOrphans] = useState<boolean>(false);
  const [allPage, setAllPage] = useState(0);
  const pageSize = 50;
  // Global quick search
  const [quickSearch, setQuickSearch] = useState('');
  const [quickResults, setQuickResults] = useState<any[]|null>(null);
  const [searching, setSearching] = useState(false);
  // Document actions state
  const [docMenuAnchor, setDocMenuAnchor] = useState<HTMLElement|null>(null);
  const [activeDoc, setActiveDoc] = useState<any|null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetGroup, setTargetGroup] = useState<number|''>('');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [dupTargetGroup, setDupTargetGroup] = useState<number|''>('');
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [chunkSize, setChunkSize] = useState<string>('');
  const [chunkOverlap, setChunkOverlap] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const openDocMenu = (e: React.MouseEvent<HTMLElement>, doc: any) => { setDocMenuAnchor(e.currentTarget); setActiveDoc(doc); };
  const closeDocMenu = () => { setDocMenuAnchor(null); };
  const refreshAfterAction = async () => { if (selectedGroup) { await loadDocuments(selectedGroup); } if (tab==='all') { await loadGlobalDocs(); } };

  const formatBytes = (bytes: number): string => {
    if (!bytes) { return '0 B'; }
    const k = 1024;
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k,i)).toFixed(2))} ${sizes[i]}`;
  };
  const formatDate = (d: string): string => {
    try { return new Date(d).toLocaleString('it-IT'); } catch { return d; }
  };

  const loadAll = async (keepSelection = true) => {
    setLoading(true);
    try {
      const [gRes, sRes] = await Promise.all([
        apiService.listRagGroups(),
        apiService.getRagStats()
      ]);
      // Stato orfani chunks
      try {
        const orphanRes = await apiService.getRagOrphansStatus();
  if (orphanRes.success) { setOrphanChunks(orphanRes.data?.orphan_chunks || 0); }
      } catch {}
      if (gRes.success) {
        const raw = gRes.data as any;
        const gs: RagGroup[] = Array.isArray(raw?.groups) ? raw.groups : (Array.isArray(raw) ? raw : []);
        setGroups(gs);
        if (keepSelection && selectedGroup && !gs.some(g => g.id === selectedGroup)) {
          setSelectedGroup(null);
          setDocuments([]);
        }
      }
  if (sRes.success) { setStats(sRes.data?.stats || sRes.data); }
      if (selectedGroup) {
        loadDocuments(selectedGroup);
      }
  if (tab==='all') { loadGlobalDocs(); }
    } finally { setLoading(false); }
  };

  const loadDocuments = async (gid: number) => {
    setLoading(true);
    try {
      const res = await apiService.listRagDocuments(gid);
      if (res.success) {
        const raw = res.data as any;
        const docs: any[] = Array.isArray(raw?.documents) ? raw.documents : (Array.isArray(raw) ? raw : []);
        setDocuments(docs);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(false); }, []);
  useEffect(() => { if (tab==='all') { loadGlobalDocs(); } }, [tab]);
  useEffect(() => { if (tab==='all') { loadGlobalDocs(); } }, [allSearch, allGroupFilter, allPage]);

  const loadGlobalDocs = async () => {
    try {
      const res = await apiService.listAllRagDocuments({
        search: allSearch || undefined,
        group_id: typeof allGroupFilter==='number' ? allGroupFilter : undefined,
        limit: pageSize,
        offset: allPage * pageSize
      });
      if (res.success) {
        setAllDocs(res.data?.documents || []);
        setAllTotal(res.data?.total || 0);
      }
    } catch {}
  };

  const openCreate = () => { setFormName(''); setFormDesc(''); setCreateOpen(true); };
  const submitCreate = async () => {
  if (!formName.trim()) { return; }
    await apiService.createRagGroup(formName.trim(), formDesc.trim());
    setCreateOpen(false);
    loadAll(false);
  };

  const openEdit = (g: RagGroup) => { setEditGroup(g); setFormName(g.name); setFormDesc(g.description || ''); };
  const submitEdit = async () => {
  if (!editGroup) { return; }
    await apiService.updateRagGroup(editGroup.id, { name: formName, description: formDesc });
    setEditGroup(null);
    loadAll();
  };

  const removeGroup = async (g: RagGroup) => {
  if (!window.confirm(`Eliminare la collezione '${g.name}'?`)) { return; }
    await apiService.deleteRagGroup(g.id);
    if (selectedGroup === g.id) {
      setSelectedGroup(null); setDocuments([]);
    }
    loadAll(false);
  };

  const handleUpload = async () => {
  if (!files.length || !selectedGroup) { return; }
    setUploading(true); setError(null);
    setProgress({ total: files.length, current: 0 });
    let hadError = false;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const res = await apiService.uploadRagDocument(selectedGroup, f);
        if (res.success) {
          const doc = res.data?.document;
          if (res.data?.duplicate) {
            // Se duplicato e già in lista, spostalo in cima
            if (doc) {
              setDocuments(prev => {
                const existing = prev.find(d => d.id === doc.id);
                if (!existing) {
                  return [doc, ...prev];
                }
                const rest = prev.filter(d => d.id !== doc.id);
                return [{ ...existing, updated_at: doc.updated_at || existing.updated_at }, ...rest];
              });
            }
            setSnack({open:true, message:`Documento già presente (riutilizzato): ${f.name}`, severity:'info'});
          } else {
            setSnack({open:true, message:`Caricato: ${f.name}`, severity:'success'});
            if (doc) {
              setDocuments(prev => [doc, ...prev]);
            }
          }
        }
        if (!res.success) {
          hadError = true;
          setError(prev => (prev ? prev + '\n' : '') + `${f.name}: ${res.error || 'Errore upload'}`);
        }
      } catch (e:any) {
        hadError = true;
        setError(prev => (prev ? prev + '\n' : '') + `${f.name}: ${(e && e.message) || 'Errore imprevisto'}`);
      } finally {
        setProgress(p => ({ ...p, current: i + 1 }));
      }
    }
    // Reload documents only once at end if any succeeded
    try {
  if (!hadError) { await loadDocuments(selectedGroup); }
  else { await loadDocuments(selectedGroup); } // still refresh list, some may have uploaded
    } finally {
      setUploading(false);
      setFiles([]);
      setTimeout(() => setProgress({ total: 0, current: 0 }), 500);
    }
  };

  const handleFileSelection = (fileList: FileList | null) => {
  if (!fileList) { return; }
    const arr = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    setFiles(prev => [...prev, ...arr]);
  };

  const removeFileAt = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const removeDocument = async (doc: any) => {
  if (!window.confirm(`Eliminare documento '${doc.filename}'?`)) { return; }
    await apiService.deleteRagDocument(doc.id);
    loadDocuments(selectedGroup!);
  };

  const performQuickSearch = async () => {
    const q = quickSearch.trim();
    if (q.length < 2) { return; }
    setSearching(true);
    try {
      const res = await apiService.searchRagDocuments(q);
      if (res.success) {
        setQuickResults(res.data?.results || []);
      } else {
        setQuickResults([]);
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        {loading && <LinearProgress sx={{ mb:2 }} />}
        {/* Header */}
        <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ xs:'flex-start', sm:'center' }} spacing={2} sx={{ mb:2 }}>
          <Typography variant="h6">RAG Documenti</Typography>
          <FormControlLabel sx={{ ml:0 }} control={<Switch size="small" checked={advancedView} onChange={e=> setAdvancedView(e.target.checked)} />} label="Vista avanzata" />
        </Stack>
        <Tabs value={tab} onChange={(_,v)=> setTab(v)} sx={{ mb:2 }}>
          <Tab label="Collezioni" value="collections" />
          <Tab label="Tutti i Documenti" value="all" />
        </Tabs>
        {/* Stats full-width in advanced view */}
        {stats && advancedView && (
          <Grid container spacing={1} sx={{ mb:2 }}>
    <Grid item xs={6} md={3}>
              <Paper variant="outlined" sx={{ p:1.2, display:'flex', alignItems:'center', gap:1 }}>
                <FolderIcon fontSize="small" color="primary" />
                <Box>
                  <Typography variant="caption" sx={{ lineHeight:1 }}>Gruppi</Typography>
                  <Typography variant="body2" fontWeight={600}>{stats.total_groups}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper variant="outlined" sx={{ p:1.2, display:'flex', alignItems:'center', gap:1 }}>
                <DescriptionIcon fontSize="small" color="success" />
                <Box>
                  <Typography variant="caption" sx={{ lineHeight:1 }}>Documenti</Typography>
                  <Typography variant="body2" fontWeight={600}>{stats.total_documents}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper variant="outlined" sx={{ p:1.2, display:'flex', alignItems:'center', gap:1 }}>
                <StorageIcon fontSize="small" color="info" />
                <Box>
                  <Typography variant="caption" sx={{ lineHeight:1 }}>Chunks</Typography>
      <Typography variant="body2" fontWeight={600}>{stats.total_chunks}{typeof orphanChunks==='number' && orphanChunks>0 && <Badge color="warning" badgeContent={orphanChunks} sx={{ ml:1 }} />}</Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={6} md={3}>
              <Paper variant="outlined" sx={{ p:1.2, display:'flex', alignItems:'center', gap:1 }}>
                <AnalyticsIcon fontSize="small" color="warning" />
                <Box>
                  <Typography variant="caption" sx={{ lineHeight:1 }}>Dimensione</Typography>
                  <Typography variant="body2" fontWeight={600}>{formatBytes(stats.total_size_bytes || 0)}</Typography>
                </Box>
              </Paper>
            </Grid>
            {(stats.embedding_model || stats.embedding_dimension) && (
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Embedding: {stats.embedding_model} ({stats.embedding_dimension})</Typography>
              </Grid>
            )}
          </Grid>
        )}
        {stats && !advancedView && (
          <Typography variant="caption" color="text.secondary" sx={{ display:'block', mb:1 }}>Totali: gruppi {stats.total_groups}, documenti {stats.total_documents}, chunks {stats.total_chunks}{orphanChunks>0?` (orfani: ${orphanChunks})`:''}</Typography>
        )}
  {tab==='collections' && (
  <Stack direction={{ xs:'column', md:'row' }} spacing={2} alignItems={{ md:'flex-start' }}>
          {/* Collezioni */}
          <Box sx={{ flex:1, minWidth:260 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:1 }}>
              <Typography variant="subtitle1">Collezioni</Typography>
              <Box>
                <IconButton size="small" onClick={()=> loadAll()}><RefreshIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={openCreate}><AddIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={handleOpenActions}>
                  <Badge color="warning" variant={orphanChunks>0? 'standard':'dot'} invisible={orphanChunks===0} badgeContent={orphanChunks>0? orphanChunks: undefined}>
                    <MoreVertIcon fontSize="small" />
                  </Badge>
                </IconButton>
                <Menu anchorEl={actionsAnchor} open={openActions} onClose={handleCloseActions}>
                  <MenuItem disabled={recoveringGroups} onClick={async ()=> { handleCloseActions(); setRecoveringGroups(true); try { const res = await apiService.recoverRagGroups(); if (res.success) { setSnack({open:true,message:`Gruppi recuperati: ${res.data?.created||0}`,severity:'success'}); await loadAll(false);} else { setSnack({open:true,message:`Errore recupero gruppi`,severity:'error'});} } finally { setRecoveringGroups(false);} }}>
                    <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Recupera gruppi mancanti" />
                  </MenuItem>
                  <MenuItem disabled={fixingOrphans} onClick={async ()=> { handleCloseActions(); setFixingOrphans(true); try { const res = await apiService.fixRagOrphans(); if (res.success) { setSnack({open:true,message:`Documenti orfani spostati: ${res.data?.moved||0}`,severity:'success'}); await loadAll(false);} } finally { setFixingOrphans(false);} }}>
                    <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Riassegna documenti orfani" />
                  </MenuItem>
                  <MenuItem disabled={cleaningOrphanDocs} onClick={async ()=> { handleCloseActions(); if (!window.confirm('Eliminare tutti i documenti orfani?')) return; setCleaningOrphanDocs(true); try { const res = await apiService.cleanupRagOrphanDocuments(); if (res.success) { const n = (res.data?.deleted ?? 0); setSnack({open:true,message:`Documenti orfani eliminati: ${n}`,severity:'success'}); await loadAll(); } else { setSnack({open:true,message:'Errore eliminazione documenti orfani',severity:'error'});} } catch { setSnack({open:true,message:'Errore eliminazione documenti orfani',severity:'error'});} finally { setCleaningOrphanDocs(false);} }}>
                    <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Elimina documenti orfani" />
                  </MenuItem>
                  <MenuItem disabled={orphanChunks===0} onClick={async ()=> {
                    handleCloseActions();
                    if (!window.confirm(`Eliminare ${orphanChunks} chunks orfani?`)) { return; }
                    try {
                      const res = await apiService.cleanupRagOrphanChunks();
                      if (res.success) {
                        setSnack({open:true,message:`Chunks eliminati: ${res.data?.removed||0}`,severity:'success'});
                        await loadAll();
                      }
                    } catch {
                      setSnack({open:true,message:'Errore eliminazione chunks orfani',severity:'error'});
                    }
                  }}>
                    <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary={orphanChunks>0?`Elimina ${orphanChunks} chunks orfani`:'Nessun chunk orfano'} />
                  </MenuItem>
                </Menu>
              </Box>
            </Stack>
            <List dense sx={{ maxHeight: 300, overflowY:'auto', border: '1px solid #eee', borderRadius:1 }}>
              <ListItem divider sx={{ gap:1 }}>
                <TextField size="small" fullWidth placeholder="Cerca documento globale" value={quickSearch} onChange={e=> setQuickSearch(e.target.value)} onKeyDown={e=> { if (e.key==='Enter') { (e.target as HTMLInputElement).blur(); performQuickSearch(); } }} />
                <Tooltip title="Cerca"><span><IconButton size="small" disabled={searching || quickSearch.trim().length<2} onClick={()=> performQuickSearch()}><FindInPageIcon fontSize="inherit" /></IconButton></span></Tooltip>
              </ListItem>
                {groups.map(g => (
                <ListItem key={g.id} selected={g.id===selectedGroup} secondaryAction={
                  <Box>
                    <Tooltip title="Modifica"><IconButton size="small" onClick={()=> openEdit(g)}><EditIcon fontSize="inherit" /></IconButton></Tooltip>
                    <Tooltip title="Elimina"><IconButton size="small" onClick={()=> removeGroup(g)}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                  </Box>
                } button onClick={()=> { setSelectedGroup(g.id); loadDocuments(g.id); }}>
                  <MUIListItemText primary={g.name} secondary={g.description || `${g.document_count||0} doc / ${g.chunk_count||0} chunks`} />
                </ListItem>
              ))}
              {groups.length===0 && <ListItem><MUIListItemText primary="Nessuna collezione" /></ListItem>}
              {quickResults && (
                <>
                  <Divider />
                  {quickResults.length===0 && <ListItem><MUIListItemText primary="Nessun risultato" /></ListItem>}
                  {quickResults.map(r => (
                    <ListItem key={`sr-${r.id}`} button onClick={()=> { setSelectedGroup(r.group_id); loadDocuments(r.group_id); setQuickResults(null); setQuickSearch(''); }}>
                      <MUIListItemText primary={r.filename} secondary={`ID ${r.id} • gruppo ${r.group_name||r.group_id||'-'} • ${r.chunk_count} chunks`} />
                    </ListItem>
                  ))}
                </>
              )}
            </List>
          </Box>

    {/* Documenti */}
          <Box sx={{ flex:2 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb:1 }}>
              <Typography variant="subtitle1">Documenti {selectedGroup && groups.find(g=>g.id===selectedGroup)?.name}</Typography>
              {selectedGroup && (
                <>
                  <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon />}>Scegli PDF(s)
                    <input hidden type="file" multiple accept="application/pdf" onChange={e=> { handleFileSelection(e.target.files); e.target.value=''; }} />
                  </Button>
                  <Button size="small" variant="contained" disabled={!files.length || uploading} onClick={handleUpload}>{uploading ? `Carico ${progress.current}/${progress.total}` : (files.length > 1 ? `Upload ${files.length} file` : 'Upload')}</Button>
                </>
              )}
            </Stack>
            {files.length > 0 && !uploading && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb:1 }}>
                {files.map((f, idx) => (
                  <Chip key={idx} label={f.name} onDelete={() => removeFileAt(idx)} size="small" />
                ))}
              </Stack>
            )}
            {uploading && (
              <Box sx={{ mb:1 }}>
                <LinearProgress variant={progress.total ? 'determinate' : 'indeterminate'} value={progress.total ? (progress.current / progress.total) * 100 : undefined} />
                <Typography variant="caption">Uploading {progress.current}/{progress.total}</Typography>
              </Box>
            )}
            {error && <Typography variant="body2" color="error" sx={{ whiteSpace:'pre-line', mb:1 }}>{error}</Typography>}
            {!advancedView && (
        <List dense sx={{ maxHeight: 300, overflowY:'auto', border: '1px solid #eee', borderRadius:1 }}>
                {documents.map(doc => (
                  <ListItem key={doc.id} secondaryAction={
                    <Tooltip title="Elimina"><IconButton size="small" onClick={()=> removeDocument(doc)}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                  }>
          <MUIListItemText primary={doc.filename} secondary={`${doc.chunk_count||0} chunks • ${(doc.file_size/1024).toFixed(1)} KB`} />
                  </ListItem>
                ))}
        {selectedGroup && documents.length===0 && <ListItem><MUIListItemText primary="Nessun documento" /></ListItem>}
        {!selectedGroup && <ListItem><MUIListItemText primary="Seleziona una collezione" /></ListItem>}
              </List>
            )}
            {advancedView && (
              <Paper variant="outlined" sx={{ maxHeight: 340, overflow:'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Nome File</TableCell>
                      <TableCell>Dimensione</TableCell>
                      <TableCell>Chunks</TableCell>
                      <TableCell>Data</TableCell>
                      <TableCell align="right">Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.map(doc => {
                      const short = (doc.chunk_count||0) <= 1;
                      return (
                        <TableRow key={doc.id} hover selected={activeDoc && activeDoc.id===doc.id}>
                          <TableCell sx={{ maxWidth:240 }}>
                            <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                              {short && <Tooltip title="Estratto poco testo – valuta Reprocess"><WarningAmberIcon color="warning" fontSize="inherit" /></Tooltip>}
                              <span>{doc.filename}</span>
                              {doc.archived ? <Tooltip title="Archiviato"><ArchiveIcon fontSize="inherit" color="disabled" /></Tooltip> : null}
                            </Box>
                          </TableCell>
                          <TableCell>{formatBytes(doc.file_size || 0)}</TableCell>
                          <TableCell>{doc.chunk_count || 0}</TableCell>
                          <TableCell>{doc.updated_at ? formatDate(doc.updated_at) : (doc.created_at ? formatDate(doc.created_at) : '-')}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Azioni"><IconButton size="small" onClick={(e)=> openDocMenu(e, doc)}><MoreVertIcon fontSize="inherit" /></IconButton></Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {selectedGroup && documents.length===0 && (
                      <TableRow><TableCell colSpan={5} align="center">Nessun documento</TableCell></TableRow>
                    )}
                    {!selectedGroup && (
                      <TableRow><TableCell colSpan={5} align="center">Seleziona una collezione</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Paper>
            )}
          </Box>
        </Stack>
        )}
        {tab==='all' && (
          <Box>
            <Stack direction={{ xs:'column', md:'row' }} spacing={2} alignItems={{ md:'flex-start' }} sx={{ mb:2 }}>
              <TextField size="small" label="Cerca" value={allSearch} onChange={e=> { setAllPage(0); setAllSearch(e.target.value); }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
              <FormControl size="small" sx={{ minWidth:220 }}>
                <InputLabel id="rag-all-group-label">Filtro gruppo</InputLabel>
                <Select labelId="rag-all-group-label" value={allGroupFilter} label="Filtro gruppo" onChange={e=> { setAllPage(0); setAllGroupFilter(e.target.value as any); }}>
                  <MenuItem value=""><em>Tutti</em></MenuItem>
                  {groups.map(g=> (
                    <MenuItem key={g.id} value={g.id}>
                      {g.name} ({g.document_count ?? 0} doc / {g.chunk_count ?? 0} ch)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel control={<Checkbox size="small" checked={onlyOrphans} onChange={e=> setOnlyOrphans(e.target.checked)} />} label="Solo orfani" />
              <Stack direction="row" spacing={1}>
                <Chip size="small" variant={orphanChunks>0? 'filled':'outlined'} color={orphanChunks>0? 'warning':'default'} label={`orfani: ${orphanChunks}`} />
                <Button size="small" variant="outlined" onClick={async()=>{ try { const res1 = await apiService.recoverRagGroups(); const res2 = await apiService.fixRagOrphans(); const res3 = await apiService.cleanupRagOrphanChunks(); setSnack({open:true,message:`Riparazione eseguita: gruppi+${res1.data?.created||0}, spostati ${res2.data?.moved||0}, chunks rimossi ${res3.data?.removed||0}`,severity:'success'}); await loadAll(false); } catch { setSnack({open:true,message:'Errore riparazione orfani',severity:'error'});} }}>Ripara orfani</Button>
              </Stack>
            </Stack>
            <Paper variant="outlined" sx={{ maxHeight: 480, overflow:'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Gruppo</TableCell>
                    <TableCell>Nome File</TableCell>
                    <TableCell>Chunks</TableCell>
                    <TableCell>Dimensione</TableCell>
                    <TableCell>Data</TableCell>
                    <TableCell align="right">Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allDocs.filter(d => !onlyOrphans || (!d.group_id || !d.group_name)).map(d => {
                    const short = (d.chunk_count||0) <= 1;
                    return (
                      <TableRow key={d.id} hover>
                        <TableCell>{d.id}</TableCell>
                        <TableCell>
                          {d.group_name ? (
                            <span>{d.group_name}</span>
                          ) : (
                            <Chip size="small" color="warning" variant="outlined" label="orfano" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                            {short && <Tooltip title="Estratto poco testo – valuta Reprocess"><WarningAmberIcon color="warning" fontSize="inherit" /></Tooltip>}
                            <span>{d.filename}</span>
                          </Box>
                        </TableCell>
                        <TableCell>{d.chunk_count || 0}</TableCell>
                        <TableCell>{formatBytes(d.file_size||0)}</TableCell>
                        <TableCell>{d.created_at ? formatDate(d.created_at) : '-'}</TableCell>
                        <TableCell align="right">
                          {(!d.group_id || !d.group_name) ? (
                            <>
                              <Tooltip title="Riassegna al gruppo 'Orfani'"><IconButton size="small" onClick={async ()=>{ try { const res = await apiService.reassignRagDocumentToOrphans(d.id); if (res.success) { const flags = res.data || {} as { duplicate_removed?: boolean; already_in_orphans?: boolean }; let msg = "Riassegnato al gruppo 'Orfani'"; if (flags.already_in_orphans) msg = "Già nel gruppo 'Orfani'"; if (flags.duplicate_removed) msg = "Duplicato rimosso (già presente negli 'Orfani')"; setSnack({open:true,message:msg,severity:'success'});
                                  if (!flags.duplicate_removed) { // Solo se esiste ancora il documento dopo la riassegnazione
                                    const doDelete = window.confirm(msg + '. Vuoi eliminarlo ora (eliminazione standard)?');
                                    if (doDelete) {
                                      try { const del = await apiService.deleteRagDocument(d.id); if (del.success) { setSnack({open:true,message:'Documento eliminato',severity:'success'}); } else { setSnack({open:true,message:'Eliminazione standard fallita',severity:'warning'}); } }
                                      catch { setSnack({open:true,message:'Errore eliminazione standard',severity:'error'}); }
                                    }
                                  }
                                  await loadGlobalDocs();
                                } else { setSnack({open:true,message: (res.error || 'Riassegnazione fallita'),severity:'error'}); console.error('Reassign to orphans failed:', res); } } catch (e) { console.error('Reassign to orphans error:', e); setSnack({open:true,message:'Errore riassegnazione',severity:'error'});} }}><SwapHorizIcon fontSize="inherit" /></IconButton></Tooltip>
                              <Tooltip title="Elimina (forzato)"><IconButton size="small" onClick={async ()=>{ if (!window.confirm('Eliminare definitivamente il documento?')) return; try { const res = await apiService.forceDeleteRagDocument(d.id); if (res.success && (res.data?.deleted ?? true)) { setSnack({open:true,message:'Documento eliminato',severity:'success'}); await loadGlobalDocs(); } else { setSnack({open:true,message:'Impossibile eliminare il documento',severity:'warning'}); } } catch { setSnack({open:true,message:'Errore eliminazione',severity:'error'});} }}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                            </>
                          ) : (
                            // Per documenti non orfani, abilita l'eliminazione standard anche da questa vista
                            <Tooltip title="Elimina"><IconButton size="small" onClick={async ()=>{ if (!window.confirm('Eliminare il documento?')) return; try { const res = await apiService.deleteRagDocument(d.id); if (res.success) { setSnack({open:true,message:'Documento eliminato',severity:'success'}); await loadGlobalDocs(); } else { setSnack({open:true,message: res.error || 'Eliminazione fallita',severity:'warning'});} } catch { setSnack({open:true,message:'Errore eliminazione',severity:'error'});} }}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {allDocs.length===0 && (
                    <TableRow><TableCell colSpan={7} align="center">Nessun documento</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt:1 }}>
              <Typography variant="caption">Totale: {allTotal}</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" disabled={allPage===0} onClick={()=> setAllPage(p=> Math.max(0, p-1))}>Prev</Button>
                <Button size="small" disabled={(allPage+1)*pageSize >= allTotal} onClick={()=> setAllPage(p=> p+1)}>Next</Button>
              </Stack>
            </Stack>
          </Box>
        )}

        {/* Dialog creazione */}
        <Dialog open={createOpen} onClose={()=> setCreateOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Nuova collezione</DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Nome" value={formName} onChange={e=> setFormName(e.target.value)} sx={{ mt:1 }} />
            <TextField fullWidth label="Descrizione" multiline minRows={2} value={formDesc} onChange={e=> setFormDesc(e.target.value)} sx={{ mt:2 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={()=> setCreateOpen(false)}>Annulla</Button>
            <Button disabled={!formName.trim()} variant="contained" onClick={submitCreate}>Crea</Button>
          </DialogActions>
        </Dialog>

        {/* Dialog modifica */}
        <Dialog open={!!editGroup} onClose={()=> setEditGroup(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Modifica collezione</DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Nome" value={formName} onChange={e=> setFormName(e.target.value)} sx={{ mt:1 }} />
            <TextField fullWidth label="Descrizione" multiline minRows={2} value={formDesc} onChange={e=> setFormDesc(e.target.value)} sx={{ mt:2 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={()=> setEditGroup(null)}>Annulla</Button>
            <Button disabled={!formName.trim()} variant="contained" onClick={submitEdit}>Salva</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
      {/* Document Actions Menu */}
      <Menu anchorEl={docMenuAnchor} open={Boolean(docMenuAnchor)} onClose={()=> { closeDocMenu(); setActiveDoc(null); }}>
        <MenuItem onClick={()=> { setRenameValue(activeDoc?.filename||''); setRenameOpen(true); closeDocMenu(); }} disabled={!activeDoc}>
          <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Rinomina" />
        </MenuItem>
        <MenuItem onClick={()=> { setTargetGroup(''); setMoveOpen(true); closeDocMenu(); }} disabled={!activeDoc}>
          <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Sposta" />
        </MenuItem>
        <MenuItem onClick={()=> { setDupTargetGroup(''); setDuplicateOpen(true); closeDocMenu(); }} disabled={!activeDoc}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Duplica" />
        </MenuItem>
        <MenuItem onClick={()=> { setChunkSize(''); setChunkOverlap(''); setReprocessOpen(true); closeDocMenu(); }} disabled={!activeDoc}>
          <ListItemIcon><ReplayIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Reprocess" />
        </MenuItem>
        <MenuItem onClick={async ()=> { if (!activeDoc) return; closeDocMenu(); setExporting(true); try { const res = await apiService.exportRagDocument(activeDoc.id); if (res.success) { const blob = new Blob([JSON.stringify(res.data, null, 2)], { type:'application/json' }); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`document_${activeDoc.id}.json`; a.click(); URL.revokeObjectURL(a.href); setSnack({open:true,message:'Export completato',severity:'success'}); } else { setSnack({open:true,message:'Export fallito',severity:'error'}); } } finally { setExporting(false); } }} disabled={!activeDoc || exporting}>
          <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary={exporting? 'Export...' : 'Export JSON'} />
        </MenuItem>
        <MenuItem onClick={async ()=> { if (!activeDoc) return; closeDocMenu(); try { const archived = !activeDoc.archived; const res = await apiService.archiveRagDocument(activeDoc.id, archived); if (res.success) { setSnack({open:true,message: archived? 'Archiviato' : 'Ripristinato',severity:'success'}); await refreshAfterAction(); } } catch { setSnack({open:true,message:'Errore archivio',severity:'error'});} }} disabled={!activeDoc}>
          <ListItemIcon>{activeDoc?.archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primary={activeDoc?.archived ? 'Ripristina' : 'Archivia'} />
        </MenuItem>
        <Divider />
        <MenuItem onClick={async ()=> { if (!activeDoc) return; closeDocMenu(); if (!window.confirm('Eliminare definitivamente il documento?')) return; try { const res = await apiService.forceDeleteRagDocument(activeDoc.id); if (res.success) { setSnack({open:true,message:'Documento eliminato',severity:'success'}); await refreshAfterAction(); } } catch { setSnack({open:true,message:'Errore eliminazione',severity:'error'});} }} disabled={!activeDoc}>
          <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Elimina" />
        </MenuItem>
      </Menu>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onClose={()=> setRenameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rinomina documento</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Nuovo nome" value={renameValue} onChange={e=> setRenameValue(e.target.value)} autoFocus sx={{ mt:1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setRenameOpen(false)}>Annulla</Button>
          <Button disabled={!renameValue.trim()} variant="contained" onClick={async ()=> { if (!activeDoc) return; try { const res = await apiService.renameRagDocument(activeDoc.id, renameValue.trim()); if (res.success) { setSnack({open:true,message:'Rinominato',severity:'success'}); await refreshAfterAction(); } } finally { setRenameOpen(false);} }}>Salva</Button>
        </DialogActions>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveOpen} onClose={()=> setMoveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Sposta documento</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt:1 }}>
            <InputLabel id="move-target-group">Seleziona gruppo</InputLabel>
            <Select labelId="move-target-group" value={targetGroup} label="Seleziona gruppo" onChange={e=> setTargetGroup(e.target.value as any)}>
              {groups.filter(g=> !activeDoc || g.id !== activeDoc.group_id).map(g=> <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setMoveOpen(false)}>Annulla</Button>
          <Button disabled={!(typeof targetGroup==='number')} variant="contained" onClick={async ()=> { if (!activeDoc || typeof targetGroup!=='number') return; try { const res = await apiService.moveRagDocument(activeDoc.id, targetGroup); if (res.success) { setSnack({open:true,message:'Spostato',severity:'success'}); await refreshAfterAction(); } } finally { setMoveOpen(false);} }}>Sposta</Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={duplicateOpen} onClose={()=> setDuplicateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Duplica documento</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt:1 }}>
            <InputLabel id="dup-target-group">Gruppo destinazione</InputLabel>
            <Select labelId="dup-target-group" value={dupTargetGroup} label="Gruppo destinazione" onChange={e=> setDupTargetGroup(e.target.value as any)}>
              {groups.map(g=> <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setDuplicateOpen(false)}>Annulla</Button>
          <Button disabled={!(typeof dupTargetGroup==='number')} variant="contained" onClick={async ()=> { if (!activeDoc || typeof dupTargetGroup!=='number') return; try { const res = await apiService.duplicateRagDocument(activeDoc.id, dupTargetGroup); if (res.success) { setSnack({open:true,message:'Duplicato',severity:'success'}); await refreshAfterAction(); } } finally { setDuplicateOpen(false);} }}>Duplica</Button>
        </DialogActions>
      </Dialog>

      {/* Reprocess Dialog */}
      <Dialog open={reprocessOpen} onClose={()=> setReprocessOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reprocess documento</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt:1 }}>
            <TextField label="Chunk size (opzionale)" value={chunkSize} onChange={e=> setChunkSize(e.target.value)} size="small" />
            <TextField label="Chunk overlap (opzionale)" value={chunkOverlap} onChange={e=> setChunkOverlap(e.target.value)} size="small" />
            <Typography variant="caption" color="text.secondary">Lascia vuoto per usare i valori di default. Usa se il documento è stato estratto con poco testo.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setReprocessOpen(false)}>Annulla</Button>
          <Button variant="contained" onClick={async ()=> { if (!activeDoc) return; try { const payload:any = {}; if (chunkSize.trim()) payload.chunk_size = parseInt(chunkSize,10); if (chunkOverlap.trim()) payload.chunk_overlap = parseInt(chunkOverlap,10); const res = await apiService.reprocessRagDocument(activeDoc.id, payload); if (res.success) { setSnack({open:true,message:`Reprocess OK (${res.data?.chunk_count} chunks)`,severity:'success'}); await refreshAfterAction(); } else { setSnack({open:true,message:'Reprocess fallito',severity:'error'});} } finally { setReprocessOpen(false);} }}>Avvia</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={()=> setSnack(s=>({...s,open:false}))} anchorOrigin={{ vertical:'bottom', horizontal:'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={()=> setSnack(s=>({...s,open:false}))}>{snack.message}</Alert>
      </Snackbar>
    </Card>
  );
};

export default RagDocumentsPanel;
