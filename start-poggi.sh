#!/bin/bash

# Script di avvio per ambiente Poggi
# Utilizza docker-compose.poggi.yml con .env.poggi

set -e  # Exit on any error

echo "🚀 Avvio ambiente Poggi..."
echo "📁 Directory di lavoro: $(pwd)"
echo "📋 File di configurazione: docker-compose.poggi.yml"
echo "🔧 File environment: .env.poggi"
echo ""

# Verifica che i file necessari esistano
if [ ! -f "docker-compose.poggi.yml" ]; then
    echo "❌ Errore: docker-compose.poggi.yml non trovato!"
    exit 1
fi

if [ ! -f ".env.poggi" ]; then
    echo "❌ Errore: .env.poggi non trovato!"
    exit 1
fi

# Verifica che Docker sia in esecuzione
if ! docker info >/dev/null 2>&1; then
    echo "❌ Errore: Docker non è in esecuzione!"
    exit 1
fi

echo "✅ Verifica prerequisiti completata"
echo ""

# Creazione delle directory di log se non esistono
echo "📂 Creazione directory di log..."
mkdir -p backend/storage/logs-poggi
echo "✅ Directory logs-poggi creata"
echo ""

# Build e avvio dei servizi
echo "🔨 Build e avvio servizi Poggi..."
docker-compose -f docker-compose.poggi.yml up --build -d

echo ""
echo "⏳ Attesa avvio servizi..."
sleep 10

# Verifica stato dei servizi
echo "📊 Stato dei servizi:"
docker-compose -f docker-compose.poggi.yml ps

echo ""
echo "🔍 Test dei servizi:"

# Test postgres
echo "   • PostgreSQL (porta 5537)..."
if curl -s -f http://localhost:5537 >/dev/null 2>&1; then
    echo "     ✅ PostgreSQL: OK"
else
    echo "     ⚠️  PostgreSQL: Verifica manualmente"
fi

# Test backend
echo "   • Backend API (porta 8117)..."
if curl -s -f http://localhost:8117/health >/dev/null 2>&1; then
    echo "     ✅ Backend: OK"
else
    echo "     ⚠️  Backend: Avvio in corso o errore"
fi

# Test frontend
echo "   • Frontend (porta 5178)..."
if curl -s -f http://localhost:5178 >/dev/null 2>&1; then
    echo "     ✅ Frontend: OK"
else
    echo "     ⚠️  Frontend: Avvio in corso o errore"
fi

echo ""
echo "🎉 Ambiente Poggi avviato!"
echo ""
echo "📱 Accessi:"
echo "   • Frontend: http://localhost:5178"
echo "   • Backend API: http://localhost:8117"
echo "   • Database: localhost:5537 (solo interno)"
echo ""
echo "📋 Per visualizzare i log:"
echo "   docker-compose -f docker-compose.poggi.yml logs -f"
echo ""
echo "⏹️  Per fermare i servizi:"
echo "   docker-compose -f docker-compose.poggi.yml down"
echo ""
echo "🌐 Per configurare Cloudflare DNS, consulta:"
echo "   CLOUDFLARE_POGGI_SETUP.md"
echo ""