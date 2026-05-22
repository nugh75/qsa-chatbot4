# 🚀 Setup Completo Cloudflare DNS - Tunnel Core Esistente

## ✅ Situazione Attuale
- **Tunnel core-tunnel** già configurato e funzionante
- **Domini ai4educ.org** già attivi
- **Counselorbot** operativo su counselor.ai4educ.org
- **N8N** operativo su n8n.ai4educ.org

## � Obiettivo
Aggiungere **Poggi** e **PEF** al tunnel `core-tunnel` esistente.

## 🚀 Setup Automatico (METODO VELOCE)

### 1. Setup completo automatico
```bash
cd /home/nugh75/ai4educ-chatbots

# Step 1: Aggiornare configurazione tunnel
./setup-core-tunnel-config.sh

# Step 2: Configurare record DNS
./setup-core-tunnel-dns.sh

# Step 3: Avviare servizi
./start-poggi.sh &
./start-pef.sh &

# Step 4: Riavviare tunnel (se attivo)
pkill cloudflared
cloudflared tunnel run core-tunnel
```

## 🔧 Setup Manuale (METODO DETTAGLIATO)

### 1. Backup e aggiornamento configurazione
```bash
# Backup automatico
cp /home/nugh75/.cloudflared/config.yml /home/nugh75/.cloudflared/config.yml.backup.$(date +%Y%m%d_%H%M%S)

# Aggiornare manualmente il file config.yml
nano /home/nugh75/.cloudflared/config.yml
```

### 2. Configurazione DNS Records
```bash
# Poggi
cloudflared tunnel route dns core-tunnel poggi.ai4educ.org
cloudflared tunnel route dns core-tunnel api-poggi.ai4educ.org

# PEF
cloudflared tunnel route dns core-tunnel pef.ai4educ.org
cloudflared tunnel route dns core-tunnel api-pef.ai4educ.org
```

## 📋 Script Completo di Automazione

### setup-cloudflare-poggi.sh
```bash
#!/bin/bash
set -e

echo "🚀 Setup automatico Cloudflare per Poggi"

# Sostituire con il vostro dominio
DOMAIN="tuodominio.com"
TUNNEL_NAME="poggi-tunnel"

echo "📡 Creazione tunnel $TUNNEL_NAME..."
cloudflared tunnel create $TUNNEL_NAME

echo "🌐 Configurazione DNS per poggi.$DOMAIN..."
cloudflared tunnel route dns $TUNNEL_NAME poggi.$DOMAIN

echo "🌐 Configurazione DNS per api-poggi.$DOMAIN..."
cloudflared tunnel route dns $TUNNEL_NAME api-poggi.$DOMAIN

echo "📝 Creazione file di configurazione..."
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/poggi-config.yml << EOF
tunnel: $TUNNEL_NAME
credentials-file: ~/.cloudflared/$TUNNEL_NAME.json

ingress:
  - hostname: poggi.$DOMAIN
    service: http://localhost:5178
  - hostname: api-poggi.$DOMAIN
    service: http://localhost:8117
  - service: http_status:404
EOF

echo "✅ Setup completato!"
echo "🚀 Per avviare: cloudflared tunnel --config ~/.cloudflared/poggi-config.yml run $TUNNEL_NAME"
```

### setup-cloudflare-pef.sh
```bash
#!/bin/bash
set -e

echo "🚀 Setup automatico Cloudflare per PEF"

# Sostituire con il vostro dominio
DOMAIN="tuodominio.com"
TUNNEL_NAME="pef-tunnel"

echo "📡 Creazione tunnel $TUNNEL_NAME..."
cloudflared tunnel create $TUNNEL_NAME

echo "🌐 Configurazione DNS per pef.$DOMAIN..."
cloudflared tunnel route dns $TUNNEL_NAME pef.$DOMAIN

echo "🌐 Configurazione DNS per api-pef.$DOMAIN..."
cloudflared tunnel route dns $TUNNEL_NAME api-pef.$DOMAIN

echo "📝 Creazione file di configurazione..."
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/pef-config.yml << EOF
tunnel: $TUNNEL_NAME
credentials-file: ~/.cloudflared/$TUNNEL_NAME.json

ingress:
  - hostname: pef.$DOMAIN
    service: http://localhost:5175
  - hostname: api-pef.$DOMAIN
    service: http://localhost:8115
  - service: http_status:404
EOF

echo "✅ Setup completato!"
echo "🚀 Per avviare: cloudflared tunnel --config ~/.cloudflared/pef-config.yml run $TUNNEL_NAME"
```

## 🔄 Comandi di Gestione Quotidiana

### Avviare entrambi gli ambienti
```bash
# Terminal 1: Avviare Poggi
cd /home/nugh75/ai4educ-chatbots
./start-poggi.sh
cloudflared tunnel --config ~/.cloudflared/poggi-config.yml run poggi-tunnel

# Terminal 2: Avviare PEF  
cd /home/nugh75/ai4educ-chatbots
./start-pef.sh
cloudflared tunnel --config ~/.cloudflared/pef-config.yml run pef-tunnel
```

### Verifica stato
```bash
# Elencare tunnel
cloudflared tunnel list

# Info tunnel specifico
cloudflared tunnel info poggi-tunnel
cloudflared tunnel info pef-tunnel

# Test delle configurazioni
curl https://poggi.tuodominio.com
curl https://pef.tuodominio.com
```

### Fermare tutto
```bash
# Fermare tunnel (Ctrl+C nei terminali)
# Fermare Docker
docker-compose -f docker-compose.poggi.yml down
docker-compose -f docker-compose.pef.yml down
```

## 🎯 One-Liner per Setup Veloce

### Poggi
```bash
cloudflared tunnel create poggi-tunnel && cloudflared tunnel route dns poggi-tunnel poggi.tuodominio.com && echo "✅ Poggi DNS configurato"
```

### PEF
```bash
cloudflared tunnel create pef-tunnel && cloudflared tunnel route dns pef-tunnel pef.tuodominio.com && echo "✅ PEF DNS configurato"
```

## 📋 Checklist Finale

- [ ] `cloudflared tunnel login` eseguito
- [ ] Tunnel poggi-tunnel creato
- [ ] Tunnel pef-tunnel creato  
- [ ] DNS poggi.tuodominio.com configurato
- [ ] DNS pef.tuodominio.com configurato
- [ ] Docker compose poggi funzionante (porta 5178)
- [ ] Docker compose pef funzionante (porta 5175)
- [ ] Tunnel cloudflare poggi attivo
- [ ] Tunnel cloudflare pef attivo
- [ ] Test accesso https://poggi.tuodominio.com
- [ ] Test accesso https://pef.tuodominio.com

## 🔧 Troubleshooting

### Problema: DNS non si risolve
```bash
# Verificare che il tunnel sia attivo
cloudflared tunnel list

# Controllare configurazione DNS su Cloudflare Dashboard
# I record CNAME dovrebbero puntare a xxxxxx.cfargotunnel.com
```

### Problema: Servizio non raggiungibile
```bash
# Verificare porte Docker
docker-compose -f docker-compose.poggi.yml ps
docker-compose -f docker-compose.pef.yml ps

# Test locale
curl http://localhost:5178  # Poggi
curl http://localhost:5175  # PEF
```