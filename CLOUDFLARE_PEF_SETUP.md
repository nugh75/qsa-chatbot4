# Configurazione DNS Cloudflare per PEF

## Prerequisiti
- Cloudflared già installato nella macchina WSL
- Tunnel `core-tunnel` già configurato e funzionante
- Docker-compose pef in esecuzione (porte: frontend 5175, backend 8115)

## Passaggi per configurazione DNS

### 1. ✅ Tunnel già esistente
```bash
# Il tunnel core-tunnel è già configurato
# File: /home/nugh75/.cloudflared/config.yml
# Tunnel ID: core-tunnel
# Credentials: /home/nugh75/.cloudflared/core-tunnel.json
```

### 2. Aggiungere record DNS per PEF
```bash
# Aggiungere DNS per frontend PEF
cloudflared tunnel route dns core-tunnel pef.ai4educ.org

# Aggiungere DNS per API PEF (opzionale)
cloudflared tunnel route dns core-tunnel api-pef.ai4educ.org
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

### 2. Configurare il Tunnel Cloudflare
```bash
# Avviare il tunnel con il token ottenuto
cloudflared tunnel --token <YOUR_TUNNEL_TOKEN>

# Oppure configurare il file di configurazione
mkdir -p ~/.cloudflared
```

### 5. File di configurazione tunnel (~/.cloudflared/config.yml)
```yaml
tunnel: pef-tunnel
credentials-file: ~/.cloudflared/pef-tunnel.json

ingress:
  # Frontend PEF
  - hostname: pef.tuodominio.com
    service: http://localhost:5175
  
  # API Backend PEF (opzionale, per accesso diretto alle API)
  - hostname: api-pef.tuodominio.com
    service: http://localhost:8115
  
  # Catch-all rule (richiesto)
  - service: http_status:404
```

### 6. Comandi CLI Completi per Setup Automatico
```bash
# Setup completo con un singolo comando (metodo veloce)
cloudflared tunnel --name pef-tunnel --hostname pef.tuodominio.com --url http://localhost:5175

# Oppure gestione separata:
# 1. Creare tunnel
cloudflared tunnel create pef-tunnel

# 2. Configurare DNS  
cloudflared tunnel route dns pef-tunnel pef.tuodominio.com
cloudflared tunnel route dns pef-tunnel api-pef.tuodominio.com

# 3. Avviare tunnel
cloudflared tunnel run pef-tunnel
```

### 4. Record DNS su Cloudflare Dashboard
Aggiungere i seguenti record DNS nel dashboard Cloudflare:

| Tipo | Nome | Contenuto | Proxy |
|------|------|-----------|-------|
| CNAME | pef | pef-tunnel.tuodominio.com | ✅ (Orange Cloud) |
| CNAME | api-pef | pef-tunnel.tuodominio.com | ✅ (Orange Cloud) |

### 5. Avviare i servizi
```bash
# 1. Avviare Docker Compose per PEF
cd /home/nugh75/qsa-chatbot4
docker-compose -f docker-compose.pef.yml up -d

# 2. Verificare che i servizi siano attivi
curl http://localhost:5175  # Frontend PEF
curl http://localhost:8115/health  # Backend PEF

# 3. Avviare il tunnel Cloudflare
cloudflared tunnel run pef-tunnel
```

### 6. Test della configurazione
```bash
# Test del frontend
curl https://pef.tuodominio.com

# Test delle API (se configurate)
curl https://api-pef.tuodominio.com/health
```

## Servizio systemd per tunnel (opzionale)
Per avviare automaticamente il tunnel:

```bash
# Creare file di servizio
sudo nano /etc/systemd/system/cloudflared-pef.service
```

Contenuto del file:
```ini
[Unit]
Description=Cloudflare Tunnel for PEF
After=network.target

[Service]
Type=simple
User=nugh75
ExecStart=/usr/local/bin/cloudflared tunnel run pef-tunnel
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Abilitare e avviare il servizio
sudo systemctl enable cloudflared-pef
sudo systemctl start cloudflared-pef
sudo systemctl status cloudflared-pef
```

## Configurazione Multi-Tunnel (se si usano entrambi Poggi e PEF)
Per gestire entrambi i tunnel contemporaneamente, creare un file di configurazione unificato:

### ~/.cloudflared/config-multi.yml
```yaml
# Tunnel per Poggi
tunnel: poggi-tunnel
credentials-file: ~/.cloudflared/poggi-tunnel.json

ingress:
  - hostname: poggi.tuodominio.com
    service: http://localhost:5178
  - hostname: api-poggi.tuodominio.com
    service: http://localhost:8117
  - service: http_status:404

---
# Tunnel per PEF  
tunnel: pef-tunnel
credentials-file: ~/.cloudflared/pef-tunnel.json

ingress:
  - hostname: pef.tuodominio.com
    service: http://localhost:5175
  - hostname: api-pef.tuodominio.com
    service: http://localhost:8115
  - service: http_status:404
```

## Porte utilizzate
- **Frontend PEF**: 5175 (locale) → pef.tuodominio.com (pubblico)
- **Backend PEF**: 8115 (locale) → api-pef.tuodominio.com (pubblico, opzionale)
- **Database PEF**: 5535 (solo locale, non esposto)

## Comandi Utili per Gestione Tunnel

### Elencare tunnel esistenti
```bash
cloudflared tunnel list
```

### Informazioni su tunnel specifico
```bash
cloudflared tunnel info pef-tunnel
```

### Eliminare record DNS
```bash
# Non c'è comando CLI diretto, usare Cloudflare Dashboard
# Oppure sovrascrivere con --overwrite-dns
cloudflared tunnel route dns pef-tunnel pef.tuodominio.com --overwrite-dns
```

### Eliminare tunnel
```bash
cloudflared tunnel delete pef-tunnel
```

### Token per tunnel esistente
```bash
# Ottenere token per tunnel già creato
cloudflared tunnel token pef-tunnel
```

### Debug e troubleshooting
```bash
# Verificare configurazione
cloudflared tunnel ingress validate

# Test delle regole ingress
cloudflared tunnel ingress rule pef.tuodominio.com

# Log dettagliati
cloudflared tunnel run pef-tunnel --loglevel debug
```

### Gestione Multi-Tunnel
```bash
# Lista tutti i tunnel
cloudflared tunnel list

# Avviare tunnel specifico
cloudflared tunnel run pef-tunnel

# Avviare più tunnel in background
nohup cloudflared tunnel run pef-tunnel &
nohup cloudflared tunnel run poggi-tunnel &
```

## Note di sicurezza
- Il database PostgreSQL (porta 5535) non è esposto pubblicamente
- Solo frontend e API backend sono accessibili tramite Cloudflare
- Tutto il traffico passa attraverso Cloudflare con protezione DDoS inclusa