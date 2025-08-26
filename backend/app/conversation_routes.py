"""
Conversation management endpoints with encryption support
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import hashlib

from .auth import get_current_active_user
from .database import ConversationModel, MessageModel, DeviceModel

router = APIRouter(prefix="/conversations", tags=["conversations"])

# Pydantic models
class ConversationCreate(BaseModel):
    title_encrypted: str
    device_id: Optional[str] = None

class ConversationUpdate(BaseModel):
    title_encrypted: str

class MessageCreate(BaseModel):
    content_encrypted: str
    role: str
    token_count: Optional[int] = 0
    processing_time: Optional[float] = 0.0

class ConversationResponse(BaseModel):
    id: str
    title_encrypted: str
    title_hash: str
    created_at: str
    updated_at: str
    message_count: int
    device_id: Optional[str]

class MessageResponse(BaseModel):
    id: str
    content_encrypted: str
    content_hash: str
    role: str
    timestamp: str
    token_count: int
    processing_time: float

@router.post("/", response_model=Dict[str, str])
async def create_conversation(
    conversation_data: ConversationCreate,
    current_user: dict = Depends(get_current_active_user)
):
    """Crea una nuova conversazione crittografata"""
    
    try:
        # Genera ID unico conversazione
        conversation_id = f"conv_{uuid.uuid4().hex}"
        
        # Crea conversazione nel database
        success = ConversationModel.create_conversation(
            conversation_id=conversation_id,
            user_id=current_user["id"],
            title_encrypted=conversation_data.title_encrypted,
            device_id=conversation_data.device_id
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create conversation"
            )
        
        return {"conversation_id": conversation_id}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating conversation: {str(e)}"
        )

@router.get("/", response_model=List[ConversationResponse])
async def get_user_conversations(
    limit: int = 50,
    current_user: dict = Depends(get_current_active_user)
):
    """Recupera le conversazioni dell'utente"""
    
    try:
        conversations = ConversationModel.get_user_conversations(
            user_id=current_user["id"],
            limit=limit
        )
        
        return [ConversationResponse(**conv) for conv in conversations]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving conversations: {str(e)}"
        )

@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Recupera una conversazione specifica"""
    
    conversation = ConversationModel.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user["id"]
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    return ConversationResponse(**conversation)

@router.put("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    update_data: ConversationUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """Aggiorna titolo conversazione"""
    
    # Verifica che conversazione appartenga all'utente
    conversation = ConversationModel.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user["id"]
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    try:
        # Aggiorna titolo
        title_hash = hashlib.sha256(update_data.title_encrypted.encode()).hexdigest()
        
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE conversations 
                SET title_encrypted = ?, title_hash = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            """, (update_data.title_encrypted, title_hash, conversation_id, current_user["id"]))
            conn.commit()
        
        return {"message": "Conversation updated successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating conversation: {str(e)}"
        )

@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Elimina conversazione (soft delete)"""
    
    # Verifica che conversazione appartenga all'utente
    conversation = ConversationModel.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user["id"]
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    try:
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Soft delete conversazione e messaggi
            cursor.execute("""
                UPDATE conversations SET is_deleted = 1 WHERE id = ? AND user_id = ?
            """, (conversation_id, current_user["id"]))
            
            cursor.execute("""
                UPDATE messages SET is_deleted = 1 WHERE conversation_id = ?
            """, (conversation_id,))
            
            conn.commit()
        
        return {"message": "Conversation deleted successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting conversation: {str(e)}"
        )

# Message endpoints
@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_active_user)
):
    """Recupera messaggi di una conversazione"""
    
    # Verifica che conversazione appartenga all'utente
    conversation = ConversationModel.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user["id"]
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    try:
        messages = MessageModel.get_conversation_messages(
            conversation_id=conversation_id,
            limit=limit
        )
        
        return [MessageResponse(**msg) for msg in messages]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving messages: {str(e)}"
        )

@router.post("/{conversation_id}/messages", response_model=Dict[str, str])
async def add_message(
    conversation_id: str,
    message_data: MessageCreate,
    current_user: dict = Depends(get_current_active_user)
):
    """Aggiunge messaggio a conversazione"""
    
    # Verifica che conversazione appartenga all'utente
    conversation = ConversationModel.get_conversation(
        conversation_id=conversation_id,
        user_id=current_user["id"]
    )
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Valida role
    if message_data.role not in ['user', 'assistant']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid message role"
        )
    
    try:
        # Genera ID messaggio
        message_id = f"msg_{uuid.uuid4().hex}"
        
        # Aggiungi messaggio
        success = MessageModel.add_message(
            message_id=message_id,
            conversation_id=conversation_id,
            content_encrypted=message_data.content_encrypted,
            role=message_data.role,
            token_count=message_data.token_count or 0,
            processing_time=message_data.processing_time or 0.0
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to add message"
            )
        
        return {"message_id": message_id}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding message: {str(e)}"
        )

# Device management endpoints
@router.post("/devices/register")
async def register_device(
    device_info: Dict[str, str],
    current_user: dict = Depends(get_current_active_user)
):
    """Registra dispositivo per sync"""
    
    required_fields = ["device_id", "device_name", "device_fingerprint"]
    if not all(field in device_info for field in required_fields):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required fields: {required_fields}"
        )
    
    try:
        success = DeviceModel.register_device(
            device_id=device_info["device_id"],
            user_id=current_user["id"],
            device_name=device_info["device_name"],
            device_fingerprint=device_info["device_fingerprint"],
            user_agent=device_info.get("user_agent"),
            ip=device_info.get("ip_address")
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register device"
            )
        
        return {"message": "Device registered successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error registering device: {str(e)}"
        )

@router.get("/devices")
async def get_user_devices(
    current_user: dict = Depends(get_current_active_user)
):
    """Recupera dispositivi utente"""
    
    try:
        devices = DeviceModel.get_user_devices(current_user["id"])
        return {"devices": devices}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving devices: {str(e)}"
        )

# Statistics endpoint
@router.get("/stats")
async def get_conversation_stats(
    current_user: dict = Depends(get_current_active_user)
):
    """Statistiche conversazioni utente"""
    
    try:
        from .database import db_manager
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Conteggio conversazioni
            cursor.execute("""
                SELECT COUNT(*) as total_conversations,
                       SUM(message_count) as total_messages,
                       MAX(updated_at) as last_activity
                FROM conversations 
                WHERE user_id = ? AND is_deleted = 0
            """, (current_user["id"],))
            
            stats = dict(cursor.fetchone())
            
            # Conversazioni per dispositivo
            cursor.execute("""
                SELECT device_id, COUNT(*) as count
                FROM conversations 
                WHERE user_id = ? AND is_deleted = 0 AND device_id IS NOT NULL
                GROUP BY device_id
            """, (current_user["id"],))
            
            device_stats = [dict(row) for row in cursor.fetchall()]
            
            return {
                "user_id": current_user["id"],
                "statistics": stats,
                "by_device": device_stats
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving statistics: {str(e)}"
        )
