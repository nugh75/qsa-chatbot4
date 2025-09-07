# 🧹 Piano di Pulizia File Backend QSA Chatbot

## Analisi Completata

**Data:** 2025-01-07  
**File analizzati:** 63  
**File inutilizzati identificati:** 22

## File SICURI da Rimuovere

### 1. File Vuoti/Stub (100% sicuri)
```bash
rm backend/app/feedback.py                    # File vuoto
rm backend/app/feedback_routes.py            # File vuoto  
rm backend/app/rag_admin.py                  # File vuoto
rm backend/app/device_sync_migration.py      # Solo import, nessuna funzionalità
```

### 2. File di Backup/Alternative (95% sicuri)
```bash
rm backend/app/file_processing_backup.py     # Backup della versione principale
rm backend/app/file_processing_simple.py     # Versione semplificata non usata
rm backend/app/file_processing_with_images.py # Versione alternativa non usata
```

### 3. Utilità Non Collegate (90% sicuri)
```bash
rm backend/app/embedding_manager.py          # Manager embedding non utilizzato
rm backend/app/deps.py                      # Dipendenze FastAPI non usate
```

## File da VALUTARE (Non rimuovere automaticamente)

### config_backup.py
- **Stato:** 564 righe di codice funzionale
- **Funzione:** Utility per backup configurazioni (non importato ma potrebbe essere usato via CLI/admin)
- **Raccomandazione:** Verificare se usato negli script di amministrazione

## Script di Migrazione/Setup (Script cartella)
Tutti i 12 script nella cartella `scripts/` sono inutilizzati nel codice principale ma potrebbero essere:
- Script di migrazione one-time (eseguiti manualmente)
- Tool di sviluppo/testing
- Script di setup/manutenzione

**Raccomandazione:** Non rimuoverli automaticamente ma documentarli.

## Comando di Pulizia Sicura

```bash
# Esegui dalla directory backend/
cd /mnt/git/qsa-chatbot4/backend

# Backup prima della pulizia
git add -A && git commit -m "Backup prima pulizia file obsoleti"

# Rimuovi file sicuri
rm app/feedback.py \
   app/feedback_routes.py \
   app/rag_admin.py \
   app/device_sync_migration.py \
   app/file_processing_backup.py \
   app/file_processing_simple.py \
   app/file_processing_with_images.py \
   app/embedding_manager.py \
   app/deps.py

# Verifica che tutto compili ancora
python -m py_compile app/*.py

echo "✅ Pulizia completata! 9 file rimossi in sicurezza"
```

## Impatto Previsto

- **File rimossi:** 9
- **Linee di codice risparmiate:** ~1000+ (stima)
- **Riduzione codebase:** ~14% dei file inutilizzati
- **Risk level:** Molto basso (file non importati)

## Verifica Post-Pulizia

```bash
# Test veloce
python analyze_imports.py app/ --format json | jq '.summary'

# Dovrebbe mostrare:
# - total_files: ~54 (invece di 63)
# - unused_files_count: ~13 (invece di 22)
```

## Note Tecniche

1. **config_backup.py** ha codice funzionale ma non è importato - potrebbe essere usato come modulo standalone
2. I file di **file_processing_\*** sembrano essere versioni alternative/backup del modulo principale
3. **embedding_manager.py** potrebbe essere parte di una funzionalità futura non ancora integrata
4. Tutti i **scripts/** sono probabilmente utility one-time o di sviluppo

## Prossimi Passi Dopo Pulizia

1. Eseguire pulizia sicura (9 file)
2. Test completo dell'applicazione
3. Valutare `config_backup.py` separatamente
4. Documentare script nella cartella `scripts/`
5. Setup multi-istanza come da richiesta utente
