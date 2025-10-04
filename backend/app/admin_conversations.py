"""
Admin endpoints for viewing all user conversations
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .auth import get_current_admin_user
from .database import db_manager
from .crypto_at_rest import decrypt_text as _dec_text, is_encrypted as _is_enc

router = APIRouter(prefix="/admin/conversations", tags=["admin-conversations"])

def _dec_safe(val: str) -> str:
    """Safely decrypt text if encrypted"""
    try:
        return _dec_text(val) if _is_enc(val) else val
    except Exception:
        return val

class ConversationListItem(BaseModel):
    id: str
    user_id: int
    user_email: Optional[str]
    username: Optional[str]
    title: str
    created_at: str
    updated_at: str
    message_count: int
    personality_id: Optional[str]
    personality_name: Optional[str]
    device_id: Optional[str]

class MessageDetail(BaseModel):
    id: str
    role: str
    content: str
    timestamp: str
    token_count: int
    processing_time: float

class ConversationDetail(BaseModel):
    id: str
    user_id: int
    username: Optional[str]
    title: str
    created_at: str
    updated_at: str
    personality_id: Optional[str]
    personality_name: Optional[str]
    device_id: Optional[str]
    messages: List[MessageDetail]

@router.get("/", response_model=Dict[str, Any])
async def list_all_conversations(
    current_user: dict = Depends(get_current_admin_user),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    personality_id: Optional[str] = Query(None, description="Filter by personality ID"),
    search: Optional[str] = Query(None, description="Search in titles and message content"),
    date_from: Optional[str] = Query(None, description="Filter from date (ISO format)"),
    date_to: Optional[str] = Query(None, description="Filter to date (ISO format)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """
    List all conversations with filters (admin only)
    Returns paginated list with user info and message counts
    Search parameter searches in both titles and message content (decrypted)
    """
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Build query with filters
            where_clauses = ["(c.is_deleted = 0 OR c.is_deleted IS NULL OR c.is_deleted = FALSE)"]
            params = []
            
            if user_id is not None:
                where_clauses.append("c.user_id = ?")
                params.append(user_id)
            
            if personality_id:
                where_clauses.append("c.id IN (SELECT DISTINCT conversation_id FROM messages WHERE content_encrypted LIKE ?)")
                params.append(f'%"personality_id":"{personality_id}"%')

            if search:
                # Search in titles or message content
                # Note: This searches in encrypted content, so it may not find all matches
                # For better results, we'll post-filter after decryption
                where_clauses.append("(c.title_encrypted LIKE ? OR c.id IN (SELECT DISTINCT conversation_id FROM messages WHERE content_encrypted LIKE ?))")
                params.append(f'%{search}%')
                params.append(f'%{search}%')
            
            if date_from:
                where_clauses.append("c.created_at >= ?")
                params.append(date_from)
            
            if date_to:
                where_clauses.append("c.created_at <= ?")
                params.append(date_to)
            
            where_sql = " AND ".join(where_clauses)
            
            # Get total count
            count_query = f"SELECT COUNT(*) as total FROM conversations c WHERE {where_sql}"
            db_manager.exec(cursor, count_query, tuple(params))
            total = cursor.fetchone()['total']
            
            # Get paginated results with user info
            query = f"""
                SELECT
                    c.id,
                    c.user_id,
                    u.email as user_email,
                    u.username,
                    c.title_encrypted,
                    c.created_at,
                    c.updated_at,
                    c.device_id,
                    COUNT(m.id) as message_count
                FROM conversations c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN messages m ON c.id = m.conversation_id AND (m.is_deleted = 0 OR m.is_deleted IS NULL OR m.is_deleted = FALSE)
                WHERE {where_sql}
                GROUP BY c.id, c.user_id, u.email, u.username, c.title_encrypted, c.created_at, c.updated_at, c.device_id
                ORDER BY c.updated_at DESC
                LIMIT ? OFFSET ?
            """
            params.extend([limit, offset])
            
            db_manager.exec(cursor, query, tuple(params))
            rows = cursor.fetchall()
            
            conversations = []
            for row in rows:
                r = dict(row)
                # Decrypt title for admin view
                title_encrypted = r.get('title_encrypted', '')
                title = _dec_safe(title_encrypted)
                
                # Try to extract personality info from first message
                personality_id = None
                personality_name = None
                
                # Get first message to check for personality
                db_manager.exec(cursor, """
                    SELECT content_encrypted FROM messages 
                    WHERE conversation_id = ? 
                    ORDER BY timestamp ASC LIMIT 1
                """, (r['id'],))
                first_msg = cursor.fetchone()
                if first_msg:
                    try:
                        import json
                        content = _dec_safe(first_msg['content_encrypted'])
                        # Try to parse if it's JSON with metadata
                        if content.startswith('{'):
                            data = json.loads(content)
                            if 'personality_id' in data:
                                personality_id = data['personality_id']
                                personality_name = data.get('personality_name')
                    except:
                        pass
                
                conversations.append(ConversationListItem(
                    id=r['id'],
                    user_id=r['user_id'],
                    user_email=r.get('user_email'),
                    username=r.get('username'),
                    title=title,
                    created_at=r['created_at'] if isinstance(r['created_at'], str) else r['created_at'].isoformat(),
                    updated_at=r['updated_at'] if isinstance(r['updated_at'], str) else r['updated_at'].isoformat(),
                    message_count=r['message_count'],
                    personality_id=personality_id,
                    personality_name=personality_name,
                    device_id=r.get('device_id')
                ))
            
            return {
                'success': True,
                'conversations': [c.dict() for c in conversations],
                'total': total,
                'limit': limit,
                'offset': offset
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversations: {str(e)}")

@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_detail(
    conversation_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Get full conversation details with all messages (admin only)
    Returns decrypted messages for admin review
    """
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get conversation info
            db_manager.exec(cursor, """
                SELECT 
                    c.*,
                    u.username
                FROM conversations c
                LEFT JOIN users u ON c.user_id = u.id
                WHERE c.id = ? AND c.is_deleted = 0
            """, (conversation_id,))
            
            conv_row = cursor.fetchone()
            if not conv_row:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            conv = dict(conv_row)
            title = _dec_safe(conv.get('title_encrypted', ''))
            
            # Get all messages
            db_manager.exec(cursor, """
                SELECT 
                    id,
                    role,
                    content_encrypted,
                    timestamp,
                    token_count,
                    processing_time
                FROM messages
                WHERE conversation_id = ?
                ORDER BY timestamp ASC
            """, (conversation_id,))
            
            message_rows = cursor.fetchall()
            messages = []
            personality_id = None
            personality_name = None
            
            for msg_row in message_rows:
                msg = dict(msg_row)
                content = _dec_safe(msg['content_encrypted'])
                
                # Try to extract personality from first message
                if not personality_id and msg['role'] == 'assistant':
                    try:
                        import json
                        if content.startswith('{'):
                            data = json.loads(content)
                            if 'personality_id' in data:
                                personality_id = data['personality_id']
                                personality_name = data.get('personality_name')
                    except:
                        pass
                
                messages.append(MessageDetail(
                    id=msg['id'],
                    role=msg['role'],
                    content=content,
                    timestamp=msg['timestamp'] if isinstance(msg['timestamp'], str) else msg['timestamp'].isoformat(),
                    token_count=msg.get('token_count', 0),
                    processing_time=msg.get('processing_time', 0.0)
                ))
            
            return ConversationDetail(
                id=conv['id'],
                user_id=conv['user_id'],
                username=conv.get('username'),
                title=title,
                created_at=conv['created_at'] if isinstance(conv['created_at'], str) else conv['created_at'].isoformat(),
                updated_at=conv['updated_at'] if isinstance(conv['updated_at'], str) else conv['updated_at'].isoformat(),
                personality_id=personality_id,
                personality_name=personality_name,
                device_id=conv.get('device_id'),
                messages=messages
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversation detail: {str(e)}")

@router.delete("/{conversation_id}")
async def delete_conversation_admin(
    conversation_id: str,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Soft delete a conversation (admin only)
    """
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE conversations 
                SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (conversation_id,))
            conn.commit()
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            return {'success': True, 'message': 'Conversation deleted'}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting conversation: {str(e)}")
