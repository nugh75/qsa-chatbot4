// API Service Types per il sistema di import/export
export interface ApiResponse<T = any> {
  data: T;
  status?: number;
  headers?: Record<string, string>;
}

export interface ApiService {
  get: <T = any>(url: string, options?: RequestInit) => Promise<ApiResponse<T>>;
  post: <T = any>(url: string, data?: any, options?: {
    headers?: Record<string, string>;
    responseType?: 'json' | 'blob' | 'text';
  }) => Promise<ApiResponse<T>>;
  put?: <T = any>(url: string, data?: any, options?: RequestInit) => Promise<ApiResponse<T>>;
  delete?: <T = any>(url: string, options?: RequestInit) => Promise<ApiResponse<T>>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  description?: string;
}

// Simple API Service implementation
export function createApiService(baseUrl: string): ApiService {
  return {
    get: async <T = any>(url: string, options?: RequestInit): Promise<ApiResponse<T>> => {
      const response = await fetch(`${baseUrl}${url}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          ...options?.headers
        },
        ...options
      });
      let data: any = null;
      try {
        const ct = response.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          data = await response.json();
        } else {
          const txt = await response.text();
          try { data = JSON.parse(txt) } catch { data = { raw: txt } }
        }
      } catch (e) {
        data = { error: 'parse_failed' }
      }
      return { data, status: response.status };
    },

    post: async <T = any>(url: string, data?: any, options?: {
      headers?: Record<string, string>;
      responseType?: 'json' | 'blob' | 'text';
    }): Promise<ApiResponse<T>> => {
      const isFormData = data instanceof FormData;
      
      const config: RequestInit = {
        method: 'POST',
        headers: isFormData ? {} : {
          'Content-Type': 'application/json',
          ...options?.headers
        },
        body: isFormData ? data : JSON.stringify(data)
      };

      const response = await fetch(`${baseUrl}${url}`, config);
      let responseData: any;
      try {
        if (options?.responseType === 'blob') {
          responseData = await response.blob();
        } else if (options?.responseType === 'text') {
          responseData = await response.text();
        } else {
          const ct = response.headers.get('content-type') || ''
          if (ct.includes('application/json')) {
            responseData = await response.json();
          } else {
            const txt = await response.text();
            try { responseData = JSON.parse(txt) } catch { responseData = { raw: txt } }
          }
        }
      } catch {
        responseData = { error: 'parse_failed' }
      }
      return { data: responseData, status: response.status };
    }
  };
}
