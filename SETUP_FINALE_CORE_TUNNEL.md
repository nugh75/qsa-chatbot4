# 📋 Configurazione Finale - Tunnel Core Setup

## ✅ Configurazione Tunnel Core Completa

### File: `/home/nugh75/.cloudflared/config.yml`
```yaml
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
```

## 🚀 Comandi di Setup Rapido

```bash
# Setup completo in 4 comandi
cd /home/nugh75/ai4educ-chatbots
./setup-core-tunnel-config.sh    # Aggiorna config.yml
./setup-core-tunnel-dns.sh       # Configura DNS records
./start-poggi.sh &               # Avvia Poggi (background)
./start-pef.sh &                 # Avvia PEF (background)

# Riavvia tunnel (se necessario)
pkill cloudflared && cloudflared tunnel run core-tunnel
```

## 📊 Mappa Servizi Finale

| Servizio | URL Pubblico | Porta Locale | Container |
|----------|--------------|--------------|-----------|
| **Questionario AI** | https://ai-q.ai4educ.org | 8501 | ✅ Esistente |
| **Counselorbot** | https://counselor.ai4educ.org | 5172 | frontend-counselorbot |
| **Counselorbot API** | https://counselor-api.ai4educ.org | 8112 | backend-counselorbot |
| **Poggi** | https://poggi.ai4educ.org | 5178 | frontend-poggi |
| **Poggi API** | https://api-poggi.ai4educ.org | 8117 | backend-poggi |
| **PEF** | https://pef.ai4educ.org | 5175 | frontend-pef |
| **PEF API** | https://api-pef.ai4educ.org | 8115 | backend-pef |
| **N8N** | https://n8n.ai4educ.org | 5678 | ✅ Esistente |

## 🔍 Comandi di Test

### Test Configurazione
```bash
# Validare config.yml
cloudflared tunnel ingress validate

# Test regole routing
cloudflared tunnel ingress rule poggi.ai4educ.org
cloudflared tunnel ingress rule pef.ai4educ.org
```

### Test Servizi Locali
```bash
# Poggi
curl http://localhost:5178
curl http://localhost:8117/health

# PEF  
curl http://localhost:5175
curl http://localhost:8115/health

# Esistenti (verifica)
curl http://localhost:5172  # Counselorbot
curl http://localhost:8112/health  # Counselorbot API
```

### Test Pubblico (dopo tunnel restart)
```bash
# Nuovi servizi
curl https://poggi.ai4educ.org
curl https://pef.ai4educ.org

# Verifica esistenti funzionanti
curl https://counselor.ai4educ.org
curl https://n8n.ai4educ.org
```

## 📁 File e Script Creati

- `CLOUDFLARE_CORE_TUNNEL_SETUP.md` - Guida completa
- `setup-core-tunnel-config.sh` - Aggiorna configurazione tunnel
- `setup-core-tunnel-dns.sh` - Configura record DNS
- `docker-compose.poggi.yml` - Compose standalone Poggi
- `docker-compose.pef.yml` - Compose standalone PEF
- `start-poggi.sh` - Script avvio Poggi
- `start-pef.sh` - Script avvio PEF

## 🔧 Troubleshooting

### Problema: Tunnel non si avvia
```bash
# Verificare sintassi config.yml
cloudflared tunnel ingress validate

# Check file credentials
ls -la /home/nugh75/.cloudflared/core-tunnel.json
```

### Problema: DNS non risolve
```bash
# Verificare record DNS creati
nslookup poggi.ai4educ.org
nslookup pef.ai4educ.org

# Re-creare record se necessario
cloudflared tunnel route dns core-tunnel poggi.ai4educ.org --overwrite-dns
```

### Problema: Servizio non raggiungibile
```bash
# Check container status
docker-compose -f docker-compose.poggi.yml ps
docker-compose -f docker-compose.pef.yml ps

# Check logs
docker-compose -f docker-compose.poggi.yml logs -f
docker-compose -f docker-compose.pef.yml logs -f
```

## 🔄 Rollback in caso di emergenza

```bash
# Ripristinare configurazione precedente
cp /home/nugh75/.cloudflared/config.yml.backup.YYYYMMDD_HHMMSS /home/nugh75/.cloudflared/config.yml

# Riavviare tunnel
pkill cloudflared
cloudflared tunnel run core-tunnel
```

## ✅ Checklist Finale

- [ ] Script `setup-core-tunnel-config.sh` eseguito con successo
- [ ] Script `setup-core-tunnel-dns.sh` eseguito con successo
- [ ] Poggi avviato: `./start-poggi.sh` completato
- [ ] PEF avviato: `./start-pef.sh` completato
- [ ] Tunnel riavviato: `cloudflared tunnel run core-tunnel`
- [ ] Test https://poggi.ai4educ.org ✅
- [ ] Test https://pef.ai4educ.org ✅
- [ ] Verifica https://counselor.ai4educ.org ancora funzionante ✅
- [ ] Verifica https://n8n.ai4educ.org ancora funzionante ✅