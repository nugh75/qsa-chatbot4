/**
 * API service for authenticated requests to the backend
 */

import { CredentialManager } from './crypto';

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
      console.log('🔑 makeRequest - Access token from storage:', accessToken?.substring(0, 20) + '...');
      
      if (accessToken) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };
        console.log('🔑 makeRequest - Added Authorization header');
      } else if (!options.headers) {
        options.headers = {
          'Content-Type': 'application/json'
        };
        console.log('🔑 makeRequest - No token found, only Content-Type header');
      }

      console.log('📡 makeRequest - Making request to:', `${API_BASE_URL}${endpoint}`);
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
  async getSummarySettings(): Promise<ApiResponse<{ settings: { provider: string; enabled: boolean } }>> {
    return this.makeRequest<{ settings: { provider: string; enabled: boolean } }>('/admin/summary-settings');
  }
  async updateSummarySettings(settings: { provider: string; enabled: boolean }): Promise<ApiResponse> {
    return this.makeRequest('/admin/summary-settings', { method: 'POST', body: JSON.stringify(settings) });
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
    ui_settings?: { arena_public: boolean };
  }>> {
    return this.makeRequest('/config/public');
  }

  async getPersonalities(): Promise<ApiResponse<{ default_id: string|null; personalities: { id: string; name: string; provider: string; model: string; system_prompt_id: string; avatar_url?: string|null }[] }>> {
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
      if (resp.ok) return { success: true, data };
      return { success: false, error: data.detail || 'Transcription failed' };
    } catch (e:any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }
  async getWhisperHealth(): Promise<ApiResponse<any>> {
    return this.makeRequest('/whisper/health');
  }
  async warmWhisperModel(model?: string): Promise<ApiResponse<any>> {
    const body = model ? JSON.stringify({ model }) : undefined;
    return this.makeRequest('/whisper/warm' + (model && !body ? `?model=${encodeURIComponent(model)}` : ''), { method: 'POST', body });
  }

  // === Pipeline (Regex Routes & File Mappings) ===
  async getPipelineConfig(): Promise<ApiResponse<{ routes: { pattern: string; topic: string }[]; files: Record<string,string> }>> {
    return this.makeRequest('/admin/pipeline');
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
