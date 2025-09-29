# 🚀 Setup Cloudflare Core Tunnel - Poggi e PEF

## Situazione Attuale
- ✅ **Tunnel core-tunnel** già esistente e configurato
- ✅ **Domini ai4educ.org** già funzionanti
- ✅ **Counselorbot** già attivo su counselor.ai4educ.org
- ✅ **N8N** già attivo su n8n.ai4educ.org

## 🎯 Obiettivo
Aggiungere **Poggi** e **PEF** al tunnel esistente senza interrompere i servizi attuali.

## 📋 Script di Setup Completo

### 1. Backup e aggiornamento configurazione
```bash
#!/bin/bash
# setup-core-tunnel-update.sh

echo "🔄 Aggiornamento tunnel core-tunnel per Poggi e PEF"

# Backup configurazione attuale
echo "💾 Backup configurazione..."
cp /home/nugh75/.cloudflared/config.yml /home/nugh75/.cloudflared/config.yml.backup.$(date +%Y%m%d_%H%M%S)

# Creare nuova configurazione
echo "📝 Creazione nuova configurazione..."
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
```

### 2. Configurazione DNS Records
```bash
#!/bin/bash
# setup-dns-records.sh

echo "🌐 Configurazione record DNS..."

# Aggiungere record DNS per Poggi
echo "📡 Configurazione DNS Poggi..."
cloudflared tunnel route dns core-tunnel poggi.ai4educ.org
cloudflared tunnel route dns core-tunnel api-poggi.ai4educ.org

# Aggiungere record DNS per PEF
echo "📡 Configurazione DNS PEF..."
cloudflared tunnel route dns core-tunnel pef.ai4educ.org
cloudflared tunnel route dns core-tunnel api-pef.ai4educ.org

echo "✅ Record DNS configurati!"
```

## 🚀 Comandi di Avvio

### Avviare Poggi
```bash
# Terminal 1: Avviare servizi Docker Poggi
cd /home/nugh75/qsa-chatbot4
./start-poggi.sh
```

### Avviare PEF
```bash
# Terminal 2: Avviare servizi Docker PEF
cd /home/nugh75/qsa-chatbot4
./start-pef.sh
```

### Riavviare tunnel (se necessario)
```bash
# Se il tunnel è in esecuzione, fermarlo e riavviarlo
# per applicare la nuova configurazione
pkill cloudflared
cloudflared tunnel run core-tunnel
```

## 🔧 Comandi di Test

### Test configurazione
```bash
# Validare file di configurazione
cloudflared tunnel ingress validate

# Test regole ingress
cloudflared tunnel ingress rule poggi.ai4educ.org
cloudflared tunnel ingress rule pef.ai4educ.org
cloudflared tunnel ingress rule counselor.ai4educ.org
```

### Test servizi locali
```bash
# Test servizi Docker
curl http://localhost:5178  # Poggi Frontend
curl http://localhost:8117/health  # Poggi Backend
curl http://localhost:5175  # PEF Frontend  
curl http://localhost:8115/health  # PEF Backend
curl http://localhost:5172  # Counselorbot (esistente)
```

### Test domini pubblici
```bash
# Test accesso pubblico (dopo restart tunnel)
curl https://poggi.ai4educ.org
curl https://pef.ai4educ.org
curl https://counselor.ai4educ.org  # Verifica esistente
```

## 🏃 Setup One-Liner

```bash
# Setup completo automatico
curl -s https://raw.githubusercontent.com/tuoaccount/qsa-chatbot4/main/setup-core-tunnel.sh | bash
```

## 📊 Configurazione Finale

| Servizio | Hostname | Porta Locale | Stato |
|----------|----------|--------------|-------|
| **Questionario AI** | ai-q.ai4educ.org | 8501 | ✅ Esistente |
| **Counselorbot** | counselor.ai4educ.org | 5172 | ✅ Esistente |
| **Counselorbot API** | counselor-api.ai4educ.org | 8112 | ✅ Esistente |
| **Poggi** | poggi.ai4educ.org | 5178 | 🆕 Nuovo |
| **Poggi API** | api-poggi.ai4educ.org | 8117 | 🆕 Nuovo |
| **PEF** | pef.ai4educ.org | 5175 | 🆕 Nuovo |
| **PEF API** | api-pef.ai4educ.org | 8115 | 🆕 Nuovo |
| **N8N** | n8n.ai4educ.org | 5678 | ✅ Esistente |

## ⚠️ Note Importanti

1. **Zero Downtime**: L'aggiornamento non interrompe i servizi esistenti
2. **Backup Automatico**: La configurazione attuale viene sempre salvata
3. **Rollback Facile**: In caso di problemi, copiare il backup su config.yml
4. **Test Graduale**: Testare ogni servizio prima di procedere al successivo

## 🔄 Rollback in caso di problemi

```bash
# Ripristinare configurazione precedente
cp /home/nugh75/.cloudflared/config.yml.backup.YYYYMMDD_HHMMSS /home/nugh75/.cloudflared/config.yml

# Riavviare tunnel
pkill cloudflared
cloudflared tunnel run core-tunnel
```

## 📋 Checklist Finale

- [ ] Backup configurazione esistente
- [ ] Aggiornamento config.yml con Poggi e PEF
- [ ] Configurazione DNS records
- [ ] Test servizi Docker Poggi (5178, 8117)
- [ ] Test servizi Docker PEF (5175, 8115)
- [ ] Riavvio tunnel cloudflared
- [ ] Test accesso https://poggi.ai4educ.org
- [ ] Test accesso https://pef.ai4educ.org
- [ ] Verifica servizi esistenti funzionanti