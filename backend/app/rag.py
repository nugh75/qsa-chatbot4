from pathlib import Path
import json
from typing import Optional, Dict, List
from functools import lru_cache

from .rag_engine import rag_engine
from .rag_routes import get_user_context

RAG_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "rag_data"
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

def load_text(name: str) -> str:
    file_map = load_files_mapping()
    fp = RAG_STORAGE_DIR / file_map[name]
    return fp.read_text(encoding="utf-8")

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
            footer = "\n[ISTRUZIONI: Quando usi informazioni da queste fonti, cita il nome del file usando il formato: [  nome_file.pdf](download_link) ]"
            assembled = header + context + footer
            print(f"[RAG] Contesto assemblato con {len(context_parts)} fonti, lunghezza={len(assembled)}")
            return assembled
        
    except Exception as e:
        print(f"Errore nel recupero contesto RAG: {e}")
        return ""
    
    return ""

def format_response_with_citations(response: str, search_results: List[Dict]) -> str:
    """
    Aggiunge link di download ai file citati nella risposta
    
    Args:
        response: Risposta dell'LLM
        search_results: Risultati della ricerca RAG
        
    Returns:
        Risposta con link ai file sorgente
    """
    if not search_results:
        return response
    
    # Mappa file citati
    file_links = {}
    for result in search_results:
        filename = result.get("original_filename", result.get("filename", ""))
        document_id = result.get("document_id")
        if filename and document_id:
            # Link placeholder - in futuro implementeremo download reale
            download_link = f"/api/rag/download/{document_id}"
            file_links[filename] = download_link
    
    # Cerca pattern di citazioni nel response e aggiungi link
    import re
    
    # Pattern per citazioni: [  filename]
    citation_pattern = r'\[ \s+([^\]]+)\]'
    
    def replace_citation(match):
        filename = match.group(1).strip()
        if filename in file_links:
            return f"[  {filename}]({file_links[filename]})"
        return match.group(0)  # Return original if no link found
    
    response_with_links = re.sub(citation_pattern, replace_citation, response)
    
    # Se non ci sono citazioni esplicite ma abbiamo risultati, aggiungi sezione fonti
    if citation_pattern not in response_with_links and file_links:
        sources_section = "\n\n**Fonti consultate:**\n"
        for filename, link in file_links.items():
            sources_section += f"- [{filename}]({link})\n"
        response_with_links += sources_section
    
    return response_with_links
