import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControlLabel,
  Checkbox,
  Button,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Badge
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Info as InfoIcon
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

interface RAGContextSelectorProps {
  onContextChange?: (selectedGroups: number[]) => void;
  compact?: boolean;
  selectedPersonalityId?: string;
}

const RAGContextSelector: React.FC<RAGContextSelectorProps> = ({ 
  onContextChange, 
  compact = false,
  selectedPersonalityId
}) => {
  const [availableGroups, setAvailableGroups] = useState<RAGGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentContext, setCurrentContext] = useState<RAGGroup[]>([]);

  useEffect(() => {
    loadAvailableGroups();
    loadCurrentContext();
  }, [selectedPersonalityId]);

  const loadAvailableGroups = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (selectedPersonalityId) {
        headers['X-Personality-Id'] = selectedPersonalityId;
      }
      const res = await apiService.get('/rag/context-options', { headers });
      if (res?.data?.available_groups) {
        setAvailableGroups(res.data.available_groups);
      }
    } catch (err: any) {
      setError('Errore nel caricamento gruppi disponibili');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentContext = async () => {
    try {
      const res = await apiService.get('/rag/context/current');
      if (res?.data?.selected_group_ids) {
        setSelectedGroups(res.data.selected_group_ids);
        if (res?.data?.selected_groups) {
          setCurrentContext(res.data.selected_groups);
        }
      }
    } catch (err: any) {
      console.error('Errore nel caricamento contesto corrente:', err);
    }
  };

  const handleGroupToggle = (groupId: number) => {
    const newSelected = selectedGroups.includes(groupId)
      ? selectedGroups.filter(id => id !== groupId)
      : [...selectedGroups, groupId];
    
    setSelectedGroups(newSelected);
  };

  const handleApplyContext = async () => {
    try {
      await apiService.post('/rag/context/select', {
        group_ids: selectedGroups
      });
      
      // Aggiorna contesto corrente
      await loadCurrentContext();
      
      // Notifica parent component
      if (onContextChange) {
        onContextChange(selectedGroups);
      }
      
    } catch (err: any) {
      setError('Errore nell\'applicazione del contesto');
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      return format(parseISO(dateString), 'dd/MM/yyyy', { locale: it });
    } catch {
      return dateString;
    }
  };

  if (compact) {
    return (
      <Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="subtitle2">
            Contesto 
            {selectedGroups.length > 0 && (
              <Chip 
                size="small" 
                label={`${selectedGroups.length} gruppi`} 
                color="primary" 
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
          <IconButton size="small" onClick={loadAvailableGroups}>
            <RefreshIcon />
          </IconButton>
        </Box>

        {currentContext.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Contesto attivo: {currentContext.map(g => g.name).join(', ')}
            </Typography>
          </Alert>
        )}

        <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
          {availableGroups.map((group) => (
            <FormControlLabel
              key={group.id}
              control={
                <Checkbox
                  checked={selectedGroups.includes(group.id)}
                  onChange={() => handleGroupToggle(group.id)}
                  size="small"
                />
              }
              label={
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Typography variant="body2">{group.name}</Typography>
                  <Chip 
                    size="small" 
                    label={group.document_count} 
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.7rem' }}
                  />
                </Box>
              }
            />
          ))}
        </Box>

        <Button
          variant="contained"
          size="small"
          onClick={handleApplyContext}
          disabled={loading}
          fullWidth
        >
          Applica Contesto
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6">
            Selezione Contesto
          </Typography>
          <IconButton onClick={loadAvailableGroups} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {currentContext.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Contesto attualmente attivo:</strong><br />
              {currentContext.map(g => `${g.name} (${g.document_count} doc)`).join(', ')}
            </Typography>
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Seleziona i gruppi di documenti da utilizzare come contesto per le tue domande.
          Il sistema cercherà informazioni rilevanti nei documenti selezionati.
        </Typography>

        <Box sx={{ mb: 2 }}>
          {availableGroups.length === 0 ? (
            <Alert severity="warning">
              Nessun gruppo con documenti disponibile. 
              Carica alcuni documenti nell'area amministrativa.
            </Alert>
          ) : (
            <List dense>
              {availableGroups.map((group) => (
                <React.Fragment key={group.id}>
                  <ListItem>
                    <ListItemIcon>
                      <Checkbox
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => handleGroupToggle(group.id)}
                      />
                    </ListItemIcon>
                    <ListItemIcon>
                      <FolderIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body1">{group.name}</Typography>
                          <Badge badgeContent={group.document_count} color="primary">
                            <DescriptionIcon fontSize="small" />
                          </Badge>
                          <Chip 
                            size="small" 
                            label={`${group.chunk_count} chunks`}
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          {group.description && (
                            <Typography variant="body2" color="text.secondary">
                              {group.description}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            Ultimo aggiornamento: {formatDate(group.updated_at)}
                          </Typography>
                        </Box>
                      }
                    />
                    <Tooltip title="Informazioni dettagliate">
                      <IconButton size="small">
                        <InfoIcon />
                      </IconButton>
                    </Tooltip>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {selectedGroups.length} di {availableGroups.length} gruppi selezionati
          </Typography>
          <Button
            variant="contained"
            onClick={handleApplyContext}
            disabled={loading || selectedGroups.length === 0}
            startIcon={<SettingsIcon />}
          >
            Applica Contesto
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default RAGContextSelector;
