from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse, FileResponse
from typing import List, Optional, Dict, Any
import json

from .auth import get_current_active_user, get_current_admin_user
from .data_tables import (
    init_tables_schema,
    create_table_from_upload,
    list_tables,
    get_table,
    get_rows,
    delete_table,
    update_table_meta,
    add_rows,
    update_row,
    delete_row,
    export_table,
    search_tables,
)

router = APIRouter(prefix="/data-tables", tags=["data-tables"])


@router.post("/upload")
async def upload_table(
    file: UploadFile = File(...),
    title: str = Form(None),
    description: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_admin_user),
):
    data = await file.read()
    if not title:
        title = file.filename
    table = create_table_from_upload(
        title=title,
        description=description,
        filename=file.filename,
        file_bytes=data,
        created_by_user_id=(current_user or {}).get('id'),
        preferred_name=name,
    )
    return {"success": True, "table": table}


@router.get("")
async def list_all_tables(current_user: dict = Depends(get_current_admin_user)):
    items = list_tables()
    return {"success": True, "tables": items}


@router.get("/{table_id}")
async def get_table_info(
    table_id: str,
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_active_user),
):
    t = get_table(table_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tabella non trovata")
    rows = get_rows(table_id, limit=limit, offset=offset)
    return {"success": True, "table": t, "rows": rows}


@router.get("/{table_id}/download")
async def download_table(table_id: str, fmt: str = Query("csv", regex="^(csv|xlsx)$")):
    mime, data = export_table(table_id, fmt=fmt)
    t = get_table(table_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tabella non trovata")
    filename = (t.get('name') or t.get('title') or table_id).replace(' ', '_') + (".xlsx" if fmt == 'xlsx' else ".csv")
    return StreamingResponse(iter([data]), media_type=mime, headers={
        "Content-Disposition": f"attachment; filename={filename}"
    })


@router.patch("/{table_id}")
async def update_table(table_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_admin_user)):
    title = payload.get('title')
    description = payload.get('description')
    update_table_meta(table_id, title=title, description=description)
    return {"success": True}


@router.delete("/{table_id}")
async def remove_table(table_id: str, current_user: dict = Depends(get_current_admin_user)):
    ok = delete_table(table_id)
    return {"success": ok}


@router.post("/{table_id}/rows")
async def add_table_rows(table_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_admin_user)):
    rows = payload.get('rows') or []
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="'rows' deve essere una lista di oggetti")
    count = add_rows(table_id, rows)
    return {"success": True, "added": count}


@router.patch("/{table_id}/rows/{row_id}")
async def edit_table_row(table_id: str, row_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_admin_user)):
    data = payload.get('data')
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="'data' deve essere un oggetto")
    update_row(table_id, row_id, data)
    return {"success": True}


@router.delete("/{table_id}/rows/{row_id}")
async def remove_table_row(table_id: str, row_id: str, current_user: dict = Depends(get_current_admin_user)):
    delete_row(table_id, row_id)
    return {"success": True}


@router.get("/search")
async def search_in_tables(
    q: str = Query(..., min_length=2),
    table_ids: Optional[str] = Query(None, description="Lista di table_id separati da virgola"),
    limit_per_table: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_active_user),
):
    if not table_ids:
        return {"success": True, "results": []}
    tids = [t.strip() for t in table_ids.split(',') if t.strip()]
    data = search_tables(q, tids, limit_per_table=limit_per_table)
    # Add download_url convenience for each table
    for entry in data.get('results', []):
        entry['download_url'] = f"/api/data-tables/{entry['table_id']}/download?format=csv"
    return {"success": True, **data}

