# Guida Amministratore Applicazione QSA Chatbot

Questa guida operativa fornisce istruzioni dettagliate per OGNI TAB dell'interfaccia amministrativa. Per ciascuna sezione trovi: Obiettivo, Dove si trova, Campi/Controlli, Flussi Operativi, Errori Comuni, Best Practice, Checklist rapida.

Se modifichi questa guida (root) la copia in `storage/admin/ADMIN_GUIDE.md` verrà sovrascritta al prossimo sync se il timestamp (mtime) root è più recente.

---
## Indice
1. Visione Architetturale e Mappa Tab
2. Tab: Provider AI & TTS
3. Tab: Prompt (System & Summary)
4. Tab: Personalità (Personality Profiles)
5. Tab: Pipeline Regex (Topic Routing)
6. Tab: Contenuti Topic (File Markdown)
7. Tab: RAG (Sorgenti & Embedding)
8. Tab: RAG Admin Avanzato (Manutenzione)
9. Tab: Feedback
10. Tab: Usage / Telemetria
11. Tab: Utenti
12. Tab: Dispositivi
13. Tab: Welcome & Guide Dinamiche
14. Tab: Logging / Log Viewer
15. Sicurezza & Segreti (Principi Trasversali)
16. Performance & Capacità
17. SOP (Procedure Operative Standard)
18. Troubleshooting Rapido
19. Checklist Mensile
20. Roadmap Evolutiva Suggerita
21. Appendice: Convenzioni & Naming

---
## 1. Visione Architetturale e Mappa Tab
Flusso: Utente → Autenticazione → Regex Topic Routing → (Se attivato) RAG Retrieval → LLM → Post‑Processing (Feedback, Usage) → Streaming Output.

Componenti principali:
- Backend FastAPI: `backend/app/`
- Frontend React Admin: `frontend/src/AdminPanel.tsx`
- Storage persistente: `backend/storage/` (suddiviso per domini: `logs/`, `personalities/`, `rag_data/`, `usage/`, `feedback/`, `welcome-guide/`, `pipeline_files/`, `prompts/`)
- Motore RAG: `rag_engine.py`, `embedding_manager.py`
- Pipeline Regex: definita in `pipeline_config.json` + validatore

Mappa Tab (logica tipica – i nomi possono variare leggermente nell'interfaccia):
| Tab | Scopo | File/Config chiave |
|-----|-------|--------------------|
| Provider | Configurare modelli e TTS | `config/admin_config.json` (o env) |
| Prompt | Gestire system & summary prompt | `storage/prompts/` + API | 
| Personalità | Profili stile risposta | `storage/personalities/` |
| Pipeline | Regex topic routing + validazione | `config/pipeline_config.json` |
| Contenuti | File markdown per topic | `storage/pipeline_files/` (o equivalente) |
| RAG | Aggiunta/indicizzazione sorgenti | `storage/rag_data/` |
| RAG Admin | Manutenzione indice / purge | Codice engine + embeddings |
| Feedback | Valutazioni utente | `storage/feedback/` |
| Usage | Metriche token, costi, latenza | `storage/usage/` |
| Utenti | Gestione account / stato | DB/Store utenti |
| Dispositivi | Fingerprint & sincronizzazioni | Database dispositivi |
| Welcome/Guide | Onboarding dinamico | `storage/welcome-guide/` |
| Log | Consultazione e diagnostica | `storage/logs/` |

---
## 2. Tab: Provider AI & TTS
**Obiettivo**: Selezionare e parametrizzare il provider LLM e i servizi Text‑To‑Speech.

**Dove**: Tab "Provider" (o pulsante configurazione modelli).

**Campi principali** (possono apparire come JSON editabile o form):
| Campo | Descrizione | Note Operative |
|-------|-------------|----------------|
| enabled | Attiva provider | Solo un provider primario consigliato |
| models | Elenco modelli disponibili | Aggiornato da API o manuale |
| selected_model | Modello corrente | Usato per le chat nuove |
| temperature | Creatività generativa | Range raccomandato 0.2–0.8 |
| max_tokens | Limite output | Evitare sprechi (profilare) |
| api_key_status | Stato chiave | Mai esporre valore completo |

**TTS**: Voice preset, rate, pitch, provider fallback.

**Flussi Operativi**:
1. Aggiorna campi → Salva → Verifica con test rapido (messaggio di controllo)
2. Cambia provider: disattiva precedente (enabled=false) → attiva nuovo → aggiorna `selected_model` → salva.

**Errori Comuni**:
- 401/403 in test: chiave mancante o scaduta.
- Modello non trovato: stringa `selected_model` non allineata all'elenco.

**Best Practice**:
- Mantieni config di riferimento versionato (senza segreti) in repo.
- Sovrascrivi segreti solo via ENV/secret manager.

**Checklist**:
- [ ] `enabled` un solo primario
- [ ] Key caricata correttamente
- [ ] Test latenza < soglia (vedi sezione Performance)

---
## 3. Tab: Prompt (System & Summary)
**Obiettivo**: Definire il comportamento globale (System) e la sintesi finale (Summary).

**Campi/Controlli**:
- Editor System Prompt (markdown / testo multilinea)
- Editor Summary Prompt
- Pulsante Reset Default
- (Opzionale) Selezione versione / id storico

**Flussi**:
1. Modifica System → Salva → Esegui conversazione di validazione (verifica tono, contesto non degradato).
2. Aggiorna Summary se cambia formato report richiesto.

**Errori**:
- Prompt troppo lungo → aumento latenza / costi.
- Contraddizioni (tono formale vs stile personalità) → risposte incoerenti.

**Best Practice**:
- Tenere System < 800 token.
- Usare sezioni numerate (Ruolo, Obiettivi, Stile, Limiti, Formato risposta) per auditing.

**Checklist**:
- [ ] Nessuna istruzione ridondante
- [ ] Limiti espliciti presenti
- [ ] Coerenza con personalità default

---
## 4. Tab: Personalità
**Obiettivo**: Gestire profili di stile conversazionale.

**Campi** (per file personality): titolo, descrizione, tono, stile, limiti, esempi opzionali.

**Flussi**:
1. Crea nuova personalità → Inserisci blocchi (Tono, Limiti) → Salva file (kebab-case) → Imposta come default (se previsto).
2. Aggiorna personalità esistente → Valida con prompt di test.

**Errori**:
- Mancanza sezione "Limiti" → drift nel tempo.
- Nome file con spazi → problemi caricamento.

**Best Practice**:
- Un file = un profilo; niente mix ruoli.
- Documentare differenze rispetto al System.

**Checklist**:
- [ ] Nome file kebab-case
- [ ] Limiti specifici
- [ ] Nessun dato sensibile

---
## 5. Tab: Pipeline Regex (Topic Routing)
**Obiettivo**: Definire routing dei messaggi verso topic logici multipli.

**Campi/Struttura**: array di oggetti `{ pattern, topic, enabled? }` (topic string coerente).

**Validatore**: Mostra severità (ERROR / WARN / INFO). Salvataggio bloccato se esistono ERROR.

**Flussi**:
1. Aggiungi pattern → Testa con input di esempio (pulsante test locale se presente) → Controlla anteprima match multipli.
2. Riordina (se supportato) per priorità (pattern specifici prima dei generici).
3. Salva → Esegui messaggio reale e verifica `topics_multi` nei log.

**Errori Comuni**:
- Alternativa vuota `(|abc)` → ERROR.
- Uso di `.*` greedy senza limiti → WARN/ERROR performance.
- Duplicati identici → WARN conflitto.

**Best Practice**:
- Preferire `\bparola\b` a `parola`.
- Limitare wildcard con quantificatori `{0,80}`.
- Commentare pattern complessi (se formato supporta campo note).

**Checklist**:
- [ ] Nessun ERROR
- [ ] Wildcard limitate
- [ ] Pattern test coprono esempi negativi e positivi

---
## 6. Tab: Contenuti Topic (File Markdown)
**Obiettivo**: Gestire contenuti informativi associati ai topic rilevati.

**Campi/Controlli**:
- Lista file → Editor markdown → Salva / Crea Nuovo.
- Campo associazione topic → file.

**Flussi**:
1. Crea file `nome-topic.md` → Inserisci H1 coerente → Aggiungi sezioni FAQ / definizioni.
2. Aggiorna mapping topic → file → Salva.

**Errori**:
- File senza H1 iniziale → scarsa leggibilità.
- Estensione errata (.txt) → non renderizzato.

**Best Practice**:
- Una sezione "Ultimo Aggiornamento:" con data.
- Markdown conciso, evitare ripetere System Prompt.

**Checklist**:
- [ ] H1 presente
- [ ] Data aggiornamento
- [ ] Nessun dato sensibile

---
## 7. Tab: RAG (Sorgenti & Embedding)
**Obiettivo**: Caricare documenti e generare embedding.

**Controlli**:
- Upload file (pdf/md/txt). 
- Pulsante "Genera / Rigenera Embedding".
- Stato indice / numero chunk.

**Flussi**:
1. Carica file → Parser crea chunk (strategie: lunghezza + overlapping).
2. Clic Rigenera (se non auto) → Attendere stato COMPLETATO.
3. Test query di validazione (prompt di verifica copertura conoscenza).

**Errori**:
- File troppo grande senza chunking → memoria elevata.
- Encoding non utf-8 → parsing fallito.

**Best Practice**:
- Normalizzare testo (rimuovere boilerplate ripetuto) prima embedding.
- Evitare PDF scannerizzati non OCR.

**Checklist**:
- [ ] Numero chunk ragionevole (<5k) per latenza
- [ ] Embedding aggiornati dopo modifiche

---
## 8. Tab: RAG Admin Avanzato
**Obiettivo**: Manutenzione (purge, rebuild, statistiche).

**Controlli**:
- Purge indice
- Rebuild completo
- Report: distribuzione lunghezze chunk, hit rate.

**Flussi**:
1. Purge (solo se necessario) → Rebuild → Verifica query test.
2. Analizza outlier chunk (troppo lunghi/corti) → Regola parametri splitting.

**Errori**:
- Purge accidentale senza backup → perdita temporanea funzionalità.

**Best Practice**:
- Annotare motivazione purge (log operativo interno).

**Checklist**:
- [ ] Backup prima di purge
- [ ] Rebuild eseguito con successo

---
## 9. Tab: Feedback
**Obiettivo**: Visualizzare valutazioni qualitative utenti.

**Campi**: id messaggio, rating (es. 👍/👎 o scala), commento facoltativo.

**Flussi**:
1. Filtra per topic → Identifica pattern con maggiori negativi → Pianifica revisione.
2. Esporta CSV (se presente) per analisi.

**Errori**:
- Rumore (feedback vuoti) → Filtrare.

**Best Practice**:
- Taggare manualmente outlier per future metriche.

**Checklist**:
- [ ] Feedback negativi triagiati
- [ ] Trend mensile calcolato

---
## 10. Tab: Usage / Telemetria
**Obiettivo**: Monitorare costi, token, latenze.

**Campi**: timestamp, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_estimate.

**Flussi**:
1. Identifica spike latenza → incrocia con modifiche prompt / RAG.
2. Calcola costo medio per conversazione.

**Errori**:
- Token null → registrazione incompleta.

**Best Practice**:
- Definire soglie alert (manuali) per latenza e costo.

**Checklist**:
- [ ] Trend latenza stabile
- [ ] Costo/token entro budget

---
## 11. Tab: Utenti
**Obiettivo**: Gestire account amministrati.

**Campi**: user_id, email/username, stato, ruoli, created_at, last_login.

**Azioni**: sospendi/riattiva, reset password (se supportato), forza logout.

**Flussi**:
1. Sospensione: cambia stato → invalida sessioni.
2. Esportazione: genera JSON/CSV (per audit).

**Errori**:
- Ruolo non coerente (admin mancante) → accesso negato a tab.

**Best Practice**:
- Principle of least privilege: ruoli granulari.

**Checklist**:
- [ ] Account inattivi >90gg revisionati
- [ ] Ruoli aggiornati dopo cambi organizzativi

---
## 12. Tab: Dispositivi
**Obiettivo**: Tracciare dispositivi associati agli utenti.

**Campi**: device_id/fingerprint, user_id, tipo, last_sync, sync_count.

**Azioni**: disattiva, reset sync_count, rimuovi.

**Flussi**:
1. Identifica dispositivi obsoleti (last_sync vecchio) → disattiva.
2. Verifica anomalia (sync_count eccessivo) → audit.

**Checklist**:
- [ ] Percentuale dispositivi attivi > soglia definita
- [ ] Nessun device zombie

---
## 13. Tab: Welcome & Guide Dinamiche
**Obiettivo**: Onboarding utente (messaggio iniziale + guida step-by-step).

**Campi**: id guida, contenuto markdown, stato attivo, ordine.

**Flussi**:
1. Crea nuova guida → Testa rendering → Imposta come attiva.
2. Aggiorna messaggi di benvenuto se cambia branding o focus.

**Best Practice**:
- Versionare con suffisso data `welcome-2025-09.md`.

**Checklist**:
- [ ] Una sola guida attiva
- [ ] Contenuto aggiornato (data < 90gg)

---
## 14. Tab: Logging / Log Viewer
**Obiettivo**: Consultare eventi e conversazioni per diagnostica.

**Campi**: timestamp, livello, messaggio, correlation_id (se presente), topics_multi, sources.

**Flussi**:
1. Filtro per correlation_id → ricostruisci conversazione.
2. Analizza WARN/ERROR ricorrenti → apri azione correttiva.

**Errori**:
- Log troppo verbosi → rumore, ruotare/ridurre livello.

**Best Practice**:
- Compressione log > 500MB.

**Checklist**:
- [ ] Nessun ERROR non triagiato
- [ ] Rotazione dimensione ok

---
## 15. Sicurezza & Segreti
Principi trasversali (non solo tab):
- Nessuna chiave in markdown / commit.
- /admin protetto da autenticazione + (idealmente) IP allowlist.
- Input regex validati (protezione ReDoS).
- Backup cifrato se contiene PII.

**Checklist**:
- [ ] Nessuna chiave esposta
- [ ] Backup criptato verificato

---
## 16. Performance & Capacità
| Area | KPI | Soglia | Azione |
|------|-----|--------|--------|
| Regex routing | Tempo medio <5ms | >5ms | Ottimizza pattern / riduci | 
| RAG retrieval | Latenza <300ms | >300ms | Pre‑cache / tuning chunk |
| LLM TTFB | <2s | >2s | Riduci prompt / provider faster |
| Log size | <500MB/file | >500MB | Rotate/compress |
| Token per risposta | < configurato | > soglia | Rivedi max_tokens |

---
## 17. SOP (Procedure Operative Standard)
| Task | Frequenza | Obiettivo |
|------|----------|-----------|
| Review pattern | Settimanale | Ridurre falsi positivi/negativi |
| Aggiorna RAG | Mensile/on demand | Inserire nuove fonti |
| Pulizia log | Mensile | Controllo spazio |
| Backup storage | Giornaliero | DR readiness |
| Verifica sicurezza | Trimestrale | Prevenire esposizioni |
| Test prompt regressione | Mensile | Coerenza risposte |

---
## 18. Troubleshooting Rapido
| Problema | Possibile causa | Azione |
|----------|-----------------|--------|
| Topic sempre uguale | Pattern generico | Raffina pattern / aggiungi specificità |
| Nessun topic assegnato | Pattern troppo restrittivi | Allenta ancore / test A/B |
| Risposta lenta | RAG lento / modello | Profilare, limitare chunk, ridurre prompt |
| Guida non aggiornata | Sync mtime non scattato | Tocca file root / riavvia sync |
| Pattern non salvato | ERROR validatore | Correggi errori segnalati |
| Embedding mancanti | Upload senza rebuild | Esegui rigenerazione |
| Costi elevati | Prompt lungo | Semplifica / parametri modello |

---
## 19. Checklist Mensile
- [ ] Pattern revisionati e senza ERROR
- [ ] Log ruotati / compressi
- [ ] Backup ripristino testato
- [ ] RAG rebuild se nuove fonti
- [ ] Prompt e personalità allineati
- [ ] Nessuna chiave esposta

---
## 20. Roadmap Evolutiva Suggerita
| Iniziativa | Beneficio | Priorità |
|-----------|-----------|----------|
| Evidenziazione match live | Qualità pattern | Alta |
| Script analytics pattern | Riduzione rumore | Alta |
| Dashboard RAG (hit rate) | Visibilità qualità | Media |
| Versioning pipeline | Audit/rollback | Media |
| Auto-suggerimenti LLM regex | Produttività admin | Media |
| Alert latenza/costi | Reazione rapida | Media |

---
## 21. Appendice: Convenzioni & Naming
- Topics: snake_case o minuscolo coerente (evitare ambiguità plurale/singolare se non necessario).
- File markdown: H1 = titolo coerente col topic; evitare spazi finali.
- Pattern: documentare casi limite se usano lookahead/lookbehind.
- Commit messaggi per modifiche pipeline: prefisso `pipeline:`.

---
Aggiorna questa guida modificando il file root `ADMIN_GUIDE.md`. La copia in storage verrà sincronizzata dall'endpoint quando il timestamp root supera quello della copia.
