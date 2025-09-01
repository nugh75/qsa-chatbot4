import React from 'react'
import { Box, List, ListItem, ListItemText } from '@mui/material'
import type { RAGChunk } from '../hooks/useRAGChunks'

interface Props { chunks: RAGChunk[] }

const RAGChunksPanel: React.FC<Props> = ({ chunks }) => {
	return (
		<Box>
			<List dense>
				{chunks.slice(0,200).map(c=> (
					<ListItem key={c.chunk_id || `${c.filename}-${c.chunk_index}`}> 
						<ListItemText primary={`#${c.chunk_index} ${c.original_filename || c.filename || ''}`} secondary={(c.content||'').slice(0,120)} />
					</ListItem>
				))}
			</List>
		</Box>
	)
}
export default RAGChunksPanel
