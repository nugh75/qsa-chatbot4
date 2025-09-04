-- Postgres DDL to create critical tables missing after migration
-- Safe to run multiple times (IF NOT EXISTS)

-- 1) Devices (admin panel expects this name and columns)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT DEFAULT 'unknown',
  fingerprint TEXT NOT NULL,
  last_sync TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sync_count INTEGER NOT NULL DEFAULT 0,
  last_ip TEXT,
  user_agent TEXT,
  force_sync BOOLEAN NOT NULL DEFAULT FALSE,
  force_sync_at TIMESTAMPTZ NULL,
  deactivated_at TIMESTAMPTZ NULL,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  admin_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices(fingerprint);

-- 2) Device sync log
-- Use TEXT id generated from md5(random...) to avoid requiring extensions
CREATE TABLE IF NOT EXISTS device_sync_log (
  id TEXT PRIMARY KEY DEFAULT (substr(md5(random()::text || clock_timestamp()::text), 1, 32)),
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  error_message TEXT,
  sync_data_size INTEGER,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_device_id ON device_sync_log(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_user_id ON device_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_timestamp ON device_sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_status ON device_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_operation_type ON device_sync_log(operation_type);

-- 3) RAG metadata (migrated from storage/databases/rag.db if desired)
CREATE TABLE IF NOT EXISTS rag_groups (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id SERIAL PRIMARY KEY,
  group_id INTEGER REFERENCES rag_groups(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT,
  file_hash TEXT NOT NULL,
  file_size INTEGER,
  content_preview TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_documents_hash_group UNIQUE (file_hash, group_id)
);
CREATE INDEX IF NOT EXISTS idx_documents_group ON rag_documents(group_id);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES rag_documents(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES rag_groups(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  content TEXT NOT NULL,
  embedding_vector BYTEA,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_group ON rag_chunks(group_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON rag_chunks(document_id);

-- Note: avoid FK to conversations/users here to keep this file runnable
-- before the core schema is imported. You can add FKs later if desired.
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_ms BIGINT,
  feedback TEXT NOT NULL CHECK (feedback IN ('like','dislike')),
  provider TEXT,
  model TEXT,
  personality_id TEXT,
  personality_name TEXT,
  user_id INTEGER,
  conversation_id TEXT,
  message_index INTEGER
);
CREATE INDEX IF NOT EXISTS idx_feedback_provider ON feedback(provider);
CREATE INDEX IF NOT EXISTS idx_feedback_model ON feedback(model);
CREATE INDEX IF NOT EXISTS idx_feedback_personality ON feedback(personality_id);

-- 5) Personalities (DB-based replacement for JSON file)
CREATE TABLE IF NOT EXISTS personalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tts_provider TEXT,
  tts_voice TEXT,
  avatar TEXT,
  welcome_message TEXT,
  guide_id TEXT,
  context_window INTEGER,
  temperature DOUBLE PRECISION,
  max_tokens INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_pipeline_topics JSONB,
  enabled_rag_groups JSONB,
  enabled_mcp_servers JSONB,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Ensure only one default personality at a time (partial unique index)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_one_default_personality'
  ) THEN
    CREATE UNIQUE INDEX uniq_one_default_personality ON personalities((is_default)) WHERE is_default IS TRUE;
  END IF;
END $$;
