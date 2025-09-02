export interface AdminConfig {
  ai_providers: {
    local:      { enabled: boolean; name: string; models: string[]; selected_model: string }
    gemini:     { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    claude:     { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openai:     { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    openrouter: { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; models: string[]; selected_model: string }
    ollama:     { enabled: boolean; name: string; base_url: string; models: string[]; selected_model: string }
  }
  tts_providers: {
    edge:        { enabled: boolean; name: string; voices: string[]; selected_voice: string }
    elevenlabs:  { enabled: boolean; name: string; api_key_status: string; api_key_masked: string; voices: string[]; selected_voice: string }
    openai_voice:{ enabled: boolean; name: string; voices: string[]; selected_voice: string }
    piper:       { enabled: boolean; name: string; voices: string[]; selected_voice: string }
  }
  default_provider: string
  default_tts: string
  summary_settings?: { provider: string; enabled: boolean; model?: string | null }
  memory_settings?:  { max_messages_per_session: number }
}

export interface FeedbackStats {
  total: number
  likes: number
  dislikes: number
  by_provider: Record<string, { likes: number; dislikes: number }>
}

export interface SystemPromptEntry { id: string; name: string; text: string }
export interface SummaryPromptEntry { id: string; name: string; text: string }
export interface PersonalityEntry {
  id: string;
  name: string;
  provider: string;
  model: string;
  system_prompt_id: string;
  avatar_url?: string | null;
  active?: boolean; // active personalities appear in chat dropdown
  tts_provider?: string | null;
  tts_voice?: string | null;
  // New structured welcome + guide fields
  welcome_message_id?: string | null;
  welcome_message_content?: string | null; // preferred text field
  // Legacy alias (old API) still used as fallback
  welcome_message?: string | null;
  guide_id?: string | null;
  guide_content?: string | null;
  context_window?: number | null;
  temperature?: number | null;
  max_tokens?: number | null;
  // Pipeline e RAG configurazioni
  enabled_pipeline_topics?: string[];
  enabled_rag_groups?: number[];
  enabled_mcp_servers?: string[];
}

export interface PipelineOption {
  topic: string;
}

export interface RAGGroup {
  id: number;
  name: string;
  document_count: number;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  capabilities: string[];
}
