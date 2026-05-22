-- Core schema for Postgres (users, conversations, messages, user_devices, admin_actions, survey_responses)

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  user_key_hash TEXT NOT NULL,
  escrow_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'user',
  username TEXT
);

-- CONVERSATIONS
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_encrypted TEXT NOT NULL,
  title_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  device_id TEXT
);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content_encrypted TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  token_count INTEGER DEFAULT 0,
  processing_time DOUBLE PRECISION DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- USER DEVICES (legacy name used by app for per-user devices)
CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  last_sync TIMESTAMPTZ DEFAULT NOW(),
  last_ip TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADMIN ACTIONS (audit)
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id INTEGER,
  target_email TEXT,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  success BOOLEAN DEFAULT TRUE
);

-- SURVEY RESPONSES
CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  demo_eta INTEGER,
  demo_sesso TEXT,
  demo_istruzione TEXT,
  demo_tipo_istituto TEXT,
  demo_provenienza TEXT,
  demo_area TEXT,
  q_utilita INTEGER, q_pertinenza INTEGER, q_chiarezza INTEGER, q_dettaglio INTEGER,
  q_facilita INTEGER, q_velocita INTEGER, q_fiducia INTEGER, q_riflessione INTEGER,
  q_coinvolgimento INTEGER, q_riuso INTEGER,
  q_riflessioni TEXT, q_commenti TEXT
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON user_devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_survey_session ON survey_responses(session_id);

