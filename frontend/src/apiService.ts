/**
 * API service for authenticated requests to the backend
 */

import { CredentialManager } from './crypto';
import type { PersonalityEntry } from './types/admin';

// Dynamic API base resolution to avoid hard-coded localhost in deployed/tunneled environments.
// Priority order:
// 1. VITE_BACKEND_URL env variable (e.g. https://cb.ai4educ.org or https://api.cb.ai4educ.org)
// 2. window.location.origin (assuming same-origin deployment / reverse proxy for /api)
// 3. Fallback to http://localhost:8005
const _rawBase = (import.meta as any)?.env?.VITE_BACKEND_URL
  || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:8005');
// Normalize trailing slashes then append /api exactly once
const API_BASE_URL = _rawBase.replace(/\/+$/, '') + '/api';
// Debug log solo in sviluppo
if ((import.meta as any)?.env?.DEV) {
  console.log('[apiService] Using API base URL:', API_BASE_URL);
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  must_change_password?: boolean;
}

export interface UserInfo {
  id: number;
  email: string;
  created_at: string;
  last_login: string;
}

export interface ConversationData {
  id: string;
  title_encrypted: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface MessageData {
  id: string;
  content_encrypted: string;
  role: 'user' | 'assistant';
  timestamp: string;
  token_count?: number;
  processing_time?: number;
}

export interface SummaryPrompt {
  id: string;
  name: string;
  text: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
}

class ApiService {
  private refreshTimeout: any = null;
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      // Aggiungi header di autenticazione se disponibile
      const accessToken = CredentialManager.getAccessToken();
  console.log('makeRequest - Access token from storage:', accessToken?.substring(0, 20) + '...');
      
      if (accessToken) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };
  console.log('makeRequest - Added Authorization header');
      } else if (!options.headers) {
        options.headers = {
          'Content-Type': 'application/json'
        };
  console.log('makeRequest - No token found, only Content-Type header');
      }

  console.log('makeRequest - Making request to:', `${API_BASE_URL}${endpoint}`);
      const response = await fetch(url, options);
      
      // Se token scaduto, prova refresh
      if (response.status === 401 && accessToken) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Riprova la richiesta con nuovo token
          options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${CredentialManager.getAccessToken()}`
          };
          const retryResponse = await fetch(url, options);
          return this.handleResponse<T>(retryResponse);
        } else {
          // Refresh fallito, logout
          CredentialManager.clearCredentials();
          return { success: false, error: 'Authentication expired' };
        }
      }

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, data };
      } else {
        return {
          success: false,
          error: data.detail || data.message || 'Request failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to parse response'
      };
    }
  }

  // Authentication endpoints
  async register(userData: RegisterRequest): Promise<ApiResponse<TokenResponse>> {
    return this.makeRequest<TokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  async login(credentials: LoginRequest): Promise<ApiResponse<TokenResponse>> {
    return this.makeRequest<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = CredentialManager.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data: TokenResponse = await response.json();
        CredentialManager.updateAccessToken(data.access_token);
        // Pianifica refresh 1 minuto prima della scadenza (expires_in in secondi)
        if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
        const refreshInMs = Math.max((data.expires_in - 60) * 1000, 10_000);
        this.refreshTimeout = setTimeout(() => {
          this.refreshToken().catch(()=>{});
        }, refreshInMs);
        return true;
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  async logout(): Promise<ApiResponse> {
    const result = await this.makeRequest('/auth/logout', {
      method: 'POST'
    });
    
    // Pulisci credenziali locali
    CredentialManager.clearCredentials();
    return result;
  }

  async getCurrentUser(): Promise<ApiResponse<UserInfo>> {
    return this.makeRequest<UserInfo>('/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    return this.makeRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });
  }

  async forceChangePassword(newPassword: string): Promise<ApiResponse> {
    return this.makeRequest('/auth/force-change-password', {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword })
    });
  }

  // Conversation endpoints (da implementare nel backend)
  async getConversations(): Promise<ApiResponse<ConversationData[]>> {
    return this.makeRequest<ConversationData[]>('/conversations');
  }

  async createConversation(titleEncrypted: string): Promise<ApiResponse<{ conversation_id: string }>> {
    return this.makeRequest<{ conversation_id: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        title_encrypted: titleEncrypted
      })
    });
  }

  async getConversationMessages(conversationId: string): Promise<ApiResponse<MessageData[]>> {
    return this.makeRequest<MessageData[]>(`/conversations/${conversationId}/messages`);
  }

  async sendMessage(
    conversationId: string,
    contentEncrypted: string,
    role: 'user' | 'assistant'
  ): Promise<ApiResponse<{ message_id: string }>> {
    return this.makeRequest<{ message_id: string }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content_encrypted: contentEncrypted,
        role
      })
    });
  }

  async deleteConversation(conversationId: string): Promise<ApiResponse> {
    return this.makeRequest(`/conversations/${conversationId}`, {
      method: 'DELETE'
    });
  }

  async updateConversationTitle(conversationId: string, titleEncrypted: string): Promise<ApiResponse> {
    return this.makeRequest(`/conversations/${conversationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title_encrypted: titleEncrypted
      })
    });
  }

  // Device management
  async registerDevice(deviceInfo: {
    device_id: string;
    device_name: string;
    device_fingerprint: string;
  }): Promise<ApiResponse> {
    return this.makeRequest('/devices/register', {
      method: 'POST',
      body: JSON.stringify(deviceInfo)
    });
  }

  async getUserDevices(): Promise<ApiResponse<any[]>> {
    return this.makeRequest('/devices');
  }

  // Migration endpoint
  async migrateLocalStorageConversations(conversations: any[]): Promise<ApiResponse> {
    return this.makeRequest('/migration/localStorage', {
      method: 'POST',
      body: JSON.stringify({ conversations })
    });
  }

  // Search
  async searchConversations(query: string): Promise<ApiResponse<ConversationData[]>> {
    return this.makeRequest(`/search/conversations?q=${encodeURIComponent(query)}`);
  }

  // Import/Export
  async exportConversations(): Promise<ApiResponse<any>> {
    return this.makeRequest('/export/conversations');
  }

  async importConversations(data: any): Promise<ApiResponse> {
    return this.makeRequest('/import/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Summary/System prompt management
  async getSummaryPrompt(): Promise<ApiResponse<{ prompt: string }>> {
    return this.makeRequest<{ prompt: string }>('/admin/summary-prompt');
  }
  async updateSummaryPrompt(prompt: string): Promise<ApiResponse> {
    return this.makeRequest('/admin/summary-prompt', { method: 'POST', body: JSON.stringify({ prompt }) });
  }
  async resetSummaryPrompt(): Promise<ApiResponse<{ prompt: string }>> {
    return this.makeRequest<{ prompt: string }>('/admin/summary-prompt/reset', { method: 'POST' });
  }
  async getSummarySettings(): Promise<ApiResponse<{ settings: { provider: string; enabled: boolean; model?: string | null; min_messages?: number; min_chars?: number; auto_on_export?: boolean } }>> {
    return this.makeRequest<{ settings: { provider: string; enabled: boolean; model?: string | null; min_messages?: number; min_chars?: number; auto_on_export?: boolean } }>('/admin/summary-settings');
  }
  async updateSummarySettings(settings: { provider: string; enabled: boolean; model?: string | null; min_messages?: number; min_chars?: number; auto_on_export?: boolean }): Promise<ApiResponse> {
    return this.makeRequest('/admin/summary-settings', { method: 'POST', body: JSON.stringify(settings) });
  }
  async testSummary(payload: { messages?: string[]; provider?: string; model?: string; prompt_override?: string }): Promise<ApiResponse<{ summary: string; provider: string; model: string; chars: number }>> {
    return this.makeRequest<{ summary: string; provider: string; model: string; chars: number }>('/admin/summary-test', { method: 'POST', body: JSON.stringify(payload) });
  }
  // New multi summary prompts endpoints
  async listSummaryPrompts(): Promise<ApiResponse<{ active_id: string; prompts: SummaryPrompt[] }>> {
    return this.makeRequest<{ active_id: string; prompts: SummaryPrompt[] }>('/admin/summary-prompts');
  }
  async upsertSummaryPrompt(payload: { id?: string; name: string; text: string; set_active?: boolean }): Promise<ApiResponse<{ id: string }>> {
    return this.makeRequest<{ id: string }>('/admin/summary-prompts', { method: 'POST', body: JSON.stringify(payload) });
  }
  async activateSummaryPrompt(promptId: string): Promise<ApiResponse> {
    return this.makeRequest(`/admin/summary-prompts/${encodeURIComponent(promptId)}/activate`, { method: 'POST' });
  }
  async deleteSummaryPrompt(promptId: string): Promise<ApiResponse> {
    return this.makeRequest(`/admin/summary-prompts/${encodeURIComponent(promptId)}`, { method: 'DELETE' });
  }

  // Get public config for enabled providers and models
  async getPublicConfig(): Promise<ApiResponse<{
    enabled_providers: string[];
    enabled_tts_providers: string[];
    enabled_asr_providers: string[];
    default_provider: string;
    default_tts: string;
    default_asr: string;
    ui_settings?: {
      arena_public: boolean;
      contact_email?: string | null;
      research_project?: string | null;
      repository_url?: string | null;
      website_url?: string | null;
      info_pdf_url?: string | null;
  footer_title?: string | null;
  footer_text?: string | null;
  show_research_project?: boolean;
  show_repository_url?: boolean;
  show_website_url?: boolean;
  show_info_pdf_url?: boolean;
  show_contact_email?: boolean;
  show_footer_block?: boolean;
    };
  }>> {
    return this.makeRequest('/config/public');
  }

  async getPersonalities(): Promise<ApiResponse<{ default_id: string|null; personalities: PersonalityEntry[] }>> {
    return this.makeRequest('/personalities');
  }
  
  async getConversationSummary(conversationId: string): Promise<ApiResponse<{ conversation_id: string; summary: string }>> {
    return this.makeRequest(`/conversations/${conversationId}/summary`);
  }
  async downloadConversationWithReport(conversationId: string): Promise<Blob> {
    const accessToken = CredentialManager.getAccessToken();
    
    if (!accessToken) {
      throw new Error('User not authenticated. Please login first.');
    }
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${accessToken}`
    };
    
    try {
      const resp = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report`, { headers });
      
      if (resp.status === 401) {
        // Token expired, try refresh
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${CredentialManager.getAccessToken()}`;
          const retryResp = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report`, { headers });
          if (!retryResp.ok) {
            const errorText = await retryResp.text();
            throw new Error(`Download failed: ${retryResp.status} - ${errorText}`);
          }
          return retryResp.blob();
        } else {
          CredentialManager.clearCredentials();
          throw new Error('Authentication expired. Please login again.');
        }
      }
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Download failed: ${resp.status} - ${errorText}`);
      }
      
      return resp.blob();
    } catch (error) {
      console.error('Download conversation with report failed:', error);
      throw error;
    }
  }
  async downloadConversationPdf(conversationId: string): Promise<Blob> {
    const accessToken = CredentialManager.getAccessToken();
    if (!accessToken) throw new Error('User not authenticated. Please login first.');
    const headers: HeadersInit = { 'Authorization': `Bearer ${accessToken}` };
    const resp = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report?format=pdf`, { headers });
    if (resp.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const retry = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report?format=pdf`, { headers: { 'Authorization': `Bearer ${CredentialManager.getAccessToken()}` } });
        if (!retry.ok) throw new Error(`Download failed: ${retry.status}`);
        return retry.blob();
      }
      throw new Error('Authentication expired');
    }
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    return resp.blob();
  }
  async downloadConversationTxt(conversationId: string): Promise<Blob> {
    const accessToken = CredentialManager.getAccessToken();
    if (!accessToken) throw new Error('User not authenticated. Please login first.');
    const headers: HeadersInit = { 'Authorization': `Bearer ${accessToken}` };
    const url = `${API_BASE_URL}/conversations/${conversationId}/export-with-report?format=txt`;
    const resp = await fetch(url, { headers });
    if (resp.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const retry = await fetch(url, { headers: { 'Authorization': `Bearer ${CredentialManager.getAccessToken()}` } });
        if (!retry.ok) throw new Error(`Download failed: ${retry.status}`);
        return retry.blob();
      }
      throw new Error('Authentication expired');
    }
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    return resp.blob();
  }

  // RAG management (existing methods may be elsewhere; adding search quick method)
  async searchRagDocuments(query: string): Promise<ApiResponse<{ results: any[] }>> {
    const q = encodeURIComponent(query);
    return this.makeRequest<{ results: any[] }>(`/admin/rag/document/search?q=${q}`);
  }

  async recoverRagGroups(): Promise<ApiResponse<{ created: number; recovered: any[] }>> {
    return this.makeRequest<{ created: number; recovered: any[] }>(`/admin/rag/recover-groups`, { method: 'POST' });
  }

  // Chat endpoint (compatibile con sistema esistente)
  async chat(messages: any[], provider: string = 'anthropic'): Promise<Response> {
    const accessToken = CredentialManager.getAccessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        provider,
        stream: true
      })
    });
  }

  // Generic GET helper (usato da componenti legacy)
  async get(path: string, init?: RequestInit): Promise<any> {
    return this.makeRequest(path, { method: 'GET', ...(init||{}) });
  }

  // Generic POST helper
  async post(path: string, body?: any, init?: RequestInit): Promise<any> {
    return this.makeRequest(path, { method: 'POST', body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined, ...(init||{}) });
  }

  // Generic DELETE helper
  async delete(path: string, init?: RequestInit): Promise<any> {
    return this.makeRequest(path, { method: 'DELETE', ...(init||{}) });
  }

  // === RAG Embedding Management ===
  async getEmbeddingConfig(): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/rag/embedding/config');
  }
  async listLocalEmbeddingModels(): Promise<ApiResponse<{ models: string[] }>> {
    return this.makeRequest('/admin/rag/embedding/local-models');
  }
  async setEmbeddingProvider(provider_type: string, model_name: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/rag/embedding/set', {
      method: 'POST',
      body: JSON.stringify({ provider_type, model_name })
    });
  }
  async startEmbeddingDownload(model_name: string): Promise<ApiResponse<{ task_id: string }>> {
    return this.makeRequest('/admin/rag/embedding/download/start', {
      method: 'POST',
      body: JSON.stringify({ model_name })
    });
  }
  async getEmbeddingDownloadStatus(task_id: string): Promise<ApiResponse<any>> {
    const q = encodeURIComponent(task_id);
    return this.makeRequest(`/admin/rag/embedding/download/status?task_id=${q}`);
  }
  async listEmbeddingDownloadTasks(): Promise<ApiResponse<{ tasks: any[] }>> {
    return this.makeRequest('/admin/rag/embedding/download/tasks');
  }

  // === RAG Groups & Documents ===
  async getRagStats(): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/rag/stats');
  }
  async listRagGroups(): Promise<ApiResponse<{ groups: any[] }>> {
    return this.makeRequest('/admin/rag/groups');
  }
  async fixRagOrphans(): Promise<ApiResponse<{ moved: number; group_id: number }>> {
    return this.makeRequest('/admin/rag/fix-orphans', { method: 'POST' });
  }
  async getRagOrphansStatus(): Promise<ApiResponse<{ orphan_chunks: number }>> {
    return this.makeRequest('/admin/rag/orphans/status');
  }
  async cleanupRagOrphanChunks(): Promise<ApiResponse<{ removed: number }>> {
    return this.makeRequest('/admin/rag/orphans/cleanup-chunks', { method: 'POST' });
  }
  async cleanupRagOrphanDocuments(): Promise<ApiResponse<{ deleted: number; requested: number }>> {
    return this.makeRequest('/admin/rag/orphans/cleanup-documents', { method: 'POST' });
  }
  async createRagGroup(name: string, description: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/rag/groups', { method: 'POST', body: JSON.stringify({ name, description }) });
  }
  async updateRagGroup(id: number, payload: { name?: string; description?: string }): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  async deleteRagGroup(id: number): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/groups/${id}`, { method: 'DELETE' });
  }
  async listRagDocuments(groupId: number): Promise<ApiResponse<{ documents: any[] }>> {
    return this.makeRequest(`/admin/rag/groups/${groupId}/documents`);
  }
  async deleteRagDocument(documentId: number): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/documents/${documentId}`, { method: 'DELETE' });
  }
  async renameRagDocument(documentId: number, filename: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/documents/${documentId}/rename`, { method: 'POST', body: JSON.stringify({ filename }) });
  }
  async moveRagDocument(documentId: number, group_id: number): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/documents/${documentId}/move`, { method: 'POST', body: JSON.stringify({ group_id }) });
  }
  async duplicateRagDocument(documentId: number, target_group_id: number): Promise<ApiResponse<{ new_document_id: number }>> {
    return this.makeRequest<{ new_document_id: number }>(`/admin/rag/documents/${documentId}/duplicate`, { method: 'POST', body: JSON.stringify({ target_group_id }) });
  }
  async reprocessRagDocument(documentId: number, opts?: { chunk_size?: number; chunk_overlap?: number }): Promise<ApiResponse<{ chunk_count: number }>> {
    return this.makeRequest<{ chunk_count: number }>(`/admin/rag/documents/${documentId}/reprocess`, { method: 'POST', body: JSON.stringify(opts || {}) });
  }
  async exportRagDocument(documentId: number): Promise<ApiResponse<{ document: any; chunks: any[] }>> {
    return this.makeRequest<{ document: any; chunks: any[] }>(`/admin/rag/documents/${documentId}/export`);
  }
  async archiveRagDocument(documentId: number, archived: boolean): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/documents/${documentId}/archive`, { method: 'POST', body: JSON.stringify({ archived }) });
  }
  async ragDocumentMetadata(documentId: number): Promise<ApiResponse<{ document: any }>> {
    return this.makeRequest<{ document: any }>(`/admin/rag/documents/${documentId}/metadata`);
  }
  async reassignRagDocumentToOrphans(documentId: number): Promise<ApiResponse<{ group_id: number; duplicate_removed?: boolean; already_in_orphans?: boolean }>> {
    return this.makeRequest<{ group_id: number; duplicate_removed?: boolean; already_in_orphans?: boolean }>(`/admin/rag/documents/${documentId}/reassign-orphans`, { method: 'POST' });
  }
  async forceDeleteRagDocument(documentId: number): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/rag/documents/${documentId}/force`, { method: 'DELETE' });
  }
  async listAllRagDocuments(params?: { search?: string; group_id?: number; limit?: number; offset?: number }): Promise<ApiResponse<{ total:number; documents:any[] }>> {
    const q: string[] = []
    if (params?.search) q.push(`search=${encodeURIComponent(params.search)}`)
    if (typeof params?.group_id === 'number') q.push(`group_id=${params.group_id}`)
    if (typeof params?.limit === 'number') q.push(`limit=${params.limit}`)
    if (typeof params?.offset === 'number') q.push(`offset=${params.offset}`)
    const qs = q.length ? `?${q.join('&')}` : ''
    return this.makeRequest(`/admin/rag/documents${qs}`)
  }
  async uploadRagDocument(groupId: number, file: File): Promise<ApiResponse<any>> {
    const form = new FormData();
    form.append('group_id', String(groupId));
    form.append('file', file);
    const accessToken = CredentialManager.getAccessToken();
    const resp = await fetch(`${API_BASE_URL}/admin/rag/upload`, {
      method: 'POST',
      headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : undefined,
      body: form
    });
    try {
      const data = await resp.json();
      if (resp.ok) return { success: true, data };
      return { success: false, error: data.detail || 'Upload failed' };
    } catch {
      return { success: false, error: 'Upload parse error' };
    }
  }

  // === Whisper ASR ===
  async listWhisperModels(): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/whisper/models');
  }
  async downloadWhisperModel(model: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/whisper/download', { method: 'POST', body: JSON.stringify({ model }) });
  }
  async setWhisperModel(model: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/whisper/set-model', { method: 'POST', body: JSON.stringify({ model }) });
  }
  async downloadWhisperModelAsync(model: string): Promise<ApiResponse<{ task_id: string; model: string }>> {
    return this.makeRequest(`/whisper/models/${encodeURIComponent(model)}/download-async`, { method: 'POST' });
  }
  async whisperDownloadTaskStatus(task_id: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/whisper/models/download-tasks/${encodeURIComponent(task_id)}`);
  }
  async activateWhisperModel(model: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/whisper/models/${encodeURIComponent(model)}/activate`, { method: 'POST' });
  }
  async deleteWhisperModel(model: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/whisper/models/${encodeURIComponent(model)}`, { method: 'DELETE' });
  }
  async transcribeAudio(file: File, model?: string): Promise<ApiResponse<{ text: string; model_used: string }>> {
    const form = new FormData();
    form.append('audio', file);
    if (model) form.append('provider', model);
    const accessToken = CredentialManager.getAccessToken();
    const headers: HeadersInit = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
    try {
      const resp = await fetch(`${API_BASE_URL}/transcribe`, { method: 'POST', headers, body: form });
      const data = await resp.json();
      // 202 => modello in download/caricamento
      if (resp.status === 202) {
        return { success: false, error: data.status || 'Model not ready', data } as any;
      }
      if (resp.ok) return { success: true, data };
      return { success: false, error: data.detail || 'Transcription failed' };
    } catch (e:any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }
  async whisperModelStatus(model: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/whisper/models/${encodeURIComponent(model)}/status`);
  }
  async getWhisperHealth(): Promise<ApiResponse<any>> {
    return this.makeRequest('/whisper/health');
  }
  async warmWhisperModel(model?: string): Promise<ApiResponse<any>> {
    const body = model ? JSON.stringify({ model }) : undefined;
    return this.makeRequest('/whisper/warm' + (model && !body ? `?model=${encodeURIComponent(model)}` : ''), { method: 'POST', body });
  }

  // === Available Models for Providers ===
  async getAvailableModels(provider: string): Promise<ApiResponse<{ models: string[] }>> {
    return this.makeRequest(`/admin/models/${encodeURIComponent(provider)}`);
  }

  // === Database Info ===
  async getDatabaseInfo(include_sizes: boolean = false, opts: { order?: 'name'|'rows'|'size'; cacheSeconds?: number; forceRefresh?: boolean } = {}): Promise<ApiResponse<{ engine: string; version?: string|null; tables: ({ name: string; rows: number|null; size_bytes?: number|null; size_pct?: number }|string)[]; critical_missing?: string[]; attached?: any[]; total_rows?: number; total_size_bytes?: number|null; elapsed_ms?: number; include_sizes?: boolean; order?: string; cached?: boolean; cache_age_s?: number; cache_ttl_s?: number }>> {
    const params: string[] = [];
    if (include_sizes) params.push('include_sizes=true');
    if (opts.order) params.push(`order=${encodeURIComponent(opts.order)}`);
    if (typeof opts.cacheSeconds === 'number') params.push(`cache_seconds=${opts.cacheSeconds}`);
    if (opts.forceRefresh) params.push('force_refresh=true');
    const qp = params.length ? `?${params.join('&')}` : '';
    return this.makeRequest<{ engine: string; version?: string|null; tables: ({ name: string; rows: number|null; size_bytes?: number|null; size_pct?: number }|string)[]; critical_missing?: string[]; attached?: any[]; total_rows?: number; total_size_bytes?: number|null; elapsed_ms?: number; include_sizes?: boolean; order?: string; cached?: boolean; cache_age_s?: number; cache_ttl_s?: number }>(`/admin/db-info${qp}`);
  }

  // === Predefined Queries ===
  async listQueries(): Promise<ApiResponse<{ queries: any[] }>> {
    return this.makeRequest('/queries');
  }
  async describeQuery(id: string): Promise<ApiResponse<{ query: any }>> {
    return this.makeRequest(`/queries/${encodeURIComponent(id)}`);
  }
  async previewQuery(id: string, params: Record<string, any>): Promise<ApiResponse<{ query_id: string; count: number; rows: any[] }>> {
    return this.makeRequest(`/queries/${encodeURIComponent(id)}/preview`, { method: 'POST', body: JSON.stringify({ params }) });
  }
  async executeQuery(id: string, params: Record<string, any>): Promise<ApiResponse<{ query_id: string; count: number; rows: any[] }>> {
    return this.makeRequest(`/queries/${encodeURIComponent(id)}/execute`, { method: 'POST', body: JSON.stringify({ params }) });
  }
  async nlq(text: string): Promise<ApiResponse<{ matched: boolean; query_id?: string; params?: any; label?: string; message?: string; suggestions?: any[] }>> {
    return this.makeRequest('/queries/nlq', { method: 'POST', body: JSON.stringify({ text }) });
  }
  async exportQueryCsv(id: string, params: Record<string, any>): Promise<Blob> {
    const accessToken = CredentialManager.getAccessToken();
    const headers: HeadersInit = accessToken ? { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    const resp = await fetch(`${API_BASE_URL}/queries/${encodeURIComponent(id)}/export`, { method: 'POST', headers, body: JSON.stringify({ params }) });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(txt || 'Export failed');
    }
    return resp.blob();
  }

  // === DB Explorer (Admin) ===
  async listDbTables(): Promise<ApiResponse<{ tables: string[] }>> {
    return this.makeRequest<{ tables: string[] }>(`/admin/db/tables`);
  }
  async sampleTable(table: string, limit: number = 100): Promise<ApiResponse<{ columns: string[]; rows: any[] }>> {
    const q = new URLSearchParams({ limit: String(limit) }).toString();
    return this.makeRequest<{ columns: string[]; rows: any[] }>(`/admin/db/table/${encodeURIComponent(table)}?${q}`);
  }
  async runDbQuery(sql: string, limit: number = 100): Promise<ApiResponse<{ columns: string[]; rows: any[] }>> {
    return this.makeRequest<{ columns: string[]; rows: any[] }>(`/admin/db/query`, { method: 'POST', body: JSON.stringify({ sql, limit }) });
  }
  async getTableColumns(table: string): Promise<ApiResponse<{ name: string; type: string; is_nullable: boolean; is_primary: boolean }[]>> {
    return this.makeRequest(`/admin/db/columns/${encodeURIComponent(table)}`);
  }
  async dbSearch(table: string, q: string, limit: number = 50): Promise<ApiResponse<{ columns: string[]; rows: any[] }>> {
    const qs = new URLSearchParams({ table, q, limit: String(limit) }).toString();
    return this.makeRequest<{ columns: string[]; rows: any[] }>(`/admin/db/search?${qs}`);
  }
  async dbUpdate(table: string, key: Record<string, any>, set: Record<string, any>): Promise<ApiResponse<{ updated: number }>> {
    return this.makeRequest<{ updated: number }>(`/admin/db/update`, { method: 'POST', body: JSON.stringify({ table, key, set }) });
  }
  async dbInsert(table: string, values: Record<string, any>): Promise<ApiResponse<{ inserted: number }>> {
    return this.makeRequest<{ inserted: number }>(`/admin/db/insert`, { method: 'POST', body: JSON.stringify({ table, values }) });
  }
  async dbDelete(table: string, key: Record<string, any>): Promise<ApiResponse<{ deleted: number }>> {
    return this.makeRequest<{ deleted: number }>(`/admin/db/delete`, { method: 'POST', body: JSON.stringify({ table, key }) });
  }

  // === DB Query Builder ===
  async dbQueryBuilder(payload: {
    table: string;
    select?: string[];
    filters?: { column: string; op: string; value?: any }[];
    group_by?: string[];
    metrics?: { fn: 'count'|'sum'|'avg'|'min'|'max'; column?: string; alias?: string }[];
    order_by?: { by: string; dir?: 'ASC'|'DESC' };
    limit?: number;
    offset?: number;
    distinct?: boolean;
  }): Promise<ApiResponse<{ columns: string[]; rows: any[] }>> {
    return this.makeRequest<{ columns: string[]; rows: any[] }>(`/admin/db/query-builder`, { method: 'POST', body: JSON.stringify(payload) });
  }

  // === Forms (Questionari) ===
  async listForms(): Promise<ApiResponse<{ forms: { id: string; name: string; description?: string; items_count: number }[] }>> {
    return this.makeRequest(`/forms`);
  }
  async getForm(formId: string): Promise<ApiResponse<{ form: { id: string; name: string; description?: string; items: any[] } }>> {
    return this.makeRequest(`/forms/${encodeURIComponent(formId)}`);
  }
  async submitForm(formId: string, values: any, opts: { conversationId?: string; personalityId?: string } = {}): Promise<ApiResponse<{ id: string }>> {
    return this.makeRequest(`/forms/${encodeURIComponent(formId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ values, conversation_id: opts.conversationId || null, personality_id: opts.personalityId || null })
    });
  }
  // Admin forms
  async adminListForms(): Promise<ApiResponse<{ forms: any[] }>> {
    return this.makeRequest(`/admin/forms`);
  }
  async adminSaveForm(form: { id?: string; name: string; description?: string; items: any[] }): Promise<ApiResponse<{ id: string }>> {
    return this.makeRequest(`/admin/forms`, { method: 'POST', body: JSON.stringify(form) });
  }
  async adminDeleteForm(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.makeRequest(`/admin/forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async adminListFormSubmissions(id: string, limit: number = 100, offset: number = 0): Promise<ApiResponse<{ items: any[] }>> {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) }).toString();
    return this.makeRequest(`/admin/forms/${encodeURIComponent(id)}/submissions?${q}`);
  }

  // === Pipeline (Regex Routes & File Mappings) ===
  async getPipelineConfig(): Promise<ApiResponse<{ routes: { pattern: string; topic: string }[]; files: Record<string,string> }>> {
    return this.makeRequest('/admin/pipeline');
  }
    async getPipelineSettings(): Promise<ApiResponse<{ settings: { force_case_insensitive: boolean; normalize_accents: boolean } }>> {
      return this.makeRequest('/admin/pipeline-settings');
    }
    async updatePipelineSettings(force_case_insensitive: boolean, normalize_accents: boolean): Promise<ApiResponse<any>> {
      return this.makeRequest('/admin/pipeline-settings', {
        method: 'POST',
        body: JSON.stringify({ force_case_insensitive, normalize_accents })
      });
    }
  async validatePipeline(): Promise<ApiResponse<{ issues: { pattern:string; topic?:string; severity:string; code:string; message:string }[]; counts: { ERROR:number; WARN:number; INFO:number } }>> {
    return this.makeRequest('/admin/pipeline/validate');
  }
  async getPipelineRegexGuide(): Promise<ApiResponse<{ content: string }>> {
    return this.makeRequest('/admin/pipeline/regex-guide');
  }
  async getAdminGuide(): Promise<ApiResponse<{ content: string }>> {
    return this.makeRequest('/admin/admin-guide');
  }
  async savePipelineConfig(cfg: { routes: { pattern: string; topic: string }[]; files: Record<string,string> }): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline', { method: 'POST', body: JSON.stringify(cfg) });
  }
  async resetPipelineConfig(): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/reset', { method: 'POST' });
  }
  async addPipelineRoute(pattern: string, topic: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/route/add', { method: 'POST', body: JSON.stringify({ pattern, topic }) });
  }
  async updatePipelineRoute(old_pattern: string, old_topic: string, new_pattern: string, new_topic: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/route/update', { method: 'POST', body: JSON.stringify({ old_pattern, old_topic, new_pattern, new_topic }) });
  }
  async deletePipelineRoute(pattern: string, topic: string): Promise<ApiResponse<any>> {
    const qp = `?pattern=${encodeURIComponent(pattern)}&topic=${encodeURIComponent(topic)}`;
    return this.makeRequest(`/admin/pipeline/route${qp}`, { method: 'DELETE' });
  }
  async addPipelineFile(topic: string, filename: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/file/add', { method: 'POST', body: JSON.stringify({ topic, filename }) });
  }
  async updatePipelineFile(old_topic: string, new_topic: string, new_filename: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/file/update', { method: 'POST', body: JSON.stringify({ old_topic, new_topic, new_filename }) });
  }
  async deletePipelineFile(topic: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/pipeline/file?topic=${encodeURIComponent(topic)}`, { method: 'DELETE' });
  }
  async listAvailablePipelineFiles(): Promise<ApiResponse<{ files: string[] }>> {
    return this.makeRequest('/admin/pipeline/files/available');
  }
  async getPipelineFileContent(filename: string): Promise<ApiResponse<{ filename: string; content: string }>> {
    return this.makeRequest(`/admin/pipeline/file/content?filename=${encodeURIComponent(filename)}`);
  }
  async savePipelineFileContent(filename: string, content: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/admin/pipeline/file/content', { method: 'POST', body: JSON.stringify({ filename, content }) });
  }
  async uploadPipelineFile(file: File): Promise<ApiResponse<{ filename: string }>> {
    const form = new FormData();
    form.append('file', file);
    const accessToken = CredentialManager.getAccessToken();
    const headers: HeadersInit = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/pipeline/file/upload`, { method: 'POST', headers, body: form });
      const data = await resp.json();
      if (resp.ok) return { success: true, data };
      return { success: false, error: data.detail || 'Upload failed' };
    } catch (e:any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  // === Admin User Management ===
  async changeUserRole(userId: number, isAdmin: boolean): Promise<ApiResponse<any>> {
    return this.makeRequest(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ is_admin: isAdmin })
    });
  }

  // === Endpoint Introspection ===
  async listEndpoints(): Promise<ApiResponse<{ count: number; endpoints: { method: string; path: string; name?: string; summary?: string }[] }>> {
    return this.makeRequest('/admin/endpoints');
  }

  // === Interactions Logs (detailed usage) ===
  async getInteractionDates(): Promise<ApiResponse<{ dates: string[] }>> {
    return this.makeRequest('/admin/logs/interactions/dates');
  }
  async getInteractionFilters(date?: string): Promise<ApiResponse<{ providers: string[]; events: string[]; models: string[]; topics: string[]; user_ids: any[]; conversation_ids: string[]; personalities: { id: string; name: string }[] }>> {
    const qp = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.makeRequest(`/admin/logs/interactions/filters${qp}`);
  }
  async getInteractions(params: { date?: string; limit?: number; offset?: number; provider?: string; event?: string; personality_id?: string; model?: string; conversation_id?: string; user_id?: number; topic?: string; request_id?: string; group_by_request_id?: boolean; rag?: boolean; min_duration_ms?: number; max_duration_ms?: number; min_tokens?: number; max_tokens?: number }): Promise<ApiResponse<{ items: any[]; total: number; date: string; grouped?: boolean }>> {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k,v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    const qs = q.toString();
    return this.makeRequest(`/admin/logs/interactions${qs ? ('?' + qs) : ''}`);
  }

  // === Welcome & Guides ===
  async getWelcomeGuideState(): Promise<ApiResponse<{ welcome: { active_id: string|null; messages: any[] }; guides: { active_id: string|null; guides: any[] } }>> {
    return this.makeRequest('/welcome-guides/state');
  }
  async listWelcomeMessages(): Promise<ApiResponse<any[]>> {
    return this.makeRequest('/welcome-guides/welcome');
  }
  async listGuides(): Promise<ApiResponse<any[]>> {
    return this.makeRequest('/welcome-guides/guides');
  }
  async createWelcomeMessage(payload: { title?: string|null; content: string }): Promise<ApiResponse<any>> {
    return this.makeRequest('/welcome-guides/welcome', { method: 'POST', body: JSON.stringify(payload) });
  }
  async createGuide(payload: { title?: string|null; content: string }): Promise<ApiResponse<any>> {
    return this.makeRequest('/welcome-guides/guides', { method: 'POST', body: JSON.stringify(payload) });
  }
  async updateWelcomeMessage(id: string, payload: { title?: string|null; content: string }): Promise<ApiResponse<any>> {
    return this.makeRequest(`/welcome-guides/welcome/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  async updateGuide(id: string, payload: { title?: string|null; content: string }): Promise<ApiResponse<any>> {
    return this.makeRequest(`/welcome-guides/guides/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  }
  async deleteWelcomeMessage(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/welcome-guides/welcome/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async deleteGuide(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest(`/welcome-guides/guides/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  async activateWelcome(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/welcome-guides/activate', { method: 'POST', body: JSON.stringify({ id, kind: 'welcome' }) });
  }
  async activateGuide(id: string): Promise<ApiResponse<any>> {
    return this.makeRequest('/welcome-guides/activate', { method: 'POST', body: JSON.stringify({ id, kind: 'guide' }) });
  }
  async getPublicWelcomeGuide(): Promise<ApiResponse<{ welcome: any; guide: any }>> {
    return this.makeRequest('/welcome-guides/public');
  }
  async downloadConversationWithReportPost(conversationId: string, history: { id?: string; role: string; content: string; timestamp?: string }[], format?: 'zip'|'pdf'|'txt'): Promise<Blob> {
    const accessToken = CredentialManager.getAccessToken();
    if (!accessToken) throw new Error('User not authenticated. Please login first.');
    const headers: HeadersInit = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const body = {
      format: format || 'zip',
      conversation_history: history
    };
    const resp = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (resp.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${CredentialManager.getAccessToken()}`;
        const retry = await fetch(`${API_BASE_URL}/conversations/${conversationId}/export-with-report`, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!retry.ok) throw new Error(`Download failed: ${retry.status}`);
        return retry.blob();
      }
      throw new Error('Authentication expired');
    }
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Download failed: ${resp.status} - ${txt}`);
    }
    return resp.blob();
  }

  // Config backup & integrity
  async getConfigStatus(): Promise<ApiResponse<{ files: {id:string; relative:string; filename:string; kind:string; required:boolean; sha256?:string; exists:boolean}[]; aggregate_sha256: string }>> {
    return this.makeRequest('/admin/config/status');
  }
  // Legacy/simple backup (admin endpoints)
  async downloadConfigBackup(params: { include_seed?: boolean; include_avatars?: boolean; include_db?: boolean; dry_run?: boolean } = {}): Promise<Response> {
    const q = new URLSearchParams();
    if (params.include_seed) q.set('include_seed','true');
    if (params.include_avatars) q.set('include_avatars','true');
    if (params.include_db === false) q.set('include_db','false');
    if (params.dry_run) q.set('dry_run','true');
    const url = `/admin/config/backup${q.toString()?`?${q.toString()}`:''}`;
    const accessToken = CredentialManager.getAccessToken();
    const headers: Record<string,string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${API_BASE_URL}${url}`, { headers });
  }
  async downloadDbDump(tables?: string[]): Promise<Response> {
    const q = new URLSearchParams();
    if (tables && tables.length) q.set('tables', tables.join(','));
    const url = `/admin/db/dump${q.toString()?`?${q.toString()}`:''}`;
    const accessToken = CredentialManager.getAccessToken();
    const headers: Record<string,string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${API_BASE_URL}${url}`, { headers });
  }
  async restoreConfigBackup(file: File, opts: { allow_seed?: boolean; dry_run?: boolean } = {}): Promise<ApiResponse<any>> {
    const q = new URLSearchParams();
    if (opts.allow_seed) q.set('allow_seed','true');
    if (opts.dry_run !== false) q.set('dry_run','true'); // default dry_run true
    const url = `/admin/config/restore${q.toString()?`?${q.toString()}`:''}`;
    const form = new FormData();
    form.append('file', file, file.name || 'backup.zip');
    const accessToken = CredentialManager.getAccessToken();
    const headers: Record<string,string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    try {
      const res = await fetch(`${API_BASE_URL}${url}`, { method: 'POST', headers, body: form });
      const data = await res.json().catch(()=>({}));
      if (res.ok) return { success: true, data };
      return { success: false, error: (data.detail || data.error || 'Restore failed'), data };
    } catch (e:any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  // Advanced backup (new endpoints with conflict preview/apply)
  async backupExportZipAdvanced(): Promise<Response> {
    const accessToken = CredentialManager.getAccessToken();
    const headers: Record<string,string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return fetch(`${API_BASE_URL}/backup/export`, { headers });
  }
  async backupImportPreview(file: File): Promise<ApiResponse<{ import_id: string; conflicts: any; summary: any }>> {
    const form = new FormData();
    form.append('file', file, file.name || 'backup.zip');
    const accessToken = CredentialManager.getAccessToken();
    const headers: Record<string,string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    try {
      const res = await fetch(`${API_BASE_URL}/backup/import/preview`, { method: 'POST', headers, body: form });
      const data = await res.json();
      if (res.ok) return { success: true, data } as any;
      return { success: false, error: data?.detail || data?.error || 'Preview failed' };
    } catch (e:any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }
  async backupImportApply(import_id: string, decisions: any): Promise<ApiResponse<{ ok: boolean }>> {
    return this.makeRequest<{ ok: boolean }>(`/backup/import/apply`, { method: 'POST', body: JSON.stringify({ import_id, decisions }) });
  }
  async backupImportDelete(import_id: string): Promise<ApiResponse<{ deleted: string }>> {
    return this.makeRequest<{ deleted: string }>(`/backup/import/${encodeURIComponent(import_id)}`, { method: 'DELETE' });
  }
}

// Istanza singola del servizio API
export const apiService = new ApiService();

// Utility per gestire errori API
export function handleApiError(error: string): string {
  const errorMappings: { [key: string]: string } = {
    'Invalid credentials': 'Email o password non corretti',
    'Email already registered': 'Email già registrata',
    'Password not strong enough': 'Password non abbastanza forte',
    'Account temporarily locked': 'Account temporaneamente bloccato',
    'Account temporarily locked due to multiple failed login attempts': 'Account temporaneamente bloccato per troppi tentativi falliti',
    'Could not validate credentials': 'Token di accesso non valido',
    'User not found or inactive': 'Utente non trovato o inattivo',
    'Invalid refresh token': 'Refresh token non valido',
    'Authentication expired': 'Autenticazione scaduta. Effettua di nuovo il login.',
    'Authentication expired. Please login again.': 'Autenticazione scaduta. Effettua di nuovo il login.',
    'Current password is incorrect': 'Password corrente errata',
    'Password change not required': 'Cambio password non richiesto',
    'Request failed': 'Richiesta non riuscita'
  };

  return errorMappings[error] || error;
}
