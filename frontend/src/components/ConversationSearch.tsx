import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Typography,
  Divider,
  Collapse,
  FormControlLabel,
  Checkbox,
  Button,
  CircularProgress,
  Alert,
  Autocomplete,
  Menu,
  MenuItem,
  Card,
  CardContent,
  Badge,
  Tooltip,
  Skeleton
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
  History as HistoryIcon,
  AccessTime as TimeIcon,
  Chat as ChatIcon,
  Message as MessageIcon,
  TrendingUp as TrendingIcon,
  CalendarToday as CalendarIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Settings as SettingsIcon,
  Bookmark as BookmarkIcon,
  Star as StarIcon
} from '@mui/icons-material';
import { format, formatDistanceToNow, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';

// Import dei servizi esistenti
import { apiService } from '../apiService';

// Simple debounce implementation
const debounce = (func: Function, wait: number) => {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

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

interface SearchResponse {
  results: SearchResult[];
  statistics: SearchStats;
  search_hashes: number;
  query: string;
}

interface SearchFilters {
  dateFrom?: Date;
  dateTo?: Date;
  conversationId?: string;
  includeMessages: boolean;
  includeTitles: boolean;
  sortBy: 'relevance' | 'date' | 'conversation';
  sortOrder: 'asc' | 'desc';
}

interface SearchSuggestion {
  text: string;
  type: 'recent' | 'popular' | 'suggestion';
  frequency?: number;
}

interface ConversationSearchProps {
  onResultSelect?: (conversationId: string, messageId?: string) => void;
  selectedConversationId?: string;
  isCompact?: boolean;
}

const ConversationSearch: React.FC<ConversationSearchProps> = ({
  onResultSelect,
  selectedConversationId,
  isCompact = false
}) => {
  // State per ricerca
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [statistics, setStatistics] = useState<SearchStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // State per filtri
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    includeMessages: true,
    includeTitles: true,
    sortBy: 'relevance',
    sortOrder: 'desc'
  });

  // State per suggerimenti
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // State per UI
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  // Funzione di ricerca debounced
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string, searchFilters: SearchFilters) => {
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
          limit: '50'
        });

        if (searchFilters.dateFrom) {
          params.append('date_from', format(searchFilters.dateFrom, 'yyyy-MM-dd'));
        }
        if (searchFilters.dateTo) {
          params.append('date_to', format(searchFilters.dateTo, 'yyyy-MM-dd'));
        }
        if (searchFilters.conversationId) {
          params.append('conversation_id', searchFilters.conversationId);
        }

        const response = await apiService.get(`/search/conversations?${params.toString()}`);
        const searchData: SearchResponse = response.data;

        // Filtra risultati in base ai filtri client-side
        let filteredResults = searchData.results;

        if (!searchFilters.includeMessages) {
          filteredResults = filteredResults.filter(r => !r.message_id);
        }
        if (!searchFilters.includeTitles) {
          filteredResults = filteredResults.filter(r => r.message_id);
        }

        // Ordina risultati
        filteredResults.sort((a, b) => {
          const multiplier = searchFilters.sortOrder === 'desc' ? -1 : 1;
          
          switch (searchFilters.sortBy) {
            case 'relevance':
              return (b.relevance_score - a.relevance_score) * multiplier;
            case 'date':
              return (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) * multiplier;
            case 'conversation':
              return a.conversation_id.localeCompare(b.conversation_id) * multiplier;
            default:
              return 0;
          }
        });

        setResults(filteredResults);
        setStatistics(searchData.statistics);

        // Salva ricerca recente
        setRecentSearches(prev => {
          const updated = [searchQuery, ...prev.filter(s => s !== searchQuery)].slice(0, 10);
          localStorage.setItem('chatbot_recent_searches', JSON.stringify(updated));
          return updated;
        });

      } catch (error) {
        console.error('Search error:', error);
        setSearchError('Errore durante la ricerca. Riprova.');
      } finally {
        setIsSearching(false);
      }
    }, 300),
    []
  );

  // Effect per ricerca automatica
  useEffect(() => {
    debouncedSearch(query, filters);
  }, [query, filters, debouncedSearch]);

  // Carica ricerche recenti al mount
  useEffect(() => {
    const saved = localStorage.getItem('chatbot_recent_searches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  // Funzione per ottenere suggerimenti
  const fetchSuggestions = useCallback(async (searchText: string) => {
    if (searchText.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await apiService.get(`/search/suggestions?q=${encodeURIComponent(searchText)}`);
      const apiSuggestions = response.data.suggestions.map((text: string) => ({
        text,
        type: 'suggestion' as const
      }));

      // Combina con ricerche recenti
      const recentMatches = recentSearches
        .filter(s => s.toLowerCase().includes(searchText.toLowerCase()))
        .map(text => ({ text, type: 'recent' as const }));

      setSuggestions([...recentMatches, ...apiSuggestions].slice(0, 8));
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  }, [recentSearches]);

  // Effect per suggerimenti
  useEffect(() => {
    if (showSuggestions && query) {
      fetchSuggestions(query);
    }
  }, [query, showSuggestions, fetchSuggestions]);

  // Funzioni di utilità
  const decryptResult = useCallback(async (result: SearchResult) => {
    // Encryption disabled: server fields are treated as plaintext
    const title = result.title_encrypted || '';
    const content = result.content_encrypted || '';
    return { title, content };
  }, []);

  const handleResultClick = (result: SearchResult) => {
    if (onResultSelect) {
      onResultSelect(result.conversation_id, result.message_id);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setStatistics(null);
    setSelectedResults(new Set());
  };

  const toggleFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Componente risultato ricerca
  const SearchResultItem: React.FC<{ result: SearchResult; index: number }> = ({ result, index }) => {
    const [decrypted, setDecrypted] = useState<{ title: string; content: string } | null>(null);

    useEffect(() => {
      let mounted = true;
      decryptResult(result).then(data => { if (mounted) setDecrypted(data); });
      return () => { mounted = false; };
    }, [result]);

    const isSelected = selectedResults.has(`${result.conversation_id}-${result.message_id || 'title'}`);
    const isCurrentConversation = result.conversation_id === selectedConversationId;

    return (
      <ListItem
        button
        selected={isCurrentConversation}
        onClick={() => handleResultClick(result)}
        sx={{
          borderLeft: isCurrentConversation ? 3 : 0,
          borderLeftColor: 'primary.main',
          '&:hover': { backgroundColor: 'action.hover' }
        }}
      >
        <ListItemAvatar>
          <Avatar sx={{ 
            bgcolor: result.message_id ? 'secondary.main' : 'primary.main',
            width: 32, 
            height: 32 
          }}>
            {result.message_id ? <MessageIcon fontSize="small" /> : <ChatIcon fontSize="small" />}
          </Avatar>
        </ListItemAvatar>
        
        <ListItemText
          primary={
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="subtitle2" noWrap sx={{ flexGrow: 1 }}>
                {decrypted?.title || 'Titolo non disponibile'}
              </Typography>
              <Chip
                size="small"
                label={result.message_id ? 'Messaggio' : 'Titolo'}
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
              {result.content_encrypted && decrypted?.content && (
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 0.5 }}>
                  {decrypted.content.substring(0, 100)}...
                </Typography>
              )}
              <Box display="flex" alignItems="center" gap={1}>
                <TimeIcon fontSize="small" />
                <Typography variant="caption">
                  {formatDistanceToNow(parseISO(result.timestamp), { 
                    addSuffix: true,
                    locale: it 
                  })}
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

  // UI principale
  return (
    <Box sx={{ width: '100%', height: isCompact ? 'auto' : '100%' }}>
      {/* Barra di ricerca */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Autocomplete
          freeSolo
          options={suggestions.map(s => s.text)}
          value={query}
          onInputChange={(_, newValue) => setQuery(newValue || '')}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          renderInput={(params) => (
            <TextField
              {...params}
              fullWidth
              placeholder="Cerca nelle conversazioni..."
              variant="outlined"
              size="medium"
              InputProps={{
                ...params.InputProps,
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
                      onClick={(e) => setFilterMenuAnchor(e.currentTarget)}
                    >
                      <Badge badgeContent={Object.values(filters).filter(v => v !== true && v !== 'relevance' && v !== 'desc').length} color="primary">
                        <FilterIcon />
                      </Badge>
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          )}
          renderOption={(props, option) => {
            const suggestion = suggestions.find(s => s.text === option);
            return (
              <li {...props}>
                <Box display="flex" alignItems="center" gap={1}>
                  {suggestion?.type === 'recent' ? <HistoryIcon fontSize="small" /> : <TrendingIcon fontSize="small" />}
                  <Typography>{option}</Typography>
                </Box>
              </li>
            );
          }}
        />

        {/* Menu filtri */}
        <Menu
          anchorEl={filterMenuAnchor}
          open={Boolean(filterMenuAnchor)}
          onClose={() => setFilterMenuAnchor(null)}
          PaperProps={{ sx: { minWidth: 300 } }}
        >
          <MenuItem>
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.includeTitles}
                  onChange={(e) => toggleFilter('includeTitles', e.target.checked)}
                />
              }
              label="Cerca nei titoli"
            />
          </MenuItem>
          <MenuItem>
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.includeMessages}
                  onChange={(e) => toggleFilter('includeMessages', e.target.checked)}
                />
              }
              label="Cerca nei messaggi"
            />
          </MenuItem>
          <Divider />
          <MenuItem>
            <TextField
              type="date"
              label="Data inizio"
              size="small"
              value={filters.dateFrom ? format(filters.dateFrom, 'yyyy-MM-dd') : ''}
              onChange={(e) => toggleFilter('dateFrom', e.target.value ? new Date(e.target.value) : undefined)}
              InputLabelProps={{ shrink: true }}
            />
          </MenuItem>
          <MenuItem>
            <TextField
              type="date"
              label="Data fine"
              size="small"
              value={filters.dateTo ? format(filters.dateTo, 'yyyy-MM-dd') : ''}
              onChange={(e) => toggleFilter('dateTo', e.target.value ? new Date(e.target.value) : undefined)}
              InputLabelProps={{ shrink: true }}
            />
          </MenuItem>
        </Menu>
      </Paper>

      {/* Statistiche ricerca */}
      {statistics && (
        <Paper elevation={0} sx={{ p: 1, mb: 2, bgcolor: 'background.default' }}>
          <Typography variant="caption" display="block">
            {statistics.results_count} risultati di {statistics.total_conversations} conversazioni 
            ({statistics.total_messages} messaggi) • {statistics.search_time_ms}ms
          </Typography>
        </Paper>
      )}

      {/* Errore ricerca */}
      {searchError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {searchError}
        </Alert>
      )}

      {/* Lista risultati */}
      <Paper elevation={1} sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {results.length > 0 ? (
          <List sx={{ overflow: 'auto', maxHeight: isCompact ? 400 : 'calc(100vh - 300px)' }}>
            {results.map((result, index) => (
              <React.Fragment key={`${result.conversation_id}-${result.message_id || 'title'}-${index}`}>
                <SearchResultItem result={result} index={index} />
                {index < results.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        ) : query && !isSearching ? (
          <Box p={4} textAlign="center">
            <SearchIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Nessun risultato trovato
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Prova con termini di ricerca diversi
            </Typography>
          </Box>
        ) : !query ? (
          <Box p={4} textAlign="center">
            <ChatIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Cerca nelle tue conversazioni
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Digita per iniziare la ricerca
            </Typography>
            {recentSearches.length > 0 && (
              <Box mt={2}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Ricerche recenti:
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} justifyContent="center">
                  {recentSearches.slice(0, 5).map(search => (
                    <Chip
                      key={search}
                      label={search}
                      size="small"
                      onClick={() => setQuery(search)}
                      clickable
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
};

export default ConversationSearch;
