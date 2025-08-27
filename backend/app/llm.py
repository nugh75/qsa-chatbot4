import os, httpx, json, re
from typing import List, Dict, Tuple

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

async def chat_with_provider(messages: List[Dict], provider: str = "local", context_hint: str = "") -> str:
    provider = (provider or 'local').lower()
    print(f"🤖 Provider selezionato: {provider}")
    
    if provider == "local":
        return await _local_reply(messages, context_hint)

    # Gemini (testo‑solo)
    if provider == "gemini":
        api_key = os.getenv("GOOGLE_API_KEY")
        print(f"🔑 GOOGLE_API_KEY presente: {'Sì' if api_key else 'No'}")
        
        if not api_key:
            print("⚠️ GOOGLE_API_KEY non trovata, fallback a local")
            return await _local_reply(messages, context_hint)
        
        try:
            # Combina tutti i messaggi in un singolo prompt per Gemini
            combined_prompt = "\n\n".join([f"{m['role'].upper()}: {m['content']}" for m in messages])
            payload = {"contents":[{"parts":[{"text": combined_prompt}]}]}
            
            print(f"📤 Chiamata a Gemini con payload: {len(combined_prompt)} caratteri")
            
            async with httpx.AsyncClient(timeout=60) as cx:
                r = await cx.post(
                  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
                  params={"key": api_key}, json=payload)
            
            print(f"📥 Risposta Gemini: Status {r.status_code}")
            
            if not r.is_success:
                print(f"❌ Errore Gemini: {r.status_code} - {r.text}")
                return await _local_reply(messages, context_hint)
            
            data = r.json()
            print(f"✅ Gemini risposta ricevuta")
            return data["candidates"][0]["content"]["parts"][0]["text"]
            
        except Exception as e:
            print(f"💥 Errore Gemini: {e}")
            return await _local_reply(messages, context_hint)

    # Claude
    if provider == "claude" and os.getenv("ANTHROPIC_API_KEY"):
        # Prepara i messaggi per Claude, supportando immagini
        claude_messages = []
        for m in messages:
            if isinstance(m.get("content"), str):
                # Messaggio di solo testo
                claude_messages.append({"role": m["role"], "content": m["content"]})
            elif "images" in m:
                # Messaggio con immagini
                content_parts = [{"type": "text", "text": m["content"]}]
                for img in m["images"]:
                    content_parts.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": f"image/{img.get('type', 'jpeg')}",
                            "data": img["data"]
                        }
                    })
                claude_messages.append({"role": m["role"], "content": content_parts})
            else:
                claude_messages.append({"role": m["role"], "content": m["content"]})
        
        async with httpx.AsyncClient(timeout=60) as cx:
            r = await cx.post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version":"2023-06-01"},
                json={"model":"claude-3-5-sonnet-20241022",
                      "max_tokens":2500,  # Aumentato da 800 per risposte più dettagliate
                      "messages": claude_messages})
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    # OpenAI (facoltativo)
    if provider == "openai" and os.getenv("OPENAI_API_KEY"):
        # Prepara i messaggi per OpenAI, supportando immagini
        openai_messages = []
        for m in messages:
            if isinstance(m.get("content"), str):
                # Messaggio di solo testo
                openai_messages.append({"role": m["role"], "content": m["content"]})
            elif "images" in m:
                # Messaggio con immagini (formato OpenAI)
                content_parts = [{"type": "text", "text": m["content"]}]
                for img in m["images"]:
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{img.get('type', 'jpeg')};base64,{img['data']}"
                        }
                    })
                openai_messages.append({"role": m["role"], "content": content_parts})
            else:
                openai_messages.append({"role": m["role"], "content": m["content"]})
        
        async with httpx.AsyncClient(timeout=60) as cx:
            r = await cx.post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                json={"model":"gpt-4o-mini",
                      "messages": openai_messages,
                      "temperature":0.3})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    # OpenRouter (supporta molti modelli)
    if provider == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY")
        print(f"🔑 OPENROUTER_API_KEY presente: {'Sì' if api_key else 'No'}")
        
        if not api_key:
            print("⚠️ OPENROUTER_API_KEY non trovata, fallback a local")
            return await _local_reply(messages, context_hint)
        
        try:
            print(f"📤 Chiamata a OpenRouter")
            
            async with httpx.AsyncClient(timeout=60) as cx:
                r = await cx.post("https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "https://qsa-chatbot.local",  # Per analytics
                        "X-Title": "QSA Chatbot"  # Nome app per analytics
                    },
                    json={
                        "model": "anthropic/claude-3.5-sonnet",  # Modello di default
                        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
                        "temperature": 0.3,
                        "max_tokens": 2500  # Aumentato da 800 per risposte più dettagliate
                    })
            
            print(f"📥 Risposta OpenRouter: Status {r.status_code}")
            
            if not r.is_success:
                print(f"❌ Errore OpenRouter: {r.status_code} - {r.text}")
                return await _local_reply(messages, context_hint)
            
            data = r.json()
            print(f"✅ OpenRouter risposta ricevuta")
            return data["choices"][0]["message"]["content"]
            
        except Exception as e:
            print(f"💥 Errore OpenRouter: {e}")
            return await _local_reply(messages, context_hint)

    # Ollama (modelli locali)
    if provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        print(f"🦙 Ollama URL: {base_url}")

        # Risolvi modello dinamicamente: 1) variabile d'ambiente OLLAMA_MODEL 2) admin_config selected_model 3) fallback hardcoded
        model_name = os.getenv("OLLAMA_MODEL")
        if not model_name:
            try:
                # Importa pigramente per evitare dipendenza circolare
                from .admin import load_config  # type: ignore
                cfg = load_config()
                model_name = cfg.get("ai_providers", {}).get("ollama", {}).get("selected_model") or "llama3.1:8b"
            except Exception as e:  # pragma: no cover - robustezza
                print(f"⚠️ Impossibile leggere admin_config per modello Ollama: {e}")
                model_name = "llama3.1:8b"

        print(f"🦙 Modello Ollama scelto: {model_name}")

        try:
            print(f"📤 Chiamata a Ollama")

            async with httpx.AsyncClient(timeout=120) as cx:  # Timeout più alto per modelli locali
                r = await cx.post(f"{base_url}/api/chat",
                    json={
                        "model": model_name,
                        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
                        "stream": False,
                        "options": {
                            "temperature": 0.3,
                            "top_p": 0.9,
                        }
                    })

            print(f"📥 Risposta Ollama: Status {r.status_code}")

            if not r.is_success:
                print(f"❌ Errore Ollama: {r.status_code} - {r.text}")
                # Se il modello non esiste, suggerisci il pull
                if r.status_code == 404 and 'model' in r.text.lower():
                    print(f"💡 Suggerimento: esegui 'ollama pull {model_name}' sul server dove gira Ollama")
                return await _local_reply(messages, context_hint)

            data = r.json()
            print(f"✅ Ollama risposta ricevuta")
            return data["message"]["content"]

        except Exception as e:
            print(f"💥 Errore Ollama: {e}")
            print("💡 Assicurati che Ollama sia in esecuzione: ollama serve")
            return await _local_reply(messages, context_hint)

    # fallback
    return await _local_reply(messages, context_hint)

def compute_token_stats(messages: List[Dict], reply: str) -> Dict:
    in_total, per_msg = count_messages_tokens(messages)
    out_tokens = estimate_tokens(reply)
    return {
        "input_tokens": in_total,
        "per_message": per_msg,
        "output_tokens": out_tokens,
        "total": in_total + out_tokens
    }
