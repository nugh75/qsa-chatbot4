"""
Migration for device sync logging table
"""

DEVICE_SYNC_LOG_MIGRATION = """
-- Tabella per tracciare le operazioni di sincronizzazione dei dispositivi
CREATE TABLE IF NOT EXISTS device_sync_log (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    device_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    operation_type TEXT NOT NULL, -- 'sync', 'register', 'deactivate', 'force_sync', 'reset', 'admin_action'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'error', 'timeout'
    details TEXT, -- JSON con dettagli specifici dell'operazione
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    duration_ms INTEGER, -- Durata operazione in millisecondi
    error_message TEXT, -- Messaggio di errore se status = 'error'
    sync_data_size INTEGER, -- Dimensione dati sincronizzati in bytes
    conflict_count INTEGER DEFAULT 0, -- Numero di conflitti risolti
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_device_sync_log_device_id ON device_sync_log(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_user_id ON device_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_timestamp ON device_sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_status ON device_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_device_sync_log_operation_type ON device_sync_log(operation_type);

-- Aggiungi campi mancanti alla tabella devices per supportare admin features
ALTER TABLE devices ADD COLUMN force_sync INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN force_sync_at TEXT;
ALTER TABLE devices ADD COLUMN deactivated_at TEXT;
ALTER TABLE devices ADD COLUMN conflict_count INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN admin_notes TEXT;

-- Aggiungi campo per ruolo admin nella tabella users
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;

-- Trigger per aggiornare sync_count quando viene aggiunto un log
CREATE TRIGGER IF NOT EXISTS update_device_sync_count
AFTER INSERT ON device_sync_log
WHEN NEW.status = 'success' AND NEW.operation_type = 'sync'
BEGIN
    UPDATE devices 
    SET sync_count = sync_count + 1,
        last_sync = NEW.timestamp
    WHERE id = NEW.device_id;
END;

-- Trigger per aggiornare conflict_count
CREATE TRIGGER IF NOT EXISTS update_device_conflict_count
AFTER INSERT ON device_sync_log
WHEN NEW.conflict_count > 0
BEGIN
    UPDATE devices 
    SET conflict_count = conflict_count + NEW.conflict_count
    WHERE id = NEW.device_id;
END;

-- Vista per statistiche dispositivi con salute
CREATE VIEW IF NOT EXISTS device_health_stats AS
SELECT 
    d.id,
    d.device_name,
    d.device_type,
    d.user_id,
    d.is_active,
    d.last_sync,
    d.sync_count,
    d.conflict_count,
    u.email as user_email,
    u.username as user_username,
    -- Calcolo punteggio salute
    CASE 
        WHEN d.is_active = 0 THEN 0
        WHEN d.last_sync IS NULL THEN 10
        WHEN julianday('now') - julianday(d.last_sync) > 7 THEN 30
        WHEN julianday('now') - julianday(d.last_sync) > 3 THEN 60
        ELSE 100
    END as health_score,
    -- Stato dispositivo
    CASE 
        WHEN d.is_active = 0 THEN 'inactive'
        WHEN d.last_sync IS NULL THEN 'never_synced'
        WHEN julianday('now') - julianday(d.last_sync) > 7 THEN 'offline'
        WHEN julianday('now') - julianday(d.last_sync) > 3 THEN 'warning'
        ELSE 'healthy'
    END as device_status,
    -- Statistiche sync recenti
    (SELECT COUNT(*) FROM device_sync_log dsl 
     WHERE dsl.device_id = d.id 
     AND dsl.timestamp > datetime('now', '-24 hours')) as syncs_24h,
    (SELECT COUNT(*) FROM device_sync_log dsl 
     WHERE dsl.device_id = d.id 
     AND dsl.status = 'error'
     AND dsl.timestamp > datetime('now', '-7 days')) as errors_7d
FROM devices d
JOIN users u ON d.user_id = u.id;

-- Vista per statistiche admin
CREATE VIEW IF NOT EXISTS admin_system_stats AS
SELECT 
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
    (SELECT COUNT(*) FROM users WHERE last_login > datetime('now', '-30 days')) as users_active_30d,
    (SELECT COUNT(*) FROM devices) as total_devices,
    (SELECT COUNT(*) FROM devices WHERE is_active = 1) as active_devices,
    (SELECT COUNT(*) FROM devices WHERE last_sync > datetime('now', '-7 days')) as devices_synced_7d,
    (SELECT COUNT(*) FROM conversations WHERE is_deleted = 0) as total_conversations,
    (SELECT COUNT(*) FROM messages WHERE is_deleted = 0) as total_messages,
    (SELECT COUNT(*) FROM device_sync_log WHERE DATE(timestamp) = DATE('now')) as syncs_today,
    (SELECT COUNT(*) FROM device_sync_log WHERE status = 'error' AND timestamp > datetime('now', '-24 hours')) as errors_24h,
    -- Storage usage (approssimato)
    (SELECT SUM(LENGTH(title_encrypted) + LENGTH(COALESCE(description, ''))) 
     FROM conversations WHERE is_deleted = 0) as conversations_size_bytes,
    (SELECT SUM(LENGTH(content_encrypted)) 
     FROM messages WHERE is_deleted = 0) as messages_size_bytes;

-- Funzione per pulire vecchi log (simulata con trigger)
-- Mantieni solo gli ultimi 30 giorni di log per dispositivo
CREATE TRIGGER IF NOT EXISTS cleanup_old_sync_logs
AFTER INSERT ON device_sync_log
BEGIN
    DELETE FROM device_sync_log 
    WHERE timestamp < datetime('now', '-30 days')
    AND device_id = NEW.device_id;
END;
"""

def run_device_sync_migration(db_manager):
    """Esegue la migrazione per device sync logging"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Esegui la migrazione
            for statement in DEVICE_SYNC_LOG_MIGRATION.split(';'):
                statement = statement.strip()
                if statement:
                    cursor.execute(statement)
            
            conn.commit()
            print("✅ Device sync migration completed successfully")
            
    except Exception as e:
        print(f"❌ Device sync migration failed: {e}")
        raise e

if __name__ == "__main__":
    # Test migration
    from .database import db_manager
    run_device_sync_migration(db_manager)
