import React, { useEffect, useState } from 'react';
import { apiService } from '../apiService';
import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, LinearProgress, List, ListItem, ListItemText, MenuItem, Select,
  Stack, TextField, Typography, Tooltip, Chip, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';

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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async (keepSelection = true) => {
    setLoading(true);
    try {
      const [gRes, sRes] = await Promise.all([
        apiService.listRagGroups(),
        apiService.getRagStats()
      ]);
      if (gRes.success) {
        const raw = gRes.data as any;
        const gs: RagGroup[] = Array.isArray(raw?.groups) ? raw.groups : (Array.isArray(raw) ? raw : []);
        setGroups(gs);
        if (keepSelection && selectedGroup) {
          if (!gs.some(g => g.id === selectedGroup)) {
            setSelectedGroup(null);
            setDocuments([]);
          }
        }
      }
      if (sRes.success) setStats(sRes.data?.stats || sRes.data);
      if (selectedGroup) {
        loadDocuments(selectedGroup);
      }
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

  const openCreate = () => { setFormName(''); setFormDesc(''); setCreateOpen(true); };
  const submitCreate = async () => {
    if (!formName.trim()) return;
    await apiService.createRagGroup(formName.trim(), formDesc.trim());
    setCreateOpen(false);
    loadAll(false);
  };

  const openEdit = (g: RagGroup) => { setEditGroup(g); setFormName(g.name); setFormDesc(g.description || ''); };
  const submitEdit = async () => {
    if (!editGroup) return;
    await apiService.updateRagGroup(editGroup.id, { name: formName, description: formDesc });
    setEditGroup(null);
    loadAll();
  };

  const removeGroup = async (g: RagGroup) => {
    if (!window.confirm(`Eliminare la collezione '${g.name}'?`)) return;
    await apiService.deleteRagGroup(g.id);
    if (selectedGroup === g.id) {
      setSelectedGroup(null); setDocuments([]);
    }
    loadAll(false);
  };

  const handleUpload = async () => {
    if (!file || !selectedGroup) return;
    setUploading(true); setError(null);
    try {
      const res = await apiService.uploadRagDocument(selectedGroup, file);
      if (!res.success) setError(res.error || 'Errore upload');
      else loadDocuments(selectedGroup);
    } finally { setUploading(false); setFile(null); }
  };

  const removeDocument = async (doc: any) => {
    if (!window.confirm(`Eliminare documento '${doc.filename}'?`)) return;
    await apiService.deleteRagDocument(doc.id);
    loadDocuments(selectedGroup!);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        {loading && <LinearProgress sx={{ mb:2 }} />}
        <Stack direction={{ xs:'column', md:'row' }} spacing={2} alignItems={{ md:'flex-start' }}>
          {/* Collezioni */}
          <Box sx={{ flex:1, minWidth:260 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:1 }}>
              <Typography variant="subtitle1">Collezioni</Typography>
              <Box>
                <IconButton size="small" onClick={()=> loadAll()}><RefreshIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={openCreate}><AddIcon fontSize="small" /></IconButton>
              </Box>
            </Stack>
            <List dense sx={{ maxHeight: 300, overflowY:'auto', border: '1px solid #eee', borderRadius:1 }}>
              {groups.map(g => (
                <ListItem key={g.id} selected={g.id===selectedGroup} secondaryAction={
                  <Box>
                    <Tooltip title="Modifica"><IconButton size="small" onClick={()=> openEdit(g)}><EditIcon fontSize="inherit" /></IconButton></Tooltip>
                    <Tooltip title="Elimina"><IconButton size="small" onClick={()=> removeGroup(g)}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                  </Box>
                } button onClick={()=> { setSelectedGroup(g.id); loadDocuments(g.id); }}>
                  <ListItemText primary={g.name} secondary={g.description || `${g.document_count||0} doc / ${g.chunk_count||0} chunks`} />
                </ListItem>
              ))}
              {groups.length===0 && <ListItem><ListItemText primary="Nessuna collezione" /></ListItem>}
            </List>
            {stats && (
              <Box sx={{ mt:1 }}>
                <Typography variant="caption" color="text.secondary">Totali: gruppi {stats.total_groups}, documenti {stats.total_documents}, chunks {stats.total_chunks}</Typography>
              </Box>
            )}
          </Box>

          {/* Documenti */}
          <Box sx={{ flex:2 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb:1 }}>
              <Typography variant="subtitle1">Documenti {selectedGroup && groups.find(g=>g.id===selectedGroup)?.name}</Typography>
              {selectedGroup && (
                <>
                  <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon />}>Scegli PDF
                    <input hidden type="file" accept="application/pdf" onChange={e=> setFile(e.target.files?.[0] || null)} />
                  </Button>
                  <Button size="small" variant="contained" disabled={!file || uploading} onClick={handleUpload}>{uploading ? 'Caricamento…' : 'Upload'}</Button>
                  {file && <Typography variant="caption">{file.name}</Typography>}
                </>
              )}
            </Stack>
            {error && <Typography variant="body2" color="error" sx={{ mb:1 }}>{error}</Typography>}
            <List dense sx={{ maxHeight: 300, overflowY:'auto', border: '1px solid #eee', borderRadius:1 }}>
              {documents.map(doc => (
                <ListItem key={doc.id} secondaryAction={
                  <Tooltip title="Elimina"><IconButton size="small" onClick={()=> removeDocument(doc)}><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
                }>
                  <ListItemText primary={doc.filename} secondary={`${doc.chunk_count||0} chunks • ${(doc.file_size/1024).toFixed(1)} KB`} />
                </ListItem>
              ))}
              {selectedGroup && documents.length===0 && <ListItem><ListItemText primary="Nessun documento" /></ListItem>}
              {!selectedGroup && <ListItem><ListItemText primary="Seleziona una collezione" /></ListItem>}
            </List>
          </Box>
        </Stack>

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
    </Card>
  );
};

export default RagDocumentsPanel;
