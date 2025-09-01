import { useState, useCallback } from 'react';
// Corrected path to shared ragApiService (three levels up to src/services)
import ragApiService from '../../../services/ragApiService';

export interface RAGGroup {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  document_count: number;
  chunk_count: number;
  size_bytes: number;
}

interface UseRAGGroupsResult {
  groups: RAGGroup[];
  loading: boolean;
  error: string | null;
  selectedGroup: RAGGroup | null;
  setSelectedGroup: (g: RAGGroup | null) => void;
  refresh: () => Promise<void>;
  create: (name: string, description?: string) => Promise<boolean>;
  update: (group: RAGGroup, name: string, description?: string) => Promise<boolean>;
  remove: (groupId: number) => Promise<boolean>;
  exportGroup: (groupId: number, groupName: string) => Promise<void>;
}

export default function useRAGGroups(): UseRAGGroupsResult {
  const [groups, setGroups] = useState<RAGGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<RAGGroup | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ragApiService.getGroups();
      if (data.success) {
        setGroups(data.groups);
      } else {
        setError(data.error || 'Errore caricamento gruppi');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (name: string, description?: string) => {
    try {
      const data = await ragApiService.createGroup(name, description);
      if (data.success) {
        await refresh();
        return true;
      } else {
        setError(data.error || 'Errore creazione gruppo');
        return false;
      }
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }, [refresh]);

  const update = useCallback(async (group: RAGGroup, name: string, description?: string) => {
    try {
      const data = await ragApiService.updateGroup(group.id, name, description);
      if (data.success) {
        await refresh();
        return true;
      } else {
        setError(data.error || 'Errore aggiornamento gruppo');
        return false;
      }
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }, [refresh]);

  const remove = useCallback(async (groupId: number) => {
    try {
      const data = await ragApiService.deleteGroup(groupId);
      if (data.success) {
        if (selectedGroup?.id === groupId) setSelectedGroup(null);
        await refresh();
        return true;
      } else {
        setError(data.error || 'Errore eliminazione gruppo');
        return false;
      }
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }, [refresh, selectedGroup]);

  const exportGroup = useCallback(async (groupId: number, groupName: string) => {
    const blob = await ragApiService.exportGroupData(groupId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rag_group_${groupName}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    groups,
    loading,
    error,
    selectedGroup,
    setSelectedGroup,
    refresh,
    create,
    update,
    remove,
    exportGroup
  };
}
