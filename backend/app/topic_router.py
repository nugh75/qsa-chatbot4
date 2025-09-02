import re
import json
from functools import lru_cache
import os
import unicodedata
from .admin import load_config  # to read pipeline_settings
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Union

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"

@lru_cache(maxsize=1)
def load_routes() -> List[Tuple[str, str]]:
  """Carica le route (pattern -> topic) dal file di configurazione della pipeline.
  Se il file non esiste, ritorna una lista vuota.
  """
  try:
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    # Config-driven flags (fallback agli env se non ancora salvati in config)
    try:
      cfg = load_config()
      _ps = cfg.get('pipeline_settings', {}) if isinstance(cfg, dict) else {}
    except Exception:
      _ps = {}
    force_case = bool(_ps.get('force_case_insensitive')) or (os.getenv("PIPELINE_FORCE_CASE_INSENSITIVE", "0") in ("1", "true", "True"))
    cleaned: List[Tuple[str,str]] = []
    for item in data.get("routes", []):
      pat = item.get("pattern", "")
      topic = item.get("topic", "")
      # Strip whitespace/newline ai bordi
      pat = pat.strip()
      # Forza case-insensitive aggiungendo (?i) se richiesto e non già presente
      if force_case and not pat.startswith("(?i)"):
        pat = "(?i)" + pat
      cleaned.append((pat, topic))
    return cleaned
  except Exception:
    return []

def _normalize_accents(text: str) -> str:
  """Rimuove gli accenti (diacritici) mantenendo solo caratteri base."""
  nfkd = unicodedata.normalize('NFKD', text)
  return ''.join(ch for ch in nfkd if not unicodedata.combining(ch))

def detect_topic(user_text: str, enabled_topics: Optional[List[str]] = None) -> Optional[str]:
  """Rileva il topic dal testo dell'utente
  
  Args:
      user_text: Testo dell'utente
      enabled_topics: Lista dei topic abilitati per la personalità corrente
      
  Returns:
      Topic rilevato se abilitato, altrimenti None
  """
  t = user_text.lower()
  try:
    cfg = load_config(); _ps = cfg.get('pipeline_settings', {}) if isinstance(cfg, dict) else {}
    norm_acc = bool(_ps.get('normalize_accents')) or (os.getenv("PIPELINE_NORMALIZE_ACCENTS", "0") in ("1", "true", "True"))
  except Exception:
    norm_acc = os.getenv("PIPELINE_NORMALIZE_ACCENTS", "0") in ("1", "true", "True")
  if norm_acc:
    t = _normalize_accents(t)
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

def detect_topics(user_text: str, enabled_topics: Optional[List[str]] = None, max_topics: Optional[int] = 5) -> List[Dict[str,str]]:
  """Rileva MULTIPLI topic per il testo utente.

  Restituisce una lista di dict {"topic":..., "pattern":...} in ordine di prima occorrenza nel testo
  (non solo ordine di configurazione) per dare priorità ai pattern che appaiono prima.

  Args:
      user_text: Testo dell'utente
      enabled_topics: Lista (whitelist) di topic abilitati
      max_topics: Numero massimo di topic da restituire. Se None o <=0 restituisce tutti i topic trovati.
  """
  t = user_text.lower()
  try:
    cfg = load_config(); _ps = cfg.get('pipeline_settings', {}) if isinstance(cfg, dict) else {}
    norm_acc = bool(_ps.get('normalize_accents')) or (os.getenv("PIPELINE_NORMALIZE_ACCENTS", "0") in ("1", "true", "True"))
  except Exception:
    norm_acc = os.getenv("PIPELINE_NORMALIZE_ACCENTS", "0") in ("1", "true", "True")
  if norm_acc:
    t = _normalize_accents(t)
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
    if max_topics is not None and max_topics > 0 and len(out) >= max_topics:
      break
  return out

def refresh_routes_cache():
  """Invalida la cache (usato quando l'admin salva)."""
  load_routes.cache_clear()  # type: ignore[attr-defined]
