import { useState } from 'react'
import { RAGGroup } from './useRAGGroups'

export interface RAGDocument { id: number; filename: string; original_filename: string; chunk_count?: number; updated_at?: string; created_at?: string }

interface UseRAGDocuments {
	documents: RAGDocument[];
	loading: boolean;
	error: string | null;
	refresh: (groupId: number) => Promise<void>;
}

const useRAGDocuments = (): UseRAGDocuments => {
	const [documents, setDocuments] = useState<RAGDocument[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string|null>(null)

	const refresh = async (groupId: number) => {
		if(!groupId) return
		setLoading(true); setError(null)
		try {
			const res = await fetch(`/api/rag/groups/${groupId}/documents`, { credentials:'include' })
			const data = await res.json(); if (data.success) setDocuments(data.documents||[]); else setError(data.detail||'Errore documenti')
		} catch(e:any) { setError(e.message || 'Errore rete documenti') } finally { setLoading(false) }
	}
	return { documents, loading, error, refresh }
}
export default useRAGDocuments
