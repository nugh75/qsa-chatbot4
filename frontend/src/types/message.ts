// Shared message types used across the frontend

export type SourceDocs = {
  rag_chunks?: { chunk_index?: number; filename?: string; similarity?: number; preview?: string; content?: string; document_id?: any; stored_filename?: string; chunk_label?: string; download_url?: string }[]
  pipeline_topics?: { name: string; description?: string | null }[]
  rag_groups?: { id: any; name: string }[]
  data_tables?: { table_id: string; title: string; download_url?: string; row_ids?: (string|number)[] }[]
}

export type UploadSummary = { id: string; filename: string; size: number; file_type: string; content?: string }[]

export type Msg = {
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
  topic?: string
  source_docs?: SourceDocs | null
  __sourcesExpanded?: boolean
  uploadSummary?: UploadSummary
  __uploadExpanded?: Record<string, boolean>
  isWelcome?: boolean
  // Optional structured payloads for special message types (e.g. form results)
  __formResult?: any
}

export default Msg
