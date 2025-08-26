"""
Admin panel routes for device management and system monitoring
"""
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json

from .auth import get_current_active_user, is_admin_user
from .database import db_manager

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
            
            # Statistiche utenti
            cursor.execute("SELECT COUNT(*) FROM users")
            total_users = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(*) FROM users 
                WHERE is_active = 1 AND last_login > datetime('now', '-30 days')
            """)
            active_users = cursor.fetchone()[0]
            
            # Statistiche dispositivi
            cursor.execute("SELECT COUNT(*) FROM devices")
            total_devices = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(*) FROM devices 
                WHERE is_active = 1 AND last_sync > datetime('now', '-7 days')
            """)
            active_devices = cursor.fetchone()[0]
            
            # Statistiche contenuti
            cursor.execute("SELECT COUNT(*) FROM conversations WHERE is_deleted = 0")
            total_conversations = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM messages WHERE is_deleted = 0")
            total_messages = cursor.fetchone()[0]
            
            # Sincronizzazioni oggi
            cursor.execute("""
                SELECT COUNT(*) FROM device_sync_log 
                WHERE DATE(timestamp) = DATE('now')
            """)
            sync_today = cursor.fetchone()[0] or 0
            
            # Medie
            avg_messages = total_messages / max(total_users, 1)
            avg_devices = total_devices / max(total_users, 1)
            
            # Storage usage (approssimato)
            cursor.execute("""
                SELECT 
                    SUM(LENGTH(title_encrypted) + LENGTH(COALESCE(description, ''))) as conv_size,
                    (SELECT SUM(LENGTH(content_encrypted)) FROM messages WHERE is_deleted = 0) as msg_size
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
            cursor.execute(query, params)
            
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
            cursor.execute(query, params)
            
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
            cursor.execute(query, params)
            
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
                        cursor.execute("""
                            UPDATE devices 
                            SET is_active = 0, deactivated_at = datetime('now')
                            WHERE id = ?
                        """, (device_id,))
                        
                    elif action_data.action == "force_sync":
                        cursor.execute("""
                            UPDATE devices 
                            SET force_sync = 1, force_sync_at = datetime('now')
                            WHERE id = ?
                        """, (device_id,))
                        
                    elif action_data.action == "reset":
                        cursor.execute("""
                            UPDATE devices 
                            SET sync_count = 0, last_sync = NULL, 
                                conflict_count = 0, force_sync = 1
                            WHERE id = ?
                        """, (device_id,))
                        
                    elif action_data.action == "delete":
                        # Prima elimina i log di sync
                        cursor.execute("DELETE FROM device_sync_log WHERE device_id = ?", (device_id,))
                        # Poi elimina il dispositivo
                        cursor.execute("DELETE FROM devices WHERE id = ?", (device_id,))
                        
                    else:
                        results.append({
                            "device_id": device_id,
                            "success": False,
                            "error": f"Unknown action: {action_data.action}"
                        })
                        continue
                    
                    # Log dell'azione admin
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
            cursor.execute("""
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
            cursor.execute("""
                SELECT * FROM device_sync_log 
                WHERE device_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 50
            """, (device_id,))
            
            sync_logs = [dict(row) for row in cursor.fetchall()]
            
            # Statistiche dispositivo
            cursor.execute("""
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
