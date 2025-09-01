import { useState } from 'react'

export interface RAGChunk { chunk_id?: number; chunk_index?: number; content?: string; filename?: string; original_filename?: string }

interface UseRAGChunks { chunks: RAGChunk[]; loading: boolean; error: string | null; refresh: (groupId: number) => Promise<void>; }

const useRAGChunks = (): UseRAGChunks => {
	const [chunks, setChunks] = useState<RAGChunk[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string|null>(null)

	const refresh = async (groupId: number) => {
		if(!groupId) { setChunks([]); return }
		setLoading(true); setError(null)
		try {
			const res = await fetch(`/api/rag/debug/groups/${groupId}/chunks`, { credentials:'include' })
			const data = await res.json(); if (data.success) setChunks(data.chunks||[]); else setError(data.detail||'Errore chunks')
		} catch(e:any) { setError(e.message || 'Errore rete chunks') } finally { setLoading(false) }
	}
	return { chunks, loading, error, refresh }
}
export default useRAGChunks
