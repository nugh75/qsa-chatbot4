# Guida Amministratore Applicazione QSA Chatbot (Backend Copy)

Questa è la versione backend (duplicata) della guida completa. La versione primaria nel repository root può essere modificata; durante il build o al primo accesso l'endpoint sincronizzerà verso `storage/admin/ADMIN_GUIDE.md` se più recente.

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

Mappa Tab (logica tipica – i nomi possono variare):
| Tab | Scopo | File/Config chiave |
|-----|-------|--------------------|
| Provider | Configurare modelli e TTS | `config/admin_config.json` |
| Prompt | Gestire system & summary prompt | `storage/prompts/` |
| Personalità | Profili stile risposta | `storage/personalities/` |
| Pipeline | Regex topic routing + validazione | `config/pipeline_config.json` |
| Contenuti | File markdown per topic | `storage/pipeline_files/` |
| RAG | Aggiunta/indicizzazione sorgenti | `storage/rag_data/` |
| RAG Admin | Manutenzione indice | Engine + embeddings |
| Feedback | Valutazioni utente | `storage/feedback/` (se presente) |
| Usage | Metriche token/costi | `storage/usage/` |
| Utenti | Gestione account | DB utenti |
| Dispositivi | Fingerprint & sync | DB dispositivi |
| Welcome/Guide | Onboarding dinamico | `storage/welcome-guide/` |
| Log | Log diagnostici | `storage/logs/` |

... (Contenuto completo identico alla guida root originale; mantenere una sola fonte di verità e sincronizzare aggiornamenti.)

---
## Nota Sincronizzazione
Durante il primo accesso all'endpoint `/api/admin/admin-guide` verrà creata (se mancante) o aggiornata la copia in `storage/admin/ADMIN_GUIDE.md` se il file backend ha un `mtime` più recente.

Aggiorna sempre prima il file root e poi copia modifiche qui (o rigenera questa copia durante il build) per evitare divergenze.
