import { useState } from 'react'

interface RAGStatsData { total_groups:number; total_documents:number; total_chunks:number; total_size_bytes:number; embedding_model?:string; embedding_dimension?:number; average_chunk_size?:number; group_breakdown?:any[] }

interface UseRAGStats { stats: RAGStatsData | null; loading: boolean; error: string | null; refresh: () => Promise<void> }

const useRAGStats = (): UseRAGStats => {
	const [stats, setStats] = useState<RAGStatsData|null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string|null>(null)
	const refresh = async () => {
		setLoading(true); setError(null)
		try { const res = await fetch('/api/rag/stats', { credentials:'include' }); const data = await res.json(); if (data.success) setStats(data.stats); else setError(data.detail||'Errore stats') } catch(e:any){ setError(e.message||'Errore rete stats') } finally { setLoading(false) }
	}
	return { stats, loading, error, refresh }
}
export default useRAGStats
