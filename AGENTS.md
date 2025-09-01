# Repository Guidelines

## Recent Updates / Aggiornamenti Recenti (2025-09-01)

### EN
This repository now includes the following improvements:
1. RAG Source Downloads: Each retrieved document chunk now carries `document_id`, `stored_filename`, `original_filename`, and a direct `download_url` served by the backend. The chat UI shows a clickable filename; no emoji icons are used anymore.
2. Chunk Labels: Retrieval adds a human readable `chunk_label` (e.g. `p3-c5`) exposed through the unified `source_docs.rag_chunks` array so the UI can display which chunks contributed to an answer.
3. Unified Source Metadata: Chat (sync + streaming) responses embed a single `source_docs` object with `rag_chunks`, `pipeline_topics`, and `rag_groups`. Legacy per-field arrays were removed.
4. Markdown Normalization: Added preprocessing to unescape literal `\n`, enforce paragraph separation before the "Fonti consultate:" section, collapse excess blank lines, and support soft line breaks via `remark-breaks`.
5. Document Link Injection: Bare references like `[DOC filename]` are auto-linked (scheme `doc://`) and can be previewed in a dialog aggregating all related chunks.
6. Emoji Removal in UI: All decorative emojis were removed from the frontend source; only SVG / MUI icons remain per design guideline.

Contributors updating RAG or chat logic should extend the `source_docs` contract rather than adding parallel fields. When adding new per-chunk metadata, ensure both streaming and non-stream endpoints map it through.

### IT
Sono state introdotte le seguenti migliorie:
1. Download delle Fonti RAG: Ogni chunk recuperato espone ora `document_id`, `stored_filename`, `original_filename` e un `download_url` diretto. L'interfaccia chat mostra il nome file cliccabile; nessuna emoji viene più usata.
2. Etichette Chunk: Il retrieval aggiunge una etichetta leggibile (`chunk_label`, es. `p3-c5`) esposta in `source_docs.rag_chunks` per mostrare quali parti hanno contribuito alla risposta.
3. Metadati Unificati: Le risposte della chat (sincrone e streaming) includono un unico oggetto `source_docs` con `rag_chunks`, `pipeline_topics`, `rag_groups`. I vecchi array separati sono stati rimossi.
4. Normalizzazione Markdown: Preprocessing per de-escapare `\n`, forzare la separazione di paragrafo prima di "Fonti consultate:", comprimere righe vuote multiple e supportare soft line break via `remark-breaks`.
5. Iniezione Link Documenti: Riferimenti semplici come `[DOC nomefile]` diventano link (schema `doc://`) con anteprima aggregata dei chunk correlati.
6. Rimozione Emoji nella UI: Tutte le emoji ornamentali sono state rimosse dal frontend; restano solo icone SVG / MUI come da linea guida.

Per estendere la logica RAG o chat, aggiornare il contratto di `source_docs` invece di creare nuovi campi paralleli. Aggiungendo nuovi metadati per chunk, assicurarsi di propagarli sia negli endpoint streaming sia non-stream.

## Project Structure & Module Organization
- Backend: `backend/app` (FastAPI routers like `chat.py`, `rag_routes.py`, `auth_routes.py`), config in `backend/config`, data/models in `backend/{data,models}`, persistent files in `backend/storage`.
- Frontend: `frontend/src` (React + Vite), static assets in `frontend/public`, build output in `frontend/dist`.
- Orchestration: `docker-compose.yml`, helper scripts `start.sh` / `stop.sh`.
- Tests/Tools: ad‑hoc script `test_chat_save.py` for API + DB flow.

## Build, Test, and Development Commands
- Backend (local):
  - Create venv and install: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
  - Run API: `uvicorn app.main:app --host 0.0.0.0 --port 8005`
- Frontend (local):
  - Install deps: `cd frontend && npm install`
  - Dev server: `npm run dev` (defaults to port 5175)
- Docker (both): `docker-compose up --build`
- Convenience: from repo root, `./start.sh` (starts both) and `./stop.sh`.
 - Models: `make models` to prefetch Whisper/Piper/embeddings locally. Docker image pre-downloads defaults during build.

## Coding Style & Naming Conventions
- Python: PEP 8, 4‑space indent, `snake_case` for modules/functions, `PascalCase` for classes. Keep routers cohesive (one concern per file), avoid cross‑module globals.
- TypeScript/React: 2‑space indent, `PascalCase` components, `camelCase` variables/hooks, colocate component styles next to files.
- Files/paths: backend modules in `backend/app/*.py`; React views/components under `frontend/src`.

## Testing Guidelines
- Primary check: run `python3 test_chat_save.py` while backend is on `:8005` to verify auth, chat, and SQLite persistence (`backend/qsa_chatbot.db`).
- Add API tests near related routers or create `backend/tests/` if expanding. Name as `test_<feature>.py`.
- For frontend, include quick smoke checks (e.g., rendering, API calls) if adding complex UI.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) with a short imperative summary.
- PRs: include purpose, summary of changes, manual test notes, linked issues, and screenshots/GIFs for UI changes. Ensure `docker-compose up` and `./start.sh` both work.

## Security & Configuration Tips
- Secrets: use `backend/.env` (see `backend/.env.example`). Do not commit real keys. Required keys include provider APIs and `JWT_SECRET_KEY`.
- Data/models: place large models and generated indexes under `backend/models/` and `backend/storage/` only. These paths and common model/index extensions (`*.pt`, `*.onnx`, `*.faiss`, `*.safetensors`, `*.bin`, `*.npy`, `*.npz`) are ignored by Git.
- If any large artifacts are already tracked, untrack them without deleting locally: `git rm --cached -r backend/models backend/storage` and commit.
