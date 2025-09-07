# QSA Chatbot - Configurazione Multi-Container

Questo progetto supporta l'esecuzione di multiple istanze del chatbot, ognuna con la propria configurazione e dominio.

## 🏗️ Architettura

Il sistema multi-container è composto da:

- **1 Database PostgreSQL condiviso** (porta 5532)
- **5 Backend separati** per ogni sito (porte 8001-8005)
- **5 Frontend separati** per ogni sito (porte 5171-5175)

### Siti Disponibili

| Sito | Frontend | Backend | Dominio |
|------|----------|---------|---------|
| Agrusti | :5171 | :8111 | agrusti.ai4educ.org |
| Counselorbot | :5172 | :8112 | counselorbot.ai4educ.org |
| EduRAG | :5173 | :8113 | edurag.ai4educ.org |
| Margottini | :5174 | :8114 | margottini.ai4educ.org |
| PEF | :5175 | :8115 | pef.ai4educ.org |

## 🚀 Avvio Rapido

```bash
# Avvio di tutti i container
./start-multi.sh

# Oppure manualmente
docker compose -f docker-compose.multi.yml up -d
```

## 🔧 Gestione dei Container

Usa lo script `manage-multi.sh` per gestire i container:

```bash
# Mostra tutti i comandi disponibili
./manage-multi.sh help

# Avvia tutti i siti
./manage-multi.sh start

# Avvia solo un sito specifico
./manage-multi.sh start edurag

# Visualizza lo stato
./manage-multi.sh status

# Visualizza i log
./manage-multi.sh logs pef

# Ferma un sito
./manage-multi.sh stop margottini

# Ricompila un sito
./manage-multi.sh build agrusti

# Mostra gli URL
./manage-multi.sh urls
```

## 📁 Struttura File

```
.
├── docker-compose.multi.yml    # Configurazione multi-container
├── manage-multi.sh            # Script di gestione
├── start-multi.sh            # Script di avvio rapido
├── nginx-multi.conf          # Configurazione nginx
├── .env.agrusti             # Variabili ambiente Agrusti
├── .env.counselorbot        # Variabili ambiente Counselorbot
├── .env.edurag              # Variabili ambiente EduRAG
├── .env.margottini          # Variabili ambiente Margottini
├── .env.pef                 # Variabili ambiente PEF
└── backend/storage/logs-*   # Log separati per ogni sito
```

## ⚙️ Configurazione

### File Environment

Ogni sito ha il proprio file `.env.[nome-sito]` con:

- Chiavi API specifiche per il sito
- Configurazione database condivisa
- Chiavi di crittografia
- Credenziali admin

### Vite Configuration

Il `frontend/vite.config.ts` è stato configurato per:

- Leggere variabili `VITE_BACKEND_TARGET` e `VITE_SITE_NAME`
- Configurare proxy API dinamicamente
- Supportare domini specifici per ogni sito
- Generare build separati per ogni sito

### Docker Build

Il Dockerfile del frontend supporta:

```bash
# Build args per configurazione specifica del sito
ARG VITE_BACKEND_TARGET
ARG VITE_SITE_NAME

# Build per sito specifico
docker build --build-arg VITE_SITE_NAME=edurag \
             --build-arg VITE_BACKEND_TARGET=http://backend-edurag:8005 \
             ./frontend
```

## 🔍 Monitoraggio

### Log Separati

Ogni sito ha i propri log in:
- `backend/storage/logs-agrusti/`
- `backend/storage/logs-counselorbot/`
- `backend/storage/logs-edurag/`
- `backend/storage/logs-margottini/`
- `backend/storage/logs-pef/`

### Visualizzazione Log

```bash
# Log di tutti i siti
./manage-multi.sh logs

# Log di un sito specifico
./manage-multi.sh logs edurag

# Log in tempo reale
docker compose -f docker-compose.multi.yml logs -f backend-pef frontend-pef
```

## 🌐 Accesso ai Siti

### Locale (Sviluppo)

- **Agrusti**: http://localhost:5171
- **Counselorbot**: http://localhost:5172
- **EduRAG**: http://localhost:5173
- **Margottini**: http://localhost:5174
- **PEF**: http://localhost:5175

### Produzione (Domini)

I domini sono configurati in `vite.config.ts` e possono essere abilitati decommentando le sezioni appropriate in `nginx-multi.conf`.

## 🔧 Troubleshooting

### Container non si avvia

```bash
# Verifica lo stato
./manage-multi.sh status

# Controlla i log
./manage-multi.sh logs [nome-sito]

# Ricompila se necessario
./manage-multi.sh build [nome-sito]
```

### Problemi di rete

```bash
# Verifica che i container possano comunicare
docker network ls
docker network inspect qsa-chatbot4_default
```

### Pulizia completa

```bash
# Rimuove tutto (ATTENZIONE: cancella i dati!)
./manage-multi.sh clean
```

## 📦 Sviluppo

### Aggiungere un nuovo sito

1. Crea file `.env.nuovo-sito`
2. Aggiungi servizi in `docker-compose.multi.yml`
3. Aggiungi il sito a `manage-multi.sh` nell'array `SITES`
4. Aggiorna `vite.config.ts` con il nuovo dominio

### Build Development

Per sviluppo locale senza Docker:

```bash
cd frontend
VITE_SITE_NAME=edurag VITE_BACKEND_TARGET=http://localhost:8003 npm run dev
```

## 🔐 Sicurezza

- Ogni container ha le proprie chiavi di crittografia
- Database condiviso ma dati separati logicamente
- Log separati per ogni sito
- Configurazioni environment isolate
