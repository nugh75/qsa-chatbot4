# Architecture Overview

## Overview
QSA Chatbot is a two-tier app: a FastAPI backend exposing REST endpoints and a React (Vite) frontend consuming them. Local development can run via scripts or Docker Compose.

## Backend (FastAPI)
- Entry: `backend/app/main.py`; mounted routers in `backend/app/*`:
  - `chat.py`: chat endpoint and provider dispatch
  - `rag_routes.py` + `rag.py`: retrieval-augmented generation (embeddings via `sentence-transformers`, vector stores via FAISS/Chroma)
  - `auth_routes.py`: registration/login, JWT handling
  - `tts.py`, `transcribe.py`: TTS/ASR providers
  - `search_routes.py`, `survey_routes.py`, `admin*.py`: auxiliary features and admin panel
- Config: JSON under `backend/config/` (e.g., `admin_config.json`) and `.env` for secrets (see `.env.example`).
- Data/Models: `backend/data/`, `backend/models/` (cached models), `backend/storage/` (persistent artifacts).
- Database: SQLite file `backend/qsa_chatbot.db`, accessed by modules like `database.py` and used by conversation/message persistence.
  - (Opzionale) È stato aggiunto supporto infrastrutturale per migrazione a PostgreSQL via `docker-compose` (servizio `postgres`). Il codice applicativo è ancora basato su `sqlite3`; vedi `backend/app/postgres_migration.md` per i passi e prevedi refactor di `database.py` usando `psycopg2` o un ORM.
- Serve: `uvicorn app.main:app --port 8005` (see `backend/Dockerfile`).

## Frontend (React + Vite)
- Source: `frontend/src`, static assets in `frontend/public`, build to `frontend/dist`.
- Dev: `npm run dev` on port 5175. Backend URL via `VITE_BACKEND_URL` (set in `docker-compose.yml`).
- UI: chat interface, admin screens, and utilities that call `/api/*` routes.

### Recent UI / Data Model Additions (EN / IT)
- Unified `source_docs` object embedded in chat messages: `{ rag_chunks, pipeline_topics, rag_groups }` / Oggetto unificato `source_docs` nei messaggi.
- Each `rag_chunks[]` item includes: `chunk_index`, `filename`, `similarity`, optional `preview|content`, `document_id`, `stored_filename`, `original_filename`, `chunk_label`, `download_url`.
- Frontend injects links for bare `[DOC filename]` tokens and opens an aggregated preview dialog. / Il frontend genera link per `[DOC nomefile]` e apre un dialog di anteprima.
- Markdown pipeline: custom normalization + `react-markdown` + `remark-gfm` + `remark-breaks` (soft line breaks). / Pipeline Markdown aggiornata con normalizzazione e plugin.
- Emojis removed in favor of SVG / MUI icons only. / Emojis rimossi, restano solo icone SVG.

## Request Flow
1. Browser UI sends requests to `http://<backend>:8005/api/*`.
2. `main.py` delegates to a specific router (chat, auth, rag, etc.).
3. Business logic may access embeddings/vector stores, models in `backend/models`, and SQLite for persistence.
4. JSON responses are returned to the frontend; optional feedback saved under `backend/feedback/*.jsonl`.
5. For retrieval, backend attaches `source_docs`; streaming endpoint emits it early (meta) and again in final message. / Per il retrieval il backend allega `source_docs`; lo streaming lo emette subito (meta) e nel messaggio finale.

## Deployment & Local
- Local: `./start.sh` (both), or `make backend` / `make frontend` after `make deps`.
- Docker: `docker-compose up --build` exposes `backend:8005`, `frontend:5175`.
