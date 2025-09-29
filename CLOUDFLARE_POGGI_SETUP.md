# Configurazione DNS Cloudflare per Poggi

## Prerequisiti
- Cloudflared già installato nella macchina WSL
- Tunnel `core-tunnel` già configurato e funzionante
- Docker-compose poggi in esecuzione (porte: frontend 5178, backend 8117)

## Passaggi per configurazione DNS

### 1. ✅ Tunnel già esistente
```bash
# Il tunnel core-tunnel è già configurato
# File: /home/nugh75/.cloudflared/config.yml
# Tunnel ID: core-tunnel
# Credentials: /home/nugh75/.cloudflared/core-tunnel.json
```

### 2. Aggiungere record DNS per Poggi
```bash
# Aggiungere DNS per frontend Poggi
cloudflared tunnel route dns core-tunnel poggi.ai4educ.org

# Aggiungere DNS per API Poggi (opzionale)
cloudflared tunnel route dns core-tunnel api-poggi.ai4educ.org
```

### 3. Aggiornare configurazione tunnel
```bash
# Backup della configurazione attuale
cp /home/nugh75/.cloudflared/config.yml /home/nugh75/.cloudflared/config.yml.backup.$(date +%Y%m%d_%H%M%S)

# Aggiungere le nuove entries al file config.yml
```

### 4. Nuova configurazione config.yml
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

###N8N
- hostname: n8n.ai4educ.org
  service: http://localhost:5678  

- service: http_status:404
```

### 2. Configurare il Tunnel Cloudflare
```bash
# Avviare il tunnel con il token ottenuto
cloudflared tunnel --token <YOUR_TUNNEL_TOKEN>

# Oppure configurare il file di configurazione
mkdir -p ~/.cloudflared
```

### 5. File di configurazione tunnel (~/.cloudflared/config.yml)
```yaml
tunnel: poggi-tunnel
credentials-file: ~/.cloudflared/poggi-tunnel.json

ingress:
  # Frontend Poggi
  - hostname: poggi.tuodominio.com
    service: http://localhost:5178
  
  # API Backend Poggi (opzionale, per accesso diretto alle API)
  - hostname: api-poggi.tuodominio.com
    service: http://localhost:8117
  
  # Catch-all rule (richiesto)
  - service: http_status:404
```

### 6. Comandi CLI Completi per Setup Automatico
```bash
# Setup completo con un singolo comando (metodo veloce)
cloudflared tunnel --name poggi-tunnel --hostname poggi.tuodominio.com --url http://localhost:5178

# Oppure gestione separata:
# 1. Creare tunnel
cloudflared tunnel create poggi-tunnel

# 2. Configurare DNS  
cloudflared tunnel route dns poggi-tunnel poggi.tuodominio.com
cloudflared tunnel route dns poggi-tunnel api-poggi.tuodominio.com

# 3. Avviare tunnel
cloudflared tunnel run poggi-tunnel
```

### 4. Record DNS su Cloudflare Dashboard
Aggiungere i seguenti record DNS nel dashboard Cloudflare:

| Tipo | Nome | Contenuto | Proxy |
|------|------|-----------|-------|
| CNAME | poggi | poggi-tunnel.tuodominio.com | ✅ (Orange Cloud) |
| CNAME | api-poggi | poggi-tunnel.tuodominio.com | ✅ (Orange Cloud) |

### 5. Avviare i servizi
```bash
# 1. Avviare Docker Compose per Poggi
cd /home/nugh75/qsa-chatbot4
docker-compose -f docker-compose.poggi.yml up -d

# 2. Verificare che i servizi siano attivi
curl http://localhost:5178  # Frontend Poggi
curl http://localhost:8117/health  # Backend Poggi

# 3. Avviare il tunnel Cloudflare
cloudflared tunnel run poggi-tunnel
```

### 6. Test della configurazione
```bash
# Test del frontend
curl https://poggi.tuodominio.com

# Test delle API (se configurate)
curl https://api-poggi.tuodominio.com/health
```

## Servizio systemd per tunnel (opzionale)
Per avviare automaticamente il tunnel:

```bash
# Creare file di servizio
sudo nano /etc/systemd/system/cloudflared-poggi.service
```

Contenuto del file:
```ini
[Unit]
Description=Cloudflare Tunnel for Poggi
After=network.target

[Service]
Type=simple
User=nugh75
ExecStart=/usr/local/bin/cloudflared tunnel run poggi-tunnel
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Abilitare e avviare il servizio
sudo systemctl enable cloudflared-poggi
sudo systemctl start cloudflared-poggi
sudo systemctl status cloudflared-poggi
```

## Porte utilizzate
- **Frontend Poggi**: 5178 (locale) → poggi.tuodominio.com (pubblico)
- **Backend Poggi**: 8117 (locale) → api-poggi.tuodominio.com (pubblico, opzionale)
- **Database Poggi**: 5537 (solo locale, non esposto)

## Comandi Utili per Gestione Tunnel

### Elencare tunnel esistenti
```bash
cloudflared tunnel list
```

### Informazioni su tunnel specifico
```bash
cloudflared tunnel info poggi-tunnel
```

### Eliminare record DNS
```bash
# Non c'è comando CLI diretto, usare Cloudflare Dashboard
# Oppure sovrascrivere con --overwrite-dns
cloudflared tunnel route dns poggi-tunnel poggi.tuodominio.com --overwrite-dns
```

### Eliminare tunnel
```bash
cloudflared tunnel delete poggi-tunnel
```

### Token per tunnel esistente
```bash
# Ottenere token per tunnel già creato
cloudflared tunnel token poggi-tunnel
```

### Debug e troubleshooting
```bash
# Verificare configurazione
cloudflared tunnel ingress validate

# Test delle regole ingress
cloudflared tunnel ingress rule poggi.tuodominio.com

# Log dettagliati
cloudflared tunnel run poggi-tunnel --loglevel debug
```

## Note di sicurezza
- Il database PostgreSQL (porta 5537) non è esposto pubblicamente
- Solo frontend e API backend sono accessibili tramite Cloudflare
- Tutto il traffico passa attraverso Cloudflare con protezione DDoS inclusa