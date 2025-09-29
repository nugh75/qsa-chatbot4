#!/bin/bash
# Script per configurare i record DNS per Poggi e PEF nel tunnel core

set -e

echo "🌐 Configurazione record DNS per tunnel core-tunnel"
echo ""

# Verificare che cloudflared sia disponibile
if ! command -v cloudflared &> /dev/null; then
    echo "❌ Errore: cloudflared non trovato!"
    exit 1
fi

# Verificare che il tunnel core-tunnel esista
echo "🔍 Verifica tunnel esistenti..."
if ! cloudflared tunnel list | grep -q "core-tunnel"; then
    echo "❌ Errore: Tunnel core-tunnel non trovato!"
    echo "   Eseguire prima: cloudflared tunnel list"
    exit 1
fi

echo "✅ Tunnel core-tunnel trovato"
echo ""

# Configurare DNS per Poggi
echo "🟡 Configurazione DNS per Poggi..."
echo "   • poggi.ai4educ.org -> localhost:5178"
if cloudflared tunnel route dns core-tunnel poggi.ai4educ.org; then
    echo "     ✅ poggi.ai4educ.org configurato"
else
    echo "     ⚠️  Possibile record già esistente per poggi.ai4educ.org"
fi

echo "   • api-poggi.ai4educ.org -> localhost:8117"
if cloudflared tunnel route dns core-tunnel api-poggi.ai4educ.org; then
    echo "     ✅ api-poggi.ai4educ.org configurato"
else
    echo "     ⚠️  Possibile record già esistente per api-poggi.ai4educ.org"
fi

echo ""

# Configurare DNS per PEF
echo "🟢 Configurazione DNS per PEF..."
echo "   • pef.ai4educ.org -> localhost:5175"
if cloudflared tunnel route dns core-tunnel pef.ai4educ.org; then
    echo "     ✅ pef.ai4educ.org configurato"
else
    echo "     ⚠️  Possibile record già esistente per pef.ai4educ.org"
fi

echo "   • api-pef.ai4educ.org -> localhost:8115"
if cloudflared tunnel route dns core-tunnel api-pef.ai4educ.org; then
    echo "     ✅ api-pef.ai4educ.org configurato"
else
    echo "     ⚠️  Possibile record già esistente per api-pef.ai4educ.org"
fi

echo ""
echo "🎉 Configurazione DNS completata!"
echo ""
echo "🔍 Test delle regole ingress:"
echo "   • Poggi: cloudflared tunnel ingress rule poggi.ai4educ.org"
echo "   • PEF: cloudflared tunnel ingress rule pef.ai4educ.org"
echo ""
echo "🚀 Prossimi passi:"
echo "   1. Avviare servizi Docker: ./start-poggi.sh && ./start-pef.sh"
echo "   2. Riavviare tunnel: pkill cloudflared && cloudflared tunnel run core-tunnel"
echo "   3. Test: curl https://poggi.ai4educ.org && curl https://pef.ai4educ.org"
echo ""