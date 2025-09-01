import React from 'react'
import { Box, List, ListItem, ListItemText, Chip } from '@mui/material'
import type { RAGDocument } from '../hooks/useRAGDocuments'

interface Props { documents: RAGDocument[]; }

const RAGDocumentsPanel: React.FC<Props> = ({ documents }) => {
	return (
		<Box>
			<List dense>
				{documents.map(d=> (
					<ListItem key={d.id}>
						<ListItemText primary={d.original_filename || d.filename} secondary={`Chunks: ${d.chunk_count||0}`} />
						{d.updated_at && <Chip size="small" label={new Date(d.updated_at).toLocaleDateString()} />}
					</ListItem>
				))}
			</List>
		</Box>
	)
}
export default RAGDocumentsPanel
