from __future__ import annotations
"""Embedding Manager - gestisce provider corrente, configurazione e download async.
"""
from typing import Dict, Any, Optional, List
from pathlib import Path
import json
import threading
import time

from .embedding_providers import (
    SentenceTransformerProvider,
    EmbeddingProvider,
    SUPPORTED_LOCAL_MODELS,
    start_async_download,
    get_download_status,
    list_download_tasks,
)

CONFIG_PATH = Path(__file__).resolve().parent.parent / 'storage' / 'rag_data' / 'embedding_config.json'
CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)

_config_lock = threading.Lock()

_default_config = {
    'provider_type': 'local',
    'model_name': 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    'dimension': 384,
    'updated_at': None
}

_active_provider: Optional[EmbeddingProvider] = None
_active_provider_key: Optional[str] = None
_provider_lock = threading.Lock()

def _load_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
        except Exception:
            pass
    return dict(_default_config)

def _save_config(cfg: Dict[str, Any]):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding='utf-8')

def get_config() -> Dict[str, Any]:
    return _load_config()

def _build_provider(provider_type: str, model_name: str) -> EmbeddingProvider:
    if provider_type == 'local':
        return SentenceTransformerProvider(model_name)
    raise ValueError(f'Provider embedding non supportato: {provider_type}')

def get_provider() -> EmbeddingProvider:
    global _active_provider, _active_provider_key
    cfg = get_config()
    key = f"{cfg['provider_type']}::{cfg['model_name']}"
    with _provider_lock:
        if _active_provider and _active_provider_key == key:
            return _active_provider
        # build new
        prov = _build_provider(cfg['provider_type'], cfg['model_name'])
        prov.load()  # lazy but we call here so dimension available
        _active_provider = prov
        _active_provider_key = key
        # update dimension if missing
        ic = prov.info()
        if ic.get('dimension') and cfg.get('dimension') != ic['dimension']:
            cfg['dimension'] = ic['dimension']
            cfg['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            _save_config(cfg)
        return prov

def set_provider(provider_type: str, model_name: str):
    if provider_type == 'local' and model_name not in SUPPORTED_LOCAL_MODELS:
        raise ValueError('Modello locale non supportato')
    cfg = get_config()
    cfg.update({
        'provider_type': provider_type,
        'model_name': model_name,
        'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    })
    _save_config(cfg)
    # force rebuild provider next call
    global _active_provider, _active_provider_key
    with _provider_lock:
        _active_provider = None
        _active_provider_key = None

def list_local_models() -> List[str]:
    return SUPPORTED_LOCAL_MODELS

def start_model_download(model_name: str) -> str:
    # Start async download (simulation)
    return start_async_download(model_name)

def download_status(task_id: str):
    return get_download_status(task_id)

def download_tasks():
    return list_download_tasks()
