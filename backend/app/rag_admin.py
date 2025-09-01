# backend/app/rag_admin.py

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
import tempfile
import os
import traceback
import json
import zipfile
import io

from .rag_engine import rag_engine
from . import embedding_manager
from .auth import get_current_admin_user
from .file_processing import (
    extract_text_from_pdf,
    extract_text_from_docx,
    extract_text_from_csv,
    extract_text_from_excel,
    extract_text_from_html,
    extract_text_from_rtf,
    extract_text_from_json,
    extract_text_from_xml,
)

router = APIRouter(
    prefix="/api/rag",
    tags=["RAG Management"],
    dependencies=[Depends(get_current_admin_user)]
)

# ===== Pydantic Models =====
class RAGGroupRequest(BaseModel):
    name: str
    description: Optional[str] = None

class RAGGroupUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class EmbeddingSetRequest(BaseModel):
    provider_type: str
    model_name: str

class EmbeddingDownloadRequest(BaseModel):
    model_name: str

class ChunkSearchRequest(BaseModel):
    search_term: str
    group_id: Optional[int] = None
    limit: int = 100

class ChunkUpdateRequest(BaseModel):
    content: str

class BulkDeleteChunksRequest(BaseModel):
    chunk_ids: List[int]

class BulkDeleteDocumentsRequest(BaseModel):
    document_ids: List[int]

class QualityAnalysisRequest(BaseModel):
    group_id: int

class BulkReindexRequest(BaseModel):
    group_ids: List[int]

# ===== Helper Functions =====
def _get_text_extractor(filename: str):
    """Returns the appropriate text extraction function based on file extension."""
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    if ext == 'pdf':
        return extract_text_from_pdf
    elif ext in ['docx', 'doc']:
        return extract_text_from_docx
    elif ext == 'csv':
        return extract_text_from_csv
    elif ext in ['xlsx', 'xls']:
        return extract_text_from_excel
    elif ext in ['html', 'htm']:
        return extract_text_from_html
    elif ext == 'rtf':
        return extract_text_from_rtf
    elif ext == 'json':
        return extract_text_from_json
    elif ext == 'xml':
        return extract_text_from_xml
    elif ext in ['txt', 'md']:
        return None  # Will be read directly as text
    return "unsupported"

# ===== Endpoints =====

# --- Embedding Provider Management ---
@router.get("/embedding/config")
async def get_embedding_config():
    try:
        cfg = embedding_manager.get_config()
        try:
            prov = embedding_manager.get_provider()
            cfg["runtime"] = prov.info()
        except Exception as e:
            cfg["runtime_error"] = str(e)
        return {"success": True, "config": cfg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore caricamento embedding config: {e}")

@router.get("/embedding/models")
async def list_embedding_models():
    """Elenca i modelli embedding locali disponibili."""
    try:
        models = embedding_manager.list_local_models()
        active = embedding_manager.get_config()
        return {"success": True, "models": models, "active": active}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/embedding/select")
async def select_embedding_model(request: EmbeddingSetRequest):
    """Imposta provider/modello embedding e invalida provider attivo."""
    try:
        embedding_manager.set_provider(request.provider_type, request.model_name)
        # forza pre-load per restituire dimensione aggiornata
        prov = embedding_manager.get_provider()
        return {"success": True, "provider": prov.info()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/embedding/download")
async def start_embedding_download(request: EmbeddingDownloadRequest):
    """Avvia download (o warm) asincrono del modello scelto."""
    try:
        task_id = embedding_manager.start_model_download(request.model_name)
        return {"success": True, "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/embedding/download/status/{task_id}")
async def embedding_download_status(task_id: str):
    try:
        status = embedding_manager.download_status(task_id)
        if not status:
            raise HTTPException(status_code=404, detail="Task non trovato")
        return {"success": True, "task": status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/embedding/download/tasks")
async def embedding_download_tasks():
    try:
        tasks = embedding_manager.download_tasks()
        return {"success": True, "tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- RAG Stats & General ---
@router.get("/stats")
async def get_rag_stats():
    try:
        stats = rag_engine.get_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Group Management ---
@router.get("/groups")
async def get_rag_groups():
    try:
        groups = rag_engine.get_groups()
        return {"success": True, "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/groups")
async def create_rag_group(request: RAGGroupRequest):
    try:
        group_id = rag_engine.create_group(request.name, request.description)
        return {"success": True, "group_id": group_id, "message": f"Gruppo '{request.name}' creato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/groups/{group_id}")
async def update_rag_group(group_id: int, request: RAGGroupUpdateRequest):
    try:
        rag_engine.update_group(group_id, request.name, request.description)
        return {"success": True, "message": "Gruppo aggiornato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/groups/{group_id}")
async def delete_rag_group(group_id: int):
    try:
        rag_engine.delete_group(group_id)
        return {"success": True, "message": "Gruppo eliminato con successo"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Document Management ---
@router.get("/groups/{group_id}/documents")
async def get_rag_documents(group_id: int):
    try:
        documents = rag_engine.get_group_documents(group_id)
        return {"success": True, "documents": documents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/preview")
async def preview_document(file: UploadFile = File(...)):
    """Extracts text from a file for preview purposes."""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file.filename.split('.')[-1]}") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        extractor = _get_text_extractor(file.filename)
        extracted_text = ""
        error_message = None

        if extractor == "unsupported":
            error_message = f"Tipo di file non supportato: {file.filename}"
        elif extractor is None: # TXT, MD
            try:
                extracted_text = content.decode('utf-8')
            except UnicodeDecodeError:
                extracted_text = content.decode('latin-1')
        else:
            extracted_text = extractor(temp_file_path)

        os.unlink(temp_file_path)

        if "Errore:" in extracted_text or "library not available" in extracted_text:
             error_message = extracted_text
             extracted_text = ""

        from langchain_text_splitters import RecursiveCharacterTextSplitter
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_text(extracted_text)
        
        return {
            "success": not error_message,
            "preview": {
                "filename": file.filename,
                "extraction_success": not error_message,
                "text_length": len(extracted_text),
                "estimated_chunks": len(chunks),
                "extracted_text": extracted_text[:2000] + "..." if len(extracted_text) > 2000 else extracted_text,
                "error": error_message
            }
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": f"Errore imprevisto: {str(e)}"})

@router.post("/upload-multi")
async def upload_rag_documents(group_id: int = Form(...), files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        file_result = {"filename": file.filename, "success": False}
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file.filename.split('.')[-1]}") as temp_file:
                content_bytes = await file.read()
                temp_file.write(content_bytes)
                temp_file_path = temp_file.name

            extractor = _get_text_extractor(file.filename)
            text_content = ""
            if extractor == "unsupported":
                file_result["error"] = f"Tipo file non supportato: {file.filename}"
            elif extractor is None:
                try:
                    text_content = content_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    text_content = content_bytes.decode('latin-1')
            else:
                text_content = extractor(temp_file_path)
            
            os.unlink(temp_file_path)

            if not text_content or not text_content.strip() or "Errore:" in text_content or "library not available" in text_content:
                file_result["error"] = f"Estrazione testo fallita per {file.filename}. Contenuto vuoto o errore libreria."
            else:
                doc_id, metrics = rag_engine.add_document(
                    group_id=group_id,
                    filename=file.filename,
                    content=text_content,
                    original_filename=file.filename,
                    original_file_bytes=content_bytes
                )
                file_result.update({
                    "success": True, "document_id": doc_id,
                    "chars_extracted": len(text_content),
                    "chunk_count": metrics.get("chunk_count"),
                    "timings": metrics.get("timings"),
                    "file_url": rag_engine.get_document_file_url(doc_id)
                })
        except Exception as e:
            file_result["error"] = f"Errore interno: {str(e)}"
        results.append(file_result)
    
    return {"success": any(r["success"] for r in results), "results": results}

@router.post("/documents/bulk-delete")
async def bulk_delete_documents(request: BulkDeleteDocumentsRequest):
    try:
        for doc_id in request.document_ids:
            rag_engine.delete_document(doc_id)
        return {"success": True, "message": f"{len(request.document_ids)} documenti eliminati."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione bulk documenti: {str(e)}")

@router.get("/download/{document_id}")
async def download_rag_document(document_id: int):
    """Downloads the original file for a given document, used for citations."""
    try:
        # Assumendo che rag_engine abbia un metodo per ottenere il file grezzo
        file_data = rag_engine.get_document_file(document_id)
        if not file_data:
            raise HTTPException(status_code=404, detail="Documento non trovato o file originale non disponibile.")

        filename = file_data.get("filename")
        file_bytes = file_data.get("file_bytes")
        mime_type = file_data.get("mime_type", "application/octet-stream")

        if not filename or not file_bytes:
            raise HTTPException(status_code=404, detail="Dati del file incompleti per il download.")

        return Response(content=file_bytes, media_type=mime_type, headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        })
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore durante il download del file: {str(e)}")

# --- Chunk Management ---
@router.get("/chunks")
async def get_paginated_chunks(group_id: int, limit: int = 50, offset: int = 0):
    try:
        result = rag_engine.get_all_chunks(group_id=group_id, limit=limit, offset=offset)
        return {"success": True, "chunks": result.get("chunks", []), "total": result.get("total", 0)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei chunks: {str(e)}")

@router.post("/chunks/search")
async def search_chunks(request: ChunkSearchRequest):
    try:
        chunks = rag_engine.search_chunks_content(
            search_term=request.search_term,
            group_id=request.group_id,
            limit=request.limit
        )
        return {"success": True, "chunks": chunks, "total_found": len(chunks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella ricerca dei chunks: {str(e)}")

@router.put("/chunks/{chunk_id}")
async def update_chunk(chunk_id: int, payload: ChunkUpdateRequest):
    try:
        success = rag_engine.update_chunk_content(chunk_id, payload.content)
        if success:
            updated_chunk = rag_engine.get_chunk_by_id(chunk_id)
            return {"success": True, "chunk": updated_chunk}
        else:
            raise HTTPException(status_code=404, detail="Chunk non trovato o errore aggiornamento")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento chunk: {str(e)}")

@router.delete("/chunks/{chunk_id}")
async def delete_chunk(chunk_id: int):
    try:
        success = rag_engine.delete_chunk(chunk_id)
        if not success:
            raise HTTPException(status_code=404, detail="Chunk non trovato")
        return {"success": True, "message": "Chunk eliminato"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione chunk: {str(e)}")

@router.post("/chunks/bulk-delete")
async def bulk_delete_chunks(request: BulkDeleteChunksRequest):
    try:
        result = rag_engine.bulk_delete_chunks(request.chunk_ids)
        return {"success": True, "message": f"{result.get('deleted', 0)} chunks eliminati"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore eliminazione bulk: {str(e)}")

# --- Storage Management ---
@router.get("/storage/stats")
async def get_storage_stats():
    try:
        stats = rag_engine.get_storage_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero statistiche storage: {str(e)}")

@router.post("/storage/cleanup")
async def cleanup_storage():
    try:
        result = rag_engine.cleanup_orphaned_files()
        return {"success": True, "message": "Pulizia dei file orfani completata.", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella pulizia dello storage: {str(e)}")

@router.post("/chunks/cleanup-orphans")
async def cleanup_orphan_chunks():
    """Elimina i chunks orfani (documenti mancanti)."""
    try:
        result = rag_engine.cleanup_orphan_chunks()
        return {"success": True, "message": f"Rimossi {result.get('removed',0)} chunks orfani.", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nella pulizia dei chunks orfani: {str(e)}")

# --- Advanced Operations (Import/Export, Analysis) ---
@router.post("/chunks/analyze-quality")
async def analyze_chunk_quality(request: QualityAnalysisRequest):
    """Analyzes the quality of chunks in a group."""
    try:
        stats = rag_engine.get_stats()
        group_chunks = rag_engine.get_all_chunks(group_id=request.group_id, limit=10000).get("chunks", [])
        
        if not group_chunks:
            raise HTTPException(status_code=404, detail="Nessun chunk trovato per l'analisi")

        quality_metrics = {
            "total_chunks": len(group_chunks),
            "average_length": sum(len(c["content"]) for c in group_chunks) / len(group_chunks),
            "duplicate_count": 0, # Placeholder
            "too_short_count": sum(1 for c in group_chunks if len(c["content"]) < 50),
            "too_long_count": sum(1 for c in group_chunks if len(c["content"]) > 2000),
            "quality_score": 85 # Placeholder
        }
        issues = []
        if quality_metrics["too_short_count"] > 0:
            issues.append({"severity": "warning", "message": f"{quality_metrics['too_short_count']} chunks sono molto corti."})
        
        analysis = {
            "quality_metrics": quality_metrics,
            "issues": issues,
            "recommendations": ["Controllare i chunk corti per assicurarsi che abbiano abbastanza contesto."]
        }
        return {"success": True, "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore analisi qualità: {str(e)}")

@router.get("/export/config")
async def export_rag_config():
    """Exports the RAG configuration (groups)."""
    try:
        groups = rag_engine.get_groups()
        config_data = {
            "version": 1,
            "exported_at": datetime.now().isoformat(),
            "groups": [
                {"name": g["name"], "description": g.get("description")} for g in groups
            ]
        }
        headers = {
            'Content-Disposition': f'attachment; filename="rag_config_export_{datetime.now().strftime("%Y%m%d")}.json"'
        }
        return JSONResponse(content=config_data, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore export configurazione: {str(e)}")

@router.get("/export/data/{group_id}")
async def export_group_data(group_id: int, include_chunks: bool = True):
    """Exports all data for a specific group."""
    try:
        group_info = next((g for g in rag_engine.get_groups() if g["id"] == group_id), None)
        if not group_info:
            raise HTTPException(status_code=404, detail="Gruppo non trovato")

        documents = rag_engine.get_group_documents(group_id)
        export_data = {"group": {"name": group_info["name"], "description": group_info.get("description")}, "documents": []}

        if include_chunks:
            chunks_result = rag_engine.get_all_chunks(group_id=group_id, limit=100000)
            chunks_by_doc_id = {}
            for chunk in chunks_result.get("chunks", []):
                doc_id = chunk["document_id"]
                if doc_id not in chunks_by_doc_id:
                    chunks_by_doc_id[doc_id] = []
                chunks_by_doc_id[doc_id].append({"chunk_index": chunk["chunk_index"], "content": chunk["content"]})

        for doc in documents:
            doc_data = {"filename": doc["original_filename"], "content_preview": doc["content_preview"]}
            if include_chunks:
                doc_data["chunks"] = chunks_by_doc_id.get(doc["id"], [])
            export_data["documents"].append(doc_data)

        headers = {
            'Content-Disposition': f'attachment; filename="rag_group_{group_info["name"]}_{datetime.now().strftime("%Y%m%d")}.json"'
        }
        return JSONResponse(content=export_data, headers=headers)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore export dati gruppo: {str(e)}")

@router.post("/import/config")
async def import_rag_config(config_file: UploadFile = File(...)):
    """Imports a RAG configuration file to create groups."""
    try:
        content = await config_file.read()
        data = json.loads(content)
        
        groups_to_create = data.get("groups", [])
        created_count = 0
        skipped_count = 0
        warnings = []

        for group_data in groups_to_create:
            name = group_data.get("name")
            if not name:
                warnings.append("Skipped a group with no name.")
                continue
            
            try:
                rag_engine.create_group(name, group_data.get("description"))
                created_count += 1
            except ValueError: # Already exists
                skipped_count += 1
                warnings.append(f"Group '{name}' already exists, skipped.")
            except Exception as e:
                skipped_count += 1
                warnings.append(f"Failed to create group '{name}': {e}")

        return {
            "success": True,
            "summary": {
                "groups_created": created_count,
                "groups_skipped": skipped_count,
                "warnings": warnings
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore import configurazione: {str(e)}")

@router.post("/groups/bulk-reindex")
async def bulk_reindex_groups(request: BulkReindexRequest):
    """Rebuilds the vector index for multiple groups."""
    try:
        reindexed_groups = []
        errors = []
        for group_id in request.group_ids:
            try:
                rag_engine._rebuild_group_index(group_id)
                reindexed_groups.append(group_id)
            except Exception as e:
                errors.append({"group_id": group_id, "error": str(e)})
        
        return {
            "success": not errors,
            "message": f"Re-indicizzati {len(reindexed_groups)} gruppi.",
            "reindexed": reindexed_groups,
            "errors": errors
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore re-indicizzazione bulk: {str(e)}")

@router.post("/export/bulk")
async def bulk_export_groups(group_ids: List[int] = Form(...)):
    """Exports data for multiple groups into a single ZIP file."""
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for group_id in group_ids:
                group_info = next((g for g in rag_engine.get_groups() if g["id"] == group_id), None)
                if not group_info:
                    continue

                documents = rag_engine.get_group_documents(group_id)
                chunks_result = rag_engine.get_all_chunks(group_id=group_id, limit=100000)
                chunks_by_doc_id = {}
                for chunk in chunks_result.get("chunks", []):
                    doc_id = chunk["document_id"]
                    if doc_id not in chunks_by_doc_id:
                        chunks_by_doc_id[doc_id] = []
                    chunks_by_doc_id[doc_id].append({"chunk_index": chunk["chunk_index"], "content": chunk["content"]})

                export_data = {"group": {"name": group_info["name"], "description": group_info.get("description")}, "documents": []}
                for doc in documents:
                    doc_data = {"filename": doc["original_filename"], "chunks": chunks_by_doc_id.get(doc["id"], [])}
                    export_data["documents"].append(doc_data)
                
                zip_file.writestr(f"group_{group_info['name']}.json", json.dumps(export_data, indent=2))

        zip_buffer.seek(0)
        
        headers = {
            'Content-Disposition': f'attachment; filename="rag_bulk_export_{datetime.now().strftime("%Y%m%d")}.zip"'
        }
        return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore export bulk: {str(e)}")