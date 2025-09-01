import { useEffect, useState, useCallback } from 'react';
import ragApiService from '../../../services/ragApiService';

export interface RAGStats {
  total_groups: number;
  total_documents: number;
  total_chunks: number;
  total_size_bytes: number;
  embedding_model: string;
  embedding_dimension: number;
  average_chunk_size: number;
  group_breakdown: Array<{group_name: string; chunks: number; documents: number}>;
  chunk_distribution: Array<{chunks_per_doc: number; document_count: number}>;
  storage_efficiency: {
    avg_chunks_per_document: number;
    avg_document_size: number;
    storage_per_chunk: number;
  };
  storage_stats?: any;
}

interface UseRAGStatsResult {
  stats: RAGStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useRAGStats(): UseRAGStatsResult {
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ragApiService.getStats();
      if (res.success) {
        setStats(res.stats);
        setError(null);
      } else {
        setError('Impossibile caricare statistiche');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, error, refresh: load };
}

export default useRAGStats;
