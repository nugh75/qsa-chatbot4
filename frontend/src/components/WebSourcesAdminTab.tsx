import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Typography,
  Tabs,
  Tab,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  Language as LanguageIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { apiService } from '../apiService';

interface WebSource {
  id: number;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  source_type: 'html' | 'pdf';
  is_active: boolean;
  show_to_users: boolean;
  created_at: string;
  updated_at: string;
  last_fetched: string | null;
  fetch_count: number;
}

interface WebSourceFormData {
  url: string;
  description: string;
  is_active: boolean;
  show_to_users: boolean;
}

interface SearchResult {
  source_id: number;
  url: string;
  source_title: string | null;
  title: string;
  snippet: string;
  word_count: number;
  show_to_users: boolean;
}

const WebSourcesAdminTab: React.FC = () => {
  const [sources, setSources] = useState<WebSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<WebSource | null>(null);
  const [formData, setFormData] = useState<WebSourceFormData>({
    url: '',
    description: '',
    is_active: true,
    show_to_users: true,
  });
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.get('/admin/web-sources/');
      if (response.success && response.data) {
        setSources(response.data.sources);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load web sources');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (source?: WebSource) => {
    if (source) {
      setEditingSource(source);
      setFormData({
        url: source.url,
        description: source.description || '',
        is_active: source.is_active,
        show_to_users: source.show_to_users,
      });
    } else {
      setEditingSource(null);
      setFormData({
        url: '',
        description: '',
        is_active: true,
        show_to_users: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSource(null);
    setFormData({
      url: '',
      description: '',
      is_active: true,
      show_to_users: true,
    });
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    try {
      if (editingSource) {
        // Update existing source
        await apiService.post(
          `/admin/web-sources/${editingSource.id}`,
          formData,
          { method: 'PUT' }
        );
        setSuccess('Web source updated successfully');
      } else {
        // Create new source
        await apiService.post(
          '/admin/web-sources/?fetch_now=true',
          formData
        );
        setSuccess('Web source created and content fetched');
      }
      handleCloseDialog();
      loadSources();
    } catch (err: any) {
      setError(err.message || 'Failed to save web source');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this web source?')) {
      return;
    }

    try {
      await apiService.delete(`/admin/web-sources/${id}`);
      setSuccess('Web source deleted successfully');
      loadSources();
    } catch (err: any) {
      setError(err.message || 'Failed to delete web source');
    }
  };

  const handleFetch = async (id: number) => {
    setError(null);
    try {
      await apiService.post(`/admin/web-sources/${id}/fetch`);
      setSuccess('Content fetched successfully');
      loadSources();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch content');
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await apiService.post(`/admin/web-sources/${id}/toggle`);
      loadSources();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle status');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const response = await apiService.post(
        `/web-search/?query=${encodeURIComponent(searchQuery)}&max_results=10`
      );
      if (response.success && response.data) {
        setSearchResults(response.data.results);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('it-IT');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Web Sources Management
      </Typography>

      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Sources" />
        <Tab label="Test Search" />
      </Tabs>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {tabValue === 0 && (
        <>
          <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add Web Source
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadSources}
            >
              Refresh
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>URL / Domain</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Visible</TableCell>
                    <TableCell>Last Fetched</TableCell>
                    <TableCell>Fetches</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        {source.source_type === 'pdf' ? (
                          <Tooltip title="PDF">
                            <PdfIcon color="error" />
                          </Tooltip>
                        ) : (
                          <Tooltip title="HTML">
                            <LanguageIcon color="primary" />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit' }}
                          >
                            {source.url}
                          </a>
                        </Typography>
                        <Chip label={source.domain} size="small" />
                      </TableCell>
                      <TableCell>
                        {source.title || <em>No title</em>}
                        {source.description && (
                          <Typography variant="caption" display="block" color="text.secondary">
                            {source.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={source.is_active}
                          onChange={() => handleToggleActive(source.id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {source.show_to_users ? (
                          <Chip label="Yes" size="small" color="success" />
                        ) : (
                          <Chip label="No" size="small" />
                        )}
                      </TableCell>
                      <TableCell>{formatDate(source.last_fetched)}</TableCell>
                      <TableCell>{source.fetch_count}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Fetch/Refresh Content">
                            <IconButton
                              size="small"
                              onClick={() => handleFetch(source.id)}
                            >
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenDialog(source)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(source.id)}
                              color="error"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sources.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        No web sources configured. Click "Add Web Source" to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {tabValue === 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Test the web search functionality. This searches in cached content from active sources.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              fullWidth
              label="Search Query"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Enter search terms..."
            />
            <Button
              variant="contained"
              startIcon={searching ? <CircularProgress size={20} /> : <SearchIcon />}
              onClick={handleSearch}
              disabled={searching}
            >
              Search
            </Button>
          </Box>

          {searchResults.length > 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Search Results ({searchResults.length})
              </Typography>
              {searchResults.map((result, index) => (
                <Box key={index} sx={{ mb: 2, pb: 2, borderBottom: index < searchResults.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                  <Typography variant="subtitle1">
                    {result.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    <a href={result.url} target="_blank" rel="noopener noreferrer">
                      {result.url}
                    </a>
                    {' - '}
                    {result.word_count} words
                    {result.show_to_users && (
                      <Chip label="Visible to users" size="small" color="success" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  <Typography variant="body2">
                    {result.snippet}
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <Alert severity="info">
              No results found for "{searchQuery}"
            </Alert>
          )}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSource ? 'Edit Web Source' : 'Add Web Source'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="URL"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/page or https://example.com/document.pdf"
              disabled={!!editingSource}
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              multiline
              rows={2}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
              }
              label="Active (enable for search)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.show_to_users}
                  onChange={(e) => setFormData({ ...formData, show_to_users: e.target.checked })}
                />
              }
              label="Show to users (like RAG documents)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editingSource ? 'Update' : 'Add and Fetch'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WebSourcesAdminTab;
