import React from 'react';
import { Card, CardHeader, CardContent, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, IconButton, Button, Tooltip, Typography } from '@mui/material';
import { Upload as UploadIcon, Delete as DeleteIcon, Download as DownloadIcon } from '@mui/icons-material';

export interface RAGDocument {
  id: number;
  filename: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
  file_url?: string;
}

interface Props {
  groupName?: string;
  documents: RAGDocument[];
  selectedDocuments: Set<number>;
  onToggleSelect: (docId: number, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  formatBytes: (bytes: number) => string;
  formatDate: (date: string) => string;
  onUploadClick: () => void;
  onDeleteDocument?: (docId: number) => void; // placeholder for future
}

export default function RAGDocumentsPanel({
  groupName,
  documents,
  selectedDocuments,
  onToggleSelect,
  onToggleSelectAll,
  formatBytes,
  formatDate,
  onUploadClick,
  onDeleteDocument
}: Props) {
  return (
    <Card>
      <CardHeader
        title={groupName ? `Documenti in "${groupName}"` : 'Seleziona una collezione'}
        action={
          groupName && (
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={onUploadClick}
              size="small"
            >
              Carica Documenti
            </Button>
          )
        }
      />
      <CardContent>
        {groupName ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedDocuments.size > 0 && selectedDocuments.size < documents.length}
                      checked={documents.length > 0 && selectedDocuments.size === documents.length}
                      onChange={(e) => onToggleSelectAll(e.target.checked)}
                    />
                  </TableCell>
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
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedDocuments.has(doc.id)}
                        onChange={(e) => onToggleSelect(doc.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>{doc.filename}</TableCell>
                    <TableCell>{formatBytes(doc.file_size)}</TableCell>
                    <TableCell>{doc.chunk_count}</TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => onDeleteDocument && onDeleteDocument(doc.id)}>
                        <DeleteIcon />
                      </IconButton>
                      {doc.file_url && (
                        <Tooltip title="Scarica originale">
                          <IconButton
                            size="small"
                            component="a"
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener"
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Nessun documento nella collezione
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" align="center">
            Seleziona una collezione per visualizzare i documenti
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
