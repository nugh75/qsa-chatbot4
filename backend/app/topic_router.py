import re
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional, List, Tuple, Dict

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

def detect_topics(user_text: str, enabled_topics: Optional[List[str]] = None, max_topics: int = 5) -> List[Dict[str,str]]:
  """Rileva MULTIPLI topic per il testo utente.

  Restituisce una lista di dict {"topic":..., "pattern":...} in ordine di prima occorrenza nel testo
  (non solo ordine di configurazione) per dare priorità ai pattern che appaiono prima.

  Args:
      user_text: Testo dell'utente
      enabled_topics: Lista (whitelist) di topic abilitati
      max_topics: Numero massimo di topic da restituire
  """
  t = user_text.lower()
  matches: List[Tuple[int,str,str]] = []  # (start_index, topic, pattern)
  for pat, topic in load_routes():
    if enabled_topics is not None and topic not in enabled_topics:
      continue
    try:
      for m in re.finditer(pat, t):
        matches.append((m.start(), topic, pat))
        break  # una singola occorrenza sufficiente per quel pattern
    except re.error:
      continue
  # Ordina per posizione di prima occorrenza poi per lunghezza pattern desc (più specifico prima)
  matches.sort(key=lambda x: (x[0], -len(x[2])))
  seen = set()
  out: List[Dict[str,str]] = []
  for _, topic, pat in matches:
    if topic in seen:
      continue
    seen.add(topic)
    out.append({"topic": topic, "pattern": pat})
    if len(out) >= max_topics:
      break
  return out

def refresh_routes_cache():
  """Invalida la cache (usato quando l'admin salva)."""
  load_routes.cache_clear()  # type: ignore[attr-defined]
