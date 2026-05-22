import io
import json
import os
import uuid
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .auth import get_current_active_user, is_admin_user
from .prompts import (
    load_system_prompts,
    save_system_prompts,
    load_summary_prompts,
    save_summary_prompts,
)
from .welcome_guides import _load as wg_load, apply_seed as wg_apply
from .personalities import load_personalities, upsert_personality


router = APIRouter(prefix="/backup", tags=["backup"])


def _admin_only(user=Depends(get_current_active_user)):
    if not is_admin_user(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _runtime_paths() -> Dict[str, str]:
    base = os.path.join(os.path.dirname(__file__), "..", "storage")
    return {
        "system_prompts": os.path.join(base, "prompts", "system_prompts.json"),
        "summary_prompts": os.path.join(base, "summary", "summary_prompts.json"),
        "welcome_guide": os.path.join(base, "welcome-guide", "welcome_guide.json"),
    }


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


@router.get("/export", dependencies=[Depends(_admin_only)])
def export_backup():
    """Produce a ZIP with runtime JSON files and personalities DB dump."""
    mem = io.BytesIO()
    zf = zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED)
    meta = {"created_at": _now_iso(), "version": 1}
    try:
        # JSON files from runtime (read via loaders to ensure structure)
        sp = load_system_prompts()
        zf.writestr("prompts/system_prompts.json", json.dumps(sp, ensure_ascii=False, indent=2))
        sump = load_summary_prompts()
        zf.writestr("summary/summary_prompts.json", json.dumps(sump, ensure_ascii=False, indent=2))
        wg = wg_load()
        zf.writestr("welcome-guide/welcome_guide.json", json.dumps(wg, ensure_ascii=False, indent=2))
        # DB dump: personalities
        pers = load_personalities()
        zf.writestr("db/personalities.json", json.dumps(pers, ensure_ascii=False, indent=2))
        # metadata
        zf.writestr("metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))
    finally:
        zf.close()
    mem.seek(0)
    filename = f"qsa-backup-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.zip"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(mem, media_type="application/zip", headers=headers)


def _read_zip_to_dict(zdata: bytes) -> Dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(zdata), 'r') as z:
        out: Dict[str, Any] = {}
        for name in z.namelist():
            if name.endswith('/'):
                continue
            if name.endswith('.json'):
                try:
                    obj = json.loads(z.read(name).decode('utf-8'))
                except Exception:
                    obj = None
                out[name] = obj
    return out


def _diff_by_id_list(current_list: List[Dict], incoming_list: List[Dict], key: str = 'id') -> Dict[str, Any]:
    c_map = {str(x.get(key)): x for x in (current_list or []) if isinstance(x, dict) and x.get(key) is not None}
    i_map = {str(x.get(key)): x for x in (incoming_list or []) if isinstance(x, dict) and x.get(key) is not None}
    adds = [i_map[k] for k in i_map.keys() - c_map.keys()]
    updates = []
    for k in (i_map.keys() & c_map.keys()):
        if json.dumps(i_map[k], sort_keys=True) != json.dumps(c_map[k], sort_keys=True):
            updates.append({"id": k, "current": c_map[k], "incoming": i_map[k]})
    missing = [c_map[k] for k in c_map.keys() - i_map.keys()]
    return {"add": adds, "update": updates, "missing_in_incoming": missing}


@router.post("/import/preview", dependencies=[Depends(_admin_only)])
async def import_preview(file: UploadFile = File(...)):
    data = await file.read()
    content = _read_zip_to_dict(data)
    # Build preview structure
    preview: Dict[str, Any] = {"conflicts": {}, "summary": {}, "import_id": None}
    # System prompts
    cur_sp = load_system_prompts()
    inc_sp = content.get("prompts/system_prompts.json") or {}
    sp_diff = _diff_by_id_list(cur_sp.get("prompts", []), (inc_sp or {}).get("prompts", []))
    preview["conflicts"]["system_prompts"] = {
        **sp_diff,
        "active_current": cur_sp.get("active_id"),
        "active_incoming": (inc_sp or {}).get("active_id")
    }
    # Summary prompts
    cur_sum = load_summary_prompts()
    inc_sum = content.get("summary/summary_prompts.json") or {}
    sum_diff = _diff_by_id_list(cur_sum.get("prompts", []), (inc_sum or {}).get("prompts", []))
    preview["conflicts"]["summary_prompts"] = {
        **sum_diff,
        "active_current": cur_sum.get("active_id"),
        "active_incoming": (inc_sum or {}).get("active_id")
    }
    # Welcome/Guides
    cur_wg = wg_load()
    inc_wg = content.get("welcome-guide/welcome_guide.json") or {}
    w_diff = _diff_by_id_list(cur_wg.get("welcome", {}).get("messages", []), (inc_wg or {}).get("welcome", {}).get("messages", []))
    g_diff = _diff_by_id_list(cur_wg.get("guides", {}).get("guides", []), (inc_wg or {}).get("guides", {}).get("guides", []))
    preview["conflicts"]["welcome_guides"] = {
        "welcome": {**w_diff, "active_current": cur_wg.get("welcome", {}).get("active_id"), "active_incoming": (inc_wg or {}).get("welcome", {}).get("active_id")},
        "guides": {**g_diff, "active_current": cur_wg.get("guides", {}).get("active_id"), "active_incoming": (inc_wg or {}).get("guides", {}).get("active_id")}
    }
    # Personalities (DB)
    cur_p = load_personalities().get("personalities", [])
    inc_p_root = content.get("db/personalities.json") or {}
    inc_p = (inc_p_root or {}).get("personalities", [])
    p_diff = _diff_by_id_list(cur_p, inc_p)
    preview["conflicts"]["personalities"] = p_diff

    # Store the uploaded file to temp for subsequent apply
    imports_dir = os.path.join(os.path.dirname(__file__), "..", "storage", "admin", "imports")
    os.makedirs(imports_dir, exist_ok=True)
    import_id = f"imp_{uuid.uuid4().hex[:10]}"
    with open(os.path.join(imports_dir, f"{import_id}.zip"), "wb") as f:
        f.write(data)
    preview["import_id"] = import_id
    # Quick summary counts
    def _count(d):
        return {k: {kk: len(vv) if isinstance(vv, list) else vv for kk, vv in dv.items()} for k, dv in d.items()}
    preview["summary"] = _count(preview["conflicts"])
    return preview


class ApplyDecision(BaseException):
    pass


@router.post("/import/apply", dependencies=[Depends(_admin_only)])
async def import_apply(payload: Dict[str, Any]):
    """
    Apply an import with optional decisions.

    payload = {
      "import_id": str,
      "decisions": {
        "system_prompts": {"apply_ids": ["..."], "use_incoming_active": false},
        "summary_prompts": {"apply_ids": ["..."], "use_incoming_active": false},
        "welcome": {"apply_ids": ["..."], "use_incoming_active": false},
        "guides": {"apply_ids": ["..."], "use_incoming_active": false},
        "personalities": {"apply_ids": ["..."]}
      }
    }
    If apply_ids omitted, default to applying adds+updates; actives keep current unless use_incoming_active.
    """
    import_id = payload.get("import_id")
    if not import_id:
        raise HTTPException(400, "import_id missing")
    imports_dir = os.path.join(os.path.dirname(__file__), "..", "storage", "admin", "imports")
    zip_path = os.path.join(imports_dir, f"{import_id}.zip")
    if not os.path.exists(zip_path):
        raise HTTPException(404, "Import not found")
    content = _read_zip_to_dict(open(zip_path, 'rb').read())
    decisions = payload.get("decisions", {}) or {}

    # System prompts
    inc_sp = content.get("prompts/system_prompts.json") or {}
    if inc_sp:
        cur_sp = load_system_prompts()
        target_ids = set(decisions.get("system_prompts", {}).get("apply_ids") or [])
        if not target_ids:
            # default: apply all ids present in incoming (add+update)
            target_ids = {p.get('id') for p in inc_sp.get('prompts', []) if p.get('id')}
        # merge by upsert and optionally set active
        data = load_system_prompts()
        ids_incoming = {p.get('id') for p in inc_sp.get('prompts', []) if p.get('id')}
        for p in inc_sp.get('prompts', []) or []:
            pid = p.get('id')
            if pid in target_ids:
                # Upsert: update or add
                found = False
                for cp in data['prompts']:
                    if cp['id'] == pid:
                        cp['name'] = p.get('name') or pid
                        cp['text'] = p.get('text') or ''
                        found = True
                        break
                if not found:
                    data['prompts'].append({"id": pid, "name": p.get('name') or pid, "text": p.get('text') or ''})
        if decisions.get("system_prompts", {}).get("use_incoming_active") and inc_sp.get('active_id') in ids_incoming:
            data['active_id'] = inc_sp.get('active_id')
        save_system_prompts(data)

    # Summary prompts
    inc_sum = content.get("summary/summary_prompts.json") or {}
    if inc_sum:
        target_ids = set(decisions.get("summary_prompts", {}).get("apply_ids") or [])
        if not target_ids:
            target_ids = {p.get('id') for p in inc_sum.get('prompts', []) if p.get('id')}
        data = load_summary_prompts()
        ids_incoming = {p.get('id') for p in inc_sum.get('prompts', []) if p.get('id')}
        for p in inc_sum.get('prompts', []) or []:
            pid = p.get('id')
            if pid in target_ids:
                found = False
                for cp in data['prompts']:
                    if cp['id'] == pid:
                        cp['name'] = p.get('name') or pid
                        cp['text'] = p.get('text') or ''
                        found = True
                        break
                if not found:
                    data['prompts'].append({"id": pid, "name": p.get('name') or pid, "text": p.get('text') or ''})
        if decisions.get("summary_prompts", {}).get("use_incoming_active") and inc_sum.get('active_id') in ids_incoming:
            data['active_id'] = inc_sum.get('active_id')
        save_summary_prompts(data)

    # Welcome/Guides
    inc_wg = content.get("welcome-guide/welcome_guide.json") or {}
    if inc_wg:
        # We reuse apply_seed with overwrite=False, but we filter to selected ids if provided
        dec_w = decisions.get('welcome', {})
        dec_g = decisions.get('guides', {})
        if dec_w.get('apply_ids') or dec_g.get('apply_ids') or dec_w.get('use_incoming_active') or dec_g.get('use_incoming_active'):
            cur = wg_load()
            # Build a minimal seed containing only selected items
            seed: Dict[str, Any] = {}
            if 'welcome' in inc_wg:
                apply_ids = set(dec_w.get('apply_ids') or [m.get('id') for m in inc_wg['welcome'].get('messages', [])])
                items = [m for m in inc_wg['welcome'].get('messages', []) if m.get('id') in apply_ids]
                active = cur.get('welcome', {}).get('active_id')
                if dec_w.get('use_incoming_active'):
                    active = inc_wg['welcome'].get('active_id')
                seed['welcome'] = {"messages": items, "active_id": active}
            if 'guides' in inc_wg:
                apply_ids_g = set(dec_g.get('apply_ids') or [g.get('id') for g in inc_wg['guides'].get('guides', [])])
                items_g = [g for g in inc_wg['guides'].get('guides', []) if g.get('id') in apply_ids_g]
                active_g = cur.get('guides', {}).get('active_id')
                if dec_g.get('use_incoming_active'):
                    active_g = inc_wg['guides'].get('active_id')
                seed['guides'] = {"guides": items_g, "active_id": active_g}
            wg_apply(seed, overwrite=False)
        else:
            # Default: merge everything
            wg_apply({"welcome": inc_wg.get('welcome'), "guides": inc_wg.get('guides')}, overwrite=False)

    # Personalities
    inc_p_root = content.get("db/personalities.json") or {}
    if inc_p_root:
        apply_ids = set(decisions.get('personalities', {}).get('apply_ids') or [p.get('id') for p in inc_p_root.get('personalities', []) if p.get('id')])
        for p in inc_p_root.get('personalities', []) or []:
            pid = p.get('id')
            if pid in apply_ids:
                try:
                    upsert_personality(
                        name=p.get('name') or pid,
                        system_prompt_id=p.get('system_prompt_id') or 'default',
                        provider=p.get('provider') or 'openrouter',
                        model=p.get('model') or 'gpt-oss-20b:free',
                        welcome_message=p.get('welcome_message'),
                        guide_id=p.get('guide_id'),
                        context_window=p.get('context_window'),
                        temperature=p.get('temperature'),
                        personality_id=pid,
                        set_default=False,
                        avatar=p.get('avatar'),
                        tts_provider=p.get('tts_provider'),
                        tts_voice=p.get('tts_voice'),
                        active=bool(p.get('active', True)),
                        enabled_pipeline_topics=p.get('enabled_pipeline_topics') or [],
                        enabled_rag_groups=p.get('enabled_rag_groups') or [],
                        enabled_mcp_servers=p.get('enabled_mcp_servers') or [],
                        enabled_data_tables=p.get('enabled_data_tables') or [],
                        enabled_forms=p.get('enabled_forms') or [],
                        max_tokens=p.get('max_tokens'),
                        show_pipeline_topics=p.get('show_pipeline_topics', True),
                        show_source_docs=p.get('show_source_docs', True),
                    )
                except Exception as e:
                    # Continue others; collect errors in result if needed
                    pass

    return {"ok": True}


@router.delete("/import/{import_id}", dependencies=[Depends(_admin_only)])
def delete_import(import_id: str):
    imports_dir = os.path.join(os.path.dirname(__file__), "..", "storage", "admin", "imports")
    zip_path = os.path.join(imports_dir, f"{import_id}.zip")
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)
        except Exception:
            pass
    return {"deleted": import_id}
