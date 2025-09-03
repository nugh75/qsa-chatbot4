from pathlib import Path
import json
import re
from typing import Optional
import shutil
import logging

"""Gestione del prompt di sistema con distinzione tra seed (read-only) e runtime (scrivibile).

Seed:   /app/data (montato read-only da docker-compose)
Runtime:/app/storage/prompts (volume scrivibile persistente)

Questo permette di aggiornare i prompt senza rebuild e mantenere un file seed
versionato come riferimento iniziale.
"""

SEED_DIR = Path('/app/data')  # percorso seed esplicito nel container
RUNTIME_DIR = Path(__file__).resolve().parent.parent / "storage" / "prompts"
SUMMARY_RUNTIME_DIR = Path(__file__).resolve().parent.parent / "storage" / "summary"

# Il DATA_DIR usato dal resto delle funzioni punta al runtime.
DATA_DIR = RUNTIME_DIR

SYSTEM_PROMPTS_JSON = DATA_DIR / "SYSTEM_PROMPTS.json"
SUMMARY_PROMPTS_JSON = SUMMARY_RUNTIME_DIR / "SUMMARY_PROMPTS.json"
LEGACY_SUMMARY_MD = SUMMARY_RUNTIME_DIR / "SUMMARY_PROMPT.md"
LEGACY_SUMMARY_JSON = SUMMARY_RUNTIME_DIR / "SUMMARY_PROMPT.json"

# File legacy e nuovo nome per il prompt singolo di default (seed)
LEGACY_SINGLE_PROMPT_CANDIDATES = [
    "system-prompt.md",  # nuovo nome
    "CLAUDE.md",         # legacy
]

DEFAULT_SYSTEM_TEXT = (
    "Sei Counselorbot, compagno di apprendimento. Guida l'utente attraverso i passi del QSA con tono positivo."
)

def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s or "default"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def _bootstrap_runtime():
    """Inizializza la directory runtime copiando i file seed se mancanti.

    Idempotente: non sovrascrive file già presenti nel runtime.
    """
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

    # Copia SYSTEM_PROMPTS.json se mancante nel runtime ma presente nel seed
    seed_json = SEED_DIR / "SYSTEM_PROMPTS.json"
    if not SYSTEM_PROMPTS_JSON.exists() and seed_json.exists():
        try:
            shutil.copy2(seed_json, SYSTEM_PROMPTS_JSON)
            logging.info("[prompts] Copiato seed SYSTEM_PROMPTS.json nel runtime")
        except Exception as e:
            logging.warning(f"[prompts] Impossibile copiare SYSTEM_PROMPTS.json seed: {e}")

    # Copia seed summary solo se nessuna struttura multi presente (gestito da migrazione successiva)
    # Manteniamo il file seed intatto; la migrazione lo leggerà se necessario.

    # Copia eventuale single prompt seed (system-prompt.md) se manca un JSON (uso come fallback iniziale)
    # Non necessario se JSON già copiato.


def _load_legacy_text() -> str:
    """Carica il testo da un file single-prompt (legacy) nel seed o runtime.

    Ordine di ricerca:
    1. Runtime/system-prompt.md
    2. Seed/system-prompt.md
    3. Seed/CLAUDE.md
    """
    # Runtime first
    for name in LEGACY_SINGLE_PROMPT_CANDIDATES:
        candidate_runtime = RUNTIME_DIR / name
        if candidate_runtime.exists():
            try:
                return candidate_runtime.read_text(encoding="utf-8")
            except Exception:
                pass
    # Seed
    for name in LEGACY_SINGLE_PROMPT_CANDIDATES:
        candidate_seed = SEED_DIR / name
        if candidate_seed.exists():
            try:
                return candidate_seed.read_text(encoding="utf-8")
            except Exception:
                pass
    return DEFAULT_SYSTEM_TEXT

def load_system_prompts() -> dict:
    """Carica la collezione di system prompts. Se mancante, crea struttura di default.

    Structure: { "active_id": str, "prompts": [{"id","name","text"}, ...] }
    """
    try:
        _bootstrap_runtime()
        if SYSTEM_PROMPTS_JSON.exists():
            data = json.loads(SYSTEM_PROMPTS_JSON.read_text(encoding="utf-8"))
            # basic validation
            if isinstance(data, dict) and "prompts" in data:
                # Se active prompt è vuoto, fallback a default se possibile
                active_id = data.get("active_id")
                if active_id:
                    for p in data.get("prompts", []):
                        if p.get("id") == active_id and not p.get("text"):
                            logging.warning("[prompts] Active system prompt vuoto: fallback a 'default'")
                            data["active_id"] = "default"
                            break
                return data
        # Migrate from legacy single file
        text = _load_legacy_text()
        data = {
            "active_id": "default",
            "prompts": [
                {"id": "default", "name": "Default", "text": text}
            ],
        }
        save_system_prompts(data)
        return data
    except Exception:
        # Fallback minimal
        return {"active_id": "default", "prompts": [{"id": "default", "name": "Default", "text": DEFAULT_SYSTEM_TEXT}]}

def save_system_prompts(data: dict) -> None:
    _ensure_data_dir()
    SYSTEM_PROMPTS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def set_active_system_prompt(prompt_id: str) -> None:
    data = load_system_prompts()
    ids = {p["id"] for p in data.get("prompts", [])}
    if prompt_id not in ids:
        raise ValueError("Prompt id non trovato")
    data["active_id"] = prompt_id
    save_system_prompts(data)

def upsert_system_prompt(name: str, text: str, prompt_id: Optional[str] = None, set_active: bool = False) -> dict:
    data = load_system_prompts()
    if prompt_id is None:
        prompt_id = _slugify(name)
    # Update if exists
    found = False
    for p in data["prompts"]:
        if p["id"] == prompt_id:
            p["name"] = name
            p["text"] = text
            found = True
            break
    if not found:
        data["prompts"].append({"id": prompt_id, "name": name, "text": text})
    if set_active:
        data["active_id"] = prompt_id
    save_system_prompts(data)
    return {"id": prompt_id}

def delete_system_prompt(prompt_id: str) -> None:
    data = load_system_prompts()
    prompts = [p for p in data.get("prompts", []) if p["id"] != prompt_id]
    if len(prompts) == len(data.get("prompts", [])):
        raise ValueError("Prompt id non trovato")
    data["prompts"] = prompts
    # If deleting active, reset to first available
    if data.get("active_id") == prompt_id:
        data["active_id"] = prompts[0]["id"] if prompts else "default"
    save_system_prompts(data)

def load_system_prompt() -> str:
    """Restituisce il testo del system prompt attivo."""
    data = load_system_prompts()
    active = data.get("active_id", "default")
    for p in data.get("prompts", []):
        if p["id"] == active:
            return p.get("text", DEFAULT_SYSTEM_TEXT)
    return DEFAULT_SYSTEM_TEXT

def get_system_prompt_by_id(prompt_id: str) -> str:
    data = load_system_prompts()
    for p in data.get("prompts", []):
        if p["id"] == prompt_id:
            return p.get("text", DEFAULT_SYSTEM_TEXT)
    return DEFAULT_SYSTEM_TEXT

def save_system_prompt(text: str) -> None:
    """Compat: salva il testo nel prompt attivo (o default)."""
    data = load_system_prompts()
    active = data.get("active_id", "default")
    for p in data.get("prompts", []):
        if p["id"] == active:
            p["text"] = text
            break
    else:
        data.setdefault("prompts", []).append({"id": "default", "name": "Default", "text": text})
        data["active_id"] = "default"
    save_system_prompts(data)

#############################
# Summary prompts (multi)   #
#############################

DEFAULT_SUMMARY_TEXT = (
    "Sei un assistente che genera un REPORT di una conversazione tra utente e counselorbot. "
    "Obiettivo: produrre un riassunto strutturato in italiano che includa: \n"
    "1. Titolo breve descrittivo (max 12 parole).\n"
    "2. Obiettivo dichiarato o implicito dell'utente.\n"
    "3. Punti chiave emersi (bullet sintetici).\n"
    "4. Eventuali fattori cognitivi/affettivi menzionati.\n"
    "5. Progressi o cambiamenti durante il dialogo.\n"
    "6. Suggerimenti concreti per il prossimo passo (max 5).\n"
    "7. Tono generale e stato emotivo percepito.\n\n"
    "Regole: Non inventare dettagli assenti. Mantieni tono professionale, empatico e sintetico."
)

def _migrate_legacy_summary_prompt():
    """Migra vecchio file singolo SUMMARY_PROMPT (md/json) alla struttura multi JSON.

    Esegue una sola volta se SUMMARY_PROMPTS.json non esiste.
    """
    if SUMMARY_PROMPTS_JSON.exists():
        return
    SUMMARY_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    legacy_text = None
    # Priorità: MD runtime -> JSON runtime -> seed MD -> default
    try:
        if LEGACY_SUMMARY_MD.exists():
            legacy_text = LEGACY_SUMMARY_MD.read_text(encoding='utf-8')
        elif LEGACY_SUMMARY_JSON.exists():
            try:
                legacy_text = json.loads(LEGACY_SUMMARY_JSON.read_text(encoding='utf-8')).get('summary_prompt')
            except Exception:
                pass
        else:
            seed_file = SEED_DIR / 'SUMMARY_PROMPT.md'
            if seed_file.exists():
                legacy_text = seed_file.read_text(encoding='utf-8')
    except Exception as e:
        logging.warning(f"[summary-prompts] Errore lettura legacy: {e}")
    if not legacy_text:
        legacy_text = DEFAULT_SUMMARY_TEXT
    data = {
        "active_id": "default",
        "prompts": [
            {"id": "default", "name": "Default", "text": legacy_text}
        ]
    }
    try:
        SUMMARY_PROMPTS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        # Rinominazione file legacy per chiarezza
        try:
            if LEGACY_SUMMARY_MD.exists():
                LEGACY_SUMMARY_MD.rename(LEGACY_SUMMARY_MD.with_suffix('.md.legacy'))
            if LEGACY_SUMMARY_JSON.exists():
                LEGACY_SUMMARY_JSON.rename(LEGACY_SUMMARY_JSON.with_suffix('.json.legacy'))
        except Exception:
            pass
        logging.info("[summary-prompts] Migrazione completata -> SUMMARY_PROMPTS.json (len=%d)", len(legacy_text))
    except Exception as e:
        logging.error(f"[summary-prompts] Errore scrittura struttura migrata: {e}")

def load_summary_prompts() -> dict:
    try:
        _bootstrap_runtime()
        _migrate_legacy_summary_prompt()
        if SUMMARY_PROMPTS_JSON.exists():
            data = json.loads(SUMMARY_PROMPTS_JSON.read_text(encoding='utf-8'))
            # Validazione minima
            if not isinstance(data, dict) or 'prompts' not in data:
                raise ValueError('Struttura SUMMARY_PROMPTS.json non valida')
            return data
    except Exception as e:
        logging.error(f"[summary-prompts] Errore load: {e}")
    # Fallback minimo
    return {"active_id": "default", "prompts": [{"id": "default", "name": "Default", "text": DEFAULT_SUMMARY_TEXT}]}

def save_summary_prompts(data: dict) -> None:
    SUMMARY_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_PROMPTS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def load_summary_prompt() -> str:
    data = load_summary_prompts()
    active = data.get('active_id', 'default')
    for p in data.get('prompts', []):
        if p.get('id') == active:
            txt = p.get('text', DEFAULT_SUMMARY_TEXT)
            final_text = txt or DEFAULT_SUMMARY_TEXT
            print(f"[DEBUG] Loaded summary prompt id='{active}' length={len(final_text)}")
            print(f"[DEBUG] Summary prompt preview: {final_text[:200]}...")
            return final_text
    print(f"[DEBUG] No active summary prompt found, using default")
    return DEFAULT_SUMMARY_TEXT

def save_summary_prompt(text: str) -> None:
    """Compat: aggiorna il prompt attivo (come prima interfaccia)."""
    data = load_summary_prompts()
    active = data.get('active_id', 'default')
    for p in data['prompts']:
        if p['id'] == active:
            p['text'] = text
            break
    else:
        data['prompts'].append({"id": "default", "name": "Default", "text": text})
        data['active_id'] = 'default'
    save_summary_prompts(data)
    logging.info("[summary-prompts] Salvato prompt attivo id=%s len=%d sha1=%s", active, len(text), __import__('hashlib').sha1(text.encode('utf-8')).hexdigest()[:12])

def upsert_summary_prompt(name: str, text: str, prompt_id: Optional[str] = None, set_active: bool = False) -> dict:
    data = load_summary_prompts()
    if prompt_id is None:
        prompt_id = _slugify(name)
    found = False
    for p in data['prompts']:
        if p['id'] == prompt_id:
            p['name'] = name
            p['text'] = text
            found = True
            break
    if not found:
        data['prompts'].append({"id": prompt_id, "name": name, "text": text})
    if set_active:
        data['active_id'] = prompt_id
    save_summary_prompts(data)
    logging.info("[summary-prompts] Upsert id=%s set_active=%s len=%d", prompt_id, set_active, len(text))
    return {"id": prompt_id}

def set_active_summary_prompt(prompt_id: str) -> None:
    data = load_summary_prompts()
    ids = {p['id'] for p in data['prompts']}
    if prompt_id not in ids:
        raise ValueError('Summary prompt id non trovato')
    data['active_id'] = prompt_id
    save_summary_prompts(data)
    logging.info("[summary-prompts] Active set id=%s", prompt_id)

def delete_summary_prompt(prompt_id: str) -> None:
    data = load_summary_prompts()
    prompts = [p for p in data['prompts'] if p['id'] != prompt_id]
    if len(prompts) == len(data['prompts']):
        raise ValueError('Summary prompt id non trovato')
    data['prompts'] = prompts
    if data.get('active_id') == prompt_id:
        data['active_id'] = prompts[0]['id'] if prompts else 'default'
    save_summary_prompts(data)
    logging.info("[summary-prompts] Deleted id=%s", prompt_id)

def reset_summary_prompt_from_seed() -> str:
    """Reset basato su seed file, sostituisce (o crea) il prompt 'default' e lo rende attivo."""
    seed_file = SEED_DIR / 'SUMMARY_PROMPT.md'
    text = DEFAULT_SUMMARY_TEXT
    if seed_file.exists():
        try:
            text = seed_file.read_text(encoding='utf-8')
        except Exception as e:
            logging.warning(f"[summary-prompts] Errore lettura seed per reset: {e}")
    data = load_summary_prompts()
    # Cerca default
    found = False
    for p in data['prompts']:
        if p['id'] == 'default':
            p['name'] = 'Default'
            p['text'] = text
            found = True
            break
    if not found:
        data['prompts'].append({"id": 'default', "name": 'Default', "text": text})
    data['active_id'] = 'default'
    save_summary_prompts(data)
    logging.info("[summary-prompts] Reset dal seed len=%d", len(text))
    return text
