# Fix Permessi RAG - Riepilogo Modifiche

**Data**: 3 ottobre 2025  
**Branch**: multichatbo

## Problema Identificato

Quando si apre il dialog di anteprima per i documenti RAG, il bottone mostrava sempre "Scarica originale" invece di rispettare i permessi configurati nel database (`allow_preview` e `allow_download`).

I permessi esistevano già nel database e nel backend (`rag_engine.py`), ma non venivano propagati correttamente alle risposte della chat.

## Modifiche Implementate

### 1. Backend: `backend/app/chat.py`

Aggiunto la propagazione dei campi `allow_preview` e `allow_download` in **4 posizioni**:

1. **Risposta sincrona** (linea ~720): aggiunto ai `rag_chunks` nella risposta non-streaming
2. **Streaming - costruzione rag_results** (linea ~1175): aggiunto quando si costruisce l'array `rag_results` dalla ricerca
3. **Streaming - meta iniziale** (linea ~1210): aggiunto nell'evento `meta` iniziale dello streaming
4. **Streaming - meta finale** (linea ~1370): aggiunto nell'evento conclusivo dello streaming

**Codice aggiunto in ogni sezione:**
```python
"allow_preview": r.get("allow_preview", True),
"allow_download": r.get("allow_download", True)
```

### 2. Frontend: `frontend/src/types/message.ts`

Il type definition era già corretto e includeva i campi opzionali:
```typescript
allow_preview?: boolean
allow_download?: boolean
```

### 3. Frontend: `frontend/src/App.tsx`

Il codice era già implementato correttamente e non richiedeva modifiche:

- **Linea 382-383**: Imposta i permessi quando si apre il preview
- **Linea 302-306**: Gestisce il comportamento del click in base a `allow_download`
- **Linea 2311**: Mostra il bottone solo se `allow_preview` è true
- **Linea 2313**: Cambia il testo del bottone: "Scarica originale" vs "Vedi l'originale"

## Comportamento Atteso

Dopo queste modifiche, il sistema dovrebbe funzionare così:

### Scenario 1: `allow_preview=true`, `allow_download=true`
- ✅ L'utente può visualizzare il documento nel dialog
- ✅ Il bottone mostra "Scarica originale"
- ✅ Cliccando il bottone, il file viene scaricato

### Scenario 2: `allow_preview=true`, `allow_download=false`
- ✅ L'utente può visualizzare il documento nel dialog
- ✅ Il bottone mostra "Vedi l'originale"
- ✅ Cliccando il bottone, il file si apre in una nuova tab (senza download)

### Scenario 3: `allow_preview=false`, `allow_download=false`
- ❌ L'utente NON può visualizzare il documento
- ❌ Il backend ritorna HTTP 403 alla chiamata `/api/rag/download/{document_id}`
- ❌ Il bottone non appare nel dialog

## Testing

Per testare le modifiche:

1. **Impostare i permessi di un documento** tramite Admin Panel:
   ```bash
   # Avviare il backend
   cd backend
   uvicorn app.main:app --reload --port 8005
   ```

2. **Accedere come admin** e modificare i permessi di un documento RAG

3. **Fare una query** che restituisca quel documento come fonte

4. **Cliccare sul documento** nel box delle fonti e verificare:
   - Il testo del bottone
   - Il comportamento del click

## File Modificati

- ✅ `backend/app/chat.py` - 4 modifiche per propagare i permessi
- ✅ `frontend/src/types/message.ts` - già corretto
- ✅ `frontend/src/App.tsx` - già corretto

## Compatibilità

Le modifiche sono retrocompatibili:
- I documenti esistenti avranno `allow_preview=true` e `allow_download=true` di default
- Il backend usa `r.get("allow_preview", True)` come fallback
- Il frontend gestisce correttamente l'assenza dei campi con `!== false`

## Note Tecniche

- Il campo `allow_preview` controlla se il documento può essere visualizzato/scaricato
- Il campo `allow_download` controlla se il file viene scaricato o solo visualizzato
- I permessi sono memorizzati nella tabella `rag_documents` del database
- La route `/api/rag/download/{document_id}` rispetta già questi permessi (implementato in `rag_routes.py`)
