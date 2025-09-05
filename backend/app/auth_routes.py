"""
Authentication endpoints for user registration, login, and token management
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Dict, Any
import uuid
from datetime import datetime, timedelta

from .auth import (
    AuthManager, UserRegistration, UserLogin, TokenResponse,
    get_current_user, get_current_active_user, get_current_admin_user, validate_password_strength, security, is_admin_user,
    MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
)
from .database import UserModel, AdminModel
from .escrow import EscrowManager
import os, jwt

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register", response_model=TokenResponse)
async def register_user(user_data: UserRegistration):
    """Registrazione nuovo utente"""
    
    # Valida forza password
    password_validation = validate_password_strength(user_data.password)
    if not password_validation["is_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Password not strong enough", "errors": password_validation["errors"]}
        )
    
    # Verifica se email esiste già
    existing_user = UserModel.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    try:
        # Crea utente con sistema escrow avanzato
        user_data_with_escrow = EscrowManager.create_user_with_escrow(
            user_data.email, user_data.password
        )
        
        if not user_data_with_escrow:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create encryption package"
            )
        
        # Crea utente nel database
        user_id = UserModel.create_user(
            email=user_data_with_escrow["email"],
            password_hash=user_data_with_escrow["password_hash"],
            user_key_hash=user_data_with_escrow["user_key_hash"],
            escrow_key_encrypted=user_data_with_escrow["escrow_key_encrypted"]
        )
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user"
            )
        
        # Genera tokens
        token_data = {"sub": str(user_id), "email": user_data.email}
        access_token = AuthManager.create_access_token(token_data)
        refresh_token = AuthManager.create_refresh_token(token_data)
        
        # Aggiorna ultimo login
        UserModel.update_last_login(user_id)
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=30 * 60,  # 30 minuti
            user_id=user_id
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@router.post("/login", response_model=TokenResponse)
async def login_user(user_data: UserLogin):
    """Login utente esistente"""
    
    # Recupera utente
    user = UserModel.get_user_by_email(user_data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Verifica se utente è bloccato
    if AuthManager.is_user_locked(user):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to multiple failed login attempts"
        )
    
    # Verifica password
    if not AuthManager.verify_password(user_data.password, user["password_hash"]):
        # Incrementa tentativi falliti e applica lock se necessario
        UserModel.increment_failed_login_and_lock_if_needed(
            user_data.email, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Genera tokens
    token_data = {"sub": str(user["id"]), "email": user["email"]}
    access_token = AuthManager.create_access_token(token_data)
    refresh_token = AuthManager.create_refresh_token(token_data)
    
    # Aggiorna ultimo login (resetta anche failed attempts)
    UserModel.update_last_login(user["id"])
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=30 * 60,  # 30 minuti
        user_id=user["id"],
        must_change_password=bool(user.get("must_change_password", 0))
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Refresh access token usando refresh token"""
    
    # Verifica refresh token
    token_data = AuthManager.verify_token(credentials.credentials, "refresh")
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    # Verifica che utente esista ancora
    user = UserModel.get_user_by_id(token_data.user_id)
    if not user or not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Genera nuovo access token
    new_token_data = {"sub": str(user["id"]), "email": user["email"]}
    access_token = AuthManager.create_access_token(new_token_data)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=credentials.credentials,  # Mantieni stesso refresh token
        expires_in=30 * 60,
        user_id=user["id"]
    )

@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_active_user)):
    """Recupera informazioni utente corrente (arricchite)"""
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "created_at": current_user["created_at"],
        "last_login": current_user["last_login"],
        "is_admin": is_admin_user(current_user),
        "must_change_password": bool(current_user.get("must_change_password", 0))
    }

from fastapi import Body

@router.post("/force-change-password")
async def force_change_password(
    payload: Dict[str, str] = Body(..., example={"new_password": "NewPass123!"}),
    current_user: dict = Depends(get_current_active_user)
):
    """Forza cambio password senza richiedere quella corrente (solo se must_change_password è attivo)."""
    new_password = payload.get("new_password", "")
    
    # Consenti solo se flag attivo
    if not bool(current_user.get("must_change_password", 0)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password change not required")
    
    # Valida nuova password
    password_validation = validate_password_strength(new_password)
    if not password_validation["is_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "New password not strong enough", "errors": password_validation["errors"]}
        )
    
    try:
        # Hash nuova password e aggiorna chiave utente
        new_password_hash = AuthManager.hash_password(new_password)
        new_user_key_hash = AuthManager.generate_user_key_hash(new_password, current_user["email"])
        
        # Aggiorna nel database
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE users 
                SET password_hash = ?, user_key_hash = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL
                WHERE id = ?
            """, (new_password_hash, new_user_key_hash, current_user["id"]))
            conn.commit()
        
        return {"message": "Password changed successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to force change password: {str(e)}"
        )

@router.get("/debug/token")
async def debug_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Endpoint di debug per ispezionare il payload del token (solo DEV)."""
    if os.getenv("ENV") == "production":
        raise HTTPException(status_code=404)
    try:
        from .auth import SECRET_KEY, ALGORITHM
        header = credentials.credentials.split('.',1)[0]
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return {"valid": True, "header_prefix": header, "payload": payload}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@router.post("/logout")
async def logout_user(current_user: dict = Depends(get_current_active_user)):
    """Logout utente (invalida token lato client)"""
    # In un sistema più complesso potresti voler mantenere una blacklist dei token
    # Per ora il logout è gestito lato client rimuovendo il token
    return {"message": "Logged out successfully"}

from fastapi import Body

@router.post("/change-password")
async def change_password(
    payload: Dict[str, str] = Body(..., example={"current_password": "OldPass123!", "new_password": "NewPass123!"}),
    current_user: dict = Depends(get_current_active_user)
):
    """Cambia password utente (accetta JSON body)"""
    current_password = payload.get("current_password", "")
    new_password = payload.get("new_password", "")
    
    # Verifica password corrente
    if not AuthManager.verify_password(current_password, current_user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Valida nuova password
    password_validation = validate_password_strength(new_password)
    if not password_validation["is_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "New password not strong enough", "errors": password_validation["errors"]}
        )
    
    try:
        # Hash nuova password e aggiorna chiave utente
        new_password_hash = AuthManager.hash_password(new_password)
        new_user_key_hash = AuthManager.generate_user_key_hash(new_password, current_user["email"])
        
        # Aggiorna nel database
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE users 
                SET password_hash = ?, user_key_hash = ?
                WHERE id = ?
            """, (new_password_hash, new_user_key_hash, current_user["id"]))
            conn.commit()
        
        # Clear must_change_password flag
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, "UPDATE users SET must_change_password = 0 WHERE id = ?", (current_user["id"],))
            conn.commit()
        return {"message": "Password changed successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to change password: {str(e)}"
        )

# Admin endpoints per gestione utenti
@router.post("/admin/reset-password")
async def admin_reset_password(
    target_email: str,
    admin_email: str = "admin@qsa-chatbot.com"  # In produzione verifica admin token
):
    """Reset password utente da parte amministratore con sistema escrow"""
    
    # Usa sistema escrow avanzato
    result = EscrowManager.admin_password_recovery(admin_email, target_email)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found or reset failed"
        )
    
    # In produzione invieresti email con password temporanea
    return {
        "message": result["message"],
        "temporary_password": result["temporary_password"],  # Solo per testing, rimuovi in produzione
        "note": "User should change password after first login"
    }

@router.get("/admin/users")
async def list_users(
    limit: int = 50,
    current_admin: dict = Depends(get_current_admin_user)
):
    """Lista utenti (solo admin)"""
    
    try:
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                SELECT id, email, created_at, last_login, is_active, failed_login_attempts
                FROM users 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,))
            users = [dict(row) for row in cursor.fetchall()]
        
        # Includi flag admin
        for u in users:
            u["is_admin"] = bool(u.get("is_admin", 0))
        # Log azione admin
        AdminModel.log_admin_action(current_admin.get("email","admin"), "LIST_USERS", None, None, f"Listed {len(users)} users")
        
        return {"users": users, "total": len(users)}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list users: {str(e)}"
        )

class RoleUpdate(BaseModel):
    is_admin: bool

@router.post("/admin/users/{user_id}/role")
async def update_user_role(user_id: int, payload: RoleUpdate, current_admin: dict = Depends(get_current_admin_user)):
    """Aggiorna ruolo amministratore per un utente (solo admin)."""
    try:
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if payload.is_admin else 0, user_id))
            conn.commit()
        AdminModel.log_admin_action(current_admin.get("email","admin"), "UPDATE_ROLE", user_id, None, f"Set is_admin={payload.is_admin}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update role: {str(e)}")

@router.get("/admin/escrow/verify")
async def verify_escrow_integrity(
    admin_email: str = "admin@qsa-chatbot.com"  # In produzione verifica admin token
):
    """Verifica integrità sistema escrow"""
    
    try:
        stats = EscrowManager.verify_escrow_integrity()
        
        # Log azione admin
        AdminModel.log_admin_action(
            admin_email, "ESCROW_VERIFY", None, None,
            f"Escrow verification: {stats['valid_escrow']}/{stats['total_users']} valid"
        )
        
        return {
            "status": "success",
            "statistics": stats,
            "integrity_percentage": (stats['valid_escrow'] / stats['total_users'] * 100) if stats['total_users'] > 0 else 0
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to verify escrow integrity: {str(e)}"
        )
