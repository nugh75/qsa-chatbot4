# Migrazione da SQLite a PostgreSQL

## 1. Esporta lo schema e i dati da SQLite
Assicurati che il container backend sia fermo per evitare scritture concorrenti.

```bash
sqlite3 backend/storage/databases/qsa_chatbot.db ".schema" > /tmp/schema_sqlite.sql
sqlite3 backend/storage/databases/qsa_chatbot.db ".mode insert" ".output /tmp/data_sqlite.sql" "SELECT * FROM users; SELECT * FROM conversations; SELECT * FROM messages; SELECT * FROM user_devices; SELECT * FROM admin_actions; SELECT * FROM survey_responses;"
```

Puoi anche esportare tabella per tabella:
```bash
for t in users conversations messages user_devices admin_actions survey_responses; do
  sqlite3 backend/storage/databases/qsa_chatbot.db ".mode insert" ".output /tmp/${t}.sql" "SELECT * FROM ${t};"
done
```

## 2. Adatta lo schema a PostgreSQL
Principali differenze:
- `INTEGER PRIMARY KEY AUTOINCREMENT` -> `SERIAL PRIMARY KEY` (o `BIGSERIAL` se necessario)
- `BOOLEAN` in SQLite è `INTEGER` dietro le quinte; in Postgres tieni `BOOLEAN`
- `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` ok (in Postgres usa `TIMESTAMPTZ` se vuoi timezone). Puoi sostituire con `TIMESTAMP WITH TIME ZONE DEFAULT NOW()`.
- Rimuovi `PRAGMA` / comandi specifici SQLite
- Constraints `CHECK (role IN ('user','assistant'))` funzionano uguale.
- Sostituisci `ON DELETE CASCADE` invariato.

Esempio schema Postgres (bozza):
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  user_key_hash TEXT NOT NULL,
  escrow_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  must_change_password BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_encrypted TEXT NOT NULL,
  title_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  device_id TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content_encrypted TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  token_count INTEGER DEFAULT 0,
  processing_time REAL DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE user_devices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_ip TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE admin_actions (
  id SERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id INTEGER,
  target_email TEXT,
  description TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  success BOOLEAN DEFAULT TRUE
);

CREATE TABLE survey_responses (
  id SERIAL PRIMARY KEY,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
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

-- Indici
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_devices_fingerprint ON user_devices(device_fingerprint);
CREATE INDEX idx_admin_actions_timestamp ON admin_actions(timestamp DESC);
CREATE INDEX idx_survey_session ON survey_responses(session_id);
```

## 3. Carica lo schema in Postgres
Con docker compose attivo:
```bash
docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/schema_pg.sql
```

## 4. Importa i dati
Converti gli INSERT generati da SQLite se necessario (in genere compatibili). Se hai usato file separati:
```bash
for t in users conversations messages user_devices admin_actions survey_responses; do
  docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/${t}.sql
done
```
Nota: se compaiono errori di violazione unique, verifica duplicati nel file origine.

## 4-bis. Rinominare/migrare `user_devices` -> `devices`
Il pannello admin usa la tabella `devices`. Se provieni da `user_devices` in SQLite, crea la tabella nuova e copia i dati:

Schema consigliato per `devices` (se non l’hai già creato):
```sql
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
```

Migrazione dati (mappatura campi da `user_devices`):
```sql
INSERT INTO devices (id, user_id, device_name, device_type, fingerprint, last_sync, created_at, is_active, sync_count, last_ip, user_agent)
SELECT id, user_id, device_name, 'unknown' as device_type, device_fingerprint as fingerprint,
       last_sync, created_at, CASE WHEN is_active IN (1, TRUE) THEN TRUE ELSE FALSE END as is_active,
       0 as sync_count, last_ip, user_agent
FROM user_devices
ON CONFLICT (id) DO NOTHING;
```

## 4-ter. Crea `device_sync_log`
Per tracciare le operazioni di sync dei dispositivi (richiesto dall’admin panel):
```sql
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
```

> Nota: nella versione SQLite esistevano trigger per aggiornare `devices.sync_count` automaticamente. In Postgres puoi replicare con trigger PL/pgSQL, oppure aggiornare i contatori esplicitamente lato applicazione.

## 4-quater. Migrazione RAG (da `storage/databases/rag.db` a Postgres)
Se vuoi unificare i metadati RAG su Postgres, crea le tabelle e importa i dati.

Schema (compatibile con quello SQLite del `rag_engine`):
```sql
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
```

Esporta i dati da SQLite (rag.db):
```bash
sqlite3 backend/storage/databases/rag.db \
  ".mode insert" \
  ".output /tmp/rag_data.sql" \
  "SELECT * FROM rag_groups; SELECT * FROM rag_documents; SELECT * FROM rag_chunks;"
```

## 5. Tabelle Dati (CSV/XLSX) gestite via API

Per abilitare l'upload/modifica di tabelle CSV/XLSX richiamabili dalla chat e dalle personalità, crea le seguenti tabelle su Postgres (se non già create automaticamente all'avvio):

```sql
CREATE TABLE IF NOT EXISTS data_tables (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  columns JSONB,
  original_filename TEXT,
  file_format TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_table_rows (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES data_tables(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dtr_table ON data_table_rows(table_id);
```

Estensione schema `personalities`: aggiungi una colonna opzionale per collegare le tabelle abilitate a ciascuna personalità.

```sql
ALTER TABLE personalities ADD COLUMN IF NOT EXISTS enabled_data_tables JSONB DEFAULT '[]'::jsonb;
```

L'applicazione aggiorna e legge `enabled_data_tables` per limitare quali tabelle vengono interrogate in chat per una data personalità.

Importa in Postgres:
```bash
docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/rag_data.sql
```

> Attenzione: `embedding_vector` in SQLite è BLOB pickled; in Postgres viene mappato a `BYTEA`. Gli INSERT generati da SQLite per i BLOB sono compatibili in molti casi, ma verifica e, se necessario, trasformali (es. via script Python che legge da SQLite e scrive in Postgres).

## 5. Aggiorna il codice
- Sostituisci `sqlite3` con `psycopg2` (o meglio migra a SQLAlchemy per astrazione futura).
- Parametri: in SQLite usi `?`, con psycopg2 devi usare `%s`.
- Rimuovi `PRAGMA` e logiche di alter che dipendono da esso.
- Usa `NOW()` per timestamp automatici o gestiscili lato applicazione.

Per questa codebase sono già stati adattati:
- Conversione booleane/placeholder nel layer DB (`db_manager.exec`) e cursori dict per Postgres.
- `is_active` gestito come boolean su Postgres (niente `= 1`).

## 6. Variabile d'ambiente
Imposta `DATABASE_URL` nel tuo `.env` oppure rely su docker-compose.
Formato: `postgresql://USER:PASS@HOST:PORT/DBNAME`

## 7. Verifica
Esegui una query semplice:
```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT COUNT(*) FROM users;"
```
Avvia il backend e controlla i log errori di connessione.

## 8. Opzione fallback
Mantieni il vecchio database SQLite fino a conferma funzionamento; implementa nel codice:
```python
import os
DB_URL = os.getenv("DATABASE_URL")
if DB_URL:
    # usa Postgres
else:
    # fallback SQLite
```

## 9. Backup
Esempio backup Postgres:
```bash
docker compose exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql
```

## 10. Passi successivi (consigliati)
- Introdurre SQLAlchemy + Alembic per migrazioni future.
- Aggiungere indice full text (pg_trgm) se farai ricerche LIKE estese.
- Monitorare prestazioni con `EXPLAIN ANALYZE`.

## Script di supporto: creazione tabelle mancanti
Per comodità è incluso uno script che crea le tabelle mancanti su Postgres:

```bash
docker compose exec backend bash -lc "python -m app.scripts.pg_create_missing_tables"
```

Lo script applica `backend/app/scripts/postgres_create_missing.sql` ed è idempotente.
