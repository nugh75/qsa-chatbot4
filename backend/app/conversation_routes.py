"""
Conversation management endpoints with encryption support
"""
from datetime import datetime, timedelta
from typing import List as _List
from typing import List, Optional, Dict, Any
import hashlib
import io, json, zipfile, re
import uuid

from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import fitz  # type: ignore
import traceback

from . import welcome_guides as _wg
from .admin import get_summary_provider, get_summary_model
from .auth import get_current_active_user
from .crypto_at_rest import encrypt_text as _enc_text, decrypt_text as _dec_text, is_encrypted as _is_enc
from .database import ConversationModel, MessageModel, DeviceModel
from .database import db_manager
from .llm import chat_with_provider
from .logging_utils import log_interaction as _li
from .prompts import load_summary_prompt

def _dec_safe(val: str) -> str:
    try:
        return _dec_text(val) if _is_enc(val) else val
    except Exception:
        return val

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
    # New: server-side decrypted title for authenticated user
    title: Optional[str] = None
    title_hash: str
    created_at: str
    updated_at: str
    message_count: int
    device_id: Optional[str]

class MessageResponse(BaseModel):
    id: str
    content_encrypted: str
    # New: server-side decrypted content for authenticated user
    content: Optional[str] = None
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
        conversation_id = f"conv_{uuid.uuid4().hex}"
        # Accept either plaintext or ciphertext in title_encrypted; store encrypted, hash on plaintext
        title_in = conversation_data.title_encrypted or ''
        try:
            title_plain = _dec_text(title_in) if _is_enc(title_in) else title_in
        except Exception:
            title_plain = title_in
        # Store via model; model encrypts at rest, but keep input consistent
        success = ConversationModel.create_conversation(
            conversation_id=conversation_id,
            user_id=current_user["id"],
            title_encrypted=title_plain,
            device_id=conversation_data.device_id
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
        return {"conversation_id": conversation_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating conversation: {e}")

@router.get("/", response_model=List[ConversationResponse])
async def get_user_conversations(
    limit: int = 50,
    current_user: dict = Depends(get_current_active_user)
):
    """Recupera le conversazioni dell'utente"""
    try:
        conversations = ConversationModel.get_user_conversations(user_id=current_user["id"], limit=limit)
        # Attach decrypted title alongside encrypted value
        enriched = []
        for conv in conversations:
            conv_dict = dict(conv)
            conv_dict["title"] = _dec_safe(conv_dict.get("title_encrypted") or "")
            enriched.append(ConversationResponse(**conv_dict))
        return enriched
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving conversations: {e}")

@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    conversation = ConversationModel.get_conversation(conversation_id=conversation_id, user_id=current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv_dict = dict(conversation)
    conv_dict["title"] = _dec_safe(conv_dict.get("title_encrypted") or "")
    return ConversationResponse(**conv_dict)

@router.put("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    update_data: ConversationUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    conversation = ConversationModel.get_conversation(conversation_id=conversation_id, user_id=current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        # Normalize plaintext for hashing and encrypt for storage
        incoming = update_data.title_encrypted or ''
        try:
            title_plain = _dec_text(incoming) if _is_enc(incoming) else incoming
        except Exception:
            title_plain = incoming
        title_hash = hashlib.sha256((title_plain or '').encode()).hexdigest()
        new_title_enc = _enc_text(title_plain)

        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, """
                UPDATE conversations 
                SET title_encrypted = ?, title_hash = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            """, (new_title_enc, title_hash, conversation_id, current_user["id"]))
            conn.commit()
        return {"message": "Conversation updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating conversation: {e}")

@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    conversation = ConversationModel.get_conversation(conversation_id=conversation_id, user_id=current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:

        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor, "UPDATE conversations SET is_deleted = ? WHERE id = ? AND user_id = ?", (True, conversation_id, current_user["id"]))
            db_manager.exec(cursor, "UPDATE messages SET is_deleted = ? WHERE conversation_id = ?", (True, conversation_id))
            conn.commit()
        return {"message": "Conversation deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting conversation: {e}")

@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    limit: int = 100,
    current_user: dict = Depends(get_current_active_user)
):
    conversation = ConversationModel.get_conversation(conversation_id=conversation_id, user_id=current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    try:
        messages = MessageModel.get_conversation_messages(conversation_id=conversation_id, limit=limit)
        enriched = []
        for msg in messages:
            m = dict(msg)
            m["content"] = _dec_safe(m.get("content_encrypted") or "")
            enriched.append(MessageResponse(**m))
        return enriched
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving messages: {e}")

@router.post("/{conversation_id}/messages", response_model=Dict[str, str])
async def add_message(
    conversation_id: str,
    message_data: MessageCreate,
    current_user: dict = Depends(get_current_active_user)
):
    conversation = ConversationModel.get_conversation(conversation_id=conversation_id, user_id=current_user["id"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if message_data.role not in ["user", "assistant"]:
        raise HTTPException(status_code=400, detail="Invalid message role")
    try:
        message_id = f"msg_{uuid.uuid4().hex}"
        # Compute plaintext for hashing if input appears encrypted with our format
        content_in = message_data.content_encrypted or ''
        try:
            content_plain = _dec_text(content_in) if _is_enc(content_in) else content_in
        except Exception:
            content_plain = content_in
        success = MessageModel.add_message(
            message_id=message_id,
            conversation_id=conversation_id,
            content_encrypted=message_data.content_encrypted,
            role=message_data.role,
            token_count=message_data.token_count or 0,
            processing_time=message_data.processing_time or 0.0,
            content_plaintext_for_hash=content_plain
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add message")
        return {"message_id": message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding message: {e}")

# Device management endpoints
class DeviceRegister(BaseModel):
    device_id: str
    device_name: str
    device_fingerprint: str
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None

@router.post("/devices/register")
async def register_device(
    device_info: DeviceRegister,
    current_user: dict = Depends(get_current_active_user)
):
    """Registra dispositivo per sync"""
    try:
        success = DeviceModel.register_device(
            device_id=device_info.device_id,
            user_id=current_user["id"],
            device_name=device_info.device_name,
            device_fingerprint=device_info.device_fingerprint,
            user_agent=device_info.user_agent,
            ip=device_info.ip_address
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register device"
            )
        return {"message": "Device registered successfully"}
    except HTTPException:
        raise
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

        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Conteggio conversazioni
            db_manager.exec(cursor, """
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
    summary_model = get_summary_model()
    
    # Detailed logging for summary generation debugging
    try:

        _li({
            "event": "summary_generation_debug_get",
            "conversation_id": conversation_id,
            "user_id": current_user.get('id'),
            "summary_prompt_length": len(summary_prompt or ''),
            "summary_prompt_preview": (summary_prompt or '')[:100] + '...' if summary_prompt and len(summary_prompt) > 100 else summary_prompt,
            "summary_provider": summary_provider,
            "summary_model": summary_model,
            "message_count": len(messages),
            "has_messages": bool(messages)
        })
    except Exception as log_err:
        print(f"Logging error in summary debug GET: {log_err}")
    
    # Decrypt messages for LLM summary
    llm_messages = [{"role": "system", "content": summary_prompt}] + [
        {"role": m['role'], "content": _dec_safe(m['content_encrypted'])} for m in messages
    ]
    
    # Log the messages being sent to LLM
    try:

        _li({
            "event": "llm_messages_debug_get",
            "conversation_id": conversation_id,
            "user_id": current_user.get('id'),
            "llm_message_count": len(llm_messages),
            "system_prompt_length": len(summary_prompt or ''),
            "user_messages_count": len([m for m in llm_messages if m['role'] != 'system']),
            "first_user_message_preview": next((m['content'][:100] + '...' for m in llm_messages if m['role'] != 'system'), 'No user messages')
        })
    except Exception as log_err:
        print(f"Logging error in LLM messages debug GET: {log_err}")
    
    try:
        print(f"[DEBUG] Starting summary generation for conversation {conversation_id} (GET)")
        print(f"[DEBUG] Provider: {summary_provider}, Model: {summary_model}")
        print(f"[DEBUG] Prompt length: {len(summary_prompt or '')}")
        print(f"[DEBUG] Messages to process: {len(messages)}")
        
        summary_text = await chat_with_provider(llm_messages, provider=summary_provider, model=summary_model, is_summary_request=True)
        
        print(f"[DEBUG] Summary generation completed successfully (GET)")
        print(f"[DEBUG] Summary length: {len(summary_text or '')}")
        print(f"[DEBUG] Summary preview: {(summary_text or '')[:200]}...")
        
        # Log successful summary generation
        try:

            _li({
                "event": "summary_generation_success_get",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "summary_length": len(summary_text or ''),
                "summary_provider": summary_provider,
                "summary_model": summary_model
            })
        except Exception as log_err:
            print(f"Logging error in summary success GET: {log_err}")
            
    except Exception as e:
        print(f"[ERROR] Summary generation failed for conversation {conversation_id} (GET): {e}")
        print(f"[ERROR] Exception type: {type(e).__name__}")

        print(f"[ERROR] Traceback: {traceback.format_exc()}")
        
        # Log the failure
        try:

            _li({
                "event": "summary_generation_failed_get",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "error_message": str(e),
                "error_type": type(e).__name__,
                "summary_provider": summary_provider,
                "summary_model": summary_model
            })
        except Exception as log_err:
            print(f"Logging error in summary failure GET: {log_err}")
        
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {e}")

    return ConversationSummaryResponse(
        conversation_id=conversation_id,
        summary=summary_text,
        model_provider=f"{summary_provider}:{summary_model}" if summary_model else summary_provider,
        message_count=len(messages),
        generated_at=datetime.utcnow().isoformat() + 'Z'
    )

@router.get("/{conversation_id}/export-with-report")
async def export_conversation_with_report(
    conversation_id: str,
    format: str | None = Query(default=None, description="Formato export: zip (default), pdf oppure txt"),
    current_user: dict = Depends(get_current_active_user)
):
    """Esporta una singola conversazione nei formati disponibili.

    Formati supportati:
      - zip (default): chat.json, report.md, metadata.json
      - pdf: singolo PDF con meta, summary e messaggi
      - txt: testo semplice con meta, summary e messaggi
    """
    try:
        conversation = ConversationModel.get_conversation(conversation_id, current_user['id'])
        if not conversation:
            raise HTTPException(status_code=404, detail=f"Conversation {conversation_id} not found for user {current_user['id']}")

        messages = MessageModel.get_conversation_messages(conversation_id, limit=1000)
        if not messages:
            raise HTTPException(status_code=400, detail=f"Conversation {conversation_id} has no messages to export")

        # Attempt to include active welcome message as the first exported message
        try:

            _wg_data = _wg.public_welcome_and_guide()
            _welcome = _wg_data.get('welcome') if isinstance(_wg_data, dict) else None
        except Exception:
            _welcome = None

        export_messages = list(messages)
        if _welcome and isinstance(_welcome, dict):
            # compute a timestamp just before the first message
            first_ts = None
            try:
                if messages and messages[0].get('timestamp'):
                    ts_s = messages[0].get('timestamp')
                    if isinstance(ts_s, str) and ts_s.endswith('Z'):
                        ts_s = ts_s[:-1]
                    first_ts = datetime.fromisoformat(ts_s)
            except Exception:
                first_ts = None

            if not first_ts:
                try:
                    first_ts = datetime.fromisoformat(conversation.get('created_at').rstrip('Z'))
                except Exception:
                    first_ts = datetime.utcnow()

            welcome_ts = (first_ts - timedelta(seconds=1)).isoformat() + 'Z'
            welcome_msg = {
                'id': _welcome.get('id') or f"welcome_{uuid.uuid4().hex}",
                'role': 'assistant',
                'content': _welcome.get('content') or '',
                'timestamp': welcome_ts,
                'is_welcome': True
            }
            export_messages = [welcome_msg] + export_messages

        summary_prompt = load_summary_prompt()
        summary_provider = get_summary_provider()
        summary_model = get_summary_model()
        
        # Detailed logging for summary generation debugging
        try:

            _li({
                "event": "summary_generation_debug_export",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "summary_prompt_length": len(summary_prompt or ''),
                "summary_prompt_preview": (summary_prompt or '')[:100] + '...' if summary_prompt and len(summary_prompt) > 100 else summary_prompt,
                "summary_provider": summary_provider,
                "summary_model": summary_model,
                "message_count": len(messages),
                "has_messages": bool(messages)
            })
        except Exception as log_err:
            print(f"Logging error in summary debug export: {log_err}")
        
        # For summary generation use the original messages (do not include welcome in the LLM prompt)
        llm_messages = [{"role": "system", "content": summary_prompt}] + [
            {"role": m['role'], "content": m['content_encrypted']} for m in messages
        ]
        
        # Log the messages being sent to LLM
        try:

            _li({
                "event": "llm_messages_debug_export",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "llm_message_count": len(llm_messages),
                "system_prompt_length": len(summary_prompt or ''),
                "user_messages_count": len([m for m in llm_messages if m['role'] != 'system']),
                "first_user_message_preview": next((m['content'][:100] + '...' for m in llm_messages if m['role'] != 'system'), 'No user messages')
            })
        except Exception as log_err:
            print(f"Logging error in LLM messages debug export: {log_err}")
        
        try:
            print(f"[DEBUG] Starting summary generation for conversation {conversation_id} (EXPORT)")
            print(f"[DEBUG] Provider: {summary_provider}, Model: {summary_model}")
            print(f"[DEBUG] Prompt length: {len(summary_prompt or '')}")
            print(f"[DEBUG] Messages to process: {len(messages)}")

            summary_text = await chat_with_provider(
                llm_messages,
                provider=summary_provider,
                model=summary_model,
                is_summary_request=True
            )

            print(f"[DEBUG] Summary generation completed successfully (EXPORT)")
            print(f"[DEBUG] Summary length: {len(summary_text or '')}")
            print(f"[DEBUG] Summary preview: {(summary_text or '')[:200]}...")

            # Log successful summary generation
            try:

                _li({
                    "event": "summary_generation_success_export",
                    "conversation_id": conversation_id,
                    "user_id": current_user.get('id'),
                    "summary_length": len(summary_text or ''),
                    "summary_provider": summary_provider,
                    "summary_model": summary_model
                })
            except Exception as log_err:
                print(f"Logging error in summary success export: {log_err}")
            
        except Exception as e:
            print(f"[ERROR] Summary generation failed for conversation {conversation_id} (EXPORT): {e}")
            print(f"[ERROR] Exception type: {type(e).__name__}")

            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            
            # Log the failure
            try:

                _li({
                    "event": "summary_generation_failed_export",
                    "conversation_id": conversation_id,
                    "user_id": current_user.get('id'),
                    "error_message": str(e),
                    "error_type": type(e).__name__,
                    "summary_provider": summary_provider,
                    "summary_model": summary_model
                })
            except Exception as log_err:
                print(f"Logging error in summary failure export: {log_err}")
            
            summary_text = (
                f"Errore generazione summary: {e}\n\n"
                f"Conversazione con {len(messages)} messaggi dal {conversation['created_at']} al {conversation['updated_at']}"
            )

        chat_payload = {
            "conversation": {
                "id": conversation['id'],
                "title_encrypted": conversation['title_encrypted'],
                "created_at": conversation['created_at'],
                "updated_at": conversation['updated_at'],
                "message_count": len(export_messages)
            },
            "summary": summary_text,
            "messages": [
                {
                    "id": m.get('id'),
                    "role": m.get('role'),
                    "content": (_dec_safe(m['content_encrypted']) if m.get('content_encrypted') is not None else m.get('content')),
                    "timestamp": m.get('timestamp'),
                    "is_welcome": bool(m.get('is_welcome'))
                } for m in export_messages
            ]
        }

        # Include title in report header if available
        _conv_title = conversation.get('title_encrypted') or ''
        report_md = (
            f"# Report Conversazione {conversation['id']}{f' - {_conv_title}' if _conv_title else ''}\n\n"
            f"## Informazioni Generali\n"
            f"- Creata: {conversation['created_at']}\n"
            f"- Ultimo aggiornamento: {conversation['updated_at']}\n"
            f"- Numero messaggi: {len(export_messages)}\n\n"
            f"## Riassunto\n\n{summary_text}\n"
        )

        metadata = {
            "exported_at": datetime.utcnow().isoformat() + 'Z',
            "user_id": current_user['id'],
            "conversation_id": conversation_id,
            "files": ["chat.json", "report.md", "metadata.json"],
            "message_count": len(export_messages),
            "summary_provider": summary_provider,
            "summary_model": summary_model,
            "summary_chars": len(summary_text or ''),
            "has_summary": bool(summary_text),
            "export_version": "1.2"
        }

        fmt = (format or '').lower()

        def _strip_markdown(text: str) -> str:
            if not text:
                return ''
            text = re.sub(r"```([\s\S]*?)```", lambda m: m.group(1).strip(), text)
            text = text.replace('**', '').replace('__', '')
            text = re.sub(r"`([^`]+)`", r"\1", text)
            text = re.sub(r"^\s{0,3}#+\s*", "", text, flags=re.MULTILINE)
            text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"^\|.*\|$", lambda m: ' '.join(p.strip() for p in m.group(0).strip('|').split('|')), text, flags=re.MULTILINE)
            text = re.sub(r"^(-{3,}|\*{3,}|_{3,})$", "", text, flags=re.MULTILINE)
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip()

        raw_title = conversation.get('title_encrypted') or ''
        safe_title = re.sub(r'[^A-Za-z0-9_-]+','-', raw_title.strip())[:40].strip('-') if raw_title else ''
        title_part = f"_{safe_title}" if safe_title else ''
        title_for_header = conversation.get('title_encrypted') or conversation['id']

        if fmt == 'txt':

            lines: _List[str] = []
            lines.append(
                f"Chat: {conversation['id']}" + (
                    f" - {title_for_header}" if title_for_header and title_for_header != conversation['id'] else ''
                )
            )
            lines.append(f"Creata: {conversation['created_at']}")
            lines.append(f"Ultimo aggiornamento: {conversation['updated_at']}")
            lines.append(f"Messaggi: {len(export_messages)}")
            lines.append(f"Provider riassunto: {summary_provider}")
            if summary_model:
                lines.append(f"Modello riassunto: {summary_model}")
            lines.append("")
            lines.append("=== SUMMARY ===")
            lines.append(_strip_markdown(summary_text or '(nessun riassunto)'))
            lines.append("\n=== MESSAGGI ===")
            for msg in export_messages:
                lines.append(f"[{msg.get('timestamp')}] {msg.get('role')}: {_strip_markdown(_dec_safe(msg.get('content_encrypted')) if msg.get('content_encrypted') is not None else msg.get('content'))}{' [WELCOME]' if msg.get('is_welcome') else ''}")
            txt_buffer = io.BytesIO("\n".join(lines).encode('utf-8'))
            created_short = conversation['created_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
            exported_short = metadata['exported_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
            filename_txt = f"chat_{conversation_id}{title_part}_{created_short}_exported_{exported_short}.txt"
            return StreamingResponse(
                txt_buffer,
                media_type='text/plain; charset=utf-8',
                headers={'Content-Disposition': f'attachment; filename={filename_txt}'}
            )

        if fmt == 'pdf':
            try:

                pdf_buffer = io.BytesIO()
                doc = fitz.open()

                def _add_wrapped_text(page, text: str, top: float = 50, left: float = 50, max_width: float = 500, line_height: float = 14, font_size: float = 11):
                    words = text.split()
                    line = ''
                    y = top
                    max_chars = int(max_width / (font_size * 0.55))
                    for w in words:
                        candidate = (line + ' ' + w).strip()
                        if len(candidate) > max_chars and line:
                            page.insert_text((left, y), line, fontsize=font_size)
                            y += line_height
                            line = w
                        else:
                            line = candidate
                        if y > page.rect.height - 60:
                            page = doc.new_page()
                            y = 50
                    if line:
                        page.insert_text((left, y), line, fontsize=font_size)
                        y += line_height
                    return page, y

                page = doc.new_page()
                title_text = (
                    f"Chat {conversation['id']}" + (
                        f" - {title_for_header}" if title_for_header and title_for_header != conversation['id'] else ''
                    ) + f" - creata {conversation['created_at']} - export {metadata['exported_at']}"
                )
                # Title
                page.insert_text((50, 40), title_text, fontsize=14)
                # Meta block lines, then compute next y dynamically
                meta_lines = [
                    f"Creato: {conversation['created_at']}",
                    f"Ultimo aggiornamento: {conversation['updated_at']}",
                    f"Messaggi: {len(messages)}",
                    f"Provider summary: {summary_provider}" + (f" / model: {summary_model}" if summary_model else '')
                ]
                y_meta = 70
                for ml in meta_lines:
                    page.insert_text((50, y_meta), ml, fontsize=11)
                    y_meta += 14
                # Section: Summary
                y_meta += 10
                page.insert_text((50, y_meta), "Riassunto:", fontsize=13)
                y_meta += 20
                page, y_cursor = _add_wrapped_text(page, _strip_markdown(summary_text or '(nessun riassunto)'), top=y_meta)
                page.insert_text((50, y_cursor + 10), "Messaggi:", fontsize=13)
                y_cursor += 30
                for msg in messages:
                    block = f"[{msg['timestamp']}] {msg['role']}:\n{_strip_markdown(_dec_safe(msg['content_encrypted']))}\n"
                    page, y_cursor = _add_wrapped_text(page, block, top=y_cursor)
                    y_cursor += 4
                    if y_cursor > page.rect.height - 80:
                        page = doc.new_page()
                        y_cursor = 50
                doc.save(pdf_buffer)
                doc.close()
                pdf_buffer.seek(0)
                created_short = conversation['created_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
                exported_short = metadata['exported_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
                filename_pdf = f"chat_{conversation_id}{title_part}_{created_short}_exported_{exported_short}.pdf"
                return StreamingResponse(
                    pdf_buffer,
                    media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename={filename_pdf}'}
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")

        # Default ZIP export
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('chat.json', json.dumps(chat_payload, ensure_ascii=False, indent=2))
            zf.writestr('report.md', report_md)
            zf.writestr('metadata.json', json.dumps(metadata, ensure_ascii=False, indent=2))
        zip_buffer.seek(0)
        created_short = conversation['created_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
        exported_short = metadata['exported_at'].replace(':', '').replace('-', '').replace('T', '_').split('.')[0]
        filename_zip = f"chat_{conversation_id}{title_part}_{created_short}_exported_{exported_short}.zip"
        return StreamingResponse(
            zip_buffer,
            media_type='application/zip',
            headers={'Content-Disposition': f'attachment; filename={filename_zip}'}
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in export_conversation_with_report: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error during export: {str(e)}")

class ExportWithReportIn(BaseModel):
    format: Optional[str] = None
    # conversation_history expects a list of items like {"role": "user"|"assistant", "content": "...", "timestamp": "...", "id": "..."}
    conversation_history: Optional[List[Dict[str, Any]]] = None

@router.post("/{conversation_id}/export-with-report")
async def export_conversation_with_report_post(
    conversation_id: str,
    payload: ExportWithReportIn,
    current_user: dict = Depends(get_current_active_user)
):
    """Export that accepts decrypted conversation history in the request body.

    This is useful when messages are encrypted client-side: the frontend can POST the plaintext
    conversation history and let the backend generate the AI report and export bundle.
    Behavior mirrors the GET handler, preferring `payload.conversation_history` when provided.
    """
    try:
        # Basic logging start
        try:

            _li({
                "event": "export_with_report_post_start",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "provided_history": bool(payload.conversation_history),
                "format": payload.format or 'zip'
            })
        except Exception:
            pass

        # Validate conversation ownership
        conversation = ConversationModel.get_conversation(conversation_id, current_user['id'])
        if not conversation:
            raise HTTPException(status_code=404, detail=f"Conversation {conversation_id} not found for user {current_user['id']}")

        # Decide source of messages: payload.history (plaintext from frontend) or DB
        if payload.conversation_history:
            # Normalize provided history to the same shape used elsewhere
            messages = []
            for m in payload.conversation_history:
                messages.append({
                    'id': m.get('id'),
                    'role': m.get('role'),
                    # treat provided content as plaintext (LLM expects 'content' field)
                    'content_encrypted': m.get('content') or m.get('content_encrypted') or '',
                    'timestamp': m.get('timestamp')
                })
        else:
            messages = MessageModel.get_conversation_messages(conversation_id, limit=1000)
            if not messages:
                raise HTTPException(status_code=400, detail=f"Conversation {conversation_id} has no messages to export")

        # Try to retrieve active welcome and prepend to export messages (POST)
        try:

            _wg_data = _wg.public_welcome_and_guide()
            _welcome = _wg_data.get('welcome') if isinstance(_wg_data, dict) else None
        except Exception:
            _welcome = None

        export_messages = list(messages)
        if _welcome and isinstance(_welcome, dict):
            first_ts = None
            try:
                if messages and messages[0].get('timestamp'):
                    ts_s = messages[0].get('timestamp')
                    if isinstance(ts_s, str) and ts_s.endswith('Z'):
                        ts_s = ts_s[:-1]
                    first_ts = datetime.fromisoformat(ts_s)
            except Exception:
                first_ts = None

            if not first_ts:
                try:
                    first_ts = datetime.fromisoformat(conversation.get('created_at').rstrip('Z'))
                except Exception:
                    first_ts = datetime.utcnow()

            welcome_ts = (first_ts - timedelta(seconds=1)).isoformat() + 'Z'
            welcome_msg = {
                'id': _welcome.get('id') or f"welcome_{uuid.uuid4().hex}",
                'role': 'assistant',
                'content': _welcome.get('content') or '',
                'timestamp': welcome_ts,
                'is_welcome': True
            }
            export_messages = [welcome_msg] + export_messages

        summary_prompt = load_summary_prompt()
        summary_provider = get_summary_provider()
        summary_model = get_summary_model()
        
        # Detailed logging for summary generation debugging
        try:

            _li({
                "event": "summary_generation_debug",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "summary_prompt_length": len(summary_prompt or ''),
                "summary_prompt_preview": (summary_prompt or '')[:100] + '...' if summary_prompt and len(summary_prompt) > 100 else summary_prompt,
                "summary_provider": summary_provider,
                "summary_model": summary_model,
                "message_count": len(messages),
                "has_messages": bool(messages)
            })
        except Exception as log_err:
            print(f"Logging error in summary debug: {log_err}")
        
        llm_messages = [{"role": "system", "content": summary_prompt}] + [
            {"role": m['role'], "content": _dec_safe(m.get('content_encrypted'))}
            for m in messages
        ]
        
        # Log the messages being sent to LLM
        try:

            _li({
                "event": "llm_messages_debug",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "llm_message_count": len(llm_messages),
                "system_prompt_length": len(summary_prompt or ''),
                "user_messages_count": len([m for m in llm_messages if m['role'] != 'system']),
                "first_user_message_preview": next((m['content'][:100] + '...' for m in llm_messages if m['role'] != 'system'), 'No user messages'),
                "full_system_prompt": summary_prompt,
                "full_messages": llm_messages
            })
        except Exception as log_err:
            print(f"Logging error in LLM messages debug: {log_err}")
            print(f"[DEBUG] System prompt: {summary_prompt}")
            print(f"[DEBUG] LLM messages count: {len(llm_messages)}")
            for i, msg in enumerate(llm_messages):
                print(f"[DEBUG] Msg {i}: {msg['role']} - {msg['content'][:100]}...")
        
        try:
            print(f"[DEBUG] Starting summary generation for conversation {conversation_id}")
            print(f"[DEBUG] Provider: {summary_provider}, Model: {summary_model}")
            print(f"[DEBUG] Prompt length: {len(summary_prompt or '')}")
            print(f"[DEBUG] Messages to process: {len(messages)}")
            
            summary_text = await chat_with_provider(llm_messages, provider=summary_provider, model=summary_model, is_summary_request=True)
            
            print(f"[DEBUG] Summary generation completed successfully")
            print(f"[DEBUG] Summary length: {len(summary_text or '')}")
            print(f"[DEBUG] Summary preview: {(summary_text or '')[:200]}...")
            
            # Log successful summary generation
            try:

                _li({
                    "event": "summary_generation_success",
                    "conversation_id": conversation_id,
                    "user_id": current_user.get('id'),
                    "summary_length": len(summary_text or ''),
                    "summary_provider": summary_provider,
                    "summary_model": summary_model
                })
            except Exception as log_err:
                print(f"Logging error in summary success: {log_err}")
                
        except Exception as e:
            print(f"[ERROR] Summary generation failed for conversation (POST) {conversation_id}: {e}")
            print(f"[ERROR] Exception type: {type(e).__name__}")

            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            
            # Log the failure
            try:

                _li({
                    "event": "summary_generation_failed",
                    "conversation_id": conversation_id,
                    "user_id": current_user.get('id'),
                    "error_message": str(e),
                    "error_type": type(e).__name__,
                    "summary_provider": summary_provider,
                    "summary_model": summary_model
                })
            except Exception as log_err:
                print(f"Logging error in summary failure: {log_err}")
            
            summary_text = (
                f"Errore generazione summary: {e}\n\n"
                f"Conversazione con {len(messages)} messaggi dal {conversation['created_at']} al {conversation['updated_at']}"
            )

        # Build export payload using export_messages (which may include welcome)
        chat_payload = {
            "conversation": {
                "id": conversation['id'],
                "title_encrypted": conversation['title_encrypted'],
                "created_at": conversation['created_at'],
                "updated_at": conversation['updated_at'],
                "message_count": len(export_messages)
            },
            "summary": summary_text,
            "messages": [
                {
                    "id": m.get('id'),
                    "role": m.get('role'),
                    "content": (m.get('content_encrypted') if m.get('content_encrypted') is not None else m.get('content')),
                    "timestamp": m.get('timestamp'),
                    "is_welcome": bool(m.get('is_welcome'))
                } for m in export_messages
            ]
        }

        # Include title in POST report header if available
        _conv_title_post = conversation.get('title_encrypted') or ''
        report_md = (
            f"# Report Conversazione {conversation['id']}{f' - {_conv_title_post}' if _conv_title_post else ''}\n\n"
            f"## Informazioni Generali\n"
            f"- Creata: {conversation['created_at']}\n"
            f"- Ultimo aggiornamento: {conversation['updated_at']}\n"
            f"- Numero messaggi: {len(messages)}\n\n"
            f"## Riassunto\n\n{summary_text}\n"
        )

        metadata = {
            "exported_at": datetime.utcnow().isoformat() + 'Z',
            "user_id": current_user['id'],
            "conversation_id": conversation_id,
            "files": ["chat.json", "report.md", "metadata.json"],
            "message_count": len(export_messages),
            "summary_provider": summary_provider,
            "summary_model": summary_model,
            "summary_chars": len(summary_text or ''),
            "has_summary": bool(summary_text),
            "export_version": "1.2"
        }

        fmt = (payload.format or '').lower()
        def _strip_markdown(text: str) -> str:
            if not text:
                return ''
            text = re.sub(r"```([\s\S]*?)```", lambda m: m.group(1).strip(), text)
            text = text.replace('**','').replace('__','')
            text = re.sub(r"`([^`]+)`", r"\1", text)
            text = re.sub(r"^\s{0,3}#+\s*","", text, flags=re.MULTILINE)
            text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"^\|.*\|$", lambda m: ' '.join(p.strip() for p in m.group(0).strip('|').split('|')), text, flags=re.MULTILINE)
            text = re.sub(r"^(-{3,}|\*{3,}|_{3,})$","", text, flags=re.MULTILINE)
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip()
        # Sanitize title for filenames and headers
        raw_title_post = conversation.get('title_encrypted') or ''
        safe_title_post = re.sub(r'[^A-Za-z0-9_-]+','-', raw_title_post.strip())[:40].strip('-') if raw_title_post else ''
        title_part_post = f"_{safe_title_post}" if safe_title_post else ''
        title_for_header_post = conversation.get('title_encrypted') or conversation['id']
        if fmt == 'txt':

            lines: _List[str] = []
            lines.append(
                f"Chat: {conversation['id']}" + (
                    f" - {title_for_header_post}" if title_for_header_post and title_for_header_post != conversation['id'] else ''
                )
            )
            lines.append(f"Creata: {conversation['created_at']}")
            lines.append(f"Ultimo aggiornamento: {conversation['updated_at']}")
            lines.append(f"Messaggi: {len(messages)}")
            lines.append(f"Provider riassunto: {summary_provider}")
            if summary_model:
                lines.append(f"Modello riassunto: {summary_model}")
            lines.append("")
            lines.append("=== SUMMARY ===")
            lines.append(_strip_markdown(summary_text or '(nessun riassunto)'))
            lines.append("\n=== MESSAGGI ===")
            for msg in export_messages:
                lines.append(f"[{msg.get('timestamp')}] {msg.get('role')}: {_strip_markdown(_dec_safe(msg.get('content_encrypted')) if msg.get('content_encrypted') is not None else msg.get('content'))}{' [WELCOME]' if msg.get('is_welcome') else ''}")
            txt_buffer = io.BytesIO("\n".join(lines).encode('utf-8'))
            created_short = conversation['created_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
            exported_short = metadata['exported_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
            filename_txt = f"chat_{conversation_id}{title_part_post}_{created_short}_exported_{exported_short}.txt"
            return StreamingResponse(
                txt_buffer,
                media_type='text/plain; charset=utf-8',
                headers={'Content-Disposition': f'attachment; filename={filename_txt}'}
            )

        if fmt == 'pdf':
            try:

                pdf_buffer = io.BytesIO()
                doc = fitz.open()

                def _add_wrapped_text(page, text: str, top: float = 50, left: float = 50, max_width: float = 500, line_height: float = 14, font_size: float = 11):
                    words = text.split()
                    line = ''
                    y = top
                    max_chars = int(max_width / (font_size * 0.55))
                    for w in words:
                        candidate = (line + ' ' + w).strip()
                        if len(candidate) > max_chars and line:
                            page.insert_text((left, y), line, fontsize=font_size)
                            y += line_height
                            line = w
                        else:
                            line = candidate
                        if y > page.rect.height - 60:
                            page = doc.new_page()
                            y = 50
                    if line:
                        page.insert_text((left, y), line, fontsize=font_size)
                        y += line_height
                    return page, y

                page = doc.new_page()
                title_text = (
                    f"Chat {conversation['id']}" + (
                        f" - {title_for_header_post}" if title_for_header_post and title_for_header_post != conversation['id'] else ''
                    ) + f" - creata {conversation['created_at']} - export {metadata['exported_at']}"
                )
                # Title
                page.insert_text((50, 40), title_text, fontsize=14)
                # Meta lines dynamic layout
                meta_lines = [
                    f"Creato: {conversation['created_at']}",
                    f"Ultimo aggiornamento: {conversation['updated_at']}",
                    f"Messaggi: {len(export_messages)}",
                    f"Provider summary: {summary_provider}" + (f" / model: {summary_model}" if summary_model else '')
                ]
                y_meta = 70
                for ml in meta_lines:
                    page.insert_text((50, y_meta), ml, fontsize=11)
                    y_meta += 14
                y_meta += 10
                page.insert_text((50, y_meta), "Riassunto:", fontsize=13)
                y_meta += 20
                page, y_cursor = _add_wrapped_text(page, _strip_markdown(summary_text or '(nessun riassunto)'), top=y_meta)
                page.insert_text((50, y_cursor + 10), "Messaggi:", fontsize=13)
                y_cursor += 30
                for msg in export_messages:
                    block = f"[{msg.get('timestamp')}] {msg.get('role')}:\n{_strip_markdown(_dec_safe(msg.get('content_encrypted')) if msg.get('content_encrypted') is not None else msg.get('content'))}{' [WELCOME]' if msg.get('is_welcome') else ''}\n"
                    page, y_cursor = _add_wrapped_text(page, block, top=y_cursor)
                    y_cursor += 4
                    if y_cursor > page.rect.height - 80:
                        page = doc.new_page()
                        y_cursor = 50
                doc.save(pdf_buffer)
                doc.close()
                pdf_buffer.seek(0)
                created_short = conversation['created_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
                exported_short = metadata['exported_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
                filename_pdf = f"chat_{conversation_id}{title_part_post}_{created_short}_exported_{exported_short}.pdf"
                return StreamingResponse(
                    pdf_buffer,
                    media_type='application/pdf',
                    headers={'Content-Disposition': f'attachment; filename={filename_pdf}'}
                )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('chat.json', json.dumps(chat_payload, ensure_ascii=False, indent=2))
            zf.writestr('report.md', report_md)
            zf.writestr('metadata.json', json.dumps(metadata, ensure_ascii=False, indent=2))
        zip_buffer.seek(0)
        created_short = conversation['created_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
        exported_short = metadata['exported_at'].replace(':','').replace('-','').replace('T','_').split('.')[0]
        filename_zip = f"chat_{conversation_id}{title_part_post}_{created_short}_exported_{exported_short}.zip"
        resp = StreamingResponse(
            zip_buffer,
            media_type='application/zip',
            headers={'Content-Disposition': f'attachment; filename={filename_zip}'}
        )
        try:

            _li({
                "event": "export_with_report_post_done",
                "conversation_id": conversation_id,
                "user_id": current_user.get('id'),
                "message_count": len(messages),
                "summary_chars": len(summary_text or ''),
                "format": payload.format or 'zip'
            })
        except Exception:
            pass
        return resp
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in export_conversation_with_report (POST): {e}")
        raise HTTPException(status_code=500, detail=f"Internal error during export (POST): {str(e)}")
