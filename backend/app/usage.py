from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

USAGE_DIR = Path(__file__).resolve().parent.parent / "usage"
USAGE_FILE = USAGE_DIR / "usage_log.jsonl"

def log_usage(entry: Dict[str, Any]) -> None:
    try:
        USAGE_DIR.mkdir(parents=True, exist_ok=True)
        with open(USAGE_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass

def _iter_usage() -> List[Dict[str, Any]]:
    if not USAGE_FILE.exists():
        return []
    out: List[Dict[str, Any]] = []
    with open(USAGE_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line=line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out

def read_usage(limit: int = 500) -> List[Dict[str, Any]]:
    data = _iter_usage()
    return data[-limit:]

def query_usage(
    start: Optional[str]=None,
    end: Optional[str]=None,
    provider: Optional[str]=None,
    model: Optional[str]=None,
    q: Optional[str]=None,
    page: int = 1,
    page_size: int = 50
) -> Dict[str, Any]:
    data = _iter_usage()
    def parse_dt(ts: str) -> datetime:
        try:
            return datetime.fromisoformat(ts.replace('Z',''))
        except Exception:
            return datetime.min
    start_dt = datetime.fromisoformat(start) if start else None
    end_dt = datetime.fromisoformat(end) if end else None
    filtered: List[Dict[str, Any]] = []
    for e in data:
        ts = e.get('ts') or ''
        dt = parse_dt(ts)
        if start_dt and dt < start_dt: continue
        if end_dt and dt > end_dt: continue
        if provider and e.get('provider') != provider: continue
        if model and e.get('model') != model: continue
        if q:
            blob = json.dumps(e, ensure_ascii=False).lower()
            if q.lower() not in blob: continue
        filtered.append(e)
    total = len(filtered)
    # pagination
    if page < 1: page = 1
    if page_size < 1: page_size = 1
    start_idx = (page-1)*page_size
    end_idx = start_idx + page_size
    items = filtered[start_idx:end_idx]
    # daily aggregation for chart
    daily: Dict[str, Dict[str, Any]] = {}
    for e in filtered:
        ts = e.get('ts','')
        day = ts.split('T')[0]
        d = daily.setdefault(day, {"count":0, "tokens":0})
        d["count"] += 1
        d["tokens"] += (e.get('tokens',{}) or {}).get('total',0)
    providers: Dict[str, Dict[str, Any]] = {}
    models: Dict[str, int] = {}
    for e in filtered:
        p = e.get('provider','unknown')
        providers.setdefault(p, {"count":0})["count"] += 1
        m = e.get('model')
        if m:
            models[m] = models.get(m,0)+1
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
        "daily": daily,
        "providers": providers,
        "models": models
    }

def usage_stats() -> Dict[str, Any]:
    # Uso _iter_usage() direttamente per ottenere tutti i dati
    all_items = _iter_usage()
    
    # Calcola statistiche per oggi
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    today_items = [e for e in all_items if e.get('ts', '').startswith(today)]
    
    # Calcola by_provider
    providers = {}
    for e in all_items:
        p = e.get('provider', 'unknown')
        if p not in providers:
            providers[p] = {"requests": 0, "tokens": 0, "cost": 0}
        providers[p]["requests"] += 1
        tokens = (e.get('tokens',{}) or {}).get('total', 0)
        providers[p]["tokens"] += tokens
        providers[p]["cost"] += tokens * 0.0001  # Stima approssimativa del costo
    
    total_tokens = sum((e.get('tokens',{}) or {}).get('total',0) for e in all_items)
    
    return {
        "total_requests": len(all_items),
        "total_tokens": total_tokens,
        "total_cost": total_tokens * 0.0001,  # Stima approssimativa
        "today": {
            "requests": len(today_items),
            "tokens": sum((e.get('tokens',{}) or {}).get('total',0) for e in today_items)
        },
        "by_provider": providers
    }

def reset_usage():
    try:
        if USAGE_FILE.exists():
            USAGE_FILE.unlink()
    except Exception:
        pass