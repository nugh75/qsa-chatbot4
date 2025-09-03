import os, httpx, json, re, traceback
from typing import List, Dict, Tuple, Optional, Any, Callable

###############################
# Constants & Helpers
###############################

DEFAULT_MODELS: Dict[str, str] = {
    "openrouter": "anthropic/claude-3.5-sonnet",
    "openai": "gpt-4o-mini",
    "gemini": "gemini-1.5-pro",
    "ollama": "llama3.1:8b",
    "claude": "claude-3-5-sonnet-20241022",
}

PROVIDER_TIMEOUTS: Dict[str, int] = {
    "openrouter": 60,
    "openai": 60,
    "gemini": 60,
    "claude": 60,
    "ollama": int(os.getenv("OLLAMA_TIMEOUT", "120")),
}

VERBOSE = os.getenv("LLM_VERBOSE", "1").lower() in ("1","true","yes","on")

def debug_log(*args, provider: Optional[str] = None):  # lightweight wrapper
    if VERBOSE:
        if provider:
            print(f"[LLM][{provider}]", *args)
        else:
            print("[LLM]", *args)

def estimate_tokens(text: str) -> int:
    """Stima semplice del numero di token (fallback se tiktoken non disponibile)."""
    try:
        import tiktoken  # type: ignore
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        # fallback euristico ~ 4 chars per token
        return max(1, len(text) // 4)

def count_messages_tokens(messages: List[Dict]) -> Tuple[int, List[int]]:
    per_msg = []
    total = 0
    for m in messages:
        c = estimate_tokens(m.get("content", ""))
        per_msg.append(c)
        total += c
    return total, per_msg

def _extract_scores(text: str) -> List[int]:
    """Estrae i punteggi numerici dal testo dell'utente"""
    # Cerca numeri separati da virgole, spazi o altri delimitatori
    numbers = re.findall(r'\b\d+\b', text)
    return [int(n) for n in numbers if 0 <= int(n) <= 10]

def _analyze_cognitive_factors(scores: List[int]) -> str:
    """Analizza i fattori cognitivi C1-C7"""
    if len(scores) < 7:
        return "Per analizzare i fattori cognitivi ho bisogno di tutti e 7 i punteggi (C1-C7). Puoi condividerli?"
    
    c1, c2, c3, c4, c5, c6, c7 = scores[:7]
    analysis = f"Perfetto Daniele! Analizziamo i tuoi fattori cognitivi:\n\n"
    
    # C1 - Strategie elaborative
    if c1 <= 4:
        analysis += f"**C1 - Strategie elaborative ({c1}/10)**: Punteggio basso. Potresti migliorare nel collegare nuovi concetti con le tue esperienze e conoscenze precedenti.\n\n"
    else:
        analysis += f"**C1 - Strategie elaborative ({c1}/10)**: Buon punteggio! Sai collegare efficacemente i nuovi concetti.\n\n"
    
    # C2 - Autoregolazione
    if c2 <= 4:
        analysis += f"**C2 - Autoregolazione ({c2}/10)**: Area di miglioramento. Pianificare e organizzare lo studio potrebbe aiutarti molto.\n\n"
    else:
        analysis += f"**C2 - Autoregolazione ({c2}/10)**: Ottimo! Gestisci bene i tuoi processi di apprendimento.\n\n"
    
    # C3 - Disorientamento (punteggio alto = problema)
    if c3 >= 6:
        analysis += f"**C3 - Disorientamento ({c3}/10)**: Punteggio alto indica difficoltà nell'orientarsi nei compiti. Può essere utile lavorare sull'organizzazione.\n\n"
    else:
        analysis += f"**C3 - Disorientamento ({c3}/10)**: Bene! Ti orienti abbastanza facilmente nei compiti di studio.\n\n"
    
    return analysis + "Vuoi che continui con gli altri fattori cognitivi (C4-C7)?"

def _analyze_affective_factors(scores: List[int]) -> str:
    """Analizza i fattori affettivo-motivazionali A1-A7"""
    if len(scores) < 14:
        return "Per l'analisi completa ho bisogno anche dei fattori affettivo-motivazionali (A1-A7)."
    
    a_scores = scores[7:14]
    a1, a2, a3, a4, a5, a6, a7 = a_scores
    
    analysis = "Ora analizziamo i fattori affettivo-motivazionali:\n\n"
    
    # A1 - Ansietà (alto = problema)
    if a1 >= 6:
        analysis += f"**A1 - Ansietà di base ({a1}/10)**: Livello alto di ansietà. Tecniche di rilassamento potrebbero essere utili.\n\n"
    else:
        analysis += f"**A1 - Ansietà di base ({a1}/10)**: Gestisci bene l'ansia nelle situazioni di valutazione.\n\n"
    
    return analysis

async def _local_reply(messages: List[Dict], context_hint: str) -> str:
    user_text = next((m['content'] for m in reversed(messages) if m['role']=='user'), '')
    
    # Estrai il nome se fornito
    name_match = re.search(r'mi chiamo (\w+)', user_text.lower())
    name = name_match.group(1).title() if name_match else ""
    
    # Cerca punteggi numerici
    scores = _extract_scores(user_text)
    
    # Se è il primo messaggio o un saluto
    if any(word in user_text.lower() for word in ['ciao', 'salve', 'buongiorno', 'buonasera']):
        if name:
            return f"Ciao {name}! Sono Counselorbot, il tuo compagno di apprendimento! 🎓\n\nSono qui per aiutarti ad analizzare i tuoi risultati del QSA. Come è andata la compilazione? Hai qualche impressione generale da condividere?"
        else:
            return "Ciao! Sono Counselorbot, il tuo compagno di apprendimento! 🎓\n\nSono qui per aiutarti ad analizzare i tuoi risultati del QSA. Come è andata la compilazione? Hai qualche impressione generale da condividere?"
    
    # Se ci sono punteggi da analizzare
    if scores:
        if len(scores) >= 7:
            # Analizza i fattori cognitivi
            if len(scores) == 13 or len(scores) == 14:  # Tutti i punteggi
                cognitive_analysis = _analyze_cognitive_factors(scores)
                return cognitive_analysis
            else:
                # Solo primi 7 (cognitivi)
                return _analyze_cognitive_factors(scores)
        else:
            return f"Vedo che hai condiviso alcuni numeri ({', '.join(map(str, scores))}). Per un'analisi completa dei fattori cognitivi ho bisogno di tutti e 7 i punteggi C1-C7. Puoi condividerli in ordine?"
    
    # Se menziona nome
    if name and name not in [msg.get('content', '') for msg in messages[:-1]]:
        return f"Piacere di conoscerti, {name}! Ora raccontami, come è andata con il QSA? Quali sono state le tue impressioni durante la compilazione?"
    
    # Risposta generica di default
    if 'impressioni' in user_text.lower() or 'impressione' in user_text.lower():
        return "Ottimo! Mi piacerebbe sentire di più. Cosa ti ha colpito di più durante la compilazione? E quando hai visto i risultati, c'è stato qualcosa che ti ha sorpreso? \n\nQuando sei pronto, puoi condividere i punteggi dei fattori cognitivi (C1-C7)."
    
    return "Che interessante! Per aiutarti al meglio, mi piacerebbe conoscere prima la tua impressione generale sul QSA. Poi, se vuoi, possiamo analizzare insieme i tuoi punteggi dei fattori cognitivi (C1–C7) e successivamente quelli affettivo-motivazionali (A1–A7)."

async def _summary_fallback_reply(messages: List[Dict], context_hint: str = "") -> str:
    """Fallback function specifically for summary generation when providers fail."""
    # Count messages to provide basic statistics
    user_messages = [m for m in messages if m.get('role') == 'user']
    assistant_messages = [m for m in messages if m.get('role') == 'assistant']
    
    total_messages = len(messages)
    user_count = len(user_messages)
    assistant_count = len(assistant_messages)
    
    # Extract conversation topics from user messages
    topics = []
    for msg in user_messages:
        content = msg.get('content', '').lower()
        if 'qsa' in content or 'questionario' in content:
            topics.append('QSA')
        if 'puntegg' in content or 'score' in content:
            topics.append('punteggi')
        if 'analisi' in content or 'analysis' in content:
            topics.append('analisi')
        if 'impression' in content or 'sentir' in content:
            topics.append('impressioni')
    
    topics = list(set(topics))  # Remove duplicates
    
    # Generate a basic summary based on available information
    summary_parts = []
    
    if topics:
        summary_parts.append(f"Questa conversazione riguarda principalmente: {', '.join(topics)}.")
    
    summary_parts.append(f"La conversazione è composta da {total_messages} messaggi totali:")
    summary_parts.append(f"- {user_count} messaggi dell'utente")
    summary_parts.append(f"- {assistant_count} messaggi del sistema")
    
    # Add context about the time period if available
    if messages:
        first_msg = messages[0]
        last_msg = messages[-1]
        if 'timestamp' in first_msg and 'timestamp' in last_msg:
            summary_parts.append(f"Periodo della conversazione: dal {first_msg['timestamp']} al {last_msg['timestamp']}")
    
    summary_parts.append("\nNota: Questo è un riassunto di fallback generato perché il provider AI principale non è riuscito a elaborare la richiesta. Si consiglia di verificare la configurazione del provider o riprovare più tardi.")
    
    return "\n".join(summary_parts)

async def chat_with_provider(messages: List[Dict], provider: str = "local", context_hint: str = "", model: Optional[str] = None, temperature: float = 0.3, is_summary_request: bool = False, ollama_base_url: Optional[str] = None) -> str:
    provider = (provider or 'local').lower()
    strict = os.getenv('STRICT_PROVIDER', '0').lower() in ('1','true','yes','on')
    debug_log(f"Provider selezionato: {provider} (strict={strict})")

    if provider == 'local':  # early exit micro-optimization
        return await (_summary_fallback_reply(messages, context_hint) if is_summary_request else _local_reply(messages, context_hint))

    available_providers = _get_available_providers()
    debug_log(f"Provider disponibili: {available_providers}")
    if provider not in available_providers:
        # Runtime autodetect specifically for ollama if enabled in config or reachable
        if provider == 'ollama':
            try:
                base_url = os.getenv('OLLAMA_BASE_URL')
                if not base_url:
                    # fallback config lookup (safe import)
                    try:
                        from .admin import load_config as _lc  # type: ignore
                        _cfg = _lc()
                        base_url = _cfg.get('ai_providers', {}).get('ollama', {}).get('base_url')
                    except Exception:
                        base_url = None
                base_url = base_url or 'http://localhost:11434'
                test_url = f"{base_url.rstrip('/')}/api/tags"
                async def _probe(url: str) -> bool:
                    try:
                        async with httpx.AsyncClient(timeout=float(os.getenv('OLLAMA_AUTODETECT_TIMEOUT','1.5'))) as cx:
                            r = await cx.get(url)
                            return r.status_code == 200
                    except Exception:
                        return False
                if os.getenv('DISABLE_OLLAMA_RUNTIME_PROBE','0').lower() not in ('1','true','yes','on'):
                    if await _probe(test_url):
                        available_providers = available_providers + ['ollama']
                        debug_log(f"Rilevato runtime ollama su {base_url}, aggiunto ai provider disponibili")
                if provider not in available_providers:
                    debug_log(f"Provider {provider} non disponibile dopo probe, uso {available_providers[0]}")
                    provider = available_providers[0]
            except Exception as _e:
                debug_log(f"Probe ollama fallito: {_e}")
                debug_log(f"Provider {provider} non disponibile, uso {available_providers[0]}")
                provider = available_providers[0]
        else:
            debug_log(f"Provider {provider} non disponibile, uso {available_providers[0]}")
            provider = available_providers[0]

    # Load config models
    provider_models: Dict[str, Optional[str]] = {}
    try:
        from .admin import load_config  # type: ignore
        cfg = load_config()
        ai_cfg = cfg.get("ai_providers", {})
        for p, pdata in ai_cfg.items():
            if isinstance(pdata, dict):
                provider_models[p] = pdata.get("selected_model") or None
    except Exception as e:
        debug_log(f"Impossibile leggere modelli da config: {e}")

    def resolve_model(p: str) -> Optional[str]:
        if model and p == provider:
            return model
        if provider_models.get(p):
            return provider_models[p]
        return DEFAULT_MODELS.get(p)

    providers_to_try = [provider] if strict else [provider] + _get_fallback_providers(provider, available_providers)
    debug_log(f"Ordine tentativi: {providers_to_try}")

    errors: Dict[str, str] = {}

    # Provider adapter registry
    async def adapter_openrouter(p_model: str) -> Optional[str]:
        api_key = os.getenv("OPENROUTER_API_KEY")
        debug_log(f"OPENROUTER_API_KEY presente: {'Sì' if api_key else 'No'}", provider='openrouter')
        if not api_key:
            errors['openrouter'] = 'missing api key'
            return None
        payload = {
            "model": p_model or DEFAULT_MODELS['openrouter'],
            "messages": [{"role": m['role'], "content": m['content']} for m in messages],
            "temperature": float(temperature),
            "max_tokens": 2500
        }
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUTS['openrouter']) as cx:
            r = await cx.post("https://openrouter.ai/api/v1/chat/completions",
                               headers={
                                   "Authorization": f"Bearer {api_key}",
                                   "HTTP-Referer": "https://qsa-chatbot.local",
                                   "X-Title": "QSA Chatbot"
                               }, json=payload)
        if not r.is_success:
            errors['openrouter'] = f"http {r.status_code} {r.text[:120]}"
            return None
        data = r.json()
        choice = (data.get('choices') or [None])[0]
        if not choice or 'message' not in choice:
            errors['openrouter'] = 'no_message_field'
            return None
        content = choice['message'].get('content', '')
        if not content or not content.strip():
            errors['openrouter'] = 'empty_content'
            return None
        return content

    async def adapter_openai(p_model: str) -> Optional[str]:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            errors['openai'] = 'missing api key'
            return None
        openai_messages = _prepare_messages_for_provider(messages, 'openai')
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUTS['openai']) as cx:
            r = await cx.post("https://api.openai.com/v1/chat/completions",
                               headers={"Authorization": f"Bearer {api_key}"},
                               json={
                                   "model": p_model or DEFAULT_MODELS['openai'],
                                   "messages": openai_messages,
                                   "temperature": float(temperature)
                               })
        if not r.is_success:
            errors['openai'] = f"http {r.status_code} {r.text[:120]}"
            return None
        data = r.json()
        content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        if not content or not content.strip():
            errors['openai'] = 'empty_content'
            return None
        return content

    async def adapter_claude(p_model: str) -> Optional[str]:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            errors['claude'] = 'missing api key'
            return None
        claude_messages = _prepare_messages_for_provider(messages, 'claude')
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUTS['claude']) as cx:
            r = await cx.post("https://api.anthropic.com/v1/messages",
                               headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                               json={
                                   "model": p_model or DEFAULT_MODELS['claude'],
                                   "max_tokens": 2500,
                                   "messages": claude_messages,
                                   "temperature": temperature
                               })
        if not r.is_success:
            errors['claude'] = f"http {r.status_code} {r.text[:120]}"
            return None
        try:
            return r.json()['content'][0]['text']
        except Exception:
            errors['claude'] = 'parse_error'
            return None

    async def adapter_gemini(p_model: str) -> Optional[str]:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            errors['gemini'] = 'missing api key'
            return None
        combined_prompt = "\n\n".join([f"{m['role'].upper()}: {m['content']}" for m in messages])
        payload = {"contents": [{"parts": [{"text": combined_prompt}]}], "generationConfig": {"temperature": temperature}}
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUTS['gemini']) as cx:
            r = await cx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{p_model or DEFAULT_MODELS['gemini']}:generateContent",
                               params={"key": api_key}, json=payload)
        if not r.is_success:
            errors['gemini'] = f"http {r.status_code} {r.text[:120]}"
            return None
        data = r.json()
        try:
            return data['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            errors['gemini'] = 'parse_error'
            return None

    async def adapter_ollama(p_model: str) -> Optional[str]:
        # base url precedence: explicit param -> env -> config -> default
        base_url_env = ollama_base_url or os.getenv("OLLAMA_BASE_URL")
        base_url_cfg = None
        try:
            from .admin import load_config as _load_cfg  # type: ignore
            _cfg_tmp = _load_cfg()
            base_url_cfg = _cfg_tmp.get('ai_providers', {}).get('ollama', {}).get('base_url') if isinstance(_cfg_tmp, dict) else None
        except Exception:
            base_url_cfg = None
        base_url = base_url_env or base_url_cfg or "http://localhost:11434"
        model_name = p_model or os.getenv("OLLAMA_MODEL") or DEFAULT_MODELS['ollama']
        async with httpx.AsyncClient(timeout=PROVIDER_TIMEOUTS['ollama']) as cx:
            r = await cx.post(f"{base_url}/api/chat", json={
                "model": model_name,
                "messages": [{"role": m['role'], "content": m['content']} for m in messages],
                "stream": False,
                "options": {"temperature": float(temperature), "top_p": 0.9}
            })
        if not r.is_success:
            msg = f"http {r.status_code}"
            if r.status_code == 404 and 'model' in r.text.lower():
                msg += ' missing_model'
            errors['ollama'] = msg
            return None
        data = r.json()
        out = data.get('message', {}).get('content', '')
        if not out or not out.strip():
            errors['ollama'] = 'empty_content'
            return None
        return out

    adapter_map: Dict[str, Callable[[Optional[str]], Any]] = {
        'openrouter': adapter_openrouter,
        'openai': adapter_openai,
        'claude': adapter_claude,
        'gemini': adapter_gemini,
        'ollama': adapter_ollama,
    }

    for attempt in providers_to_try:
        debug_log(f"Tentativo con provider: {attempt}", provider=attempt)
        attempt_model = resolve_model(attempt)
        if attempt_model:
            debug_log(f"Modello scelto: {attempt_model}", provider=attempt)
        if attempt == 'local':
            return await (_summary_fallback_reply(messages, context_hint) if is_summary_request else _local_reply(messages, context_hint))
        adapter = adapter_map.get(attempt)
        if not adapter:
            continue
        try:
            result = await adapter(attempt_model or DEFAULT_MODELS.get(attempt, ''))
            if result:
                return result
        except Exception as e:
            errors[attempt] = f"exception {type(e).__name__}: {e}"[:180]
            debug_log(f"Errore {e}\n{traceback.format_exc()}", provider=attempt)
            continue

    debug_log(f"Tutti i provider hanno fallito: {errors}")
    return await (_summary_fallback_reply(messages, context_hint) if is_summary_request else _local_reply(messages, context_hint))

def _prepare_messages_for_provider(messages: List[Dict], target: str) -> List[Dict]:
    """Normalize messages structure for provider target (supports images)."""
    prepared: List[Dict] = []
    for m in messages:
        if target == 'openai':
            if isinstance(m.get('content'), str) and 'images' not in m:
                prepared.append({"role": m['role'], "content": m['content']})
            elif 'images' in m:
                parts = [{"type": "text", "text": m['content']}] if isinstance(m.get('content'), str) else []
                for img in m['images']:
                    parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/{img.get('type','jpeg')};base64,{img['data']}"}
                    })
                prepared.append({"role": m['role'], "content": parts})
            else:
                prepared.append({"role": m['role'], "content": m.get('content','')})
        elif target == 'claude':
            if isinstance(m.get('content'), str) and 'images' not in m:
                prepared.append({"role": m['role'], "content": m['content']})
            elif 'images' in m:
                parts = [{"type": "text", "text": m['content']}] if isinstance(m.get('content'), str) else []
                for img in m['images']:
                    parts.append({
                        "type": "image",
                        "source": {"type": "base64", "media_type": f"image/{img.get('type','jpeg')}", "data": img['data']}
                    })
                prepared.append({"role": m['role'], "content": parts})
            else:
                prepared.append({"role": m['role'], "content": m.get('content','')})
        else:
            prepared.append({"role": m['role'], "content": m.get('content','')})
    return prepared

def _get_available_providers() -> List[str]:
    """Restituisce la lista dei provider disponibili e abilitati, ordinati per priorità di fallback."""
    try:
        from .admin import load_config
        config = load_config()
        ai_providers = config.get("ai_providers", {})
        
        # Lista dei provider in ordine di priorità per fallback
        priority_order = ["openrouter", "claude", "openai", "gemini", "ollama", "local"]
        available_providers = []
        debug = bool(os.getenv("DEBUG_PROVIDER_DISCOVERY"))
        debug_rows = []
        
        allow_autodetect = os.getenv("ALLOW_OLLAMA_AUTODETECT", "0").lower() in ("1","true","yes","on")
        autodetect_timeout = float(os.getenv("OLLAMA_AUTODETECT_TIMEOUT", "1.5"))
        requested_provider = os.getenv('FORCE_PROVIDER')
        for provider in priority_order:
            provider_config = ai_providers.get(provider, {})
            enabled_flag = provider_config.get("enabled", False)
            status_note = ''
            reason = ''
            has_credentials = False
            if enabled_flag:
                if provider == "local":
                    has_credentials = True
                elif provider == "gemini":
                    has_credentials = bool(os.getenv("GOOGLE_API_KEY"))
                    if not has_credentials:
                        reason = 'missing GOOGLE_API_KEY'
                elif provider == "claude":
                    has_credentials = bool(os.getenv("ANTHROPIC_API_KEY"))
                    if not has_credentials:
                        reason = 'missing ANTHROPIC_API_KEY'
                elif provider == "openai":
                    has_credentials = bool(os.getenv("OPENAI_API_KEY"))
                    if not has_credentials:
                        reason = 'missing OPENAI_API_KEY'
                elif provider == "openrouter":
                    has_credentials = bool(os.getenv("OPENROUTER_API_KEY"))
                    if not has_credentials:
                        reason = 'missing OPENROUTER_API_KEY'
                elif provider == "ollama":
                    # Nessuna credenziale richiesta: consideriamo sempre valido se enabled
                    has_credentials = True
                if has_credentials:
                    available_providers.append(provider)
                    if debug:
                        debug_rows.append((provider, 'ENABLED', 'OK'))
                else:
                    if debug:
                        debug_rows.append((provider, 'ENABLED', reason or 'MISSING'))
            else:
                # Provider disabilitato
                if provider == 'ollama' and allow_autodetect:
                    try:
                        import httpx
                        base_url = provider_config.get('base_url') or os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
                        url = f"{base_url.rstrip('/')}/api/tags"
                        with httpx.Client(timeout=autodetect_timeout) as cx:
                            r = cx.get(url)
                            if r.status_code == 200:
                                available_providers.append('ollama')
                                if debug:
                                    debug_rows.append(('ollama', 'AUTO', 'reachable'))
                                continue
                            else:
                                if debug:
                                    debug_rows.append(('ollama', 'DISABLED', f'http {r.status_code}'))
                    except Exception:  # pragma: no cover
                        if debug:
                            debug_rows.append(('ollama', 'DISABLED', 'err'))
                else:
                    if debug:
                        debug_rows.append((provider, 'DISABLED', '-'))
        
        # Forza inclusione provider richiesto se definito e conosciuto
        if requested_provider and requested_provider.lower() not in available_providers:
            if requested_provider.lower() in priority_order:
                available_providers.append(requested_provider.lower())
                if debug:
                    debug_rows.append((requested_provider.lower(), 'FORCED', 'env_FORCE_PROVIDER'))

        # Se nessun provider è disponibile, almeno local
        if not available_providers:
            available_providers = ["local"]
            if debug:
                debug_rows.append(("local", 'FORCED', 'fallback'))

        if debug or os.getenv('FORCE_PROVIDER_DISCOVERY_LOG','0').lower() in ('1','true','yes','on'):
            print("[PROVIDERS] Discovery table:")
            for row in debug_rows:
                # row = (name, status, note)
                print(f"  - {row[0]:10s} status={row[1]:9s} note={row[2]}")
            
        return available_providers
        
    except Exception as e:
        print(f"Errore nel caricamento dei provider disponibili: {e}")
        return ["local"]

def _get_fallback_providers(current_provider: str, available_providers: List[str]) -> List[str]:
    """Restituisce la lista dei provider di fallback escludendo quello corrente."""
    return [p for p in available_providers if p != current_provider]

def compute_token_stats(messages: List[Dict], reply: str) -> Dict:
    in_total, per_msg = count_messages_tokens(messages)
    out_tokens = estimate_tokens(reply)
    return {
        "input_tokens": in_total,
        "per_message": per_msg,
        "output_tokens": out_tokens,
        "total": in_total + out_tokens
    }
