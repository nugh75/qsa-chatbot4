#!/bin/bash

# Script per avviare frontend e backend del QSA Chatbot

echo "🚀 Avvio QSA Chatbot..."

# Controlla se il progetto è nella directory corretta
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ Errore: Esegui lo script dalla directory root del progetto"
    exit 1
fi

# Funzione per terminare processi
cleanup() {
    echo "🛑 Arresto applicazioni..."
    pkill -f "uvicorn.*app.main:app" 2>/dev/null
    pkill -f "vite.*dev" 2>/dev/null
    pkill -f "npm.*run.*dev" 2>/dev/null
    echo "✅ Applicazioni arrestate"
    exit 0
}

# Gestisce Ctrl+C
trap cleanup SIGINT SIGTERM

echo "📦 Avvio Backend (FastAPI)..."
cd backend
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment non trovato in backend/.venv"
    echo "   Crea prima l'ambiente virtuale: python -m venv .venv"
    exit 1
fi

source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8005 &
BACKEND_PID=$!

cd ..

echo "🌐 Avvio Frontend (Vite)..."
cd frontend
if [ ! -f "package.json" ]; then
    echo "❌ package.json non trovato in frontend/"
    exit 1
fi

npm run dev &
FRONTEND_PID=$!

cd ..

echo "✅ Applicazioni avviate!"
echo "   Backend:  http://localhost:8005"
echo "   Frontend: http://localhost:5173"
echo "   Admin:    http://localhost:5173/admin"
echo ""
echo "💡 Premi Ctrl+C per arrestare entrambe le applicazioni"

# Aspetta che i processi terminino
wait $BACKEND_PID $FRONTEND_PID
