import { useState, useCallback } from 'react';
// Corrected path to shared ragApiService (three levels up to src/services)
import ragApiService from '../../../services/ragApiService';

export interface RAGDocument {
  id: number;
  filename: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
  file_url?: string;
}

interface UseRAGDocumentsResult {
  documents: RAGDocument[];
  loading: boolean;
  error: string | null;
  refresh: (groupId: number) => Promise<void>;
  clear: () => void;
}

export default function useRAGDocuments(): UseRAGDocumentsResult {
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (groupId: number) => {
    if (!groupId) return;
    try {
      setLoading(true);
      const data = await ragApiService.getDocuments(groupId);
      if (data.success) {
        setDocuments(data.documents);
      } else {
        setError(data.error || 'Errore caricamento documenti');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = () => setDocuments([]);

  return { documents, loading, error, refresh, clear };
}
