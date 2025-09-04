"""
Admin panel routes for device management and system monitoring
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query, Body
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json, time, os

from .auth import get_current_active_user, is_admin_user
from .database import db_manager
from .database import USING_POSTGRES

router = APIRouter(prefix="/admin", tags=["admin"])

class DeviceInfo(BaseModel):
    id: str
    user_id: str
    device_name: str
    device_type: str
    fingerprint: str
    last_sync: str
    created_at: str
    is_active: bool
    sync_count: int
    user_email: Optional[str] = None
    user_username: Optional[str] = None

class UserInfo(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool
    created_at: str
    last_login: Optional[str] = None
    device_count: int
    conversation_count: int
    message_count: int

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    total_devices: int
    active_devices: int
    total_conversations: int
    total_messages: int
    sync_operations_today: int
    storage_usage_mb: float
    avg_messages_per_user: float
    avg_devices_per_user: float

class SyncActivity(BaseModel):
    id: str
    user_id: str
    device_id: str
    operation_type: str
    timestamp: str
    status: str
    details: Optional[str] = None
    user_email: Optional[str] = None
    device_name: Optional[str] = None

class DeviceAction(BaseModel):
    action: str  # 'deactivate', 'force_sync', 'reset', 'delete'
    device_ids: List[str]
    reason: Optional[str] = None

class SQLQuery(BaseModel):
    sql: str
    limit: Optional[int] = 100

class TableColumns(BaseModel):
    name: str
    type: str
    is_nullable: bool = True
    is_primary: bool = False

class DBUpdate(BaseModel):
    table: str
    key: Dict[str, Any]  # where equality (AND)
    set: Dict[str, Any]

class DBInsert(BaseModel):
    table: str
    values: Dict[str, Any]

class DBDelete(BaseModel):
    table: str
    key: Dict[str, Any]

_DBINFO_CACHE: dict = {
    # key: (result_dict, timestamp)
}

@router.get("/db-info")
async def get_db_info(
    include_sizes: bool = Query(False, description="Includi dimensioni fisiche (tabella / totale)"),
    order: str = Query("name", description="Ordinamento: name | rows | size"),
    cache_seconds: int = Query(30, description="TTL cache lato server in secondi"),
    force_refresh: bool = Query(False, description="Ignora cache e ricalcola"),
    current_user: dict = Depends(get_current_active_user)
):
    """Ritorna informazioni sul database in uso e lista tabelle.

    Parametri:
    - include_sizes: se true calcola dimensioni (può essere costoso su Postgres grandi)."""
    if not is_admin_user(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    try:
        t0 = time.time()
        cache_key = (include_sizes, order)
        now = time.time()
        if not force_refresh and cache_seconds > 0:
            cached = _DBINFO_CACHE.get(cache_key)
            if cached and (now - cached[1]) < cache_seconds:
                data = cached[0].copy()
                data["cached"] = True
                data["cache_age_s"] = round(now - cached[1], 2)
                data["cache_ttl_s"] = cache_seconds - (now - cached[1])
                return data
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            # Elenco tabelle e conteggi
            # Nota: 'personalities' è file-based (storage/personalities/personalities.json),
            # quindi NON deve essere considerata una tabella critica.
            critical_tables = [
                'users','devices','conversations','messages','device_sync_log',
                'feedback','personalities','rag_documents','rag_chunks'
            ]
            table_info = []  # list of {name, rows}
            present_tables = set()

            if USING_POSTGRES:
                db_manager.exec(cursor, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
                table_names = [r[0] for r in cursor.fetchall()]
                for t in table_names:
                    present_tables.add(t)
                    try:
                        db_manager.exec(cursor, f'SELECT COUNT(*) FROM "{t}"')
                        count = cursor.fetchone()[0]
                    except Exception:
                        count = None
                    size_bytes = None
                    if include_sizes:
                        try:
                            # Usa pg_total_relation_size per includere indici
                            db_manager.exec(cursor, f"SELECT pg_total_relation_size(%s)", (t,))
                            size_bytes = cursor.fetchone()[0]
                        except Exception:
                            size_bytes = None
                    table_info.append({"name": t, "rows": count, "size_bytes": size_bytes})
                db_version = None
                try:
                    db_manager.exec(cursor, "SELECT version()")
                    db_version = cursor.fetchone()[0]
                except Exception:
                    pass
                missing = [t for t in critical_tables if t not in present_tables]
                total_rows = sum([ti["rows"] for ti in table_info if isinstance(ti.get("rows"), int)])
                total_size = sum([ti.get("size_bytes") or 0 for ti in table_info]) if include_sizes else None
                elapsed_ms = round((time.time() - t0)*1000, 2)
                # Ordinamento
                if order == 'rows':
                    table_info.sort(key=lambda x: (x.get('rows') is None, -(x.get('rows') or 0)))
                elif order == 'size' and include_sizes:
                    table_info.sort(key=lambda x: (x.get('size_bytes') is None, -(x.get('size_bytes') or 0)))
                else:  # name default
                    table_info.sort(key=lambda x: x['name'])

                # Percent occupancy per singola tabella se total_size disponibile
                if include_sizes and total_size and total_size > 0:
                    for ti in table_info:
                        sb = ti.get('size_bytes') or 0
                        if sb:
                            ti['size_pct'] = round((sb / total_size) * 100, 3)

                result = {
                    "engine": "postgres",
                    "version": db_version,
                    "tables": table_info,
                    "critical_missing": missing,
                    "total_rows": total_rows,
                    "total_size_bytes": total_size,
                    "elapsed_ms": elapsed_ms,
                    "include_sizes": include_sizes,
                    "order": order,
                    "cached": False,
                    "cache_age_s": 0.0,
                    "cache_ttl_s": cache_seconds,
                }
                if cache_seconds > 0:
                    _DBINFO_CACHE[cache_key] = (result, now)
                return result
            else:
                # SQLite
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                table_names = [r[0] for r in cursor.fetchall()]
                for t in table_names:
                    present_tables.add(t)
                    try:
                        cursor.execute(f'SELECT COUNT(*) FROM "{t}"')
                        count = cursor.fetchone()[0]
                    except Exception:
                        count = None
                    size_bytes = None
                    if include_sizes:
                        # Non abbiamo dimensione per tabella facilmente senza analizzare file interno; saltiamo.
                        size_bytes = None
                    table_info.append({"name": t, "rows": count, "size_bytes": size_bytes})
                cursor.execute("PRAGMA database_list")
                dblist = cursor.fetchall()
                missing = [t for t in critical_tables if t not in present_tables]
                # Dimensione totale file
                total_rows = sum([ti["rows"] for ti in table_info if isinstance(ti.get("rows"), int)])
                db_file_size = None
                if include_sizes:
                    try:
                        # determina path principale DB da manager
                        from .database import db_manager as _dbm
                        if getattr(_dbm, 'db_path', None):
                            if os.path.exists(_dbm.db_path):
                                db_file_size = os.path.getsize(_dbm.db_path)
                    except Exception:
                        db_file_size = None
                elapsed_ms = round((time.time() - t0)*1000, 2)
                if order == 'rows':
                    table_info.sort(key=lambda x: (x.get('rows') is None, -(x.get('rows') or 0)))
                elif order == 'size' and include_sizes:
                    table_info.sort(key=lambda x: (x.get('size_bytes') is None, -(x.get('size_bytes') or 0)))
                else:
                    table_info.sort(key=lambda x: x['name'])

                result = {
                    "engine": "sqlite",
                    "tables": table_info,
                    "attached": [dict(zip([c[0] for c in cursor.description], row)) for row in dblist] if cursor.description else [],
                    "critical_missing": missing,
                    "total_rows": total_rows,
                    "total_size_bytes": db_file_size,
                    "elapsed_ms": elapsed_ms,
                    "include_sizes": include_sizes,
                    "order": order,
                    "cached": False,
                    "cache_age_s": 0.0,
                    "cache_ttl_s": cache_seconds,
                }
                if cache_seconds > 0:
                    _DBINFO_CACHE[cache_key] = (result, now)
                return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore recupero info DB: {e}")

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    current_user: dict = Depends(get_current_active_user)
):
    """Ottieni statistiche generali del sistema"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()

            # Funzioni tempo differenziate
            if USING_POSTGRES:
                last_login_30 = "last_login > NOW() - INTERVAL '30 days'"
                last_sync_7 = "last_sync > NOW() - INTERVAL '7 days'"
                today_clause = "DATE(timestamp) = CURRENT_DATE"
                length_fn = "LENGTH"
            else:
                last_login_30 = "last_login > datetime('now', '-30 days')"
                last_sync_7 = "last_sync > datetime('now', '-7 days')"
                today_clause = "DATE(timestamp) = DATE('now')"
                length_fn = "LENGTH"

            db_manager.exec(cursor, "SELECT COUNT(*) FROM users")
            total_users = cursor.fetchone()[0]

            db_manager.exec(cursor, f"SELECT COUNT(*) FROM users WHERE is_active = 1 AND {last_login_30}")
            active_users = cursor.fetchone()[0]

            db_manager.exec(cursor, "SELECT COUNT(*) FROM devices")
            total_devices = cursor.fetchone()[0]

            db_manager.exec(cursor, f"SELECT COUNT(*) FROM devices WHERE is_active = 1 AND {last_sync_7}")
            active_devices = cursor.fetchone()[0]

            db_manager.exec(cursor, "SELECT COUNT(*) FROM conversations WHERE is_deleted = 0")
            total_conversations = cursor.fetchone()[0]

            db_manager.exec(cursor, "SELECT COUNT(*) FROM messages WHERE is_deleted = 0")
            total_messages = cursor.fetchone()[0]

            db_manager.exec(cursor, f"SELECT COUNT(*) FROM device_sync_log WHERE {today_clause}")
            sync_today = cursor.fetchone()[0] or 0

            avg_messages = total_messages / max(total_users, 1)
            avg_devices = total_devices / max(total_users, 1)

            db_manager.exec(cursor, f"""
                SELECT 
                    SUM({length_fn}(title_encrypted) + {length_fn}(COALESCE(description, ''))) as conv_size,
                    (SELECT SUM({length_fn}(content_encrypted)) FROM messages WHERE is_deleted = 0) as msg_size
                FROM conversations WHERE is_deleted = 0
            """)
            storage_row = cursor.fetchone()
            storage_bytes = (storage_row[0] or 0) + (storage_row[1] or 0)
            storage_mb = storage_bytes / (1024 * 1024)
            
            return AdminStats(
                total_users=total_users,
                active_users=active_users,
                total_devices=total_devices,
                active_devices=active_devices,
                total_conversations=total_conversations,
                total_messages=total_messages,
                sync_operations_today=sync_today,
                storage_usage_mb=round(storage_mb, 2),
                avg_messages_per_user=round(avg_messages, 1),
                avg_devices_per_user=round(avg_devices, 1)
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving stats: {str(e)}"
        )

@router.get("/users", response_model=List[UserInfo])
async def get_users(
    limit: int = Query(50, description="Maximum users to return"),
    offset: int = Query(0, description="Offset for pagination"),
    search: Optional[str] = Query(None, description="Search by username or email"),
    current_user: dict = Depends(get_current_active_user)
):
    """Lista utenti con informazioni sui dispositivi"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            where_clause = "WHERE 1=1"
            params = []
            
            if search:
                where_clause += " AND (u.username LIKE ? OR u.email LIKE ?)"
                search_pattern = f"%{search}%"
                params.extend([search_pattern, search_pattern])
            
            query = f"""
                SELECT 
                    u.id, u.username, u.email, u.is_active, u.created_at, u.last_login,
                    COUNT(DISTINCT d.id) as device_count,
                    COUNT(DISTINCT c.id) as conversation_count,
                    COUNT(DISTINCT m.id) as message_count
                FROM users u
                LEFT JOIN devices d ON u.id = d.user_id AND d.is_active = 1
                LEFT JOIN conversations c ON u.id = c.user_id AND c.is_deleted = 0
                LEFT JOIN messages m ON c.id = m.conversation_id AND m.is_deleted = 0
                {where_clause}
                GROUP BY u.id, u.username, u.email, u.is_active, u.created_at, u.last_login
                ORDER BY u.created_at DESC
                LIMIT ? OFFSET ?
            """
            
            params.extend([limit, offset])
            db_manager.exec(cursor, query, params)
            
            users = []
            for row in cursor.fetchall():
                users.append(UserInfo(
                    id=row[0],
                    username=row[1],
                    email=row[2],
                    is_active=bool(row[3]),
                    created_at=row[4],
                    last_login=row[5],
                    device_count=row[6],
                    conversation_count=row[7],
                    message_count=row[8]
                ))
            
            return users
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving users: {str(e)}"
        )

@router.get("/devices", response_model=List[DeviceInfo])
async def get_devices(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    limit: int = Query(100, description="Maximum devices to return"),
    offset: int = Query(0, description="Offset for pagination"),
    inactive: bool = Query(False, description="Include inactive devices"),
    current_user: dict = Depends(get_current_active_user)
):
    """Lista dispositivi con informazioni utente"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            where_conditions = []
            params = []
            
            if user_id:
                where_conditions.append("d.user_id = ?")
                params.append(user_id)
            
            if not inactive:
                where_conditions.append("d.is_active = 1")
            
            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            query = f"""
                SELECT 
                    d.id, d.user_id, d.device_name, d.device_type, d.fingerprint,
                    d.last_sync, d.created_at, d.is_active, d.sync_count,
                    u.email, u.username
                FROM devices d
                JOIN users u ON d.user_id = u.id
                {where_clause}
                ORDER BY d.last_sync DESC
                LIMIT ? OFFSET ?
            """
            
            params.extend([limit, offset])
            db_manager.exec(cursor, query, params)
            
            devices = []
            for row in cursor.fetchall():
                devices.append(DeviceInfo(
                    id=row[0],
                    user_id=row[1],
                    device_name=row[2],
                    device_type=row[3],
                    fingerprint=row[4],
                    last_sync=row[5],
                    created_at=row[6],
                    is_active=bool(row[7]),
                    sync_count=row[8],
                    user_email=row[9],
                    user_username=row[10]
                ))
            
            return devices
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving devices: {str(e)}"
        )

@router.get("/sync-activity", response_model=List[SyncActivity])
async def get_sync_activity(
    hours: int = Query(24, description="Hours back to look"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    device_id: Optional[str] = Query(None, description="Filter by device ID"),
    limit: int = Query(100, description="Maximum activities to return"),
    current_user: dict = Depends(get_current_active_user)
):
    """Lista attività di sincronizzazione recenti"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            where_conditions = ["s.timestamp > datetime('now', ?)"]
            if USING_POSTGRES:
                where_conditions = ["s.timestamp > NOW() - ( ? )::interval"]
                params = [f"{hours} hours"]
            else:
                where_conditions = ["s.timestamp > datetime('now', ?)"]
                params = [f"-{hours} hours"]
            
            if user_id:
                where_conditions.append("s.user_id = ?")
                params.append(user_id)
            
            if device_id:
                where_conditions.append("s.device_id = ?")
                params.append(device_id)
            
            where_clause = "WHERE " + " AND ".join(where_conditions)
            
            query = f"""
                SELECT 
                    s.id, s.user_id, s.device_id, s.operation_type,
                    s.timestamp, s.status, s.details,
                    u.email, d.device_name
                FROM device_sync_log s
                LEFT JOIN users u ON s.user_id = u.id
                LEFT JOIN devices d ON s.device_id = d.id
                {where_clause}
                ORDER BY s.timestamp DESC
                LIMIT ?
            """
            
            params.append(limit)
            db_manager.exec(cursor, query, params)
            
            activities = []
            for row in cursor.fetchall():
                activities.append(SyncActivity(
                    id=row[0],
                    user_id=row[1],
                    device_id=row[2],
                    operation_type=row[3],
                    timestamp=row[4],
                    status=row[5],
                    details=row[6],
                    user_email=row[7],
                    device_name=row[8]
                ))
            
            return activities
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving sync activity: {str(e)}"
        )

@router.post("/devices/action")
async def device_action(
    action_data: DeviceAction,
    current_user: dict = Depends(get_current_active_user)
):
    """Esegui azioni sui dispositivi (disattiva, forza sync, reset, elimina)"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            results = []
            
            for device_id in action_data.device_ids:
                try:
                    if action_data.action == "deactivate":
                        if USING_POSTGRES:
                            db_manager.exec(cursor, """
                                UPDATE devices 
                                SET is_active = FALSE, deactivated_at = NOW()
                                WHERE id = ?
                            """, (device_id,))
                        else:
                            cursor.execute("""
                                UPDATE devices 
                                SET is_active = 0, deactivated_at = datetime('now')
                                WHERE id = ?
                            """, (device_id,))
                        
                    elif action_data.action == "force_sync":
                        if USING_POSTGRES:
                            db_manager.exec(cursor, """
                                UPDATE devices 
                                SET force_sync = TRUE, force_sync_at = NOW()
                                WHERE id = ?
                            """, (device_id,))
                        else:
                            cursor.execute("""
                                UPDATE devices 
                                SET force_sync = 1, force_sync_at = datetime('now')
                                WHERE id = ?
                            """, (device_id,))
                        
                    elif action_data.action == "reset":
                        if USING_POSTGRES:
                            db_manager.exec(cursor, """
                                UPDATE devices 
                                SET sync_count = 0, last_sync = NULL, 
                                    conflict_count = 0, force_sync = TRUE
                                WHERE id = ?
                            """, (device_id,))
                        else:
                            cursor.execute("""
                                UPDATE devices 
                                SET sync_count = 0, last_sync = NULL, 
                                    conflict_count = 0, force_sync = 1
                                WHERE id = ?
                            """, (device_id,))
                        
                    elif action_data.action == "delete":
                        # Prima elimina i log di sync
                        db_manager.exec(cursor, "DELETE FROM device_sync_log WHERE device_id = ?", (device_id,))
                        # Poi elimina il dispositivo
                        db_manager.exec(cursor, "DELETE FROM devices WHERE id = ?", (device_id,))
                        
                    else:
                        results.append({
                            "device_id": device_id,
                            "success": False,
                            "error": f"Unknown action: {action_data.action}"
                        })
                        continue
                    
                    # Log dell'azione admin
                    if USING_POSTGRES:
                        db_manager.exec(cursor, """
                            INSERT INTO device_sync_log (device_id, user_id, operation_type, status, details, timestamp)
                            SELECT d.id, d.user_id, ?, 'success', ?, NOW()
                            FROM devices d WHERE d.id = ?
                        """, (f"admin_{action_data.action}", action_data.reason or f"Admin action: {action_data.action}", device_id))
                    else:
                        cursor.execute("""
                            INSERT INTO device_sync_log (device_id, user_id, operation_type, status, details, timestamp)
                            SELECT d.id, d.user_id, ?, 'success', ?, datetime('now')
                            FROM devices d WHERE d.id = ?
                        """, (f"admin_{action_data.action}", action_data.reason or f"Admin action: {action_data.action}", device_id))
                    
                    results.append({
                        "device_id": device_id,
                        "success": True,
                        "action": action_data.action
                    })
                    
                except Exception as e:
                    results.append({
                        "device_id": device_id,
                        "success": False,
                        "error": str(e)
                    })
            
            conn.commit()
            
            return {
                "action": action_data.action,
                "total_devices": len(action_data.device_ids),
                "successful": len([r for r in results if r["success"]]),
                "failed": len([r for r in results if not r["success"]]),
                "results": results
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error performing device action: {str(e)}"
        )

@router.get("/device/{device_id}/details")
async def get_device_details(
    device_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Dettagli completi di un dispositivo"""
    
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Informazioni base dispositivo
            db_manager.exec(cursor, """
                SELECT 
                    d.*, u.username, u.email, u.is_active as user_active
                FROM devices d
                JOIN users u ON d.user_id = u.id
                WHERE d.id = ?
            """, (device_id,))
            
            device_row = cursor.fetchone()
            if not device_row:
                raise HTTPException(status_code=404, detail="Device not found")
            
            # Log di sync recenti
            db_manager.exec(cursor, """
                SELECT * FROM device_sync_log 
                WHERE device_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 50
            """, (device_id,))
            
            sync_logs = [dict(row) for row in cursor.fetchall()]
            
            # Statistiche dispositivo
            db_manager.exec(cursor, """
                SELECT 
                    COUNT(*) as total_syncs,
                    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_syncs,
                    COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_syncs,
                    MIN(timestamp) as first_sync,
                    MAX(timestamp) as last_sync
                FROM device_sync_log 
                WHERE device_id = ?
            """, (device_id,))
            
            stats_row = cursor.fetchone()
            
            return {
                "device": dict(device_row),
                "sync_logs": sync_logs,
                "statistics": dict(stats_row) if stats_row else {},
                "health_score": calculate_device_health(stats_row, device_row)
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving device details: {str(e)}"
        )

# ---- Simple DB Explorer (read-only) ----
@router.get("/db/tables")
async def list_db_tables(current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            tables = []
            if USING_POSTGRES:
                db_manager.exec(cur, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
                tables = [r[0] for r in cur.fetchall()]
            else:
                cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                tables = [r[0] for r in cur.fetchall()]
            return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB list error: {e}")

@router.get("/db/table/{table_name}")
async def sample_table(table_name: str, limit: int = 100, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            if not table_name.replace('_','').isalnum():
                raise HTTPException(status_code=400, detail="Invalid table name")
            q = f'SELECT * FROM "{table_name}" LIMIT ?'
            db_manager.exec(cur, q, (limit,))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description] if cur.description else []
            data = []
            for r in rows:
                try:
                    data.append(dict(r))
                except Exception:
                    data.append(list(r))
            return {"columns": cols, "rows": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB sample error: {e}")

@router.post("/db/query")
async def run_sql_query(payload: SQLQuery, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    sql = (payload.sql or '').strip()
    if not sql.lower().startswith('select'):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    if ';' in sql[:-1]:
        raise HTTPException(status_code=400, detail="Multiple statements not allowed")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            db_manager.exec(cur, sql)
            rows = cur.fetchmany(size=payload.limit or 100)
            cols = [d[0] for d in cur.description] if cur.description else []
            data = []
            for r in rows:
                try:
                    data.append(dict(r))
                except Exception:
                    data.append(list(r))
            return {"columns": cols, "rows": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {e}")

def _validate_table_name(name: str) -> bool:
    # allow only alnum + underscore
    return bool(name) and name.replace('_','').isalnum()

_WRITABLE_TABLES = set([
    'users','conversations','messages','devices','device_sync_log','admin_actions',
    'survey_responses','user_devices','rag_groups','rag_documents','rag_chunks','personalities'
])

@router.get("/db/columns/{table_name}", response_model=List[TableColumns])
async def get_table_columns(table_name: str, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(403, detail="Admin access required")
    if not _validate_table_name(table_name):
        raise HTTPException(400, detail="Invalid table name")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            cols: List[TableColumns] = []
            if USING_POSTGRES:
                # columns
                db_manager.exec(cur, """
                    SELECT c.column_name, c.data_type, c.is_nullable
                    FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name = ?
                    ORDER BY c.ordinal_position
                """, (table_name,))
                col_rows = cur.fetchall()
                # primary key
                db_manager.exec(cur, """
                    SELECT a.attname
                    FROM pg_index i
                    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                    WHERE i.indrelid = ?::regclass AND i.indisprimary
                """, (table_name,))
                pkcols = {r[0] for r in cur.fetchall()}
                for r in col_rows:
                    cols.append(TableColumns(
                        name=r[0], type=r[1], is_nullable=(r[2] == 'YES'), is_primary=(r[0] in pkcols)
                    ))
            else:
                # SQLite pragma
                cur.execute(f"PRAGMA table_info('{table_name}')")
                for r in cur.fetchall():
                    cols.append(TableColumns(
                        name=r[1], type=str(r[2]), is_nullable=not bool(r[3]), is_primary=bool(r[5])
                    ))
            return cols
    except Exception as e:
        raise HTTPException(500, detail=f"Columns error: {e}")

@router.get("/db/search")
async def search_table(table: str, q: str, limit: int = 50, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(403, detail="Admin access required")
    if not _validate_table_name(table):
        raise HTTPException(400, detail="Invalid table name")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            # discover text columns
            text_cols: List[str] = []
            num_cols: List[str] = []
            if USING_POSTGRES:
                db_manager.exec(cur, """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema='public' AND table_name = ?
                """, (table,))
                for r in cur.fetchall():
                    dt = str(r[1]).lower()
                    if 'char' in dt or 'text' in dt or 'json' in dt:
                        text_cols.append(r[0])
                    elif any(x in dt for x in ['int','numeric','double','real','float']):
                        num_cols.append(r[0])
            else:
                cur.execute(f"PRAGMA table_info('{table}')")
                for r in cur.fetchall():
                    dt = str(r[2]).lower()
                    if 'char' in dt or 'text' in dt:
                        text_cols.append(r[1])
                    elif 'int' in dt or 'real' in dt or 'num' in dt:
                        num_cols.append(r[1])
            where_parts: List[str] = []
            params: List[Any] = []
            terms = [t for t in q.strip().split() if t]
            for term in terms:
                sub_parts: List[str] = []
                like = f"%{term}%"
                for c in text_cols[:8]:  # cap to 8 columns for performance
                    sub_parts.append(f'"{c}" ILIKE ?' if USING_POSTGRES else f'"{c}" LIKE ?')
                    params.append(like)
                # numeric exact match
                if term.isdigit():
                    for c in num_cols[:5]:
                        sub_parts.append(f'"{c}" = ?')
                        params.append(int(term))
                if sub_parts:
                    where_parts.append('(' + ' OR '.join(sub_parts) + ')')
            where_clause = (' WHERE ' + ' AND '.join(where_parts)) if where_parts else ''
            qsql = f'SELECT * FROM "{table}"{where_clause} LIMIT ?'
            params.append(limit)
            db_manager.exec(cur, qsql, params)
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description] if cur.description else []
            data = []
            for r in rows:
                try:
                    data.append(dict(r))
                except Exception:
                    data.append(list(r))
            return {"columns": cols, "rows": data}
    except Exception as e:
        raise HTTPException(500, detail=f"Search error: {e}")

@router.post("/db/update")
async def db_update(payload: DBUpdate, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(403, detail="Admin access required")
    if not _validate_table_name(payload.table):
        raise HTTPException(400, detail="Invalid table name")
    if payload.table not in _WRITABLE_TABLES:
        raise HTTPException(400, detail="Table not allowed for write")
    if not payload.key or not payload.set:
        raise HTTPException(400, detail="Missing key or set")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            set_cols = list(payload.set.keys())
            where_cols = list(payload.key.keys())
            set_clause = ', '.join([f'"{c}" = ?' for c in set_cols])
            where_clause = ' AND '.join([f'"{c}" = ?' for c in where_cols])
            sql = f'UPDATE "{payload.table}" SET {set_clause} WHERE {where_clause}'
            params = [payload.set[c] for c in set_cols] + [payload.key[c] for c in where_cols]
            db_manager.exec(cur, sql, params)
            conn.commit()
            return {"updated": cur.rowcount}
    except Exception as e:
        raise HTTPException(500, detail=f"Update error: {e}")

@router.post("/db/insert")
async def db_insert(payload: DBInsert, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(403, detail="Admin access required")
    if not _validate_table_name(payload.table):
        raise HTTPException(400, detail="Invalid table name")
    if payload.table not in _WRITABLE_TABLES:
        raise HTTPException(400, detail="Table not allowed for write")
    if not payload.values:
        raise HTTPException(400, detail="Missing values")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            cols = list(payload.values.keys())
            placeholders = ','.join(['?']*len(cols))
            col_idents = ','.join([f'"{c}"' for c in cols])
            sql = f'INSERT INTO "{payload.table}" ({col_idents}) VALUES ({placeholders})'
            db_manager.exec(cur, sql, [payload.values[c] for c in cols])
            conn.commit()
            return {"inserted": cur.rowcount}
    except Exception as e:
        raise HTTPException(500, detail=f"Insert error: {e}")

@router.post("/db/delete")
async def db_delete(payload: DBDelete, current_user: dict = Depends(get_current_active_user)):
    if not is_admin_user(current_user):
        raise HTTPException(403, detail="Admin access required")
    if not _validate_table_name(payload.table):
        raise HTTPException(400, detail="Invalid table name")
    if payload.table not in _WRITABLE_TABLES:
        raise HTTPException(400, detail="Table not allowed for write")
    if not payload.key:
        raise HTTPException(400, detail="Missing key")
    try:
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            where_cols = list(payload.key.keys())
            where_clause = ' AND '.join([f'"{c}" = ?' for c in where_cols])
            sql = f'DELETE FROM "{payload.table}" WHERE {where_clause}'
            db_manager.exec(cur, sql, [payload.key[c] for c in where_cols])
            conn.commit()
            return {"deleted": cur.rowcount}
    except Exception as e:
        raise HTTPException(500, detail=f"Delete error: {e}")

def calculate_device_health(stats_row, device_row) -> dict:
    """Calcola punteggio di salute dispositivo"""
    if not stats_row or not device_row:
        return {"score": 0, "status": "unknown", "issues": ["No data available"]}
    
    score = 100
    issues = []
    
    # Controllo sync recenti
    if device_row["last_sync"]:
        last_sync = datetime.fromisoformat(device_row["last_sync"].replace('Z', '+00:00'))
        days_since_sync = (datetime.now() - last_sync).days
        
        if days_since_sync > 7:
            score -= 30
            issues.append("No sync for over 7 days")
        elif days_since_sync > 3:
            score -= 15
            issues.append("No sync for over 3 days")
    else:
        score -= 50
        issues.append("Never synced")
    
    # Controllo tasso errori
    total_syncs = stats_row["total_syncs"]
    failed_syncs = stats_row["failed_syncs"]
    
    if total_syncs > 0:
        error_rate = failed_syncs / total_syncs
        if error_rate > 0.5:
            score -= 40
            issues.append("High error rate (>50%)")
        elif error_rate > 0.2:
            score -= 20
            issues.append("Moderate error rate (>20%)")
    
    # Controllo attivazione
    if not device_row["is_active"]:
        score -= 30
        issues.append("Device inactive")
    
    # Determina status
    if score >= 80:
        status = "healthy"
    elif score >= 60:
        status = "warning"
    elif score >= 30:
        status = "critical"
    else:
        status = "offline"
    
    return {
        "score": max(0, score),
        "status": status,
        "issues": issues
    }
