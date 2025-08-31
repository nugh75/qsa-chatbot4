import re
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional, List, Tuple

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"

@lru_cache(maxsize=1)
def load_routes() -> List[Tuple[str, str]]:
  """Carica le route (pattern -> topic) dal file di configurazione della pipeline.
  Se il file non esiste, ritorna una lista vuota.
  """
  try:
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return [(item["pattern"], item["topic"]) for item in data.get("routes", [])]
  except Exception:
    return []

def detect_topic(user_text: str, enabled_topics: Optional[List[str]] = None) -> Optional[str]:
  """Rileva il topic dal testo dell'utente
  
  Args:
      user_text: Testo dell'utente
      enabled_topics: Lista dei topic abilitati per la personalità corrente
      
  Returns:
      Topic rilevato se abilitato, altrimenti None
  """
  t = user_text.lower()
  for pat, topic in load_routes():
    try:
      if re.search(pat, t):
        # Se sono specificati topic abilitati, controlla che il topic sia nella lista
        if enabled_topics is not None and topic not in enabled_topics:
          continue
        return topic
    except re.error:
      # ignora pattern invalidi
      continue
  return None

def refresh_routes_cache():
  """Invalida la cache (usato quando l'admin salva)."""
  load_routes.cache_clear()  # type: ignore[attr-defined]
