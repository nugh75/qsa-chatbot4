# ai4educ-chatbots — Configurazione multi-istanza

Questo progetto fa girare **più istanze indipendenti** dello stesso software chatbot.
Codice `backend/` + `frontend/` **condiviso**; dati (chatbot, RAG, config, DB) **isolati per istanza**.

Documentazione operativa completa: [instances/README.md](instances/README.md).

## 🏗️ Architettura

```
ai4educ-chatbots/
├── backend/                 # codice FastAPI (condiviso)
├── frontend/                # codice Vite (condiviso)
├── instances/
│   ├── counselorbot/  {docker-compose.yml, .env, start.sh}
│   ├── pef/           {docker-compose.yml, .env, start.sh}
│   ├── poggi/         {docker-compose.yml, .env, start.sh}
│   └── _template/     # base per nuove istanze
├── runtime-data/
│   ├── <istanza>/{storage, config, backups, exports}   # isolato
│   └── models/                                          # condiviso (whisper, embeddings)
└── scripts/bootstrap_runtime_data.sh
```

Ogni istanza ha: postgres + backend + frontend propri, project name Docker = nome cartella
(`name:` nel compose → isola container, rete, volumi).

## 📍 Istanze attive

| Istanza | Frontend | Backend | Postgres | Dominio |
|---------|----------|---------|----------|---------|
| counselorbot | :5172 | :8112 | :5532 | counselorbot.ai4educ.org |
| pef | :5175 | :8115 | :5535 | pef.ai4educ.org |
| poggi | :5178 | :8117 | :5537 | poggi.ai4educ.org |

## 🚀 Avvio / stop

```bash
# avvio (build + up -d + bootstrap runtime-data)
./instances/pef/start.sh

# manuale
cd instances/pef && docker compose up --build -d

# stop / log
docker compose -f instances/pef/docker-compose.yml down
docker compose -f instances/pef/docker-compose.yml logs -f
```

## ➕ Nuova istanza

```bash
cp -r instances/_template instances/<nome>
# in docker-compose.yml e start.sh: sostituisci SITE -> <nome>, scegli porte libere
cp instances/<nome>/.env.example instances/<nome>/.env   # compila DB + api keys
./instances/<nome>/start.sh
```

## 🔐 Isolamento

- Chatbot/personalità, RAG, prompt, pipeline → `runtime-data/<istanza>/storage/`
- Config + **api_keys** → `runtime-data/<istanza>/config/` (per-istanza)
- Database → volume `pgdata-<istanza>`
- Modelli ML → `runtime-data/models/` (condivisi: binari, nessun dato utente)

> I file `.env` per istanza sono gitignored (contengono segreti) e non vanno committati.
