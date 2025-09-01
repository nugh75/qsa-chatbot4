import React from 'react';
import { Card, CardHeader, CardContent, Box, TextField, IconButton, Chip, Button, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, CircularProgress, Pagination, Typography } from '@mui/material';
import { Search as SearchIcon, Assessment as AssessmentIcon, Visibility as VisibilityIcon, Edit as EditIcon, Delete as DeleteIcon, DeleteSweep as DeleteSweepIcon } from '@mui/icons-material';
import { highlightTerm } from '../utils/highlight';
import { RAGChunk } from '../hooks/useRAGChunks';

interface Props {
  groupName?: string;
  chunks: RAGChunk[];
  loading: boolean;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  onSearch: () => void;
  selected: Set<number>;
  onToggleSelect: (id: number, checked: boolean) => void;
  onToggleSelectAll: () => void;
  onView: (chunk: RAGChunk) => void;
  onEdit: (chunk: RAGChunk) => void;
  onDelete: (id: number) => void;
  pagination: { total: number; limit: number; page: number };
  onPageChange: (page: number) => void;
  onQualityAnalysis: () => void;
  onCleanupOrphans: () => void;
}

const RAGChunksPanel: React.FC<Props> = ({
  groupName,
  chunks,
  loading,
  searchTerm,
  onSearchTermChange,
  onSearch,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onDelete,
  pagination,
  onPageChange,
  onQualityAnalysis,
  onCleanupOrphans
}) => {
  return (
    <Card>
      <CardHeader
        title={`Chunks${groupName ? ` in "${groupName}"` : ''}`}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Cerca nei chunks..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onSearch()}
            />
            <IconButton onClick={onSearch}>
              <SearchIcon />
            </IconButton>
            {selected.size > 0 && (
              <Chip label={`${selected.size} selezionati`} color="primary" size="small" />
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<AssessmentIcon />}
              onClick={onQualityAnalysis}
              disabled={!groupName}
            >
              Analisi Qualità
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<DeleteSweepIcon />}
              onClick={onCleanupOrphans}
              disabled={!groupName}
            >
              Cleanup Orfani
            </Button>
          </Box>
        }
      />
      <CardContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selected.size > 0 && selected.size < chunks.length}
                        checked={chunks.length > 0 && selected.size === chunks.length}
                        onChange={onToggleSelectAll}
                      />
                    </TableCell>
                    <TableCell>Contenuto</TableCell>
                    <TableCell>Documento</TableCell>
                    <TableCell>Indice</TableCell>
                    <TableCell>Dimensione</TableCell>
                    <TableCell>Azioni</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chunks.map(chunk => (
                    <TableRow key={chunk.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(chunk.id)}
                          onChange={(e) => onToggleSelect(chunk.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 300 }}>
                          {highlightTerm(chunk.content_preview, searchTerm)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 150 }}>
                          {chunk.original_filename}
                        </Typography>
                      </TableCell>
                      <TableCell>{chunk.chunk_index}</TableCell>
                      <TableCell>{chunk.content_length} chars</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => onView(chunk)}>
                          <VisibilityIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => onEdit(chunk)}>
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => onDelete(chunk.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {chunks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        Nessun chunk trovato
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {pagination.total > pagination.limit && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={Math.ceil(pagination.total / pagination.limit)}
                  page={pagination.page}
                  onChange={(_, p) => onPageChange(p)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RAGChunksPanel;
