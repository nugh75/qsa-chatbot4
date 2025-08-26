# QSA Chatbot – Advanced AI Counselorbot / Chatbot AI Avanzato per Counseling

**English** | [Italiano](#italiano)

## 🚀 Features

An advanced AI chatbot with comprehensive RAG (Retrieval-Augmented Generation) system, user management, and multi-provider AI support. Features a complete admin panel for content management and user administration.

### Core Features
- **🤖 Multiple AI Providers**: Gemini, OpenAI, Claude, OpenRouter, Ollama, Local
- **🎵 Text-to-Speech**: Edge TTS, ElevenLabs, OpenAI Voice, Piper  
- **🎤 Speech-to-Text**: Voice recording support with Whisper
- **📚 Advanced RAG System**: PDF upload, document chunking, semantic search with HuggingFace embeddings
- **👥 User Management**: Complete admin interface for user administration
- **🎛️ Admin Panel**: Full configuration dashboard (password: `Lagom192.`)
- **🎨 Modern Interface**: Clean design with professional SVG icons
- **💾 Chat Export**: JSON conversation export
- **🔒 Security**: JWT authentication, encrypted conversations

### RAG System
- **📄 PDF Processing**: Automatic text extraction and intelligent chunking
- **🧠 Semantic Search**: HuggingFace sentence-transformers with FAISS vector indexing
- **📁 Document Groups**: Organize content by topics and contexts
- **🎯 Context Selection**: Dynamic context switching during conversations
- **📊 Analytics**: Document usage statistics and search performance

### Admin Features
- **👤 User Management**: View, delete users, reset passwords
- **📚 Content Management**: Upload PDFs, create document groups
- **⚙️ System Configuration**: AI providers, TTS settings, prompts
- **📈 Usage Analytics**: Track system usage and performance
- **🔧 Pipeline Management**: Configure topic routing and file processing

## 📋 Prerequisites

- **Python 3.9+**
- **Node.js 16+** 
- **npm or yarn**

## 🛠️ Installation & Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd qsa-chatbot
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# macOS/Linux:
source .venv/bin/activate
# Windows:
# .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```

### 4. Environment Configuration

Create `.env` file in `backend/` directory:

```env
# Provider API keys (optional)
GOOGLE_API_KEY="your_google_api_key"
ANTHROPIC_API_KEY="your_anthropic_api_key" 
OPENAI_API_KEY="your_openai_api_key"
OPENROUTER_API_KEY="your_openrouter_api_key"
ELEVENLABS_API_KEY="your_elevenlabs_api_key"

# Ollama (if using custom server)
OLLAMA_BASE_URL="http://localhost:11434"
```

## 🏃‍♂️ Quick Start

### Option 1: Manual Start (Recommended)
```bash
# Terminal 1: Start Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8005

# Terminal 2: Start Frontend  
cd frontend
npm run dev -- --port 5175
```

### Option 2: Using Start Script
```bash
# Start both backend and frontend
./start.sh

# Stop both services
./stop.sh
```

### Option 3: Docker Compose
```bash
docker compose up --build
```

## 🌐 Access Points

- **Frontend**: http://localhost:5175
- **Backend API**: http://localhost:8005
- **Admin Panel**: http://localhost:5175/admin (password: `Lagom192.`)
- **API Documentation**: http://localhost:8005/docs

## 🤖 Supported AI Providers

| Provider | Configuration | Models |
|----------|---------------|--------|
| **Google Gemini** | `GOOGLE_API_KEY` | gemini-pro, gemini-1.5-pro, etc. |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4, gpt-3.5-turbo, etc. |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | claude-3, claude-2, etc. |
| **OpenRouter** | `OPENROUTER_API_KEY` | Multiple AI models |
| **Ollama** | `OLLAMA_BASE_URL` | Local/remote server |
| **Local** | None | Rule-based responses |

## 🎵 Supported TTS Providers

| Provider | Configuration | Notes |
|----------|---------------|-------|
| **Edge TTS** | None | Free, Microsoft voices |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Premium voices |
| **OpenAI Voice** | `OPENAI_API_KEY` | 6 voices available |
| **Piper** | None | Local TTS |

## 📚 RAG System Architecture

### Document Processing
- **PDF Upload**: Automatic text extraction using PyPDF2
- **Chunking**: Intelligent text splitting (1000 chars, 200 overlap)
- **Embeddings**: HuggingFace sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
- **Vector Storage**: FAISS indexing for fast similarity search

### Document Organization
- **Groups**: Organize documents by topic/context
- **Metadata**: Track upload dates, file sizes, chunk counts
- **Search**: Semantic search across all or filtered documents
- **Context Selection**: Dynamic context switching in chat

### API Endpoints
- `GET /api/rag/groups` - List document groups
- `POST /api/rag/groups` - Create new group
- `POST /api/rag/upload` - Upload PDF to group
- `POST /api/rag/search` - Semantic search
- `GET /api/rag/context-options` - Available contexts

## � User Management

### Admin Features
- **User List**: View all registered users
- **User Details**: Registration date, last login, activity status
- **Password Reset**: Generate temporary passwords
- **User Deletion**: Remove users and their conversations
- **Search**: Filter users by email

### API Endpoints
- `GET /api/admin/users` - List all users
- `DELETE /api/admin/users/{id}` - Delete user
- `POST /api/admin/users/{id}/reset-password` - Reset password

## 🔐 Security Features

- **JWT Authentication**: Secure API access
- **Password Hashing**: bcrypt for secure password storage
- **Encrypted Conversations**: SQLite with encryption support
- **Admin Protection**: Separate admin authentication
- **API Key Masking**: Sensitive data hidden in UI

## 🐛 Troubleshooting

### Backend Issues
```bash
# Verify virtual environment
source backend/.venv/bin/activate

# Reinstall dependencies
pip install -r backend/requirements.txt

# Check database
ls -la backend/qsa_chatbot.db
```

### RAG System Issues
```bash
# Check RAG data directory
ls -la backend/rag_data/

# Verify model download
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"
```

### Frontend Issues
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

# Italiano

## 🚀 Caratteristiche

Un chatbot AI avanzato con sistema RAG (Retrieval-Augmented Generation) completo, gestione utenti e supporto multi-provider AI. Include un pannello admin completo per la gestione dei contenuti e l'amministrazione degli utenti.

### Funzionalità Principali
- **🤖 Provider AI Multipli**: Gemini, OpenAI, Claude, OpenRouter, Ollama, Local
- **🎵 Text-to-Speech**: Edge TTS, ElevenLabs, OpenAI Voice, Piper
- **🎤 Speech-to-Text**: Supporto registrazione vocale con Whisper
- **📚 Sistema RAG Avanzato**: Upload PDF, chunking documenti, ricerca semantica con embeddings HuggingFace
- **👥 Gestione Utenti**: Interfaccia admin completa per amministrazione utenti
- **🎛️ Pannello Admin**: Dashboard configurazione completa (password: `Lagom192.`)
- **🎨 Interfaccia Moderna**: Design pulito con icone SVG professionali
- **💾 Esportazione Chat**: Esportazione conversazioni in JSON
- **🔒 Sicurezza**: Autenticazione JWT, conversazioni crittografate

### Sistema RAG
- **📄 Processamento PDF**: Estrazione automatica testo e chunking intelligente
- **🧠 Ricerca Semantica**: HuggingFace sentence-transformers con indicizzazione FAISS
- **📁 Gruppi Documenti**: Organizza contenuti per argomenti e contesti
- **🎯 Selezione Contesto**: Cambio dinamico del contesto durante le conversazioni
- **📊 Analytics**: Statistiche uso documenti e performance ricerca

### Funzionalità Admin
- **👤 Gestione Utenti**: Visualizza, elimina utenti, reset password
- **📚 Gestione Contenuti**: Upload PDF, creazione gruppi documenti
- **⚙️ Configurazione Sistema**: Provider AI, impostazioni TTS, prompt
- **📈 Analytics Utilizzo**: Tracciamento utilizzo e performance sistema
- **🔧 Gestione Pipeline**: Configurazione routing topic e processamento file

## 📋 Prerequisiti

- **Python 3.9+**
- **Node.js 16+**
- **npm o yarn**

## 🛠️ Installazione e Configurazione

### 1. Clone Repository
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
# macOS/Linux:
source .venv/bin/activate
# Windows:
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

Crea file `.env` nella directory `backend/`:

```env
# Chiavi API provider (opzionali)
GOOGLE_API_KEY="your_google_api_key"
ANTHROPIC_API_KEY="your_anthropic_api_key"
OPENAI_API_KEY="your_openai_api_key"
OPENROUTER_API_KEY="your_openrouter_api_key"
ELEVENLABS_API_KEY="your_elevenlabs_api_key"

# Ollama (se usi server personalizzato)
OLLAMA_BASE_URL="http://localhost:11434"
```

## 🏃‍♂️ Avvio Rapido

### Opzione 1: Avvio Manuale (Consigliato)
```bash
# Terminal 1: Avvia Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8005

# Terminal 2: Avvia Frontend
cd frontend
npm run dev -- --port 5175
```

### Opzione 2: Script di Avvio
```bash
# Avvia backend e frontend
./start.sh

# Ferma entrambi i servizi
./stop.sh
```

### Opzione 3: Docker Compose
```bash
docker compose up --build
```

## 🌐 Punti di Accesso

- **Frontend**: http://localhost:5175
- **API Backend**: http://localhost:8005
- **Pannello Admin**: http://localhost:5175/admin (password: `Lagom192.`)
- **Documentazione API**: http://localhost:8005/docs

## 🤖 Provider AI Supportati

| Provider | Configurazione | Modelli |
|----------|----------------|---------|
| **Google Gemini** | `GOOGLE_API_KEY` | gemini-pro, gemini-1.5-pro, etc. |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4, gpt-3.5-turbo, etc. |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | claude-3, claude-2, etc. |
| **OpenRouter** | `OPENROUTER_API_KEY` | Modelli AI multipli |
| **Ollama** | `OLLAMA_BASE_URL` | Server locale/remoto |
| **Local** | Nessuna | Risposte rule-based |

## 🎵 Provider TTS Supportati

| Provider | Configurazione | Note |
|----------|----------------|------|
| **Edge TTS** | Nessuna | Gratuito, voci Microsoft |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Voci premium |
| **OpenAI Voice** | `OPENAI_API_KEY` | 6 voci disponibili |
| **Piper** | Nessuna | TTS locale |

## 📚 Architettura Sistema RAG

### Processamento Documenti
- **Upload PDF**: Estrazione automatica testo con PyPDF2
- **Chunking**: Divisione intelligente testo (1000 caratteri, overlap 200)
- **Embeddings**: HuggingFace sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
- **Storage Vettoriale**: Indicizzazione FAISS per ricerca similarità veloce

### Organizzazione Documenti
- **Gruppi**: Organizza documenti per argomento/contesto
- **Metadati**: Traccia date upload, dimensioni file, numero chunk
- **Ricerca**: Ricerca semantica su tutti o documenti filtrati
- **Selezione Contesto**: Cambio dinamico contesto in chat

### Endpoint API
- `GET /api/rag/groups` - Lista gruppi documenti
- `POST /api/rag/groups` - Crea nuovo gruppo
- `POST /api/rag/upload` - Upload PDF in gruppo
- `POST /api/rag/search` - Ricerca semantica
- `GET /api/rag/context-options` - Contesti disponibili

## 👥 Gestione Utenti

### Funzionalità Admin
- **Lista Utenti**: Visualizza tutti gli utenti registrati
- **Dettagli Utente**: Data registrazione, ultimo login, stato attività
- **Reset Password**: Genera password temporanee
- **Eliminazione Utente**: Rimuovi utenti e loro conversazioni
- **Ricerca**: Filtra utenti per email

### Endpoint API
- `GET /api/admin/users` - Lista tutti gli utenti
- `DELETE /api/admin/users/{id}` - Elimina utente
- `POST /api/admin/users/{id}/reset-password` - Reset password

## 🔐 Funzionalità di Sicurezza

- **Autenticazione JWT**: Accesso API sicuro
- **Hash Password**: bcrypt per storage password sicuro
- **Conversazioni Crittografate**: SQLite con supporto crittografia
- **Protezione Admin**: Autenticazione admin separata
- **Mascheramento API Key**: Dati sensibili nascosti in UI

## 🐛 Risoluzione Problemi

### Problemi Backend
```bash
# Verifica virtual environment
source backend/.venv/bin/activate

# Reinstalla dipendenze
pip install -r backend/requirements.txt

# Controlla database
ls -la backend/qsa_chatbot.db
```

### Problemi Sistema RAG
```bash
# Controlla directory dati RAG
ls -la backend/rag_data/

# Verifica download modello
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"
```

### Problemi Frontend
```bash
# Pulisci cache e reinstalla
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## 📁 Struttura Progetto

```
qsa-chatbot/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py         # Entry point
│   │   ├── rag_engine.py   # RAG core system
│   │   ├── rag_routes.py   # RAG API endpoints
│   │   ├── admin.py        # Admin endpoints
│   │   ├── auth.py         # Authentication
│   │   ├── chat.py         # Chat functionality
│   │   └── ...
│   ├── rag_data/           # RAG documents and indexes
│   ├── requirements.txt    # Python dependencies
│   └── .env               # Environment variables
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminRAGManagement.tsx
│   │   │   ├── AdminUserManagement.tsx
│   │   │   ├── RAGContextSelector.tsx
│   │   │   └── ...
│   │   ├── AdminPanel.tsx  # Main admin interface
│   │   └── App.tsx        # Main app
│   └── package.json       # Node dependencies
├── data/                  # Legacy knowledge files
├── docker-compose.yml     # Docker configuration
├── start.sh              # Start script
├── stop.sh               # Stop script
└── README.md             # This file
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions, please open an issue in the GitHub repository.

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

