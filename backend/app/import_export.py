"""
Import/Export functionality for conversations with multiple format support
"""
from fastapi import APIRouter, HTTPException, Depends, status, File, UploadFile, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import json
import csv
import io
import zipfile
import uuid
from datetime import datetime
import hashlib
import asyncio
import os
import tempfile

from .auth import get_current_active_user
from .database import db_manager

router = APIRouter(prefix="/import-export", tags=["import-export"])

class ExportRequest(BaseModel):
    format: str = "json"  # json, csv, txt, zip
    conversation_ids: Optional[List[str]] = None  # None = all conversations
    include_metadata: bool = True
    decrypt_content: bool = False  # Export in plain text or keep encrypted
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    compression: bool = False

class ImportProgress(BaseModel):
    task_id: str
    status: str  # 'pending', 'processing', 'completed', 'failed'
    total_conversations: int
    processed_conversations: int
    total_messages: int
    processed_messages: int
    errors: List[str]
    start_time: str
    completion_time: Optional[str] = None

class ImportOptions(BaseModel):
    format: str = "json"  # json, csv, txt, zip
    duplicate_handling: str = "skip"  # skip, overwrite, create_new
    encrypt_content: bool = True
    preserve_timestamps: bool = True
    create_backup: bool = True

# Store per tracking import progress
import_progress_store: Dict[str, ImportProgress] = {}

@router.post("/export")
async def export_conversations(
    export_request: ExportRequest,
    current_user: dict = Depends(get_current_active_user)
):
    """Esporta conversazioni in vari formati"""
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Costruisci query per conversazioni
            where_conditions = ["c.user_id = ?", "c.is_deleted = 0"]
            params = [current_user["id"]]
            
            if export_request.conversation_ids:
                placeholders = ",".join(["?" for _ in export_request.conversation_ids])
                where_conditions.append(f"c.id IN ({placeholders})")
                params.extend(export_request.conversation_ids)
            
            if export_request.date_from:
                where_conditions.append("c.created_at >= ?")
                params.append(export_request.date_from)
                
            if export_request.date_to:
                where_conditions.append("c.created_at <= ?")
                params.append(export_request.date_to + " 23:59:59")
            
            where_clause = "WHERE " + " AND ".join(where_conditions)
            
            # Query conversazioni
            conversations_query = f"""
                SELECT c.id, c.title_encrypted, c.description, c.created_at, c.updated_at
                FROM conversations c
                {where_clause}
                ORDER BY c.created_at DESC
            """
            
            cursor.execute(conversations_query, params)
            conversations = [dict(row) for row in cursor.fetchall()]
            
            if not conversations:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No conversations found matching criteria"
                )
            
            # Query messaggi per ogni conversazione
            conversation_ids = [conv["id"] for conv in conversations]
            placeholders = ",".join(["?" for _ in conversation_ids])
            
            messages_query = f"""
                SELECT conversation_id, role, content_encrypted, timestamp, is_deleted
                FROM messages
                WHERE conversation_id IN ({placeholders}) AND is_deleted = 0
                ORDER BY timestamp ASC
            """
            
            cursor.execute(messages_query, conversation_ids)
            all_messages = cursor.fetchall()
            
            # Raggruppa messaggi per conversazione
            messages_by_conv = {}
            for msg in all_messages:
                conv_id = msg[0]
                if conv_id not in messages_by_conv:
                    messages_by_conv[conv_id] = []
                messages_by_conv[conv_id].append({
                    "role": msg[1],
                    "content_encrypted": msg[2],
                    "timestamp": msg[3],
                    "is_deleted": bool(msg[4])
                })
            
            # Genera export in base al formato
            if export_request.format == "json":
                return await export_to_json(
                    conversations, messages_by_conv, export_request, current_user
                )
            elif export_request.format == "csv":
                return await export_to_csv(
                    conversations, messages_by_conv, export_request, current_user
                )
            elif export_request.format == "txt":
                return await export_to_txt(
                    conversations, messages_by_conv, export_request, current_user
                )
            elif export_request.format == "zip":
                return await export_to_zip(
                    conversations, messages_by_conv, export_request, current_user
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported export format: {export_request.format}"
                )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export error: {str(e)}"
        )

@router.post("/import")
async def import_conversations(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    options: str = '{"format": "json", "duplicate_handling": "skip", "encrypt_content": true}',
    current_user: dict = Depends(get_current_active_user)
):
    """Importa conversazioni da file"""
    
    try:
        import_options = ImportOptions.parse_raw(options)
        
        # Crea task ID per tracking
        task_id = str(uuid.uuid4())
        
        # Inizializza progress tracking
        import_progress_store[task_id] = ImportProgress(
            task_id=task_id,
            status="pending",
            total_conversations=0,
            processed_conversations=0,
            total_messages=0,
            processed_messages=0,
            errors=[],
            start_time=datetime.now().isoformat()
        )
        
        # Salva file temporaneo
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{file.filename.split('.')[-1]}")
        content = await file.read()
        temp_file.write(content)
        temp_file.close()
        
        # Avvia import in background
        background_tasks.add_task(
            process_import_file,
            task_id,
            temp_file.name,
            import_options,
            current_user
        )
        
        return {
            "task_id": task_id,
            "status": "started",
            "message": "Import started in background"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import initiation error: {str(e)}"
        )

@router.get("/import/progress/{task_id}")
async def get_import_progress(
    task_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Ottieni progress dell'import"""
    
    if task_id not in import_progress_store:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import task not found"
        )
    
    return import_progress_store[task_id]

@router.get("/formats")
async def get_supported_formats():
    """Lista formati supportati per import/export"""
    
    return {
        "export_formats": {
            "json": {
                "name": "JSON",
                "description": "Formato JSON con struttura completa",
                "supports_encryption": True,
                "supports_metadata": True
            },
            "csv": {
                "name": "CSV",
                "description": "File CSV per spreadsheet",
                "supports_encryption": False,
                "supports_metadata": True
            },
            "txt": {
                "name": "Plain Text",
                "description": "Testo semplice per lettura",
                "supports_encryption": False,
                "supports_metadata": False
            },
            "zip": {
                "name": "ZIP Archive",
                "description": "Archivio con tutti i formati",
                "supports_encryption": True,
                "supports_metadata": True
            }
        },
        "import_formats": ["json", "csv", "txt"],
        "duplicate_handling": ["skip", "overwrite", "create_new"]
    }

# Funzioni di export specifiche per formato

async def export_to_json(conversations, messages_by_conv, export_request, current_user):
    """Export in formato JSON"""
    from .chat import chatCrypto  # Import crypto service
    
    export_data = {
        "export_info": {
            "format": "json",
            "export_date": datetime.now().isoformat(),
            "user_id": current_user["id"],
            "total_conversations": len(conversations),
            "encrypted": not export_request.decrypt_content
        },
        "conversations": []
    }
    
    for conv in conversations:
        conv_data = {
            "id": conv["id"],
            "created_at": conv["created_at"],
            "updated_at": conv["updated_at"]
        }
        
        # Gestione title
        if export_request.decrypt_content:
            try:
                conv_data["title"] = await chatCrypto.decrypt(conv["title_encrypted"])
            except:
                conv_data["title"] = "Decryption failed"
        else:
            conv_data["title_encrypted"] = conv["title_encrypted"]
        
        # Aggiungi metadata se richiesto
        if export_request.include_metadata:
            conv_data["description"] = conv.get("description")
        
        # Aggiungi messaggi
        conv_messages = messages_by_conv.get(conv["id"], [])
        conv_data["messages"] = []
        
        for msg in conv_messages:
            msg_data = {
                "role": msg["role"],
                "timestamp": msg["timestamp"]
            }
            
            if export_request.decrypt_content:
                try:
                    msg_data["content"] = await chatCrypto.decrypt(msg["content_encrypted"])
                except:
                    msg_data["content"] = "Decryption failed"
            else:
                msg_data["content_encrypted"] = msg["content_encrypted"]
            
            conv_data["messages"].append(msg_data)
        
        export_data["conversations"].append(conv_data)
    
    # Crea response
    json_content = json.dumps(export_data, indent=2, ensure_ascii=False)
    
    if export_request.compression:
        # Comprimi con gzip
        import gzip
        compressed = gzip.compress(json_content.encode('utf-8'))
        return StreamingResponse(
            io.BytesIO(compressed),
            media_type="application/gzip",
            headers={"Content-Disposition": "attachment; filename=conversations.json.gz"}
        )
    else:
        return StreamingResponse(
            io.BytesIO(json_content.encode('utf-8')),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=conversations.json"}
        )

async def export_to_csv(conversations, messages_by_conv, export_request, current_user):
    """Export in formato CSV"""
    from .chat import chatCrypto
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header CSV
    headers = ["conversation_id", "conversation_title", "message_role", "message_content", "timestamp"]
    if export_request.include_metadata:
        headers.extend(["conversation_created", "conversation_description"])
    
    writer.writerow(headers)
    
    # Dati
    for conv in conversations:
        title = conv["title_encrypted"]
        if export_request.decrypt_content:
            try:
                title = await chatCrypto.decrypt(conv["title_encrypted"])
            except:
                title = "Decryption failed"
        
        conv_messages = messages_by_conv.get(conv["id"], [])
        
        for msg in conv_messages:
            content = msg["content_encrypted"]
            if export_request.decrypt_content:
                try:
                    content = await chatCrypto.decrypt(msg["content_encrypted"])
                except:
                    content = "Decryption failed"
            
            row = [
                conv["id"],
                title,
                msg["role"],
                content,
                msg["timestamp"]
            ]
            
            if export_request.include_metadata:
                row.extend([
                    conv["created_at"],
                    conv.get("description", "")
                ])
            
            writer.writerow(row)
    
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=conversations.csv"}
    )

async def export_to_txt(conversations, messages_by_conv, export_request, current_user):
    """Export in formato testo semplice"""
    from .chat import chatCrypto
    
    output = []
    output.append(f"QSA Chatbot Conversations Export")
    output.append(f"Export Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output.append(f"Total Conversations: {len(conversations)}")
    output.append("=" * 80)
    output.append("")
    
    for i, conv in enumerate(conversations, 1):
        title = conv["title_encrypted"]
        if export_request.decrypt_content:
            try:
                title = await chatCrypto.decrypt(conv["title_encrypted"])
            except:
                title = "Decryption failed"
        
        output.append(f"Conversation {i}: {title}")
        output.append(f"Created: {conv['created_at']}")
        output.append("-" * 60)
        
        conv_messages = messages_by_conv.get(conv["id"], [])
        
        for msg in conv_messages:
            content = msg["content_encrypted"]
            if export_request.decrypt_content:
                try:
                    content = await chatCrypto.decrypt(msg["content_encrypted"])
                except:
                    content = "Decryption failed"
            
            role_prefix = "👤 User:" if msg["role"] == "user" else "🤖 Assistant:"
            output.append(f"\n{role_prefix}")
            output.append(content)
            output.append(f"Time: {msg['timestamp']}")
        
        output.append("\n" + "=" * 80 + "\n")
    
    text_content = "\n".join(output)
    
    return StreamingResponse(
        io.BytesIO(text_content.encode('utf-8')),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=conversations.txt"}
    )

async def export_to_zip(conversations, messages_by_conv, export_request, current_user):
    """Export in archivio ZIP con tutti i formati"""
    
    # Crea zip in memoria
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Export JSON
        json_response = await export_to_json(conversations, messages_by_conv, export_request, current_user)
        json_content = b"".join([chunk async for chunk in json_response.body_iterator])
        zip_file.writestr("conversations.json", json_content)
        
        # Export CSV
        csv_response = await export_to_csv(conversations, messages_by_conv, export_request, current_user)
        csv_content = b"".join([chunk async for chunk in csv_response.body_iterator])
        zip_file.writestr("conversations.csv", csv_content)
        
        # Export TXT
        txt_response = await export_to_txt(conversations, messages_by_conv, export_request, current_user)
        txt_content = b"".join([chunk async for chunk in txt_response.body_iterator])
        zip_file.writestr("conversations.txt", txt_content)
        
        # Metadata
        metadata = {
            "export_date": datetime.now().isoformat(),
            "user_id": current_user["id"],
            "total_conversations": len(conversations),
            "total_messages": sum(len(messages_by_conv.get(conv["id"], [])) for conv in conversations),
            "formats_included": ["json", "csv", "txt"]
        }
        zip_file.writestr("export_metadata.json", json.dumps(metadata, indent=2))
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        io.BytesIO(zip_buffer.getvalue()),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=conversations_export.zip"}
    )

# Funzione per processing import in background
async def process_import_file(task_id: str, file_path: str, options: ImportOptions, user: dict):
    """Processa file di import in background"""
    
    progress = import_progress_store[task_id]
    progress.status = "processing"
    
    try:
        if options.format == "json":
            await process_json_import(task_id, file_path, options, user)
        elif options.format == "csv":
            await process_csv_import(task_id, file_path, options, user)
        elif options.format == "txt":
            await process_txt_import(task_id, file_path, options, user)
        else:
            raise ValueError(f"Unsupported import format: {options.format}")
        
        progress.status = "completed"
        progress.completion_time = datetime.now().isoformat()
        
    except Exception as e:
        progress.status = "failed"
        progress.errors.append(str(e))
        progress.completion_time = datetime.now().isoformat()
    
    finally:
        # Cleanup temporary file
        try:
            os.unlink(file_path)
        except:
            pass

async def process_json_import(task_id: str, file_path: str, options: ImportOptions, user: dict):
    """Processa import JSON"""
    
    progress = import_progress_store[task_id]
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    conversations = data.get("conversations", [])
    progress.total_conversations = len(conversations)
    
    total_messages = sum(len(conv.get("messages", [])) for conv in conversations)
    progress.total_messages = total_messages
    
    # Process conversations
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        
        for conv in conversations:
            try:
                # Handle duplicates
                existing_conv = None
                if options.duplicate_handling != "create_new":
                    cursor.execute(
                        "SELECT id FROM conversations WHERE title_encrypted = ? AND user_id = ?",
                        (conv.get("title_encrypted", ""), user["id"])
                    )
                    existing_conv = cursor.fetchone()
                
                if existing_conv and options.duplicate_handling == "skip":
                    progress.processed_conversations += 1
                    continue
                
                # Create or update conversation
                conv_id = conv.get("id", str(uuid.uuid4()))
                
                if existing_conv and options.duplicate_handling == "overwrite":
                    conv_id = existing_conv[0]
                    # Delete existing messages
                    cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
                
                # Insert/update conversation
                cursor.execute("""
                    INSERT OR REPLACE INTO conversations 
                    (id, user_id, title_encrypted, description, created_at, updated_at, is_deleted)
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                """, (
                    conv_id,
                    user["id"],
                    conv.get("title_encrypted", conv.get("title", "Imported Conversation")),
                    conv.get("description", ""),
                    conv.get("created_at", datetime.now().isoformat()),
                    conv.get("updated_at", datetime.now().isoformat())
                ))
                
                # Insert messages
                messages = conv.get("messages", [])
                for msg in messages:
                    cursor.execute("""
                        INSERT INTO messages
                        (id, conversation_id, role, content_encrypted, timestamp, is_deleted)
                        VALUES (?, ?, ?, ?, ?, 0)
                    """, (
                        str(uuid.uuid4()),
                        conv_id,
                        msg.get("role", "user"),
                        msg.get("content_encrypted", msg.get("content", "")),
                        msg.get("timestamp", datetime.now().isoformat())
                    ))
                    
                    progress.processed_messages += 1
                
                progress.processed_conversations += 1
                conn.commit()
                
            except Exception as e:
                progress.errors.append(f"Error processing conversation {conv.get('id', 'unknown')}: {str(e)}")

async def process_csv_import(task_id: str, file_path: str, options: ImportOptions, user: dict):
    """Processa import CSV"""
    # Implementazione simile ma per CSV
    pass

async def process_txt_import(task_id: str, file_path: str, options: ImportOptions, user: dict):
    """Processa import TXT"""
    # Implementazione per formato testo
    pass
