/**
 * API service for authenticated requests to the backend
 */

import { CredentialManager } from './crypto';

const API_BASE_URL = 'http://localhost:8005/api';

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
  
  // Get public config for enabled providers and models
  async getPublicConfig(): Promise<ApiResponse<{
    enabled_providers: string[];
    enabled_tts_providers: string[];
    enabled_asr_providers: string[];
    default_provider: string;
    default_tts: string;
    default_asr: string;
  }>> {
    return this.makeRequest('/config/public');
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
    'Could not validate credentials': 'Token di accesso non valido',
    'User not found or inactive': 'Utente non trovato o inattivo'
  };

  return errorMappings[error] || error;
}
