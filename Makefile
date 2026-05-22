SHELL := /bin/bash

.PHONY: help deps pre-commit-install backend frontend dev stop test docker-up docker-down docker-rebuild lint format models

help:
	@echo "Common tasks:"
	@echo "  make deps                # Install backend and frontend dependencies"
	@echo "  make pre-commit-install  # Install git hooks"
	@echo "  make backend             # Run FastAPI (uvicorn)"
	@echo "  make frontend            # Run Vite dev server"
	@echo "  make dev                 # Start both via ./start.sh"
	@echo "  make stop                # Stop both via ./stop.sh"
	@echo "  make test                # Run API+DB test script"
	@echo "  make docker-up INSTANCE=pef     # build + up -d istanza (default pef)"
	@echo "  make docker-down INSTANCE=pef   # ferma istanza"
	@echo "  make docker-rebuild INSTANCE=pef # rebuild senza cache + up -d"
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

# Istanza target (override: make docker-up INSTANCE=poggi)
INSTANCE ?= pef

docker-up:
	cd instances/$(INSTANCE) && docker compose up --build -d

docker-down:
	cd instances/$(INSTANCE) && docker compose down

docker-rebuild:
	cd instances/$(INSTANCE) && docker compose build --no-cache && docker compose up -d

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
