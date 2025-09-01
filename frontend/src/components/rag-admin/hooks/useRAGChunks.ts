import { useState, useCallback } from 'react';
// Correct relative path to shared ragApiService
import ragApiService from '../../../services/ragApiService';

export interface RAGChunk {
  id: number;
  group_id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  content_preview: string;
  content_length: number;
  created_at: string;
  filename: string;
  original_filename: string;
  group_name: string;
}

interface PaginationState { total: number; limit: number; offset: number; page: number; }

interface UseRAGChunksResult {
  chunks: RAGChunk[];
  loading: boolean;
  pagination: PaginationState;
  selected: Set<number>;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  setLimit: (limit: number) => void;
  setPage: (page: number) => void;
  refresh: (groupId: number, offset?: number) => Promise<void>;
  search: (groupId: number | undefined) => Promise<void>;
  toggleSelect: (id: number, checked: boolean) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  deleteOne: (chunkId: number) => Promise<boolean>;
  deleteMany: (chunkIds: number[]) => Promise<boolean>;
}

export default function useRAGChunks(initialLimit = 50): UseRAGChunksResult {
  const [chunks, setChunks] = useState<RAGChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({ total: 0, limit: initialLimit, offset: 0, page: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const refresh = useCallback(async (groupId: number, offset = 0) => {
    if (!groupId) return;
    try {
      setLoading(true);
      const data = await ragApiService.getChunks(groupId, pagination.limit, offset);
      if (data.success) {
        setChunks(data.chunks);
        setPagination(prev => ({ ...prev, total: data.total, offset, page: Math.floor(offset / prev.limit) + 1 }));
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  const search = useCallback(async (groupId: number | undefined) => {
    if (!groupId) return;
    if (!searchTerm.trim()) {
      refresh(groupId, 0);
      return;
    }
    try {
      setLoading(true);
      const data = await ragApiService.searchChunks(searchTerm, groupId, pagination.limit);
      if (data.success) {
        setChunks(data.chunks);
        setPagination(prev => ({ ...prev, total: data.total_found, offset: 0, page: 1 }));
      }
    } finally {
      setLoading(false);
    }
  }, [searchTerm, pagination.limit, refresh]);

  const setLimit = (limit: number) => setPagination(prev => ({ ...prev, limit }));
  const setPage = (page: number) => setPagination(prev => ({ ...prev, page, offset: (page - 1) * prev.limit }));

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected(prev => {
      const copy = new Set(prev);
      if (checked) copy.add(id); else copy.delete(id);
      return copy;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === chunks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(chunks.map(c => c.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  const deleteOne = async (chunkId: number) => {
    const data = await ragApiService.deleteChunk(chunkId);
    if (data.success) {
      setChunks(prev => prev.filter(c => c.id !== chunkId));
      setSelected(prev => { const s = new Set(prev); s.delete(chunkId); return s; });
      return true;
    }
    return false;
  };

  const deleteMany = async (chunkIds: number[]) => {
    const data = await ragApiService.bulkDeleteChunks(chunkIds);
    if (data.success) {
      setChunks(prev => prev.filter(c => !chunkIds.includes(c.id)));
      setSelected(new Set());
      return true;
    }
    return false;
  };

  return {
    chunks,
    loading,
    pagination,
    selected,
    searchTerm,
    setSearchTerm,
    setLimit,
    setPage,
    refresh,
    search,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    deleteOne,
    deleteMany
  };
}
