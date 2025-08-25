from __future__ import annotations
import os, json, time
from pathlib import Path
from typing import Dict, Any, List

USAGE_DIR = Path(__file__).resolve().parent.parent / "usage"
USAGE_FILE = USAGE_DIR / "usage_log.jsonl"

def log_usage(entry: Dict[str, Any]) -> None:
    try:
        USAGE_DIR.mkdir(parents=True, exist_ok=True)
        with open(USAGE_FILE, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass

def read_usage(limit: int = 500) -> List[Dict[str, Any]]:
    if not USAGE_FILE.exists():
        return []
    lines: List[Dict[str, Any]] = []
    try:
        with open(USAGE_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line=line.strip()
                if not line:
                    continue
                try:
                    lines.append(json.loads(line))
                except Exception:
                    continue
        return lines[-limit:]
    except Exception:
        return []

def usage_stats() -> Dict[str, Any]:
    data = read_usage(5000)
    total = len(data)
    by_provider: Dict[str, Dict[str, Any]] = {}
    tokens_total = 0
    for e in data:
        prov = e.get('provider','unknown')
        if prov not in by_provider:
            by_provider[prov] = {"count":0, "tokens":0}
        by_provider[prov]["count"] += 1
        t = e.get('tokens', {}).get('total') or e.get('tokens_total') or 0
        by_provider[prov]["tokens"] += t
        tokens_total += t
    return {
        "total_interactions": total,
        "total_tokens": tokens_total,
        "by_provider": by_provider
    }

def reset_usage():
    try:
        if USAGE_FILE.exists():
            USAGE_FILE.unlink()
    except Exception:
        pass