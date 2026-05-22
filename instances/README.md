# Istanze ai4educ-chatbots

Ogni sottocartella è un'**istanza indipendente** dello stesso software.
Il **codice** `backend/` (FastAPI) e `frontend/` (Vite) è **condiviso** (build context `../../`).
I **dati** sono **isolati** per istanza:

| Cosa | Dove | Isolamento |
|------|------|-----------|
| Chatbot / personalità | `runtime-data/<istanza>/storage/personalities` | per-istanza |
| RAG (indici, documenti) | `runtime-data/<istanza>/storage/rag_data` | per-istanza |
| Prompt, pipeline, MCP, avatar… | `runtime-data/<istanza>/storage/…` | per-istanza |
| Config (api_keys, pipeline_config, welcome…) | `runtime-data/<istanza>/config` | per-istanza |
| Database PostgreSQL | volume `pgdata-<istanza>` | per-istanza |
| Modelli ML (whisper, embeddings) | `runtime-data/models` | **condiviso** |

## Istanze attive

| Istanza | Frontend | Backend | Postgres |
|---------|----------|---------|----------|
| counselorbot | 5172 | 8112 | 5532 |
| pef | 5175 | 8115 | 5535 |
| poggi | 5178 | 8117 | 5537 |

## Avviare un'istanza

```bash
./instances/pef/start.sh
# oppure manualmente:
cd instances/pef && docker compose up --build -d
```

## Fermare / log

```bash
docker compose -f instances/pef/docker-compose.yml down
docker compose -f instances/pef/docker-compose.yml logs -f
```

## Aggiungere una nuova istanza

1. `cp -r instances/_template instances/<nome>`
2. In `docker-compose.yml` e `start.sh`: sostituisci `SITE` con `<nome>` e scegli **porte host libere** (PG / backend / frontend).
3. `cp instances/<nome>/.env.example instances/<nome>/.env` e compila (DB, api keys). `.env` è gitignored.
4. `./instances/<nome>/start.sh` — il bootstrap crea `runtime-data/<nome>/{storage,config,backups,exports}` e seeda i default.
5. (Opzionale) esporre sul tunnel via il pannello cloudflared-manager.

> Nota: `name:` nel compose imposta il project name Docker → isola container, rete e volumi. Tienilo uguale al nome cartella.
