import React from 'react';
import { Card, CardHeader, CardContent, Button, List, ListItem, ListItemText, ListItemIcon, Checkbox, Chip, Divider, IconButton, Tooltip } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Download as DownloadIcon } from '@mui/icons-material';
import { RAGGroup } from '../hooks/useRAGGroups';

interface Props {
  onCreate: () => void;
  onEdit: (group: RAGGroup) => void;
  onSelect: (group: RAGGroup) => void;
  selectedGroupId: number | null;
  onExport: (groupId: number, groupName: string) => void;
  onDelete: (groupId: number, groupName: string) => void;
  groups: RAGGroup[];
}

export default function RAGGroupsPanel({ onCreate, onEdit, onSelect, selectedGroupId, onExport, onDelete, groups }: Props) {

  return (
    <Card>
      <CardHeader
        title="Collezioni RAG"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onCreate}
            size="small"
          >
            Nuova Collezione
          </Button>
        }
      />
      <CardContent>
        <List>
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <ListItem
                secondaryAction={
                  <div style={{ display: 'flex', gap: 4 }}>
                    <IconButton edge="end" onClick={() => onEdit(group)} size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton edge="end" onClick={() => onExport(group.id, group.name)} size="small" title="Esporta collezione">
                      <DownloadIcon />
                    </IconButton>
                    <IconButton edge="end" onClick={() => { if (window.confirm(`Eliminare la collezione "${group.name}"? Questa azione rimuove anche i documenti e chunks associati.`)) onDelete(group.id, group.name); }} size="small" color="error" title="Elimina collezione">
                      <DeleteIcon />
                    </IconButton>
                  </div>
                }
              >
                <ListItemIcon>
                  <Checkbox
                    checked={selectedGroupId === group.id}
                    onChange={() => onSelect(group)}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={group.name}
                  secondary={
                    <div>
                      {group.description && (
                        <span style={{ display: 'block', color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>
                          {group.description}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <Chip label={`${group.document_count} doc`} size="small" />
                        <Chip label={`${group.chunk_count} chunks`} size="small" />
                      </div>
                    </div>
                  }
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))}
          {groups.length === 0 && (
            <ListItem>
              <ListItemText
                primary="Nessuna collezione disponibile"
                secondary="Crea la prima collezione per iniziare"
              />
            </ListItem>
          )}
        </List>
      </CardContent>
    </Card>
  );
}
