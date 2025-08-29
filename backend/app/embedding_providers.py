from __future__ import annotations
"""Embedding provider abstractions for RAG.

Phase 1: only local SentenceTransformer provider (sync load) + async download simulation.
Future: OpenAI / HF Inference / Azure / others.
"""
from typing import List, Dict, Any, Optional
import threading
import time
import os

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
except Exception:  # pragma: no cover - optional runtime import
    SentenceTransformer = None  # type: ignore

class EmbeddingProvider:
    """Interface for embedding providers."""
    provider_type: str

    def load(self) -> None:
        raise NotImplementedError

    def embed(self, texts: List[str]):  # -> List[List[float]]
        raise NotImplementedError

    def info(self) -> Dict[str, Any]:
        raise NotImplementedError

class SentenceTransformerProvider(EmbeddingProvider):
    def __init__(self, model_name: str):
        self.provider_type = 'local'
        self.model_name = model_name
        self._model = None
        self._dimension: Optional[int] = None
        self._lock = threading.Lock()

    def load(self) -> None:
        if self._model is not None:
            return
        if SentenceTransformer is None:
            raise RuntimeError("sentence-transformers non installato nel runtime")
        with self._lock:
            if self._model is None:  # double check
                self._model = SentenceTransformer(self.model_name)
                self._dimension = self._model.get_sentence_embedding_dimension()

    def embed(self, texts: List[str]):
        if self._model is None:
            self.load()
        assert self._model is not None
        return self._model.encode(texts)

    def info(self) -> Dict[str, Any]:
        return {
            'provider_type': self.provider_type,
            'model_name': self.model_name,
            'dimension': self._dimension,
            'loaded': self._model is not None
        }

# Simple async download registry (Phase 1 minimal)
_download_tasks: Dict[str, Dict[str, Any]] = {}
_download_lock = threading.Lock()

SUPPORTED_LOCAL_MODELS = [
    'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
    'sentence-transformers/all-MiniLM-L6-v2',
    'sentence-transformers/paraphrase-multilingual-mpnet-base-v2'
]

def start_async_download(model_name: str) -> str:
    """Start a background thread that 'downloads' (warms) the model.
    Returns a task_id.
    """
    task_id = f"dl_{int(time.time()*1000)}"
    with _download_lock:
        if model_name not in SUPPORTED_LOCAL_MODELS:
            raise ValueError('Modello non supportato')
        _download_tasks[task_id] = {
            'id': task_id,
            'model_name': model_name,
            'status': 'pending',
            'progress': 0,
            'error': None,
            'created_at': time.time()
        }

    def _run():
        try:
            with _download_lock:
                _download_tasks[task_id]['status'] = 'running'
            # Simulazione step (real impl: pre-load SentenceTransformer cache)
            steps = 5
            for i in range(steps):
                time.sleep(0.8)
                with _download_lock:
                    _download_tasks[task_id]['progress'] = int(((i+1)/steps)*100)
            # Done
            with _download_lock:
                _download_tasks[task_id]['status'] = 'completed'
        except Exception as e:  # pragma: no cover
            with _download_lock:
                _download_tasks[task_id]['status'] = 'failed'
                _download_tasks[task_id]['error'] = str(e)

    threading.Thread(target=_run, daemon=True).start()
    return task_id

def get_download_status(task_id: str) -> Optional[Dict[str, Any]]:
    with _download_lock:
        return _download_tasks.get(task_id)

def list_download_tasks() -> List[Dict[str, Any]]:
    with _download_lock:
        return list(_download_tasks.values())
