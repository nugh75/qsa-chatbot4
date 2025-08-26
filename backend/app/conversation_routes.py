"""
Conversation management endpoints with encryption support
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import hashlib

from .auth import get_current_active_user
from .database import ConversationModel, MessageModel, DeviceModel
from .prompts import load_summary_prompt
from .llm import chat_with_provider
from .admin import get_summary_provider
import io, json, zipfile

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

class ConversationSummaryResponse(BaseModel):
    conversation_id: str
    summary: str
    model_provider: str
    message_count: int
    generated_at: str

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

# Test endpoint for debugging authentication
@router.get("/test-auth")
async def test_auth(current_user: dict = Depends(get_current_active_user)):
    """Test endpoint to verify authentication is working"""
    return {
        "authenticated": True,
        "user_id": current_user["id"],
        "email": current_user.get("email", "N/A"),
        "message": "Authentication successful"
    }

# ---------------- Summary & Export with Report -----------------
@router.get("/{conversation_id}/summary", response_model=ConversationSummaryResponse)
async def summarize_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Genera un riassunto della conversazione usando il prompt di summary configurato."""
    conversation = ConversationModel.get_conversation(conversation_id, current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = MessageModel.get_conversation_messages(conversation_id, limit=1000)
    if not messages:
        raise HTTPException(status_code=400, detail="Conversation has no messages")

    # Genera summary con provider configurato
    summary_prompt = load_summary_prompt()
    summary_provider = get_summary_provider()
    llm_messages = [{"role": "system", "content": summary_prompt}] + [
        {"role": m['role'], "content": m['content_encrypted']} for m in messages
    ]
    try:
        summary_text = await chat_with_provider(llm_messages, provider=summary_provider)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {e}")

    return ConversationSummaryResponse(
        conversation_id=conversation_id,
        summary=summary_text,
        model_provider=summary_provider,
        message_count=len(messages),
        generated_at=datetime.utcnow().isoformat() + 'Z'
    )

@router.get("/{conversation_id}/export-with-report")
async def export_conversation_with_report(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Esporta una singola conversazione in un archivio ZIP contenente:
    - chat.json (metadata + messaggi)
    - report.md (riassunto conversazione)
    - metadata.json (informazioni di export)
    """
    try:
        conversation = ConversationModel.get_conversation(conversation_id, current_user['id'])
        if not conversation:
            raise HTTPException(
                status_code=404, 
                detail=f"Conversation {conversation_id} not found for user {current_user['id']}"
            )

        messages = MessageModel.get_conversation_messages(conversation_id, limit=1000)
        if not messages:
            raise HTTPException(
                status_code=400, 
                detail=f"Conversation {conversation_id} has no messages to export"
            )

        # Genera summary con error handling migliorato
        summary_prompt = load_summary_prompt()
        summary_provider = get_summary_provider()
        llm_messages = [{"role": "system", "content": summary_prompt}] + [
            {"role": m['role'], "content": m['content_encrypted']} for m in messages
        ]
        
        try:
            summary_text = await chat_with_provider(llm_messages, provider=summary_provider)
        except Exception as e:
            print(f"Summary generation failed for conversation {conversation_id}: {e}")
            summary_text = f"Errore generazione summary: {e}\n\nConversazione con {len(messages)} messaggi dal {conversation['created_at']} al {conversation['updated_at']}"

        # Preparazione payload export
        chat_payload = {
            "conversation": {
                "id": conversation['id'],
                "title_encrypted": conversation['title_encrypted'],
                "created_at": conversation['created_at'],
                "updated_at": conversation['updated_at'],
                "message_count": conversation['message_count']
            },
            "messages": [
                {
                    "id": m['id'],
                    "role": m['role'],
                    "content": m['content_encrypted'],
                    "timestamp": m['timestamp']
                } for m in messages
            ]
        }
        
        report_md = f"# Report Conversazione {conversation['id']}\n\n## Informazioni Generali\n- Creata: {conversation['created_at']}\n- Ultimo aggiornamento: {conversation['updated_at']}\n- Numero messaggi: {len(messages)}\n\n## Riassunto\n\n{summary_text}\n"
        
        metadata = {
            "exported_at": datetime.utcnow().isoformat() + 'Z',
            "user_id": current_user['id'],
            "conversation_id": conversation_id,
            "files": ["chat.json", "report.md", "metadata.json"],
            "message_count": len(messages),
            "export_version": "1.1"
        }

        # Creazione ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('chat.json', json.dumps(chat_payload, ensure_ascii=False, indent=2))
            zf.writestr('report.md', report_md)
            zf.writestr('metadata.json', json.dumps(metadata, ensure_ascii=False, indent=2))

        zip_buffer.seek(0)
        filename = f"conversation_{conversation_id}_export.zip"
        
        return StreamingResponse(
            zip_buffer, 
            media_type='application/zip', 
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        print(f"Unexpected error in export_conversation_with_report: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal error during export: {str(e)}"
        )
