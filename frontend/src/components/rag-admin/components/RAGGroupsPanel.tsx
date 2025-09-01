import React from 'react'
import { Box, Button, List, ListItem, ListItemText, IconButton } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import DownloadIcon from '@mui/icons-material/Download'
import type { RAGGroup } from '../hooks/useRAGGroups'

interface Props {
	groups: RAGGroup[];
	onCreate: () => void;
	onEdit: (group: RAGGroup) => void;
	onSelect: (group: RAGGroup) => void;
	selectedGroupId: number | null;
	onExport: (groupId: number) => void;
	onDelete: (groupId: number, groupName: string) => void;
}

const RAGGroupsPanel: React.FC<Props> = ({ groups, onCreate, onEdit, onSelect, selectedGroupId, onExport, onDelete }) => {
	return (
		<Box>
			<Box mb={2} display="flex" gap={1}>
				<Button variant="contained" size="small" onClick={onCreate}>Nuovo Gruppo</Button>
			</Box>
			<List dense>
				{groups.map(g=> (
					<ListItem key={g.id} selected={g.id===selectedGroupId} secondaryAction={
						<Box>
							<IconButton edge="end" size="small" onClick={()=> onEdit(g)}><EditIcon fontSize="inherit" /></IconButton>
							<IconButton edge="end" size="small" onClick={()=> onExport(g.id)}><DownloadIcon fontSize="inherit" /></IconButton>
							<IconButton edge="end" size="small" onClick={()=> onDelete(g.id, g.name)}><DeleteIcon fontSize="inherit" /></IconButton>
						</Box>
					} onClick={()=> onSelect(g)} sx={{ cursor:'pointer' }}>
						<ListItemText primary={g.name} secondary={`${g.document_count||0} doc / ${g.chunk_count||0} chunks`} />
					</ListItem>
				))}
			</List>
		</Box>
	)
}

export default RAGGroupsPanel
