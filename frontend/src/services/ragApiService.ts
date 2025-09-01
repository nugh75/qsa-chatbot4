// Frontend RAG API service
// Provides functions to interact with backend RAG & embedding endpoints

const API_BASE = '/api/rag';

import { CredentialManager } from '../crypto';

async function jsonFetch(url: string, options: RequestInit = {}) {
  // Attach bearer token if present (admin endpoints require it)
  const token = CredentialManager.getAccessToken();
  const baseHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (!(options.body instanceof FormData)) baseHeaders['Content-Type'] = 'application/json';
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    headers: { ...baseHeaders, ...(options.headers || {}) },
    credentials: 'include',
    ...options
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  return data;
}

const ragApiService = {
  // Stats & groups
  getStats: () => jsonFetch('/api/rag/stats'),
  getGroups: () => jsonFetch(`${API_BASE}/groups`),
  createGroup: (name: string, description?: string) => jsonFetch(`${API_BASE}/groups`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateGroup: (groupId: number, name?: string, description?: string) => jsonFetch(`${API_BASE}/groups/${groupId}`, { method: 'PUT', body: JSON.stringify({ name, description }) }),
  deleteGroup: (groupId: number) => jsonFetch(`${API_BASE}/groups/${groupId}`, { method: 'DELETE' }),

  // Documents
  getDocuments: (groupId: number) => jsonFetch(`${API_BASE}/groups/${groupId}/documents`),
  previewDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/preview`, { method: 'POST', body: form, credentials: 'include' }).then(r => r.json());
  },
  uploadDocuments: (groupId: number, files: File[]) => {
    const form = new FormData();
    form.append('group_id', String(groupId));
    files.forEach(f => form.append('files', f));
    return fetch(`${API_BASE}/upload-multi`, { method: 'POST', body: form, credentials: 'include' }).then(r => r.json());
  },
  bulkDeleteDocuments: (documentIds: number[]) => jsonFetch(`${API_BASE}/documents/bulk-delete`, { method: 'POST', body: JSON.stringify({ document_ids: documentIds }) }),

  // Chunks
  getChunks: (groupId: number, limit = 50, offset = 0) => jsonFetch(`${API_BASE}/chunks?group_id=${groupId}&limit=${limit}&offset=${offset}`),
  searchChunks: (searchTerm: string, groupId?: number, limit = 100) => jsonFetch(`${API_BASE}/chunks/search`, { method: 'POST', body: JSON.stringify({ search_term: searchTerm, group_id: groupId, limit }) }),
  updateChunk: (chunkId: number, content: string) => jsonFetch(`${API_BASE}/chunks/${chunkId}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteChunk: (chunkId: number) => jsonFetch(`${API_BASE}/chunks/${chunkId}`, { method: 'DELETE' }),
  bulkDeleteChunks: (chunkIds: number[]) => jsonFetch(`${API_BASE}/chunks/bulk-delete`, { method: 'POST', body: JSON.stringify({ chunk_ids: chunkIds }) }),
  cleanupOrphanChunks: () => jsonFetch(`${API_BASE}/chunks/cleanup-orphans`, { method: 'POST' }),

  // Storage
  getStorageStats: () => jsonFetch(`${API_BASE}/storage/stats`),
  cleanupStorage: () => jsonFetch(`${API_BASE}/storage/cleanup`, { method: 'POST' }),

  // Export / Import / Advanced
  exportConfig: () => fetch(`${API_BASE}/export/config`, { credentials: 'include' }).then(r => r.blob()),
  exportGroupData: (groupId: number) => fetch(`${API_BASE}/export/data/${groupId}?include_chunks=true`, { credentials: 'include' }).then(r => r.blob()),
  importConfig: (file: File) => {
    const form = new FormData();
    form.append('config_file', file);
    return fetch(`${API_BASE}/import/config`, { method: 'POST', body: form, credentials: 'include' }).then(r => r.json());
  },
  bulkReindexGroups: (groupIds: number[]) => jsonFetch(`${API_BASE}/groups/bulk-reindex`, { method: 'POST', body: JSON.stringify({ group_ids: groupIds }) }),
  bulkExportGroups: (groupIds: number[]) => {
    const form = new FormData();
    groupIds.forEach(id => form.append('group_ids', String(id)));
    return fetch(`${API_BASE}/export/bulk`, { method: 'POST', body: form, credentials: 'include' }).then(r => r.blob());
  },

  // Quality / Analysis
  analyzeQuality: (groupId: number) => jsonFetch(`${API_BASE}/chunks/analyze-quality`, { method: 'POST', body: JSON.stringify({ group_id: groupId }) }),

  // Embedding management
  getEmbeddingConfig: () => jsonFetch(`${API_BASE}/embedding/config`),
  listEmbeddingModels: () => jsonFetch(`${API_BASE}/embedding/models`),
  selectEmbeddingModel: (provider_type: string, model_name: string) => jsonFetch(`${API_BASE}/embedding/select`, { method: 'POST', body: JSON.stringify({ provider_type, model_name }) }),
  startEmbeddingDownload: (model_name: string) => jsonFetch(`${API_BASE}/embedding/download`, { method: 'POST', body: JSON.stringify({ model_name }) }),
  embeddingDownloadStatus: (task_id: string) => jsonFetch(`${API_BASE}/embedding/download/status/${task_id}`),
  embeddingDownloadTasks: () => jsonFetch(`${API_BASE}/embedding/download/tasks`),
};

export default ragApiService;
