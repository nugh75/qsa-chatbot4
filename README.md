# QSA Chatbot – Counselorbot

Un chatbot AI avanzato con supporto per multiple piattaforme AI e sintesi vocale.
Integra una RAG "leggera" che instrada le richieste verso 4 file di conoscenza e 
usa l'avatar personalizzato `volto.png`.

## 🚀 Funzionalità

- **Multiple AI Providers**: Gemini, OpenAI, Claude, OpenRouter, Ollama, Local
- **Text-to-Speech**: Edge TTS, ElevenLabs, OpenAI Voice, Piper
- **Speech-to-Text**: Supporto per registrazione vocale
- **Pannello Amministratore**: Configurazione completa (password: `Lagom192.`)
- **Interfaccia Moderna**: Design pulito con icone SVG professionali
- **RAG Topic-based**: 4 file di conoscenza (analisi secondo livello, fattori cognitivi, essere artefice di sé, FAQ)
- **Download Chat**: Esportazione conversazioni in JSON
- **Avatar Personalizzato**: Basato su `volto.png`

## 📋 Prerequisiti

- **Python 3.9+**
- **Node.js 16+**
- **npm o yarn**

## 🛠️ Installazione e Setup

### 1. Clone del repository
```bash
git clone <repository-url>
cd qsa-chatbot
```

### 2. Setup Backend
```bash
cd backend

# Crea virtual environment
python -m venv .venv

# Attiva virtual environment
# Su macOS/Linux:
source .venv/bin/activate
# Su Windows:
# .venv\Scripts\activate

# Installa dipendenze
pip install -r requirements.txt
```

### 3. Setup Frontend
```bash
cd ../frontend
npm install
```

### 4. Configurazione Environment

Crea il file `.env` nella directory `backend/`:

```env
# Provider keys (opzionali)
GOOGLE_API_KEY="your_google_api_key"
ANTHROPIC_API_KEY="your_anthropic_api_key"
OPENAI_API_KEY="your_openai_api_key"
OPENROUTER_API_KEY="your_openrouter_api_key"
ELEVENLABS_API_KEY="your_elevenlabs_api_key"

# Ollama (se usi server personalizzato)
OLLAMA_BASE_URL="http://localhost:11434"
```

## 🏃‍♂️ Avviohatbot – Counselorbot

Progetto completo (frontend React/Vite + backend FastAPI) per un chatbot
che segue le linee guida di **CLAUDE.md** e usa l’avatar `volto.png`.
Il bot integra una RAG “leggera” che instrada le richieste verso 4 file di
conoscenza: analisi di secondo livello, fattori cognitivi, essere artefice di sé,
FAQ.

## Porte
- Frontend: http://localhost:5175
- Backend:  http://localhost:8005

## Avvio rapido (senza Docker)
1. **Backend**
   ```bash
   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   # copia .env.example in .env e inserisci le chiavi se vuoi usare provider reali
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8005
   ```
2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev -- --port 5175
   ```

## Avvio con Docker Compose (opzionale)
```bash
docker compose up --build
```
> Funzionerà anche senza chiavi API: verrà usato il provider locale “rule‑based”.
> Per usare Gemini/Claude/ OpenAI, vedi `ISTRUZIONI.md`.

## Funzionalità chiave
- Avatar del bot basato su `volto.png`
- Download conversazione in JSON
- Clear chat alla chiusura della tab
- Provider LLM selezionabile (default `local`); supporto opzionale a Gemini/Claude/OpenAI
- RAG “per topic” che inserisce nel contesto i testi dei 4 file
- Endpoint TTS (ElevenLabs) e ASR (Whisper) predisposti (facoltativi)

## Struttura
- `frontend/` React + Vite + MUI
- `backend/` FastAPI + routing topic + RAG lite
- `data/` file di conoscenza e CLAUDE.md

```text
qsa-chatbot/
  frontend/
  backend/
  data/
  ISTRUZIONI.md
  README.md
  docker-compose.yml
```

## 🤖 Provider AI Supportati

| Provider | Configurazione | Note |
|----------|----------------|------|
| **Google Gemini** | `GOOGLE_API_KEY` | Modelli: gemini-pro, gemini-1.5-pro, etc. |
| **OpenAI** | `OPENAI_API_KEY` | Modelli: gpt-4, gpt-3.5-turbo, etc. |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | Modelli: claude-3, claude-2, etc. |
| **OpenRouter** | `OPENROUTER_API_KEY` | Accesso a multiple AI |
| **Ollama** | `OLLAMA_BASE_URL` | Server locale o remoto |
| **Local** | Nessuna | Per modelli locali |

## 🎵 Provider TTS Supportati

| Provider | Configurazione | Note |
|----------|----------------|------|
| **Edge TTS** | Nessuna | Gratuito, voci Microsoft |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Voci premium |
| **OpenAI Voice** | `OPENAI_API_KEY` | 6 voci disponibili |
| **Piper** | Nessuna | TTS locale |

## 🔐 Sicurezza

- Le API key sono gestite tramite variabili di ambiente
- Il pannello admin è protetto da password
- I file sensibili sono esclusi da Git
- Le API key sono mascherate nell'interfaccia

## 🐛 Risoluzione Problemi

### Backend non si avvia

```bash
# Verifica che il virtual environment sia attivo
source backend/.venv/bin/activate

# Reinstalla dipendenze
pip install -r backend/requirements.txt
```

### Provider non funziona

1. Verifica che le API key siano configurate nel file `.env`
2. Controlla che il provider sia abilitato nel pannello admin
3. Testa la connessione usando il pulsante "Test" nel pannello admin

### Audio non funziona

1. Verifica che il provider TTS sia abilitato
2. Per ElevenLabs/OpenAI, controlla le API key
3. Per Edge TTS, verifica la connessione internet

## 📋 Note Aggiuntive

- **Funziona anche senza API key**: Il provider locale "rule-based" è sempre disponibile
- **Docker Compose**: Disponibile per deployment rapido
- **RAG Intelligente**: Routing automatico verso 4 file di conoscenza
- **Download Chat**: Esportazione conversazioni in JSON
- **Clear automatico**: La chat si resetta alla chiusura della tab

