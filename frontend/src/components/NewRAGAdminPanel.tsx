import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Chip,
  IconButton,
  Divider
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Folder as FolderIcon,
  Description as DocumentIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';

// Import dei nostri hook e componenti
import useRAGGroups from './rag-admin/hooks/useRAGGroups';
import useRAGDocuments from './rag-admin/hooks/useRAGDocuments';
import useRAGChunks from './rag-admin/hooks/useRAGChunks';
import useRAGStats from './rag-admin/hooks/useRAGStats';
import RAGGroupsPanel from './rag-admin/components/RAGGroupsPanel';
import RAGDocumentsPanel from './rag-admin/components/RAGDocumentsPanel';
import RAGChunksPanel from './rag-admin/components/RAGChunksPanel';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`rag-tabpanel-${index}`}
      aria-labelledby={`rag-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function NewRAGAdminPanel() {
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Dialog states
  const [createGroupDialog, setCreateGroupDialog] = useState(false);
  const [editGroupDialog, setEditGroupDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [cleanupDialog, setCleanupDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(false);

  // Hooks per gestire i dati
  const ragGroups = useRAGGroups();
  const ragDocuments = useRAGDocuments();
  const ragChunks = useRAGChunks();
  const ragStats = useRAGStats();

  // Carica i dati iniziali
  useEffect(() => {
    ragGroups.refresh();
    ragStats.refresh();
  }, []);

  // Gestione cambio tab
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Gestione snackbar
  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const closeSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  // Gestione creazione gruppo
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      showSnackbar('Il nome del gruppo è obbligatorio', 'error');
      return;
    }

    const success = await ragGroups.create(groupName.trim(), groupDescription.trim() || undefined);
    if (success) {
      showSnackbar('Gruppo creato con successo');
      setCreateGroupDialog(false);
      setGroupName('');
      setGroupDescription('');
      ragStats.refresh(); // Aggiorna le statistiche
    } else {
      showSnackbar('Errore durante la creazione del gruppo', 'error');
    }
  };

  // Gestione modifica gruppo
  const handleEditGroup = async () => {
    if (!ragGroups.selectedGroup || !groupName.trim()) {
      showSnackbar('Dati gruppo non validi', 'error');
      return;
    }

    const success = await ragGroups.update(
      ragGroups.selectedGroup,
      groupName.trim(),
      groupDescription.trim() || undefined
    );
    
    if (success) {
      showSnackbar('Gruppo aggiornato con successo');
      setEditGroupDialog(false);
      setGroupName('');
      setGroupDescription('');
      ragStats.refresh();
    } else {
      showSnackbar('Errore durante l\'aggiornamento del gruppo', 'error');
    }
  };

  // Gestione eliminazione gruppo
  const handleDeleteGroup = async (groupId: number, groupName: string) => {
    const success = await ragGroups.remove(groupId);
    if (success) {
      showSnackbar(`Gruppo "${groupName}" eliminato con successo`);
      ragStats.refresh();
    } else {
      showSnackbar('Errore durante l\'eliminazione del gruppo', 'error');
    }
  };

  // Gestione upload file
  const handleUploadFiles = async () => {
    if (!ragGroups.selectedGroup || uploadFiles.length === 0) {
      showSnackbar('Seleziona una collezione e almeno un file', 'error');
      return;
    }

    setUploadProgress(true);
    try {
      const response = await fetch('/api/rag/upload-multi', {
        method: 'POST',
        body: (() => {
          const form = new FormData();
          form.append('group_id', String(ragGroups.selectedGroup.id));
          uploadFiles.forEach(file => form.append('files', file));
          return form;
        })(),
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.success) {
        showSnackbar(`Caricati ${result.processed_files || uploadFiles.length} file con successo`);
        setUploadDialog(false);
        setUploadFiles([]);
        ragDocuments.refresh(ragGroups.selectedGroup.id);
        ragGroups.refresh(); // Aggiorna le statistiche
        ragStats.refresh();
      } else {
        showSnackbar(result.error || 'Errore durante il caricamento', 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showSnackbar('Errore di rete durante il caricamento', 'error');
    } finally {
      setUploadProgress(false);
    }
  };

  // Gestione cleanup chunk orfani
  const handleCleanupOrphans = async () => {
    try {
      const response = await fetch('/api/rag/chunks/cleanup-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.success) {
        showSnackbar(`Rimossi ${result.deleted_chunks || 0} chunk orfani`);
        setCleanupDialog(false);
        ragStats.refresh();
        if (ragGroups.selectedGroup) {
          ragChunks.refresh(ragGroups.selectedGroup.id);
        }
      } else {
        showSnackbar(result.error || 'Errore durante la pulizia', 'error');
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      showSnackbar('Errore di rete durante la pulizia', 'error');
    }
  };

  // Gestione selezione gruppo
  const handleSelectGroup = (group: any) => {
    ragGroups.setSelectedGroup(group);
    ragDocuments.refresh(group.id);
    ragChunks.refresh(group.id);
  };

  // Gestione apertura dialog modifica
  const handleOpenEditDialog = (group: any) => {
    ragGroups.setSelectedGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setEditGroupDialog(true);
  };

  // Dashboard Statistics Component
  const DashboardPanel = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5">Dashboard RAG</Typography>
          <IconButton onClick={ragStats.refresh} disabled={ragStats.loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Grid>

      {ragStats.loading ? (
        <Grid item xs={12} display="flex" justifyContent="center">
          <CircularProgress />
        </Grid>
      ) : ragStats.stats ? (
        <>
          {/* Statistiche principali */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Gruppi Totali
                </Typography>
                <Typography variant="h4">
                  {ragStats.stats.total_groups}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Documenti Totali
                </Typography>
                <Typography variant="h4">
                  {ragStats.stats.total_documents}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Chunks Totali
                </Typography>
                <Typography variant="h4">
                  {ragStats.stats.total_chunks}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Dimensione Totale
                </Typography>
                <Typography variant="h4">
                  {(ragStats.stats.total_size_bytes / 1024 / 1024).toFixed(1)} MB
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Dettagli embedding */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Modello Embedding" />
              <CardContent>
                <Typography><strong>Modello:</strong> {ragStats.stats.embedding_model}</Typography>
                <Typography><strong>Dimensioni:</strong> {ragStats.stats.embedding_dimension}</Typography>
                <Typography><strong>Dimensione media chunk:</strong> {ragStats.stats.average_chunk_size} caratteri</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Breakdown per gruppo */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title="Gruppi" />
              <CardContent>
                {ragStats.stats.group_breakdown.map((group, index) => (
                  <Box key={index} mb={1}>
                    <Typography variant="subtitle2">{group.group_name}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      {group.documents} documenti, {group.chunks} chunks
                    </Typography>
                    {index < ragStats.stats!.group_breakdown.length - 1 && <Divider sx={{ my: 1 }} />}
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </>
      ) : (
        <Grid item xs={12}>
          <Alert severity="error">Errore nel caricamento delle statistiche</Alert>
        </Grid>
      )}
    </Grid>
  );

  return (
    <Container maxWidth="xl">
      <Box sx={{ mt: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Amministrazione RAG
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Gestisci collezioni, documenti e chunks del sistema RAG
        </Typography>
      </Box>

      <Paper sx={{ width: '100%', mb: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          aria-label="RAG Admin Tabs"
          variant="fullWidth"
        >
          <Tab icon={<DashboardIcon />} label="Dashboard" />
          <Tab icon={<FolderIcon />} label="Collezioni" />
          <Tab icon={<DocumentIcon />} label="Documenti" />
          <Tab icon={<SettingsIcon />} label="Chunks" />
        </Tabs>

        {/* Tab Dashboard */}
        <TabPanel value={activeTab} index={0}>
          <DashboardPanel />
        </TabPanel>

        {/* Tab Collezioni */}
        <TabPanel value={activeTab} index={1}>
          <RAGGroupsPanel
            groups={ragGroups.groups}
            onCreate={() => setCreateGroupDialog(true)}
            onEdit={handleOpenEditDialog}
            onSelect={handleSelectGroup}
            selectedGroupId={ragGroups.selectedGroup?.id || null}
            onExport={ragGroups.exportGroup}
            onDelete={handleDeleteGroup}
          />
          {ragGroups.loading && (
            <Box display="flex" justifyContent="center" mt={2}>
              <CircularProgress />
            </Box>
          )}
          {ragGroups.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {ragGroups.error}
            </Alert>
          )}
        </TabPanel>

        {/* Tab Documenti */}
        <TabPanel value={activeTab} index={2}>
          {ragGroups.selectedGroup ? (
            <Box>
              <Card>
                <CardHeader
                  title={`Documenti in "${ragGroups.selectedGroup.name}"`}
                  action={
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => setUploadDialog(true)}
                      size="small"
                    >
                      Carica Documenti
                    </Button>
                  }
                />
                <CardContent>
                  <RAGDocumentsPanel
                    groupName={ragGroups.selectedGroup.name}
                    documents={ragDocuments.documents}
                    selectedDocuments={new Set()}
                    onToggleSelect={() => {}}
                    onToggleSelectAll={() => {}}
                    formatBytes={(bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`}
                    formatDate={(date: string) => new Date(date).toLocaleDateString('it-IT')}
                    onUploadClick={() => setUploadDialog(true)}
                    onDeleteDocument={() => {}}
                  />
                </CardContent>
              </Card>
              {ragDocuments.loading && (
                <Box display="flex" justifyContent="center" mt={2}>
                  <CircularProgress />
                </Box>
              )}
              {ragDocuments.error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {ragDocuments.error}
                </Alert>
              )}
            </Box>
          ) : (
            <Alert severity="info" icon={<InfoIcon />}>
              Seleziona una collezione per visualizzare i documenti
            </Alert>
          )}
        </TabPanel>

        {/* Tab Chunks */}
        <TabPanel value={activeTab} index={3}>
          {ragGroups.selectedGroup ? (
            <Box>
              <Card>
                <CardHeader
                  title={`Chunks in "${ragGroups.selectedGroup.name}"`}
                  action={
                    <Button
                      variant="outlined"
                      color="warning"
                      onClick={() => setCleanupDialog(true)}
                      size="small"
                    >
                      Pulisci Orfani
                    </Button>
                  }
                />
                <CardContent>
                  <RAGChunksPanel
                    groupName={ragGroups.selectedGroup.name}
                    chunks={ragChunks.chunks}
                    loading={ragChunks.loading}
                    searchTerm={ragChunks.searchTerm}
                    onSearchTermChange={ragChunks.setSearchTerm}
                    onSearch={() => ragChunks.search(ragGroups.selectedGroup?.id)}
                    selected={ragChunks.selected}
                    onToggleSelect={ragChunks.toggleSelect}
                    onToggleSelectAll={ragChunks.toggleSelectAll}
                    onView={() => {}}
                    onEdit={() => {}}
                    onDelete={ragChunks.deleteOne}
                    pagination={ragChunks.pagination}
                    onPageChange={ragChunks.setPage}
                    onQualityAnalysis={() => {}}
                    onCleanupOrphans={() => setCleanupDialog(true)}
                  />
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Alert severity="info" icon={<InfoIcon />}>
              Seleziona una collezione per visualizzare i chunks
            </Alert>
          )}
        </TabPanel>
      </Paper>

      {/* Dialog Creazione Gruppo */}
      <Dialog open={createGroupDialog} onClose={() => setCreateGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crea Nuova Collezione</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome Collezione"
            fullWidth
            variant="outlined"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Descrizione (opzionale)"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateGroupDialog(false)}>Annulla</Button>
          <Button onClick={handleCreateGroup} variant="contained" disabled={!groupName.trim()}>
            Crea
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modifica Gruppo */}
      <Dialog open={editGroupDialog} onClose={() => setEditGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifica Collezione</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome Collezione"
            fullWidth
            variant="outlined"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Descrizione (opzionale)"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditGroupDialog(false)}>Annulla</Button>
          <Button onClick={handleEditGroup} variant="contained" disabled={!groupName.trim()}>
            Salva
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Upload File */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Carica Documenti</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Seleziona uno o più file da caricare nella collezione "{ragGroups.selectedGroup?.name}"
            </Typography>
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,.docx"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setUploadFiles(files);
              }}
              style={{ 
                width: '100%', 
                padding: '12px', 
                border: '2px dashed #ccc',
                borderRadius: '8px',
                marginTop: '8px'
              }}
            />
          </Box>
          
          {uploadFiles.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                File selezionati ({uploadFiles.length}):
              </Typography>
              {uploadFiles.map((file, index) => (
                <Chip
                  key={index}
                  label={`${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`}
                  onDelete={() => {
                    setUploadFiles(files => files.filter((_, i) => i !== index));
                  }}
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
          )}

          {uploadProgress && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Typography variant="body2">Caricamento in corso...</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)} disabled={uploadProgress}>
            Annulla
          </Button>
          <Button 
            onClick={handleUploadFiles} 
            variant="contained" 
            disabled={uploadFiles.length === 0 || uploadProgress}
          >
            Carica {uploadFiles.length > 0 ? `${uploadFiles.length} file` : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Cleanup Chunk Orfani */}
      <Dialog open={cleanupDialog} onClose={() => setCleanupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pulisci Chunk Orfani</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Questa operazione rimuoverà permanentemente tutti i chunk che non sono più associati a documenti esistenti.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            I chunk orfani possono formarsi quando i documenti vengono eliminati ma i chunk corrispondenti rimangono nel database.
            Questa operazione aiuta a mantenere pulito il database e liberare spazio.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupDialog(false)}>Annulla</Button>
          <Button onClick={handleCleanupOrphans} variant="contained" color="warning">
            Pulisci Orfani
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar per notifiche */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={closeSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={closeSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
