SHELL := /bin/bash

.PHONY: help deps pre-commit-install backend frontend dev stop test docker-up docker-down docker-rebuild docker-rebuild-clean docker-rebuild-models lint format models

help:
	@echo "Common tasks:"
	@echo "  make deps                # Install backend and frontend dependencies"
	@echo "  make pre-commit-install  # Install git hooks"
	@echo "  make backend             # Run FastAPI (uvicorn)"
	@echo "  make frontend            # Run Vite dev server"
	@echo "  make dev                 # Start both via ./start.sh"
	@echo "  make stop                # Stop both via ./stop.sh"
	@echo "  make test                # Run API+DB test script"
	@echo "  make docker-up           # docker-compose up --build"
	@echo "  make docker-down         # docker-compose down"
	@echo "  make docker-rebuild      # Rebuild containers without cache"
	@echo "  make docker-rebuild-clean # Full clean rebuild (down -v, prune, no models)"
	@echo "  make docker-rebuild-models # Full clean rebuild (down -v, prune, WITH models)"
	@echo "  make lint                # Run pre-commit on all files"
	@echo "  make format              # Format Python and Frontend sources"
 	@echo "  make models              # Download Whisper/Piper/Embeddings models"

deps:
	@echo "Installing backend deps..."
	cd backend && if [ ! -d .venv ]; then python -m venv .venv; fi && \
		source .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "Installing frontend deps..."
	cd frontend && npm install

pre-commit-install:
	@echo "Installing pre-commit hooks..."
	pre-commit install

backend:
	cd backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8005

frontend:
	cd frontend && npm run dev

dev:
	./start.sh

stop:
	./stop.sh

test:
	python3 test_chat_save.py

docker-up:
	docker-compose up --build

docker-down:
	docker-compose down

docker-rebuild:
	docker-compose build --no-cache && docker-compose up

docker-rebuild-clean:
	./rebuild_docker.sh

docker-rebuild-models:
	./rebuild_docker.sh --models

lint:
	pre-commit run --all-files

format:
	@echo "Formatting backend with isort + black..."
	cd backend && source .venv/bin/activate && isort app && black app
	@echo "Formatting frontend with prettier..."
	cd frontend && npx prettier --write "src/**/*.{ts,tsx,js,jsx,css,json,md}"

models:
	@echo "Downloading models (Whisper, Piper, Embeddings)..."
	cd backend && source .venv/bin/activate && python app/scripts/download_models.py
