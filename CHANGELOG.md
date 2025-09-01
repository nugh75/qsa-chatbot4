# Changelog

All notable changes to this project will be documented in this file.

## v0.5.1 - 2025-09-01

### Changed
- **Frontend**: The "Topic e Fonti" (Topics and Sources) section in the chat is now collapsible to improve user experience.
- **Frontend**: The "Topic e Fonti" section now displays document IDs instead of filenames, providing a clearer reference to the source documents.
- **Backend**: Removed the automatic "Fonti consultate" (Sources consulted) section that was appended to the chatbot's response when no explicit citations were found. This gives more control over the output.

### Fixed
- **Frontend**: The list of sources now correctly displays unique document IDs, sorted by relevance, and no longer shows individual data chunks.

## v0.5.0 - 2025-08-31

### Added - Sistema MCP (Model Context Protocol)
- **🔌 Gestione Server MCP**: Sistema completo per l'integrazione di server MCP esterni
  - Pannello admin dedicato per la configurazione dei server MCP
  - Supporto per server email, calendar, filesystem, webscraper, database e custom
  - Gestione credenziali e variabili di ambiente per ogni server
  - Abilitazione/disabilitazione dinamica dei server
  - Test di connessione e monitoraggio dello stato
- **⚙️ Configurazione per Personalità**: Ogni personalità può ora abilitare specifici server MCP
  - Selezione granulare dei server MCP per personalità
  - Integrazione con sistema di pipeline topics e gruppi RAG esistente
- **🛠️ Architettura MCP**: Implementazione backend completa
  - `mcp_servers.py`: Definizione modelli e tipi MCP
  - `mcp_manager.py`: Gestione runtime dei server MCP
  - API endpoints per CRUD operations sui server MCP
  - Storage persistente configurazioni in `/app/storage/mcp_servers/`

### Added - Miglioramenti Personalità
- **🎯 Configurazione Avanzata Personalità**:
  - **Pipeline Topics**: Selezione granulare dei topic pipeline abilitati per personalità
  - **Gruppi RAG**: Controllo fine sui gruppi RAG accessibili per personalità
  - **Max Tokens**: Limite configurabile di token per personalità
  - **Server MCP**: Abilitazione selettiva server MCP per personalità
- **🖼️ Anteprima Migliorata**: Fix anteprima avatar nei form di modifica personalità
- **📋 Display Completo**: Box personalità ora mostra anteprima avatar, prompt e configurazioni attive

### Added - Funzionalità Frontend
- **📱 Tab MCP dedicata**: Nuovo tab "MCP Servers" nel pannello admin
- **🔧 Interfaccia Gestione MCP**: Componente `MCPPanel.tsx` per gestione completa server MCP
  - Creazione, modifica, eliminazione server MCP
  - Test connessione in tempo reale
  - Gestione configurazioni complesse (command, args, env)
  - Monitoraggio stato e capabilities
- **⚡ Selezione Multi-opzione**: Miglioramenti UX per selezione pipeline, RAG e MCP nelle personalità

### Changed
- **📊 Modello Dati Personalità**: Esteso con nuovi campi per controllo granulare
- **🎛️ Pannello Admin**: Riorganizzazione per includere sezione MCP dedicata
- **🔄 API Personalità**: Aggiornamento endpoint per supportare nuovi parametri di configurazione

### Technical Improvements
- **🏗️ Architettura Modulare MCP**: Sistema estensibile per nuovi tipi di server MCP
- **💾 Storage Persistente**: Configurazioni MCP persistenti tramite Docker volumes
- **🔒 Gestione Sicurezza**: Handling sicuro di credenziali e variabili di ambiente MCP
- **📡 API RESTful**: Endpoint completi per gestione CRUD server MCP
- **🧪 Testing System**: Sistema di test integrato per validazione connessioni MCP

### Notes
- I server MCP sono in fase di implementazione e verranno attivati nella prossima release
- La configurazione MCP è già disponibile nel pannello admin per preparazione
- I server Gmail, Calendar e altri provider saranno aggiunti gradualmente

## v0.4.0 - 2025-08-30

### Added
- Admin / Pipeline:
  - Colonna File nelle Routes con apertura diretta del contenuto associato.
  - Editor file unificato: lista cliccabile dei file direttamente nel tab "File Editor".
  - (Preparazione) Dialog per creazione/modifica route (pattern, topic, selezione/creazione file .md). *Se la creazione file via dialog verrà completata aggiungere qui la conferma definitiva.*
- Admin / Usage & Feedback:
  - Tabella dettagliata (provider, modello LLM, personalità, topic, latency ms, token usage) con filtri multipli e base per paginazione / sorting.

### Changed
- Admin / Pipeline:
  - Rimossa sidebar editor delle routes; sostituita con approccio basato su dialog (work in progress se non già attivo completamente).
  - Rimossi tab "Files" e componente di test debug pipeline (DebugPipelineTest).
  - Snellito layout toolbar (filtro, test regex, refresh, bulk delete).
- Admin / Usage:
  - Rimosso "Riepilogo conversazione" obsoleto.
  - Interfaccia unificata per usage e feedback (tabella filtrabile) con metadata centrale.

### Fixed
- File editor: apertura file dalla colonna non cambia più tab erroneamente.
- Eliminato comportamento che chiudeva il box file editor quando si cliccava un file.

### Removed
- DebugPipelineTest component (box test API pipeline).
- Vecchio tab "Files" del pannello Pipeline.
- Riepilogo conversazioni dal pannello amministrazione.

### Migration / Notes
- Verificare che il volume montato contenga i file markdown richiesti; la creazione di nuovi file .md avverrà via dialog (se attivata completamente).
- Aggiornare eventuali documentazioni interne che facevano riferimento al tab "Files" o al pannello di riepilogo.

### Next (Ideas)
- Ordinamento colonne usage + esportazione CSV.
- Creazione file .md direttamente nella dialog route (se non già finalizzata).
- Validazione regex live direttamente dentro la dialog (highlight pattern errors).

### Tag & Release
Per creare la release:
```
git pull origin master
git add CHANGELOG.md
git commit -m "chore: release v0.4.0"
git tag -a v0.4.0 -m "Release v0.4.0"
git push origin master --tags
```

## v0.3.0 - 2025-08-28

### Added
- Frontend: Markdown rendering via `react-markdown` + `remark-gfm` with proper GFM tables, inline code and code blocks styling.
- Frontend: Arena page (`/arena`) showing feedback stats by provider, model and personality; chip link in header; visibility toggle (public/admin-only) driven by new admin UI setting.
- Frontend: Admin → Log & Interazioni with:
  - Filters (provider, event, personality, model, conversation, user, topic, RAG yes/no, duration range, tokens range)
  - Group-by Request ID view with aggregated duration and tokens
  - Timeline per request (TS, Δms, event, provider, model, duration, tokens) and raw JSON preview
  - Download JSONL + system.log buttons and detail dialog
  - Loading indicator and clearer empty-state message
- Backend: JSONL interactions logging per day (chat/stream, TTS, ASR) with `request_id`, provider, model, personality, topic, duration_ms, tokens, RAG chunks and user/conversation identifiers.
- Backend: System logging of request start/resolution/done with durations.
- Backend: Admin endpoints for logs: list dates, list interactions (filters + grouping), download system and interactions logs, and filters metadata endpoint.
- Backend: Admin UI setting `arena_public` with GET/POST `/api/admin/ui-settings`; exposed in `/api/config/public`.

### Changed
- Frontend: TTS now sends sanitized plain text (no Markdown markers) to backend.
- Backend: TTS sanitizes Markdown/HTML as fallback before synthesis.
- Backend: Stream chat now emits resolved provider/model event and logs completion with durations.

### Fixed
- Markdown output from LLMs: tables now render as HTML tables (including cases wrapped in code fences and simple dash-based tables converted to GFM).
- TTS no longer speaks Markdown tags/symbols.

### Notes
- To push this release and tag to your remote:
  - `git push origin HEAD --tags`

## v0.2.0 - 2025-08-28

### Added
- Admin-only routing and protection on backend for all `/api/admin/*` endpoints via token (`get_current_admin_user`).
- `authFetch` utility with automatic token refresh and retry on 401 (frontend).
- Admin banner on 401/403 with one-click relog to `/admin`.
- Admin badge in app header when the user has admin privileges.
- Manual chunk splitting in Vite for more predictable bundles (`vendor-react`, `vendor-mui`, etc.).

### Changed
- Unified administration UI to a single route `/admin`; removed `admin-qsa-settings` usage.
- Persist login across hard refresh: frontend holds user session using local data if `/auth/me` temporarily fails.
- Frontend now uses `authFetch` for:
  - Admin panel (all `/api/admin/*` calls)
  - Chat streaming, conversation creation, TTS and ASR endpoints
  - File uploads (FileUpload, FileManager, FileManagerCompact)
- Survey Results visuals: added toggles and zooms
  - Bar/Pie toggle per demographic (Età, Sesso, Istruzione, Tipo Istituto, Provenienza)
  - Collapsible sections, numeric labels on bars, labels on pie sectors (counts only)
  - Line chart for all Likert questions with clickable legend to show/hide series
  - STEM/Umanistiche comparison moved into demographics and tied to selected question
  - Type Istituto grouped by macro-typology (Scuole, Università/AFAM, ITS, Altre) with static mapping `frontend/public/istituto_mapping.json`
  - Zoom-to-fullscreen for each demographic chart

### Fixed
- Removed duplicated “Dati demografici” section in SurveyResults.
- Removed legacy admin password prompt from AdminPanel.

### Notes
- To push this release and tag to your remote:
  - `git push origin master --tags`
- If running in dev, start backend and frontend as usual, then open `/admin` and login with an admin user.

