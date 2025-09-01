# INSTRUCTIONS (English first / Italiano sotto)

## 1) Requirements / Requisiti
- Node.js >= 18
- Python 3.10/3.11
- (Optional / Opz.) Docker + Docker Compose

## 2) Environment Variables / Variabili d'Ambiente
Copy `backend/.env.example` to `backend/.env` and fill keys if you want real providers. / Copia `backend/.env.example` in `backend/.env` e imposta le chiavi.
```
GOOGLE_API_KEY=       # Gemini
ANTHROPIC_API_KEY=    # Claude
OPENAI_API_KEY=       # GPT (optional / facoltativo)
ELEVENLABS_API_KEY=   # TTS (optional / facoltativo)
```
If keys are absent the backend falls back to provider `local`. / Se mancano le chiavi usa `local`.

## 3) Development Start / Avvio Sviluppo
- Backend: `uvicorn app.main:app --host 0.0.0.0 --port 8005`
- Frontend: `npm run dev` (port 5175)

## 4) RAG Behavior / Funzionamento RAG
The backend detects a topic and injects matching file contents. / Il backend rileva il topic e inserisce il file corrispondente.
- `analisi-di-secondo-livello.txt` – synthesis / sintesi e collegamenti
- `fattori-cognitivi.txt` – factors C1–C7 / fattori C1–C7, A1–A7
- `essere-artchietto-di-sestessi.txt` – autonomy / autonomia
- `domane-e-risposte.txt` – FAQ

Recent additions / Aggiunte recenti:
- Per‑chunk metadata: `chunk_label`, `similarity`, `download_url` for original file.
- Unified `source_docs` object: { rag_chunks, pipeline_topics, rag_groups }.
- Document preview dialog aggregating chunk content via `doc://` links.
- Markdown normalization (line breaks, "Fonti consultate:" formatting).
- All emoji removed from UI (SVG icons only).

## 5) System Prompt / Prompt di Sistema
File: `data/CLAUDE.md` – edit to change counselor style. / Modifica per cambiare stile counselor.

## 6) Key Endpoints / Endpoint Utili
- `POST /api/chat` (header `X-LLM-Provider: local|gemini|claude|openai|openrouter|ollama`)
- `POST /api/chat/stream` (SSE-like streaming)
- `POST /api/tts/elevenlabs`
- `POST /api/transcribe/whisper`
- `GET /api/rag/download/{document_id}` (new file download)

## 7) Production Build / Build Produzione
- Frontend: `npm run build` → `frontend/dist`
- Backend: Uvicorn/Gunicorn. Docker: `docker compose up --build -d`

## 8) Notes / Note
- Files in `data/` are memory-loaded & topic tagged. / I file in `data/` sono caricati in memoria.
- Replace avatar: `frontend/public/volto.png`.
- RAG original files stored under `backend/storage/pipeline_files` with generated names; download via endpoint.

## 9) Testing / Test
Quick flow: run backend then execute `python3 test_chat_save.py` to validate auth + chat persistence. / Avvia backend poi `python3 test_chat_save.py`.

---

## (IT) Sezione Italiana Completa
Le sezioni sopra contengono già la traduzione essenziale. Questo documento mantiene formato bilingue per facilitare contributi internazionali.
