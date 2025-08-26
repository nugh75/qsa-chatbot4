#!/bin/bash

# Script per arrestare il QSA Chatbot

echo "🛑 Arresto QSA Chatbot..."

# Termina processi backend
echo "📦 Arresto Backend..."
pkill -f "uvicorn.*app.main:app" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ Backend arrestato"
else
    echo "   ℹ️  Nessun processo backend trovato"
fi

# Termina processi frontend
echo "🌐 Arresto Frontend..."
pkill -f "vite.*dev" 2>/dev/null
pkill -f "npm.*run.*dev" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ Frontend arrestato"
else
    echo "   ℹ️  Nessun processo frontend trovato"
fi

# Verifica che non ci siano processi attivi sulle porte
echo "🔍 Verifica porte..."
BACKEND_PORT=$(lsof -ti:8005 2>/dev/null)
FRONTEND_PORT=$(lsof -ti:5173 2>/dev/null)

if [ -n "$BACKEND_PORT" ]; then
    echo "   ⚠️  Processo ancora attivo su porta 8005 (PID: $BACKEND_PORT)"
    echo "      Forzando terminazione..."
    kill -9 $BACKEND_PORT 2>/dev/null
fi

if [ -n "$FRONTEND_PORT" ]; then
    echo "   ⚠️  Processo ancora attivo su porta 5173 (PID: $FRONTEND_PORT)"
    echo "      Forzando terminazione..."
    kill -9 $FRONTEND_PORT 2>/dev/null
fi

echo "✅ QSA Chatbot arrestato completamente"
