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
- Serve: `uvicorn app.main:app --port 8005` (see `backend/Dockerfile`).

## Frontend (React + Vite)
- Source: `frontend/src`, static assets in `frontend/public`, build to `frontend/dist`.
- Dev: `npm run dev` on port 5175. Backend URL via `VITE_BACKEND_URL` (set in `docker-compose.yml`).
- UI: chat interface, admin screens, and utilities that call `/api/*` routes.

## Request Flow
1. Browser UI sends requests to `http://<backend>:8005/api/*`.
2. `main.py` delegates to a specific router (chat, auth, rag, etc.).
3. Business logic may access embeddings/vector stores, models in `backend/models`, and SQLite for persistence.
4. JSON responses are returned to the frontend; optional feedback saved under `backend/feedback/*.jsonl`.

## Deployment & Local
- Local: `./start.sh` (both), or `make backend` / `make frontend` after `make deps`.
- Docker: `docker-compose up --build` exposes `backend:8005`, `frontend:5175`.
