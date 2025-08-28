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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  FormControlLabel,
  Checkbox,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Upload as UploadIcon,
  Analytics as AnalyticsIcon,
  Storage as StorageIcon,
  CloudUpload as CloudUploadIcon
} from '@mui/icons-material';
import { authFetch } from '../utils/authFetch'

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005');

interface RAGStats {
  total_groups: number;
  total_documents: number;
  total_chunks: number;
  total_size_bytes: number;
  embedding_model: string;
  embedding_dimension: number;
}

interface RAGGroup {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  document_count: number;
  chunk_count: number;
  size_bytes: number;
}

interface RAGDocument {
  id: number;
  filename: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

export default function AdminRAGManagement() {
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [groups, setGroups] = useState<RAGGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<RAGGroup | null>(null);
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [createGroupDialog, setCreateGroupDialog] = useState(false);
  const [editGroupDialog, setEditGroupDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  
  // Form states
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [editingGroup, setEditingGroup] = useState<RAGGroup | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadDocuments(selectedGroup.id);
    }
  }, [selectedGroup]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, groupsRes] = await Promise.all([
        authFetch(`${BACKEND}/api/admin/rag/stats`),
        authFetch(`${BACKEND}/api/admin/rag/groups`)
      ]);
      
      const statsData = await statsRes.json();
      const groupsData = await groupsRes.json();
      
      if (statsData.success) setStats(statsData.stats);
      if (groupsData.success) setGroups(groupsData.groups);
      
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (groupId: number) => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/rag/groups/${groupId}/documents`);
      const data = await res.json();
      
      if (data.success) {
        setDocuments(data.documents);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateGroup = async () => {
    try {
      const res = await authFetch(`${BACKEND}/api/admin/rag/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription || undefined
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setCreateGroupDialog(false);
        setGroupName('');
        setGroupDescription('');
        loadData();
      } else {
        setError(data.error || 'Errore nella creazione del gruppo');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditGroup = (group: RAGGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setEditGroupDialog(true);
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    
    try {
      const res = await authFetch(`${BACKEND}/api/admin/rag/groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription || undefined
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setEditGroupDialog(false);
        setEditingGroup(null);
        setGroupName('');
        setGroupDescription('');
        loadData();
      } else {
        setError(data.error || 'Errore nell\'aggiornamento del gruppo');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo gruppo e tutti i suoi documenti?')) {
      return;
    }
    
    try {
      const res = await authFetch(`${BACKEND}/api/admin/rag/groups/${groupId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.success) {
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
          setDocuments([]);
        }
        loadData();
      } else {
        setError(data.error || 'Errore nell\'eliminazione del gruppo');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedFile || !selectedGroup) return;
    
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('group_id', selectedGroup.id.toString());
      
      const res = await authFetch(`${BACKEND}/api/admin/rag/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (data.success) {
        setUploadDialog(false);
        setSelectedFile(null);
        loadData();
        loadDocuments(selectedGroup.id);
      } else {
        setError(data.error || 'Errore nel caricamento del documento');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo documento?')) {
      return;
    }
    
    try {
      const res = await authFetch(`${BACKEND}/api/admin/rag/documents/${documentId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.success) {
        loadData();
        if (selectedGroup) {
          loadDocuments(selectedGroup.id);
        }
      } else {
        setError(data.error || 'Errore nell\'eliminazione del documento');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('it-IT');
  };

  return (
    <Box sx={{ width: '100%' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Statistics */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h6">{stats.total_groups}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Gruppi
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <DescriptionIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Box>
                    <Typography variant="h6">{stats.total_documents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Documenti
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <StorageIcon sx={{ mr: 1, color: 'info.main' }} />
                  <Box>
                    <Typography variant="h6">{stats.total_chunks}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Chunks
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <AnalyticsIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <Box>
                    <Typography variant="h6">{formatBytes(stats.total_size_bytes)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Dimensione
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={3}>
        {/* Groups List */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Gruppi RAG"
              action={
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateGroupDialog(true)}
                  size="small"
                >
                  Nuovo Gruppo
                </Button>
              }
            />
            <CardContent>
              <List>
                {groups.map((group) => (
                  <React.Fragment key={group.id}>
                    <ListItem
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <IconButton
                            edge="end"
                            onClick={() => handleEditGroup(group)}
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            edge="end"
                            onClick={() => handleDeleteGroup(group.id)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemIcon>
                        <Checkbox
                          checked={selectedGroup?.id === group.id}
                          onChange={() => setSelectedGroup(group)}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={group.name}
                        secondary={
                          <Box>
                            {group.description && (
                              <Typography variant="body2" color="text.secondary">
                                {group.description}
                              </Typography>
                            )}
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip label={`${group.document_count} doc`} size="small" />
                              <Chip label={`${group.chunk_count} chunks`} size="small" />
                              <Chip label={formatBytes(group.size_bytes)} size="small" />
                            </Box>
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))}
                {groups.length === 0 && (
                  <ListItem>
                    <ListItemText
                      primary="Nessun gruppo disponibile"
                      secondary="Crea il primo gruppo per iniziare"
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Documents List */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title={selectedGroup ? `Documenti in "${selectedGroup.name}"` : 'Seleziona un gruppo'}
              action={
                selectedGroup && (
                  <Button
                    variant="contained"
                    startIcon={<UploadIcon />}
                    onClick={() => setUploadDialog(true)}
                    size="small"
                  >
                    Carica PDF
                  </Button>
                )
              }
            />
            <CardContent>
              {selectedGroup ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nome File</TableCell>
                        <TableCell>Dimensione</TableCell>
                        <TableCell>Chunks</TableCell>
                        <TableCell>Data</TableCell>
                        <TableCell>Azioni</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>{doc.filename}</TableCell>
                          <TableCell>{formatBytes(doc.file_size)}</TableCell>
                          <TableCell>{doc.chunk_count}</TableCell>
                          <TableCell>{formatDate(doc.created_at)}</TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {documents.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            Nessun documento nel gruppo
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" align="center">
                  Seleziona un gruppo per visualizzare i documenti
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialog} onClose={() => {
        setCreateGroupDialog(false);
        setGroupName('');
        setGroupDescription('');
      }}>
        <DialogTitle>Crea Nuovo Gruppo</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome Gruppo"
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
            variant="outlined"
            multiline
            rows={3}
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCreateGroupDialog(false);
            setGroupName('');
            setGroupDescription('');
          }}>Annulla</Button>
          <Button
            onClick={handleCreateGroup}
            variant="contained"
            disabled={!groupName.trim()}
          >
            Crea
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={editGroupDialog} onClose={() => {
        setEditGroupDialog(false);
        setEditingGroup(null);
        setGroupName('');
        setGroupDescription('');
      }}>
        <DialogTitle>Modifica Gruppo</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome Gruppo"
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
            variant="outlined"
            multiline
            rows={3}
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setEditGroupDialog(false);
            setEditingGroup(null);
            setGroupName('');
            setGroupDescription('');
          }}>Annulla</Button>
          <Button
            onClick={handleUpdateGroup}
            variant="contained"
            disabled={!groupName.trim()}
          >
            Aggiorna
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)}>
        <DialogTitle>Carica Documento PDF</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <input
              accept=".pdf"
              style={{ display: 'none' }}
              id="file-upload"
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <label htmlFor="file-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<CloudUploadIcon />}
                fullWidth
                sx={{ mb: 2 }}
              >
                Seleziona File PDF
              </Button>
            </label>
            {selectedFile && (
              <Alert severity="info">
                File selezionato: {selectedFile.name} ({formatBytes(selectedFile.size)})
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Annulla</Button>
          <Button
            onClick={handleUploadDocument}
            variant="contained"
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Caricamento...' : 'Carica'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
