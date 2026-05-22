# Query predefinite e richieste “uman-like”

Questa guida spiega, in modo non tecnico, come usare le "Query predefinite" e le richieste in linguaggio naturale (NLQ) nell’area Admin, per ottenere rapidamente dati dal database senza scrivere SQL.

## Cosa sono le Query predefinite
- Sono ricerche già pronte con parametri chiari (es. "Utenti recenti").
- Ogni query ha: una descrizione, parametri modificabili (es. limite, filtri), ordinate consentite e limiti di sicurezza.
- L’esecuzione è sicura e parametrizzata: niente SQL libero, nessun rischio di comandi distruttivi.

## Dove si trovano
- Apri “Admin” → sezione “Database”.
- Nella card Database, scorri fino a “Query predefinite”.

## Come si usano
1) Seleziona una query dal menu a tendina.
2) Compila i campi parametri (il form appare in base alla query scelta).
3) Facoltativo: imposta “Ordina per” e “Direzione”.
4) Imposta “Limite” (quante righe vuoi vedere).
5) Premi “Anteprima” per un assaggio veloce (limite ridotto) o “Esegui” per la query completa.
6) I risultati appaiono in tabella e possono essere scorsi.

Suggerimento: se non vedi il form, cambia query e torna alla precedente (forza il reset dello stato). La UI ora resetta automaticamente alla selezione.

## Parametri tipici
- only_active: filtra utenti attivi (1) o inattivi (0). Se vuoto, li mostra tutti.
- limit: quante righe (ha sempre un massimo di sicurezza).
- order_by/direction: campi e verso di ordinamento consentiti (white‑list).

## Richieste “uman-like” (NLQ)
Puoi digitare una richiesta naturale e lasciare che il sistema la mappi in automatico alla query predefinita giusta.

Esempi utili:
- “utenti attivi” → mostra la lista utenti filtrando gli attivi.
- “utenti attivi ultimi 10 ordina per login desc” → limita a 10, ordine per ultimo accesso decrescente.
- “conversazioni utente 42” → mostra conversazioni dell’utente con id 42.
- “conversazioni utente mario.rossi@example.com” → risolve l’email in id e mostra le conversazioni.
- “documenti rag gruppo 3” → (solo Postgres) documenti RAG del gruppo 3.

Suggerimenti NLQ:
- “ultimi/ultimo/limite/max N” imposta il limite.
- “ordina per CREATO/AGGIORNATO/MESSAGGI/LOGIN [asc|desc]” imposta l’ordine (sinonimi riconosciuti).
- Se la richiesta non viene riconosciuta, la UI mostra un messaggio e alcuni esempi.

## Cosa posso chiedere oggi
- Utenti: elenco con filtri “attivi/inattivi”, ordinamento per creazione, ultimo accesso, email, id.
- Conversazioni per utente: serve un id o un’email valida; ordinamento per aggiornamento, creazione, numero messaggi.
- Documenti RAG per gruppo (Postgres): elenco con file, dimensione, chunks, data.

## Limiti e sicurezza
- Non è possibile modificare o cancellare dati da qui: solo SELECT sicure.
- I parametri vengono convalidati (tipi, intervalli, liste consentite).
- Il limite ha sempre un tetto massimo (es. 200/500 righe) per proteggere prestazioni.

## Risoluzione problemi
- “Form non visibile”: cambia selezione e torna; lo stato viene resettato automaticamente. Assicurati che il browser non blocchi script.
- “Nessun risultato”: prova ad aumentare “limite” o cambiare filtri/ordinamento.
- “Utente con email … non trovato”: verifica l’indirizzo, oppure prova con l’id utente.
- “Documenti RAG per gruppo …” non disponibili: potrebbe essere attivo SQLite per il RAG; la query è disponibile su Postgres.

## Domande frequenti
- Posso esportare i risultati? Al momento la UI mostra i risultati; per esporti avanzati usa le funzioni di backup o gli strumenti DB dedicati.
- Posso aggiungere nuove query predefinite? Sì, lato backend (registro), poi appaiono nel menu. Contatta un admin tecnico.

---

## Riferimento rapido per admin tecnici
- Registry: `backend/app/predefined_queries.py` (aggiungere `id`, `label`, `sql` con `:param`, `params`, `order_by`, `limit`).
- API: `GET /api/queries`, `GET /api/queries/{id}`, `POST /api/queries/{id}/preview|execute`, `POST /api/queries/nlq`.
- UI: `DatabaseInfoPanel` mostra dropdown, form dinamico, risultati.
- NLQ: regole in `backend/app/queries_routes.py` (estrazione limite/ordinamento, mapping email→user_id).

