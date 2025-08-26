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
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  FormControlLabel,
  Checkbox,
  Divider,
  Badge,
  Tooltip,
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Upload as UploadIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  FilePresent as FilePresentIcon,
  CloudUpload as CloudUploadIcon,
  Analytics as AnalyticsIcon,
  Storage as StorageIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

import { apiService } from '../apiService';

interface RAGGroup {
  id: number;
  name: string;
  description: string;
  document_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

interface RAGDocument {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  content_preview: string;
  chunk_count: number;
  created_at: string;
}

interface RAGStats {
  total_groups: number;
  total_documents: number;
  total_chunks: number;
  total_size_bytes: number;
  embedding_model: string;
  embedding_dimension: number;
}

interface ProcessedFile {
  filename: string;
  success: boolean;
  document_id?: number;
  text_length?: number;
  message?: string;
  error?: string;
}

interface SearchResult {
  chunk_id: number;
  content: string;
  chunk_index: number;
  document_id: number;
  filename: string;
  original_filename: string;
  similarity_score: number;
  group_id: number;
}

const RAGManagement: React.FC = () => {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Data state
  const [groups, setGroups] = useState<RAGGroup[]>([]);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<RAGGroup | null>(null);
  const [groupDocuments, setGroupDocuments] = useState<RAGDocument[]>([]);

  // Dialog state
  const [createGroupDialog, setCreateGroupDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [searchDialog, setSearchDialog] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState(false);

  // Form state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadResults, setUploadResults] = useState<ProcessedFile[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchGroups, setSearchGroups] = useState<number[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [groupsRes, statsRes] = await Promise.all([
        apiService.get('/rag/groups'),
        apiService.get('/rag/stats')
      ]);

      if (groupsRes?.data?.groups) {
        setGroups(groupsRes.data.groups);
      }
      if (statsRes?.data?.stats) {
        setStats(statsRes.data.stats);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nel caricamento dati RAG');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupDocuments = async (groupId: number) => {
    try {
      const res = await apiService.get(`/rag/groups/${groupId}/documents`);
      if (res?.data?.documents) {
        setGroupDocuments(res.data.documents);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nel caricamento documenti');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    
    setLoading(true);
    try {
      await apiService.post('/rag/groups', {
        name: newGroupName.trim(),
        description: newGroupDescription.trim()
      });
      
      setMessage('Gruppo creato con successo');
      setCreateGroupDialog(false);
      setNewGroupName('');
      setNewGroupDescription('');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nella creazione gruppo');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: number, groupName: string) => {
    if (!confirm(`Eliminare il gruppo "${groupName}" e tutti i suoi documenti?`)) {
      return;
    }

    setLoading(true);
    try {
      await apiService.delete(`/rag/groups/${groupId}`);
      setMessage('Gruppo eliminato con successo');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nell\'eliminazione gruppo');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedGroup || !selectedFiles || selectedFiles.length === 0) return;

    setUploadProgress(true);
    setUploadResults([]);

    try {
      const formData = new FormData();
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append('files', selectedFiles[i]);
      }

      const res = await apiService.post(`/rag/groups/${selectedGroup.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res?.data?.processed_files) {
        setUploadResults(res.data.processed_files);
        const successCount = res.data.processed_files.filter((f: ProcessedFile) => f.success).length;
        setMessage(`${successCount} file elaborati con successo`);
        await loadData();
        if (selectedGroup) {
          await loadGroupDocuments(selectedGroup.id);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nell\'upload file');
    } finally {
      setUploadProgress(false);
    }
  };

  const handleDeleteDocument = async (documentId: number, filename: string) => {
    if (!confirm(`Eliminare il documento "${filename}"?`)) {
      return;
    }

    try {
      await apiService.delete(`/rag/documents/${documentId}`);
      setMessage('Documento eliminato con successo');
      if (selectedGroup) {
        await loadGroupDocuments(selectedGroup.id);
      }
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nell\'eliminazione documento');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchGroups.length === 0) return;

    setSearchLoading(true);
    try {
      const res = await apiService.post('/rag/search', {
        query: searchQuery.trim(),
        group_ids: searchGroups,
        top_k: 10
      });

      if (res?.data?.results) {
        setSearchResults(res.data.results);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Errore nella ricerca');
    } finally {
      setSearchLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    try {
      return format(parseISO(dateString), 'dd/MM/yyyy HH:mm', { locale: it });
    } catch {
      return dateString;
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3} gap={1}>
        <StorageIcon />
        <Typography variant="h6">Gestione RAG (Retrieval-Augmented Generation)</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={loadData}
          disabled={loading}
        >
          Aggiorna
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <FolderIcon color="primary" sx={{ mr: 1 }} />
                  <Box>
                    <Typography variant="h6">{stats.total_groups}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Gruppi
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <DescriptionIcon color="secondary" sx={{ mr: 1 }} />
                  <Box>
                    <Typography variant="h6">{stats.total_documents}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Documenti
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <MemoryIcon color="info" sx={{ mr: 1 }} />
                  <Box>
                    <Typography variant="h6">{stats.total_chunks}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Chunks
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center">
                  <StorageIcon color="warning" sx={{ mr: 1 }} />
                  <Box>
                    <Typography variant="h6">{formatBytes(stats.total_size_bytes)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Storage
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Groups Management */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Gruppi RAG"
              subheader="Organizza documenti in gruppi tematici"
              action={
                <Box>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setCreateGroupDialog(true)}
                    size="small"
                    sx={{ mr: 1 }}
                  >
                    Nuovo Gruppo
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<SearchIcon />}
                    onClick={() => setSearchDialog(true)}
                    size="small"
                  >
                    Ricerca
                  </Button>
                </Box>
              }
            />
            <CardContent>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Gruppo</TableCell>
                      <TableCell align="center">Documenti</TableCell>
                      <TableCell align="center">Chunks</TableCell>
                      <TableCell align="center">Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {group.name}
                            </Typography>
                            {group.description && (
                              <Typography variant="caption" color="text.secondary">
                                {group.description}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={group.document_count} color="primary" />
                        </TableCell>
                        <TableCell align="center">
                          <Chip size="small" label={group.chunk_count} color="secondary" />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedGroup(group);
                              loadGroupDocuments(group.id);
                              setDetailsDialog(true);
                            }}
                          >
                            <SettingsIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedGroup(group);
                              setUploadDialog(true);
                            }}
                          >
                            <UploadIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteGroup(group.id, group.name)}
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

        {/* Model Info */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Configurazione Modello"
              subheader="Dettagli del modello di embedding"
            />
            <CardContent>
              {stats && (
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <SpeedIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Modello Embedding"
                      secondary={stats.embedding_model}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <MemoryIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Dimensione Vettori"
                      secondary={`${stats.embedding_dimension} dimensioni`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <AnalyticsIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Metodo Similarity"
                      secondary="Cosine Similarity (FAISS IndexFlatIP)"
                    />
                  </ListItem>
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialog} onClose={() => setCreateGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crea Nuovo Gruppo</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Nome Gruppo"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              fullWidth
              required
              placeholder="es. Manuale Utente, Documentazione API..."
            />
            <TextField
              label="Descrizione"
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Descrizione opzionale del gruppo"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateGroupDialog(false)}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || loading}
          >
            Crea Gruppo
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Upload Documenti - {selectedGroup?.name}
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <Alert severity="info">
              Formati supportati: PDF, Word (DOCX/DOC), TXT, Markdown (MD)
            </Alert>
            
            <TextField
              type="file"
              inputProps={{ multiple: true, accept: '.pdf,.docx,.doc,.txt,.md' }}
              onChange={(e) => {
                const target = e.target as HTMLInputElement;
                setSelectedFiles(target.files);
              }}
              fullWidth
              helperText="Seleziona uno o più file da elaborare"
            />

            {uploadProgress && <LinearProgress />}

            {uploadResults.length > 0 && (
              <Card>
                <CardHeader title="Risultati Elaborazione" />
                <CardContent>
                  <List dense>
                    {uploadResults.map((result, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          {result.success ? (
                            <FilePresentIcon color="success" />
                          ) : (
                            <DescriptionIcon color="error" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={result.filename}
                          secondary={
                            result.success
                              ? `Elaborato: ${result.text_length} caratteri`
                              : `Errore: ${result.error}`
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Chiudi</Button>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleFileUpload}
            disabled={!selectedFiles || selectedFiles.length === 0 || uploadProgress}
          >
            Elabora File
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search Dialog */}
      <Dialog open={searchDialog} onClose={() => setSearchDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Ricerca nei Documenti</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
            <TextField
              label="Query di ricerca"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              placeholder="Inserisci la tua domanda o parole chiave..."
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleSearch} disabled={searchLoading}>
                      <SearchIcon />
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Seleziona gruppi da cercare:
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {groups.map((group) => (
                  <FormControlLabel
                    key={group.id}
                    control={
                      <Checkbox
                        checked={searchGroups.includes(group.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSearchGroups([...searchGroups, group.id]);
                          } else {
                            setSearchGroups(searchGroups.filter(id => id !== group.id));
                          }
                        }}
                      />
                    }
                    label={`${group.name} (${group.document_count})`}
                  />
                ))}
              </Box>
            </Box>

            {searchLoading && <LinearProgress />}

            {searchResults.length > 0 && (
              <Card>
                <CardHeader title={`Risultati (${searchResults.length})`} />
                <CardContent>
                  <List>
                    {searchResults.map((result, index) => (
                      <React.Fragment key={result.chunk_id}>
                        <ListItem>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="body2" component="span">
                                  {result.original_filename}
                                </Typography>
                                <Chip 
                                  size="small" 
                                  label={`Score: ${result.similarity_score.toFixed(3)}`}
                                  color="primary"
                                />
                              </Box>
                            }
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                {result.content.length > 200 
                                  ? result.content.substring(0, 200) + '...'
                                  : result.content
                                }
                              </Typography>
                            }
                          />
                        </ListItem>
                        {index < searchResults.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchDialog(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>

      {/* Group Details Dialog */}
      <Dialog open={detailsDialog} onClose={() => setDetailsDialog(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Dettagli Gruppo - {selectedGroup?.name}
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Nome Originale</TableCell>
                  <TableCell align="center">Dimensione</TableCell>
                  <TableCell align="center">Chunks</TableCell>
                  <TableCell align="center">Data</TableCell>
                  <TableCell align="center">Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Tooltip title={doc.content_preview}>
                        <Typography variant="body2">
                          {doc.filename.length > 30 
                            ? doc.filename.substring(0, 30) + '...'
                            : doc.filename
                          }
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{doc.original_filename}</TableCell>
                    <TableCell align="center">{formatBytes(doc.file_size)}</TableCell>
                    <TableCell align="center">
                      <Chip size="small" label={doc.chunk_count} />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption">
                        {formatDate(doc.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteDocument(doc.id, doc.original_filename)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog(false)}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RAGManagement;
