# Repository Guidelines

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
