"""
Pipeline History Module - Gestisce lo storico delle modifiche alla configurazione pipeline.

Registra ogni modifica (add, update, delete) in un file JSONL per audit e rollback.
"""
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

# Path per il file di storico
HISTORY_DIR = Path(__file__).resolve().parent.parent / "storage" / "pipeline"
HISTORY_FILE = HISTORY_DIR / "history.jsonl"

def ensure_history_dir():
    """Assicura che la directory esista."""
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

def log_change(
    action: str,
    user: str = "admin",
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Registra una modifica allo storico.

    Args:
        action: Tipo di azione (add_route, update_route, delete_route, update_config, etc.)
        user: Utente che ha effettuato la modifica
        before: Stato prima della modifica
        after: Stato dopo la modifica
        metadata: Metadati aggiuntivi
    """
    ensure_history_dir()

    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "action": action,
        "user": user,
        "before": before,
        "after": after,
        "metadata": metadata or {}
    }

    try:
        with open(HISTORY_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        # Non blocca l'operazione principale se il logging fallisce
        import logging
        logging.getLogger(__name__).warning(f"Failed to log pipeline change: {e}")

def get_history(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """
    Recupera le ultime modifiche dallo storico.

    Args:
        limit: Numero massimo di entry da restituire
        offset: Numero di entry da saltare (per paginazione)

    Returns:
        Lista di entry in ordine cronologico inverso (più recenti prima)
    """
    ensure_history_dir()

    if not HISTORY_FILE.exists():
        return []

    try:
        entries = []
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

        # Ordina per timestamp decrescente
        entries.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        # Applica paginazione
        return entries[offset:offset + limit]
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to read pipeline history: {e}")
        return []

def get_history_count() -> int:
    """Restituisce il numero totale di entry nello storico."""
    ensure_history_dir()

    if not HISTORY_FILE.exists():
        return 0

    try:
        count = 0
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    count += 1
        return count
    except Exception:
        return 0

def clear_history() -> bool:
    """
    Svuota lo storico (usa con cautela).

    Returns:
        True se l'operazione è riuscita
    """
    ensure_history_dir()

    try:
        if HISTORY_FILE.exists():
            HISTORY_FILE.unlink()
        return True
    except Exception:
        return False
