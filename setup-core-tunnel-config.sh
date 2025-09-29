#!/bin/bash
# Script per aggiornare la configurazione del tunnel core con Poggi e PEF

set -e

echo "🔄 Aggiornamento tunnel core-tunnel per Poggi e PEF"
echo ""

# Verificare che il file di configurazione esista
if [ ! -f "/home/nugh75/.cloudflared/config.yml" ]; then
    echo "❌ Errore: File di configurazione tunnel non trovato!"
    echo "   Percorso: /home/nugh75/.cloudflared/config.yml"
    exit 1
fi

# Backup configurazione attuale
echo "💾 Backup configurazione attuale..."
BACKUP_FILE="/home/nugh75/.cloudflared/config.yml.backup.$(date +%Y%m%d_%H%M%S)"
cp /home/nugh75/.cloudflared/config.yml "$BACKUP_FILE"
echo "✅ Backup salvato in: $BACKUP_FILE"
echo ""

# Creare nuova configurazione
echo "📋 Creazione nuova configurazione..."
cat > /home/nugh75/.cloudflared/config.yml << 'EOF'
tunnel: core-tunnel
credentials-file: /home/nugh75/.cloudflared/core-tunnel.json

ingress:
###Questionario AI
- hostname: ai-q.ai4educ.org
  service: http://localhost:8501

###Counselorbot
- hostname: counselor.ai4educ.org
  service: http://localhost:5172

- hostname: counselor-api.ai4educ.org
  service: http://localhost:8112

###Poggi
- hostname: poggi.ai4educ.org
  service: http://localhost:5178

- hostname: api-poggi.ai4educ.org
  service: http://localhost:8117

###PEF
- hostname: pef.ai4educ.org
  service: http://localhost:5175

- hostname: api-pef.ai4educ.org
  service: http://localhost:8115

###N8N
- hostname: n8n.ai4educ.org
  service: http://localhost:5678  

- service: http_status:404
EOF

echo "✅ Configurazione aggiornata!"
echo ""

# Validare configurazione
echo "🔍 Validazione configurazione..."
if cloudflared tunnel ingress validate; then
    echo "✅ Configurazione valida!"
else
    echo "❌ Errore nella configurazione!"
    echo "🔄 Ripristino backup..."
    cp "$BACKUP_FILE" /home/nugh75/.cloudflared/config.yml
    exit 1
fi

echo ""
echo "🎉 Configurazione tunnel aggiornata con successo!"
echo ""
echo "🚀 Prossimi passi:"
echo "   1. Configurare DNS: ./setup-core-tunnel-dns.sh"
echo "   2. Avviare Poggi: ./start-poggi.sh"
echo "   3. Avviare PEF: ./start-pef.sh"
echo "   4. Riavviare tunnel: pkill cloudflared && cloudflared tunnel run core-tunnel"
echo ""
echo "🔙 Per rollback: cp $BACKUP_FILE /home/nugh75/.cloudflared/config.yml"
echo ""