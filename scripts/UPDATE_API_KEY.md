# Guida: Aggiornare API_KEY senza rebuildare le immagini Docker

Questo documento spiega come usare lo script `scripts/update_api_key.py` per aggiornare una chiave API (variabile `API_KEY`) in un file di ambiente e, opzionalmente, far ripartire i container Docker senza ricostruire le immagini.

Lo script è pensato come operazione operativa rapida: modifica il file `.env` (o altro file specificato), crea un backup, e può eseguire `docker compose up` con `--no-build --force-recreate` per applicare la nuova variabile ai container.

---

## Dove si trova lo script

- Percorso: `scripts/update_api_key.py`
- Assicurati che sia eseguibile: `chmod +x scripts/update_api_key.py`

## Comportamento dello script

- Aggiorna o aggiunge la variabile `API_KEY` in un file di ambiente (di default `./.env`).
- Crea un backup del file modificato: `<envfile>.bak`.
- Se richiesto, ricrea i container con lo stesso immagine (senza rebuild) eseguendo:
  `docker compose -f docker-compose.multi.yml up -d --no-build --force-recreate <servizi...>`
- Non modifica il codice sorgente e non ricostruisce immagini.

> Nota: lo script contiene in cima la costante `API_KEY` che puoi modificare a mano prima di eseguire lo script. In alternativa, puoi passare `--key "valore"` da riga di comando per sovrascrivere la costante.

---

## Uso rapido (esempi)

1) Aggiornare il `.env` usando la costante nello script (modifica il file e poi esegui):

```bash
./scripts/update_api_key.py --no-restart
```

2) Aggiornare il `.env` e ricreare un servizio specifico (es. `backend-agrusti`):

```bash
./scripts/update_api_key.py --key "nuova_api_key" --service backend-agrusti
```

3) Aggiornare un env file differente e ricreare più servizi:

```bash
./scripts/update_api_key.py --env-file .env.production --key "nuova_api_key" --service backend-agrusti --service frontend-agrusti
```

4) Aggiornare il file senza ricreare i container:

```bash
./scripts/update_api_key.py --key "nuova_api_key" --no-restart
```

5) Se non passi servizi e non usi `--no-restart`, lo script chiederà conferma prima di ricreare tutti i servizi definiti in `docker-compose.multi.yml`.

### Esempi concreti per `.env.agrusti` e servizio `backend-agrusti`

Se vuoi aggiornare `OPENAI_API_KEY` nel file `.env.agrusti` e applicare la modifica al servizio `backend-agrusti`, qui ci sono comandi pronti da copiare/incollare.

- Usando comandi shell (backup + sed):

```bash
# imposta la nuova chiave
NEWVALUE="sk-...nuova-chiave..."

# fai backup
cp .env.agrusti .env.agrusti.bak

# sostituisci se esiste, altrimenti appendi
if grep -q '^OPENAI_API_KEY=' .env.agrusti; then
  sed -i -E "s|^OPENAI_API_KEY=.*$|OPENAI_API_KEY=${NEWVALUE}|" .env.agrusti
else
  printf "\nOPENAI_API_KEY=%s\n" "${NEWVALUE}" >> .env.agrusti
fi

# verifica
grep '^OPENAI_API_KEY' .env.agrusti || true

# ricrea solo il servizio (no rebuild)
docker compose -f docker-compose.multi.yml up -d --no-build --force-recreate backend-agrusti

# verifica dentro container
docker compose exec backend-agrusti env | grep OPENAI_API_KEY
```

- Usando lo script interattivo che abbiamo aggiunto:

```bash
# esecuzione non-interattiva (passando variabile e servizio)
./scripts/update_api_key.py --env-file .env.agrusti --set OPENAI_API_KEY=sk-...nuova-chiave... --service backend-agrusti

# esecuzione interattiva (seguire le istruzioni a schermo)
./scripts/update_api_key.py
```

Questi comandi creano sempre un backup `.env.agrusti.bak` prima della modifica.

---

## Cosa succede nel file `.env` (o file specificato)

- Se esiste una riga che inizia con `API_KEY=`, lo script la sostituisce con `API_KEY=<nuovo_valore>`.
- Se non esiste, lo script aggiunge la riga in fondo al file.
- Prima di sovrascrivere, lo script copia il file originale in `<envfile>.bak`.

Esempio di backup: se il file è `.env`, il backup sarà `.env.bak`.

---

## Verifiche post-update

- Controllare che il file sia stato aggiornato correttamente:

```bash
grep -n "^API_KEY=" .env && tail -n 3 .env
```

- Se hai ricreato servizi, verificare lo stato e i log:

```bash
# stato container
docker compose -f docker-compose.multi.yml ps

# logs del servizio
docker compose -f docker-compose.multi.yml logs -f backend-agrusti

# verificare la variabile d'ambiente dentro il container
docker compose exec backend-agrusti env | grep API_KEY
```

---

## Rollback

- Se qualcosa va storto, ripristina il file di ambiente dal backup:

```bash
cp .env.bak .env
# poi ricrea i servizi se necessario
docker compose -f docker-compose.multi.yml up -d --no-build --force-recreate backend-agrusti
```

- Lo script non esegue rollback automatici dei container; il rollback del file `.env` + ricreazione dei servizi ripristinerà il comportamento precedente.

---

## Suggerimenti operativi e sicurezza

- Non tenere chiavi sensibili in repository senza restringere l'accesso. Valuta soluzioni più sicure per le secret (Docker secrets, HashiCorp Vault, Azure Key Vault, etc.).
- Per minimizzare downtime, esegui la ricreazione servizio-per-servizio se hai più repliche o un bilanciatore.
- Se usi più progetti Docker nello stesso host, specifica il project name con `-p` quando richiami `docker compose`.

Esempio con project name:

```bash
docker compose -p mio_progetto -f docker-compose.multi.yml up -d --no-build --force-recreate backend-agrusti
```

---

## Zero-downtime (opzioni avanzate)

- Se serve zero-downtime, usa rolling updates su più repliche dietro a un bilanciatore:
  - Scala su più repliche, ricrea una replica alla volta, poi riduci il numero se necessario.
  - Oppure usa orchestratori come Kubernetes che supportano rolling updates nativamente.

---

## Troubleshooting comune

- "La variabile non si vede nel container": probabilmente il container non è stato ricreato. Ricrealo esplicitamente:

```bash
docker compose -f docker-compose.multi.yml up -d --no-build --force-recreate nome_servizio
```

- "Lo script non ha trovato docker": assicurati che `docker` sia in PATH e che l'utente abbia i permessi necessari.

- "Voglio aggiornare più chiavi": puoi estendere lo script per cercare più variabili (posso farlo se vuoi).

---

## Personalizzazioni possibili (se vuoi che le aggiunga)

- Aggiungere più chiavi da aggiornare in un singolo passaggio (`OPENAI_KEY`, `AZURE_KEY`, ecc.).
- Integrazione con servizi segreti secure (es. leggere la chiave da Vault o da Azure Key Vault e aggiornare automaticamente).
- Logging/registrazione delle operazioni (audit trail).

---

Se vuoi, posso aggiungere una versione dello script che aggiorna più variabili, o che legge la chiave direttamente da un prompt interattivo (con mascheramento). Dimmi come preferisci procedere e lo aggiungo.
