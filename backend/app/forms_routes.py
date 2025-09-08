from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List, Optional

from .auth import get_current_admin_user, get_current_active_user
from .forms import (
    init_forms_schema, list_forms, get_form, upsert_form, delete_form,
    submit_form_values, list_submissions
)
from statistics import mean

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


@admin_router.get("/{form_id}/submissions.csv")
async def admin_list_submissions_csv(form_id: str, limit: int = 1000, current_user: dict = Depends(get_current_admin_user)):
    """Return submissions as CSV for the given form_id."""
    if not form_id:
        raise HTTPException(status_code=400, detail="form_id required")
    submissions = list_submissions(form_id=form_id, limit=limit, offset=0)
    # build CSV
    import csv
    from io import StringIO
    sio = StringIO()
    writer = csv.writer(sio)
    # collect header fields dynamically: id, created_at, user_id, conversation_id, personality_id, then flatten values
    header = ["submission_id", "created_at", "user_id", "conversation_id", "personality_id"]
    # determine value keys by scanning submissions
    value_keys = set()
    for s in submissions:
        vals = s.get('values') or {}
        rows = vals.get('rows') or []
        for r in rows:
            # use id if present else factor
            key = r.get('id') or r.get('factor')
            if key:
                value_keys.add(key)
    value_keys = sorted(list(value_keys))
    header.extend(value_keys)
    writer.writerow(header)
    for s in submissions:
        row = [s.get('id'), s.get('created_at'), s.get('user_id'), s.get('conversation_id'), s.get('personality_id')]
        vals = s.get('values') or {}
        prow_map = {}
        for r in (vals.get('rows') or []):
            key = r.get('id') or r.get('factor')
            if key:
                rowval = r.get('value')
                # if multi choice list, join
                if isinstance(rowval, list):
                    rowval = '|'.join([str(x) for x in rowval])
                prow_map[key] = rowval
        for k in value_keys:
            row.append(prow_map.get(k))
        writer.writerow(row)
    sio.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([sio.getvalue()]), media_type='text/csv')


@admin_router.get("/{form_id}/stats")
async def admin_form_stats(form_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Return simple aggregations for a form: for scales mean/std, for choices counts, and sample texts."""
    if not form_id:
        raise HTTPException(status_code=400, detail="form_id required")
    form = get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form non trovato")
    submissions = list_submissions(form_id=form_id, limit=10000, offset=0)
    # normalize items
    items = form.get('items') or []
    def _norm(it):
        if isinstance(it, dict) and 'id' in it and 'type' in it:
            return it
        # fallback to legacy
        if isinstance(it, dict) and 'factor' in it:
            return { 'id': it.get('factor'), 'type':'scale', 'label': it.get('description') }
        return it
    norm_items = { _norm(i).get('id') : _norm(i) for i in items if _norm(i).get('id') }
    # prepare aggregations
    stats: Dict[str, Any] = {}
    for sid, it in norm_items.items():
        typ = it.get('type') or 'scale'
        if typ == 'scale':
            nums = []
            for s in submissions:
                for r in (s.get('values') or {}).get('rows') or []:
                    key = r.get('id') or r.get('factor')
                    if key == sid:
                        try:
                            nums.append(float(r.get('value')))
                        except Exception:
                            pass
            stats[sid] = { 'type':'scale', 'count': len(nums), 'mean': mean(nums) if nums else None }
        elif typ in ('choice_single','choice_multi'):
            counts: Dict[str,int] = {}
            for s in submissions:
                for r in (s.get('values') or {}).get('rows') or []:
                    key = r.get('id') or r.get('factor')
                    if key != sid:
                        continue
                    v = r.get('value')
                    if isinstance(v, list):
                        for vv in v:
                            counts[vv] = counts.get(vv,0)+1
                    else:
                        counts[v] = counts.get(v,0)+1
            stats[sid] = { 'type':'choice', 'counts': counts }
        elif typ in ('text','textarea'):
            samples = []
            for s in submissions:
                for r in (s.get('values') or {}).get('rows') or []:
                    key = r.get('id') or r.get('factor')
                    if key == sid:
                        vv = r.get('value')
                        if isinstance(vv, str) and vv.strip():
                            samples.append(vv)
                            if len(samples) >= 10:
                                break
            stats[sid] = { 'type':'text', 'samples': samples }
        else:
            stats[sid] = { 'type': typ }
    return { 'success': True, 'form_id': form_id, 'stats': stats }

