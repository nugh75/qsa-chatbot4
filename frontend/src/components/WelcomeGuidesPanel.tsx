import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemSecondaryAction, ListItemText, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, RadioButtonUnchecked as InactiveIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { apiService } from '../apiService';

interface WGItem { id: string; title?: string|null; content: string }

const WelcomeGuidesPanel: React.FC = () => {
  const [welcome, setWelcome] = useState<WGItem[]>([]);
  const [guides, setGuides] = useState<WGItem[]>([]);
  const [activeWelcome, setActiveWelcome] = useState<string|null>(null);
  const [activeGuide, setActiveGuide] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [kind, setKind] = useState<'welcome'|'guide'>('welcome');
  const [editId, setEditId] = useState<string|null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string|null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const st = await apiService.getWelcomeGuideState();
      if (st.success && st.data) {
        const w = st.data.welcome || { active_id: null, messages: [] };
        const g = st.data.guides || { active_id: null, guides: [] };
        setWelcome(Array.isArray(w.messages) ? w.messages : []);
        setGuides(Array.isArray(g.guides) ? g.guides : []);
        setActiveWelcome(w.active_id || null);
        setActiveGuide(g.active_id || null);
      } else setError(st.error||'Errore caricamento stato');
    } finally { setLoading(false); }
  };

  useEffect(()=>{ loadAll(); }, []);

  const openCreate = (k: 'welcome'|'guide') => {
    setKind(k); setEditId(null); setTitle(''); setContent(''); setDialogOpen(true); setError(null);
  };
  const openEdit = (k: 'welcome'|'guide', item: WGItem) => {
    setKind(k); setEditId(item.id); setTitle(item.title||''); setContent(item.content); setDialogOpen(true); setError(null);
  };
  const handleSave = async () => {
    if (!content.trim()) { setError('Contenuto richiesto'); return; }
    const payload = { title: title.trim() || undefined, content };
    let res;
    if (editId) {
      res = kind==='welcome' ? await apiService.updateWelcomeMessage(editId, payload) : await apiService.updateGuide(editId, payload);
    } else {
      res = kind==='welcome' ? await apiService.createWelcomeMessage(payload) : await apiService.createGuide(payload);
    }
    if (!res.success) { setError(res.error||'Errore salvataggio'); return; }
    setDialogOpen(false); loadAll();
  };
  const handleDelete = async (k:'welcome'|'guide', id:string) => {
    if (!confirm('Confermi eliminazione?')) return;
    const res = k==='welcome' ? await apiService.deleteWelcomeMessage(id) : await apiService.deleteGuide(id);
    if (res.success) loadAll();
  };
  const handleActivate = async (k:'welcome'|'guide', id:string) => {
    const res = k==='welcome' ? await apiService.activateWelcome(id) : await apiService.activateGuide(id);
    if (res.success) loadAll();
  };

  const listBlock = (label:string, items:WGItem[], activeId:string|null, k:'welcome'|'guide') => (
    <Card variant="outlined" sx={{ flex:1, minWidth: 0 }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb:1 }}>
          <Typography variant="subtitle1">{label}</Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Ricarica"><span><IconButton size="small" onClick={loadAll} disabled={loading}><RefreshIcon fontSize="small" /></IconButton></span></Tooltip>
            <Button size="small" startIcon={<AddIcon />} onClick={()=> openCreate(k)}>Nuovo</Button>
          </Stack>
        </Stack>
        {items.length === 0 && <Typography variant="body2" color="text.secondary">Nessun elemento</Typography>}
        <List dense>
          {items.map(it => (
            <ListItem key={it.id} sx={{ alignItems:'flex-start' }}>
              <ListItemText primary={<Stack direction="row" spacing={1} alignItems="center">
                {activeId===it.id ? <CheckIcon color="success" fontSize="small" /> : <InactiveIcon fontSize="small" color="disabled" />}
                <Typography variant="body2" fontWeight={500}>{it.title || it.id}</Typography>
                {activeId===it.id && <Chip size="small" color="success" label="attivo" />}
              </Stack>} secondary={<Typography variant="caption" sx={{ whiteSpace:'pre-wrap' }}>{it.content.slice(0,160)}{it.content.length>160?'…':''}</Typography>} />
              <ListItemSecondaryAction>
                {/* Rimosso pulsante attiva per welcome/guide: l'associazione avviene nella personalità */}
                {(k==='guide' || k==='welcome') && (
                  <Tooltip title="Attiva"><span><IconButton size="small" onClick={()=> handleActivate(k,it.id)} disabled={activeId===it.id}><CheckIcon fontSize="small" /></IconButton></span></Tooltip>
                )}
                <Tooltip title="Modifica"><IconButton size="small" onClick={()=> openEdit(k,it)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Elimina"><IconButton size="small" onClick={()=> handleDelete(k,it.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Typography variant="body2" sx={{ mb:2 }}>
        Gestisci molteplici messaggi di benvenuto e guide di onboarding. Il primo creato diventa attivo automaticamente se non esiste ancora un attivo.
      </Typography>
      <Stack direction={{ xs:'column', md:'row' }} spacing={2}>
        {listBlock('Welcome Messages', welcome, activeWelcome, 'welcome')}
        {listBlock('Guides', guides, activeGuide, 'guide')}
      </Stack>
      <Dialog open={dialogOpen} onClose={()=> setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editId ? 'Modifica' : 'Nuovo'} {kind === 'welcome' ? 'Welcome' : 'Guida'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt:1 }}>
            <TextField label="Titolo (opzionale)" value={title} onChange={e=> setTitle(e.target.value)} size="small" />
            <TextField label="Contenuto" value={content} onChange={e=> setContent(e.target.value)} multiline minRows={5} />
            {error && <Typography variant="caption" color="error">{error}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" onClick={handleSave}>Salva</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WelcomeGuidesPanel;
