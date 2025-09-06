import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Collapse,
  FormControlLabel,
  Checkbox,
  Button,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  Chat as ChatIcon,
  Message as MessageIcon,
  AccessTime as TimeIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';

// Utility per debouncing senza lodash
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Utility per formattazione date senza date-fns
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'ora';
  if (diffMinutes < 60) return `${diffMinutes} min fa`;
  if (diffHours < 24) return `${diffHours} ore fa`;
  if (diffDays < 7) return `${diffDays} giorni fa`;
  return date.toLocaleDateString('it-IT');
}

interface SearchResult {
  conversation_id: string;
  title_encrypted: string;
  title_hash: string;
  message_id?: string;
  content_encrypted?: string;
  content_hash?: string;
  message_role?: string;
  timestamp: string;
  relevance_score: number;
  match_type?: string;
}

interface SearchStats {
  total_conversations: number;
  total_messages: number;
  search_time_ms: number;
  results_count: number;
}

interface SimpleSearchProps {
  onResultSelect?: (conversationId: string, messageId?: string) => void;
  selectedConversationId?: string;
  apiService: any;
  cryptoService: any;
}

const SimpleSearch: React.FC<SimpleSearchProps> = ({
  onResultSelect,
  selectedConversationId,
  apiService,
  cryptoService
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [statistics, setStatistics] = useState<SearchStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filtri semplificati
  const [includeMessages, setIncludeMessages] = useState(true);
  const [includeTitles, setIncludeTitles] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const debouncedQuery = useDebounce(query, 300);

  // Funzione di ricerca
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setStatistics(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: '30'
      });

      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);

      const response = await apiService.get(`/search/conversations?${params.toString()}`);
      const searchData = response.data;

      let filteredResults = searchData.results || [];

      // Applica filtri client-side
      if (!includeMessages) {
        filteredResults = filteredResults.filter((r: SearchResult) => !r.message_id);
      }
      if (!includeTitles) {
        filteredResults = filteredResults.filter((r: SearchResult) => r.message_id);
      }

      setResults(filteredResults);
      setStatistics(searchData.statistics);

    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Errore durante la ricerca');
    } finally {
      setIsSearching(false);
    }
  }, [apiService, dateFrom, dateTo, includeMessages, includeTitles]);

  // Effect per ricerca automatica
  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  // Decrittazione risultato
  const decryptResult = useCallback(async (result: SearchResult) => {
  // Encryption disabled: treat server fields as plaintext
  const title = result.title_encrypted || '';
  const content = result.content_encrypted || '';
  return { title, content };
  }, [cryptoService]);

  const handleResultClick = (result: SearchResult) => {
    if (onResultSelect) {
      onResultSelect(result.conversation_id, result.message_id);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setStatistics(null);
  };

  // Componente per singolo risultato
  const ResultItem: React.FC<{ result: SearchResult }> = ({ result }) => {
    const [decrypted, setDecrypted] = useState<{ title: string; content: string } | null>(null);

    useEffect(() => {
      decryptResult(result).then(data => setDecrypted(data));
    }, [result]);

    const isCurrentConversation = result.conversation_id === selectedConversationId;

    return (
      <ListItem
        button
        selected={isCurrentConversation}
        onClick={() => handleResultClick(result)}
        sx={{
          borderLeft: isCurrentConversation ? 3 : 0,
          borderLeftColor: 'primary.main'
        }}
      >
        <ListItemIcon>
          {result.message_id ? 
            <MessageIcon color="secondary" /> : 
            <ChatIcon color="primary" />
          }
        </ListItemIcon>
        <ListItemText
          primary={
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>
                {decrypted?.title || 'Titolo non disponibile'}
              </Typography>
              <Chip
                size="small"
                label={result.message_id ? 'Msg' : 'Titolo'}
                color={result.message_id ? 'secondary' : 'primary'}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`${Math.round(result.relevance_score * 100)}%`}
                color="success"
                variant="filled"
              />
            </Box>
          }
          secondary={
            <Box>
              {decrypted?.content && result.content_encrypted && (
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 0.5 }}>
                  {decrypted.content.substring(0, 80)}...
                </Typography>
              )}
              <Box display="flex" alignItems="center" gap={1}>
                <TimeIcon fontSize="small" />
                <Typography variant="caption">
                  {formatTimeAgo(result.timestamp)}
                </Typography>
                {result.message_role && (
                  <Chip
                    size="small"
                    label={result.message_role}
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.6rem' }}
                  />
                )}
              </Box>
            </Box>
          }
        />
      </ListItem>
    );
  };

  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      {/* Barra di ricerca */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Cerca nelle conversazioni..."
          variant="outlined"
          size="medium"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isSearching ? (
                  <CircularProgress size={20} />
                ) : (
                  <SearchIcon />
                )}
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {query && (
                  <IconButton size="small" onClick={clearSearch}>
                    <ClearIcon />
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <FilterIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        {/* Filtri */}
        <Collapse in={showFilters}>
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" gutterBottom>
              Filtri di ricerca
            </Typography>
            <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeTitles}
                    onChange={(e) => setIncludeTitles(e.target.checked)}
                    size="small"
                  />
                }
                label="Titoli"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeMessages}
                    onChange={(e) => setIncludeMessages(e.target.checked)}
                    size="small"
                  />
                }
                label="Messaggi"
              />
              <TextField
                type="date"
                label="Data inizio"
                size="small"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 140 }}
              />
              <TextField
                type="date"
                label="Data fine"
                size="small"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 140 }}
              />
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Statistiche */}
      {statistics && (
        <Paper elevation={0} sx={{ p: 1, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="caption">
            {statistics.results_count} risultati • {statistics.search_time_ms}ms
          </Typography>
        </Paper>
      )}

      {/* Errore */}
      {searchError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {searchError}
        </Alert>
      )}

      {/* Risultati */}
      <Paper elevation={1} sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {results.length > 0 ? (
          <List sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
            {results.map((result, index) => (
              <React.Fragment key={`${result.conversation_id}-${result.message_id || 'title'}-${index}`}>
                <ResultItem result={result} />
                {index < results.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        ) : query && !isSearching ? (
          <Box p={4} textAlign="center">
            <SearchIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Nessun risultato
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Prova con termini diversi
            </Typography>
          </Box>
        ) : !query ? (
          <Box p={4} textAlign="center">
            <ChatIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Cerca nelle conversazioni
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Digita per iniziare la ricerca
            </Typography>
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
};

export default SimpleSearch;
