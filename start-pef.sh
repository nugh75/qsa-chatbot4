#!/bin/bash

# Script di avvio per ambiente PEF
# Utilizza docker-compose.pef.yml con .env.pef

set -e  # Exit on any error

echo "🚀 Avvio ambiente PEF..."
echo "📁 Directory di lavoro: $(pwd)"
echo "📋 File di configurazione: docker-compose.pef.yml"
echo "🔧 File environment: .env.pef"
echo ""

# Verifica che i file necessari esistano
if [ ! -f "docker-compose.pef.yml" ]; then
    echo "❌ Errore: docker-compose.pef.yml non trovato!"
    exit 1
fi

if [ ! -f ".env.pef" ]; then
    echo "❌ Errore: .env.pef non trovato!"
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
mkdir -p backend/storage/logs-pef
echo "✅ Directory logs-pef creata"
echo ""

# Build e avvio dei servizi
echo "🔨 Build e avvio servizi PEF..."
docker-compose -f docker-compose.pef.yml up --build -d

echo ""
echo "⏳ Attesa avvio servizi..."
sleep 10

# Verifica stato dei servizi
echo "📊 Stato dei servizi:"
docker-compose -f docker-compose.pef.yml ps

echo ""
echo "🔍 Test dei servizi:"

# Test postgres
echo "   • PostgreSQL (porta 5535)..."
if curl -s -f http://localhost:5535 >/dev/null 2>&1; then
    echo "     ✅ PostgreSQL: OK"
else
    echo "     ⚠️  PostgreSQL: Verifica manualmente"
fi

# Test backend
echo "   • Backend API (porta 8115)..."
if curl -s -f http://localhost:8115/health >/dev/null 2>&1; then
    echo "     ✅ Backend: OK"
else
    echo "     ⚠️  Backend: Avvio in corso o errore"
fi

# Test frontend
echo "   • Frontend (porta 5175)..."
if curl -s -f http://localhost:5175 >/dev/null 2>&1; then
    echo "     ✅ Frontend: OK"
else
    echo "     ⚠️  Frontend: Avvio in corso o errore"
fi

echo ""
echo "🎉 Ambiente PEF avviato!"
echo ""
echo "📱 Accessi:"
echo "   • Frontend: http://localhost:5175"
echo "   • Backend API: http://localhost:8115"
echo "   • Database: localhost:5535 (solo interno)"
echo ""
echo "📋 Per visualizzare i log:"
echo "   docker-compose -f docker-compose.pef.yml logs -f"
echo ""
echo "⏹️  Per fermare i servizi:"
echo "   docker-compose -f docker-compose.pef.yml down"
echo ""
echo "🌐 Per configurare Cloudflare DNS, consulta:"
echo "   CLOUDFLARE_PEF_SETUP.md"
echo ""