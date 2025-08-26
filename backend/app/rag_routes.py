"""
API Routes per il sistema RAG
Gestisce gruppi, documenti, upload e ricerca
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
import tempfile
import uuid
from datetime import datetime
import mimetypes
import asyncio
from pathlib import Path

from .rag_engine import rag_engine
from .file_processing import extract_text_from_pdf, extract_text_from_docx
from .auth import get_current_admin_user

# Pydantic models
class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)

class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    group_ids: List[int] = Field(..., min_items=1)
    top_k: int = Field(default=5, ge=1, le=50)

class ContextSelection(BaseModel):
    group_ids: List[int] = Field(default=[])

router = APIRouter()

@router.get("/rag/stats")
async def get_rag_stats():
    """Ottieni statistiche del sistema RAG"""
    try:
        stats = rag_engine.get_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero statistiche: {str(e)}")

@router.get("/rag/groups")
async def get_groups():
    """Ottieni lista di tutti i gruppi"""
    try:
        groups = rag_engine.get_groups()
        return {"success": True, "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero gruppi: {str(e)}")

@router.post("/rag/groups")
async def create_group(group_data: GroupCreate, current_user = Depends(get_current_admin_user)):
    """Crea un nuovo gruppo"""
    try:
        group_id = rag_engine.create_group(group_data.name, group_data.description)
        return {"success": True, "group_id": group_id, "message": f"Gruppo '{group_data.name}' creato"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella creazione gruppo: {str(e)}")

@router.put("/rag/groups/{group_id}")
async def update_group(group_id: int, group_data: GroupUpdate, current_user = Depends(get_current_admin_user)):
    """Aggiorna un gruppo esistente"""
    try:
        # Per ora implementazione semplice - potresti estendere rag_engine
        return {"success": True, "message": "Aggiornamento gruppo non ancora implementato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento: {str(e)}")

@router.delete("/rag/groups/{group_id}")
async def delete_group(group_id: int, current_user = Depends(get_current_admin_user)):
    """Elimina un gruppo e tutti i suoi documenti"""
    try:
        rag_engine.delete_group(group_id)
        return {"success": True, "message": f"Gruppo {group_id} eliminato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione: {str(e)}")

@router.get("/rag/groups/{group_id}/documents")
async def get_group_documents(group_id: int):
    """Ottieni tutti i documenti di un gruppo"""
    try:
        documents = rag_engine.get_group_documents(group_id)
        return {"success": True, "documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero documenti: {str(e)}")

@router.post("/rag/groups/{group_id}/upload")
async def upload_documents(
    group_id: int,
    files: List[UploadFile] = File(...),
    current_user = Depends(get_current_admin_user)
):
    """Upload e processa documenti in un gruppo"""
    processed_files = []
    
    for upload_file in files:
        try:
            # Validazione tipo file
            filename = upload_file.filename or "unknown"
            file_ext = filename.split('.')[-1].lower() if '.' in filename else ''
            
            if file_ext not in ['pdf', 'docx', 'doc', 'txt', 'md']:
                processed_files.append({
                    "filename": filename,
                    "success": False,
                    "error": f"Tipo file non supportato: {file_ext}"
                })
                continue
            
            # Leggi contenuto
            content = await upload_file.read()
            
            # Crea file temporaneo
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            # Estrai testo
            try:
                if file_ext == 'pdf':
                    text_content = extract_text_from_pdf(temp_file_path)
                elif file_ext in ['docx', 'doc']:
                    text_content = extract_text_from_docx(temp_file_path)
                elif file_ext in ['txt', 'md']:
                    with open(temp_file_path, 'r', encoding='utf-8') as f:
                        text_content = f.read()
                else:
                    text_content = ""
                
                # Validazione contenuto
                if not text_content or len(text_content.strip()) < 10:
                    raise ValueError("Contenuto troppo breve o vuoto")
                
                # Aggiungi al RAG engine
                document_id = rag_engine.add_document(
                    group_id=group_id,
                    filename=f"{uuid.uuid4().hex}_{filename}",
                    content=text_content,
                    original_filename=filename
                )
                
                processed_files.append({
                    "filename": filename,
                    "success": True,
                    "document_id": document_id,
                    "text_length": len(text_content),
                    "message": "Documento elaborato e indicizzato"
                })
                
            finally:
                # Cleanup file temporaneo
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
                    
        except Exception as e:
            processed_files.append({
                "filename": filename,
                "success": False,
                "error": f"Errore nell'elaborazione: {str(e)}"
            })
    
    return {"success": True, "processed_files": processed_files}

@router.delete("/rag/documents/{document_id}")
async def delete_document(document_id: int, current_user = Depends(get_current_admin_user)):
    """Elimina un documento"""
    try:
        rag_engine.delete_document(document_id)
        return {"success": True, "message": f"Documento {document_id} eliminato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione: {str(e)}")

@router.post("/rag/search")
async def search_documents(search_request: SearchRequest):
    """Cerca nei documenti specificati"""
    try:
        results = rag_engine.search(
            query=search_request.query,
            group_ids=search_request.group_ids,
            top_k=search_request.top_k
        )
        
        return {
            "success": True,
            "query": search_request.query,
            "total_results": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella ricerca: {str(e)}")

@router.get("/rag/context-options")
async def get_context_options():
    """Ottieni opzioni disponibili per la selezione del contesto"""
    try:
        groups = rag_engine.get_groups()
        # Filtra solo gruppi con documenti
        available_groups = [g for g in groups if g["document_count"] > 0]
        return {"success": True, "available_groups": available_groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero opzioni: {str(e)}")

# Session storage temporaneo per contesto utente (in produzione usa Redis/database)
user_contexts = {}

@router.post("/rag/context/select")
async def select_context(context: ContextSelection):
    """Seleziona gruppi per il contesto chat (temp storage)"""
    # In una versione completa, questo dovrebbe essere associato all'utente/sessione
    session_id = "default"  # Placeholder
    user_contexts[session_id] = context.group_ids
    
    return {
        "success": True,
        "selected_groups": context.group_ids,
        "message": f"Contesto impostato con {len(context.group_ids)} gruppi"
    }

@router.get("/rag/context/current")
async def get_current_context():
    """Ottieni contesto attualmente selezionato"""
    session_id = "default"  # Placeholder
    selected_groups = user_contexts.get(session_id, [])
    
    # Recupera dettagli dei gruppi selezionati
    groups_info = []
    if selected_groups:
        all_groups = rag_engine.get_groups()
        groups_info = [g for g in all_groups if g["id"] in selected_groups]
    
    return {
        "success": True,
        "selected_group_ids": selected_groups,
        "selected_groups": groups_info
    }

def get_user_context(session_id: str = "default") -> List[int]:
    """Utility per ottenere il contesto dell'utente"""
    return user_contexts.get(session_id, [])

@router.get("/rag/download/{document_id}")
async def download_document(document_id: int):
    """Download del documento originale (placeholder - implementazione futura)"""
    # Questa funzionalità richiederebbe storage dei file originali
    raise HTTPException(status_code=501, detail="Download non ancora implementato")

# Route per testing e debugging
@router.get("/rag/debug/groups/{group_id}/chunks")
async def debug_group_chunks(group_id: int, current_user = Depends(get_current_admin_user)):
    """Debug: visualizza chunks di un gruppo"""
    try:
        # Query diretta al database per debug
        import sqlite3
        conn = sqlite3.connect(rag_engine.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.id, c.chunk_index, c.content, d.filename, d.original_filename
            FROM rag_chunks c
            JOIN rag_documents d ON c.document_id = d.id
            WHERE c.group_id = ?
            ORDER BY d.id, c.chunk_index
            LIMIT 100
        """, (group_id,))
        
        chunks = []
        for row in cursor.fetchall():
            chunks.append({
                "chunk_id": row[0],
                "chunk_index": row[1],
                "content": row[2][:200] + "..." if len(row[2]) > 200 else row[2],
                "filename": row[3],
                "original_filename": row[4]
            })
        
        conn.close()
        return {"success": True, "chunks": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore debug: {str(e)}")
