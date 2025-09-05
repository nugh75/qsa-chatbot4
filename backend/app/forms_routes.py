from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List, Optional

from .auth import get_current_admin_user, get_current_active_user
from .forms import (
    init_forms_schema, list_forms, get_form, upsert_form, delete_form,
    submit_form_values, list_submissions
)

router = APIRouter(prefix="/forms", tags=["forms"])


@router.get("")
async def public_list_forms(current_user: dict = Depends(get_current_active_user)):
    items = list_forms()
    # Public endpoint returns minimal info
    out = [{ 'id': f['id'], 'name': f['name'], 'description': f.get('description',''), 'items_count': len(f.get('items') or []) } for f in items]
    return {"success": True, "forms": out}


@router.get("/{form_id}")
async def public_get_form(form_id: str, current_user: dict = Depends(get_current_active_user)):
    f = get_form(form_id)
    if not f:
        raise HTTPException(status_code=404, detail="Form non trovato")
    return {"success": True, "form": f}


@router.post("/{form_id}/submit")
async def public_submit_form(form_id: str, payload: Dict[str, Any], current_user: dict = Depends(get_current_active_user)):
    values = payload.get('values') or {}
    conversation_id = payload.get('conversation_id') or None
    personality_id = payload.get('personality_id') or None
    res = submit_form_values(form_id=form_id, values=values, user_id=(current_user or {}).get('id'), conversation_id=conversation_id, personality_id=personality_id)
    return {"success": True, **res}


# ---- Admin endpoints ----
admin_router = APIRouter(prefix="/admin/forms", tags=["admin-forms"])


@admin_router.get("")
async def admin_list_forms(current_user: dict = Depends(get_current_admin_user)):
    return {"success": True, "forms": list_forms()}


@admin_router.get("/{form_id}")
async def admin_get_form(form_id: str, current_user: dict = Depends(get_current_admin_user)):
    f = get_form(form_id)
    if not f:
        raise HTTPException(status_code=404, detail="Form non trovato")
    return {"success": True, "form": f}


@admin_router.post("")
async def admin_upsert_form(payload: Dict[str, Any], current_user: dict = Depends(get_current_admin_user)):
    name = payload.get('name')
    if not name or not isinstance(name, str):
        raise HTTPException(status_code=400, detail="Parametro 'name' richiesto")
    description = payload.get('description')
    items = payload.get('items') or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="'items' deve essere una lista")
    form_id = payload.get('id')
    res = upsert_form(form_id=form_id, name=name, description=description, items=items, created_by=(current_user or {}).get('id'))
    return {"success": True, **res}


@admin_router.delete("/{form_id}")
async def admin_delete_form(form_id: str, current_user: dict = Depends(get_current_admin_user)):
    ok = delete_form(form_id)
    return {"success": ok}


@admin_router.get("/{form_id}/submissions")
async def admin_list_submissions(form_id: str, limit: int = 100, offset: int = 0, current_user: dict = Depends(get_current_admin_user)):
    items = list_submissions(form_id=form_id, limit=limit, offset=offset)
    return {"success": True, "items": items}

