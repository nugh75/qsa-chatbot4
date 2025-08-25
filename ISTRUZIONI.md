# ISTRUZIONI

## 1) Requisiti
- Node.js >= 18
- Python 3.10/3.11
- (Opz.) Docker + Docker Compose

## 2) Variabili d'ambiente
Copia `backend/.env.example` in `backend/.env` e imposta le chiavi se vuoi usare provider reali:
```
GOOGLE_API_KEY=       # per Gemini
ANTHROPIC_API_KEY=    # per Claude
OPENAI_API_KEY=       # facoltativo, per GPT
ELEVENLABS_API_KEY=   # facoltativo TTS
```

Se le chiavi non sono presenti, il backend usa il provider `local` (regole semplici).

## 3) Avvio in sviluppo
- Avvia il **backend** su :8005 (vedi README).
- Avvia il **frontend** su :5175.

## 4) Come funziona la RAG
Il backend rileva il **topic** nel testo dell’utente e inserisce nel contesto il
contenuto del file corrispondente in `data/`:
- `analisi-di-secondo-livello.txt` → quando l’utente chiede sintesi/collegamenti tra fattori.
- `fattori-cognitivi.txt` → quando parla di C1–C7 o A1–A7 e di strategie.
- `essere-artchietto-di-sestessi.txt` → quando chiede di autonomia/essere artefice di sé.
- `domane-e-risposte.txt` → quando chiede FAQ o “domande e risposte”.

## 5) Prompt di sistema
Il backend carica `data/CLAUDE.md`. Modificalo per cambiare stile e flusso (Alex).

## 6) Endpoint utili
- `POST /api/chat` → chat principale (header opzionale `X-LLM-Provider: local|gemini|claude|openai`)
- `POST /api/tts/elevenlabs` → TTS (se `ELEVENLABS_API_KEY` presente)
- `POST /api/transcribe/whisper` → ASR (stub)

## 7) Build produzione
- Frontend: `npm run build` → output in `frontend/dist`
- Backend: esegui con Uvicorn/Gunicorn. In Docker: `docker compose up --build -d`

## 8) Note
- I file in `data/` sono caricati in memoria e taggati per topic; non serve DB.
- Per sostituire l’avatar: rimpiazza `frontend/public/volto.png`.
