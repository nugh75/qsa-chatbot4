#!/bin/bash

# Script di avvio veloce per tutti i siti
# Crea le directory dei log e avvia tutti i container

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Avvio sistema multi-container QSA Chatbot..."

# Crea le directory dei log se non esistono
echo "📁 Creazione directory dei log..."
mkdir -p backend/storage/logs-{agrusti,counselorbot,edurag,margottini,pef}

# Avvia i container
echo "🐳 Avvio container..."
if command -v docker compose &> /dev/null; then
    docker compose -f docker-compose.multi.yml up -d
else
    docker-compose -f docker-compose.multi.yml up -d
fi

echo ""
echo "✅ Sistema avviato!"
echo ""
echo "📍 URLs dei siti:"
echo "  • Agrusti:      http://localhost:5171"
echo "  • Counselorbot: http://localhost:5172"
echo "  • EduRAG:       http://localhost:5173"
echo "  • Margottini:   http://localhost:5174"
echo "  • PEF:          http://localhost:5175"
echo ""
echo "🔧 Per gestire i container usa: ./manage-multi.sh [comando] [sito]"
echo "📊 Per vedere lo stato: ./manage-multi.sh status"
echo "📜 Per vedere i log: ./manage-multi.sh logs [sito]"
