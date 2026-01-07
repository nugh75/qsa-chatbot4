from pathlib import Path
import json
from typing import Optional, Dict, List, Tuple, Any
from functools import lru_cache

from .rag_engine import rag_engine
from .rag_routes import get_user_context

RAG_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "rag_data"
PIPELINE_FILES_DIR = Path(__file__).resolve().parent.parent / "storage" / "pipeline_files"
CONFIG_FILE = Path(__file__).resolve().parent.parent / "config" / "pipeline_config.json"

@lru_cache(maxsize=1)
def load_files_mapping() -> Dict[str, str]:
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data.get("files", {})
    except Exception:
        return {}

def refresh_files_cache():
    load_files_mapping.cache_clear()  # type: ignore[attr-defined]

def _resolve_topic_file(name: str) -> Dict[str, Any]:
    file_map = load_files_mapping()
    if name not in file_map:
        raise KeyError(f"Topic '{name}' non presente in pipeline_config.json")
    filename = file_map[name]
    pipeline_path = PIPELINE_FILES_DIR / filename
    rag_path = RAG_STORAGE_DIR / filename
    return {
        "topic": name,
        "filename": filename,
        "pipeline_path": str(pipeline_path),
        "rag_path": str(rag_path),
        "source": None,
        "exists": None,
    }

def load_text_with_meta(name: str) -> Tuple[str, Dict[str, Any]]:
    meta = _resolve_topic_file(name)
    filename = meta["filename"]
    pipeline_path = Path(meta["pipeline_path"])
    rag_path = Path(meta["rag_path"])
    if pipeline_path.exists():
        # Best-effort mirror to rag_data for legacy path usage.
        try:
            RAG_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
            if (not rag_path.exists()) or pipeline_path.stat().st_mtime > rag_path.stat().st_mtime:
                rag_path.write_bytes(pipeline_path.read_bytes())
                meta["synced_to_rag"] = True
            else:
                meta["synced_to_rag"] = False
        except Exception:
            meta["synced_to_rag"] = None
        meta["source"] = "pipeline_files"
        meta["exists"] = True
        text = pipeline_path.read_text(encoding="utf-8")
        meta["chars"] = len(text)
        return text, meta
    if rag_path.exists():
        meta["source"] = "rag_data"
        meta["exists"] = True
        text = rag_path.read_text(encoding="utf-8")
        meta["chars"] = len(text)
        return text, meta
    meta["source"] = "missing"
    meta["exists"] = False
    raise FileNotFoundError(f"File topic '{filename}' non trovato in pipeline_files o rag_data")

def load_text(name: str) -> str:
    text, _meta = load_text_with_meta(name)
    return text

def get_context(topic: Optional[str], query: str = "", personality_enabled_groups: Optional[List[int]] = None) -> str:
    """
    Ottiene il contesto per la chat usando il sistema RAG avanzato
    
    Args:
        topic: Topic rilevato (legacy, ora usiamo RAG)
        query: Query dell'utente per ricerca semantica
        personality_enabled_groups: Gruppi RAG abilitati per la personalità corrente
        
    Returns:
        Contesto formattato per l'LLM
    """
    # Prima prova a usare il nuovo sistema RAG
    rag_context = get_rag_context(query, personality_enabled_groups=personality_enabled_groups)
    if rag_context:
        return rag_context
    
    # Fallback al sistema legacy
    file_map = load_files_mapping()
    if topic and topic in file_map:
        try:
            return load_text(topic)
        except Exception:
            pass
    
    # fallback: concat breve di tutti i file (tagliato)
    parts = []
    for key in file_map:
        try:
            txt = load_text(key)
            parts.append(f"[{key}]\n" + txt[:2000])
        except Exception:
            continue
    return "\n\n".join(parts)[:6000]

def get_rag_context(query: str, session_id: str = "default", max_results: int = 5, personality_enabled_groups: Optional[List[int]] = None) -> str:
    """
    Ottiene contesto usando il sistema RAG avanzato
    
    Args:
        query: Query dell'utente
        session_id: ID sessione per ottenere contesto selezionato
        max_results: Numero massimo di risultati per gruppo
        personality_enabled_groups: Gruppi RAG abilitati per la personalità corrente
        
    Returns:
        Contesto formattato con citazioni ai file sorgente
    """
    try:
        # Ottieni gruppi selezionati dall'utente
        user_selected_groups = get_user_context(session_id)
        
        # Se la personalità ha gruppi specifici abilitati, usa quelli come filtro
        if personality_enabled_groups is not None:
            # Interseca i gruppi selezionati dall'utente con quelli abilitati per la personalità
            if user_selected_groups:
                selected_groups = [g for g in user_selected_groups if g in personality_enabled_groups]
            else:
                # Se l'utente non ha selezionato gruppi specifici, usa tutti quelli abilitati per la personalità
                selected_groups = personality_enabled_groups
        else:
            # Fallback al comportamento precedente
            selected_groups = user_selected_groups
        
        if not selected_groups:
            # Auto-selezione gruppi (fallback) se utente non ha scelto nulla
            try:
                all_groups = rag_engine.get_groups()
                # Prendi solo gruppi con almeno 1 documento
                auto_groups = [g['id'] for g in all_groups if g.get('document_count')]
                # Limita a massimo 5 gruppi per evitare contesto troppo grande
                selected_groups = auto_groups[:5]
                if selected_groups:
                    print(f"[RAG][auto-select] Nessun gruppo selezionato esplicitamente, uso fallback gruppi {selected_groups}")
                else:
                    return ""
            except Exception:
                return ""
        
        # Esegui ricerca RAG
        results = rag_engine.search(
            query=query,
            group_ids=selected_groups,
            top_k=max_results
        )
        if not results:
            print(f"[RAG] Nessun risultato per query='{query[:50]}' gruppi={selected_groups}")
        
        if not results:
            return ""
        
        # Formatta risultati per l'LLM
        context_parts = []
        seen_files = set()
        for i, result in enumerate(results[:max_results * 2]):  # Limita risultati totali
            filename = result.get("original_filename", result.get("filename", "documento"))
            content = result.get("content", "")
            score = result.get("similarity_score", 0.0)
            file_key = f"{filename}_{result.get('document_id')}"
            if file_key in seen_files:
                continue
            seen_files.add(file_key)
            context_parts.append(f"[Fonte: {filename} - Rilevanza: {score:.3f}]\n{content}\n")
        if context_parts:
            context = "\n".join(context_parts)
            header = f"[CONTESTO RAG - {len(context_parts)} documenti rilevanti trovati]\n\n"
            footer = "\n[ISTRUZIONI: Quando utilizzi informazioni da queste fonti, cita il nome del file usando il formato: [DOC nome_file.pdf] senza aggiungere link.]"
            assembled = header + context + footer
            print(f"[RAG] Contesto assemblato con {len(context_parts)} fonti, lunghezza={len(assembled)}")
            return assembled
        
    except Exception as e:
        print(f"Errore nel recupero contesto RAG: {e}")
        return ""
    
    return ""

def format_response_with_citations(response: str, search_results: List[Dict]) -> str:
    """
    Adatta eventuali citazioni della risposta al formato `[DOC nome_file]`.
    I dettagli completi delle fonti sono ora gestiti dal pannello delle fonti RAG.

    Args:
        response: Risposta dell'LLM
        search_results: Risultati della ricerca RAG (usati solo per verificare i nomi file)

    Returns:
        Risposta con citazioni normalizzate, senza appendere sezioni aggiuntive
    """
    if not search_results:
        return response

    import re

    known_filenames = {
        result.get("original_filename", result.get("filename", ""))
        for result in search_results
        if result.get("original_filename") or result.get("filename")
    }

    # Pattern per citazioni ereditate: [  filename]
    citation_pattern = r"\[ \s+([^\]]+)\]"

    def replace_citation(match) -> str:
        filename = match.group(1).strip()
        if filename and filename in known_filenames:
            return f"[DOC {filename}]"
        return match.group(0)

    return re.sub(citation_pattern, replace_citation, response)
