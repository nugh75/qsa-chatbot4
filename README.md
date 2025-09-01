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
- **🎭 Advanced Personalities**: Granular control over AI behavior with pipeline topics, RAG groups, and MCP servers
- **🔌 MCP Integration**: Model Context Protocol support for external services (Email, Calendar, Filesystem, etc.)
- **🎛️ Admin Panel**: Full configuration dashboard (password: `Lagom192.`)
- **🎨 Modern Interface**: Clean design with professional SVG icons
- **💾 Chat Export**: JSON conversation export
- **🔒 Security**: JWT authentication, encrypted conversations

### Recent Improvements
- **Collapsible Sources**: The "Topics and Sources" section in the chat is now collapsible for a cleaner interface.
- **Clearer Document References**: The sources list now displays document IDs for better clarity.
- **Controlled Source Display**: The backend no longer automatically appends a list of consulted sources, giving more control over the chat output.

### RAG System
- **📄 PDF Processing**: Automatic text extraction and intelligent chunking
- **🧠 Semantic Search**: HuggingFace sentence-transformers with FAISS vector indexing
- **📁 Document Groups**: Organize content by topics and contexts
- **🎯 Context Selection**: Dynamic context switching during conversations
- **📊 Analytics**: Document usage statistics and search performance

### Admin Features
- **👤 User Management**: View, delete users, reset passwords
- **📚 Content Management**: Upload PDFs, create document groups
- **🎭 Personality Management**: Configure AI personalities with granular controls
  - **Pipeline Topics**: Select specific topics each personality can handle
  - **RAG Groups**: Control which document groups are accessible
  - **MCP Servers**: Enable specific external services per personality
  - **Token Limits**: Set maximum response tokens per personality
- **🔌 MCP Server Management**: Configure and manage external service integrations
  - **Email Integration**: Gmail, Outlook, and other email providers
  - **Calendar Services**: Google Calendar, Outlook Calendar
  - **File Systems**: Local and cloud file access
  - **Web Scraping**: Automated data extraction
  - **Database Access**: SQL and NoSQL database connections
  - **Custom Servers**: Support for custom MCP implementations
- **⚙️ System Configuration**: AI providers, TTS settings, prompts
- **📈 Usage Analytics**: Track system usage and performance
- **🔧 Pipeline Management**: Configure topic routing and file processing

## 🔌 MCP Integration (Under Development)

The QSA Chatbot includes comprehensive Model Context Protocol (MCP) support for integrating external services and tools. **Note: MCP servers are currently under development and will be fully implemented in future releases.**

### Supported Service Types
- **📧 Email Services**: Gmail, Outlook, IMAP/SMTP
- **📅 Calendar Integration**: Google Calendar, Outlook Calendar
- **📁 File Systems**: Local files, cloud storage (Google Drive, OneDrive)
- **🌐 Web Scraping**: Automated data extraction and analysis
- **💾 Database Access**: SQL and NoSQL database connections
- **🔧 Custom Services**: Support for custom MCP server implementations

### Configuration Features
- **Per-Personality Access**: Enable specific MCP servers for different AI personalities
- **Security Controls**: Granular permissions and access restrictions
- **Connection Testing**: Built-in tools to verify server connectivity
- **Real-time Monitoring**: Live status updates and error reporting

### Implementation Status
- ✅ **MCP Protocol Framework**: Core infrastructure implemented
- ✅ **Admin Interface**: Complete management panel with CRUD operations
- ✅ **Personality Integration**: Per-personality MCP server selection
- 🚧 **Server Implementations**: Individual service connectors in development
- 🚧 **Authentication**: OAuth2 and secure credential management
- 🚧 **Error Handling**: Robust error recovery and fallback mechanisms

### Future Capabilities
- **Smart Workflows**: Automated task chains across multiple services
- **Context Sharing**: Seamless data flow between integrated services
- **Performance Optimization**: Intelligent caching and request batching

## 🎭 Advanced Personality System

The QSA Chatbot features a sophisticated personality management system that allows granular control over AI behavior and capabilities.

### Personality Configuration
Each personality can be configured with:

#### **📋 Basic Settings**
- **Name & Description**: Unique identifier and description
- **Avatar**: Custom avatar image upload with preview
- **System Prompt**: Core instructions defining personality behavior
- **Welcome Message**: Initial greeting for users

#### **🎯 Pipeline Topics**
- **Selective Topic Handling**: Choose which conversation topics the personality can process
- **Topic Routing**: Automatic routing to appropriate knowledge bases
- **Context Awareness**: Topic-specific responses and knowledge retrieval

#### **📚 RAG Group Access**
- **Document Access Control**: Select which document groups the personality can access
- **Knowledge Scope**: Limit or expand knowledge base per personality
- **Contextual Retrieval**: Personality-specific document retrieval

#### **🔌 MCP Server Integration**
- **Service Selection**: Enable specific external services per personality
- **Capability Control**: Granular access to email, calendar, filesystem, etc.
- **Security Boundaries**: Limit external service access per use case

#### **⚙️ Response Configuration**
- **Max Tokens**: Set maximum response length per personality
- **Response Style**: Control verbosity and detail level
- **Behavior Constraints**: Define personality-specific limitations

### Use Case Examples

#### **📧 Email Assistant Personality**
```json
{
  "name": "Email Assistant",
  "enabled_pipeline_topics": ["email", "communication"],
  "enabled_rag_groups": [1, 3], // Email docs, Communication guides
  "enabled_mcp_servers": ["gmail-server", "calendar-server"],
  "max_tokens": 500
}
```

#### **📚 Research Assistant Personality**
```json
{
  "name": "Research Assistant",
  "enabled_pipeline_topics": ["research", "analysis"],
  "enabled_rag_groups": [2, 4, 5], // Research docs, Academic papers
  "enabled_mcp_servers": ["web-scraper", "database-server"],
  "max_tokens": 1000
}
```

#### **👥 Customer Support Personality**
```json
{
  "name": "Customer Support",
  "enabled_pipeline_topics": ["support", "troubleshooting"],
  "enabled_rag_groups": [6], // Support documentation
  "enabled_mcp_servers": ["ticket-system"],
  "max_tokens": 300
}
```

### Admin Interface
The personality management interface provides:
- **Visual Configuration**: Drag-and-drop topic and service selection
- **Real-time Preview**: See personality configuration in real-time
- **Bulk Operations**: Configure multiple personalities efficiently
- **Testing Tools**: Test personality responses with different configurations

### API Endpoints
- `GET /api/admin/personalities` - List all personalities
- `POST /api/admin/personalities` - Create new personality
- `PUT /api/admin/personalities/{id}` - Update personality
- `DELETE /api/admin/personalities/{id}` - Delete personality
- `GET /api/admin/pipeline-topics` - Get available pipeline topics
- `GET /api/admin/rag-groups` - Get available RAG groups

This advanced personality system enables creating specialized AI assistants for different use cases while maintaining security and performance boundaries.

## � Quick Start  
- **🎤 Speech-to-Text**: Voice recording support with Whisper
- **📚 Advanced RAG System**: PDF upload, document chunking, semantic search with HuggingFace embeddings
- **👥 User Management**: Complete admin interface for user administration
- **� Advanced Personalities**: Granular control over AI behavior with pipeline topics, RAG groups, and MCP servers
- **🔌 MCP Integration**: Model Context Protocol support for external services (Email, Calendar, Filesystem, etc.)
- **�🎛️ Admin Panel**: Full configuration dashboard (password: `Lagom192.`)
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
- **🎭 Personality Management**: Configure AI personalities with granular controls
  - **Pipeline Topics**: Select specific topics each personality can handle
  - **RAG Groups**: Control which document groups are accessible
  - **MCP Servers**: Enable specific external services per personality
  - **Token Limits**: Set maximum response tokens per personality
- **🔌 MCP Server Management**: Configure and manage external service integrations
  - **Email Integration**: Gmail, Outlook, and other email providers
  - **Calendar Services**: Google Calendar, Outlook Calendar
  - **File Systems**: Local and cloud file access
  - **Web Scraping**: Automated data extraction
  - **Database Access**: SQL and NoSQL database connections
  - **Custom Servers**: Support for custom MCP implementations
- **⚙️ System Configuration**: AI providers, TTS settings, prompts
- **📈 Usage Analytics**: Track system usage and performance
- **🔧 Pipeline Management**: Configure topic routing and file processing

## 📋 Prerequisites

- **Python 3.9+**
- **Node.js 16+** 
 - **npm or yarn**

## 📦 Large Models and Data (Do Not Commit)

- Store local models and generated indexes only in `backend/models/` and `backend/storage/`.
- Git ignores common large artifacts: `*.pt`, `*.onnx`, `*.faiss`, `*.safetensors`, `*.bin`, `*.npy`, `*.npz` and the directories above.
- If something was accidentally tracked before, untrack without deleting locally:
  `git rm --cached -r backend/models backend/storage && git commit -m "chore: stop tracking local models"`.

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

### Avatar Storage Persistence & Permissions (EN)
Personality avatar uploads are saved under `./backend/storage/avatars` on the host (mapped to `/app/storage/avatars` in the container). If after an upload the avatar disappears after restart or returns 500 errors:

1. Inspect backend logs for lines starting with `[storage-diag]` (printed once at startup) and any `Errore upload avatar` details.
2. Check host directory exists and is writable:
  ```bash
  ls -ld backend/storage backend/storage/avatars
  ```
3. Fix permissions (development):
  ```bash
  chmod -R u+rwX backend/storage
  ```
4. If running as a non-root UID in future, ensure ownership matches: `chown -R <uid>:<gid> backend/storage`.
5. SELinux (Fedora/RHEL) may require: `chcon -Rt svirt_sandbox_file_t backend/storage`.

Common error messages:
- `Directory avatars non scrivibile`: the directory exists but cannot be written; adjust mode or ownership.
- `Permesso negato scrivendo`: host FS (e.g. NFS with root_squash) denies write; change owner to your user or configure Docker to use a matching UID.

Files are served at `/static/avatars/<filename>`; cache busting uses timestamped filenames.

### Persistenza e Permessi Avatar (IT)
Gli avatar delle personalità sono salvati in `./backend/storage/avatars` (container: `/app/storage/avatars`). Se non restano dopo il riavvio o l'upload fallisce:

1. Controlla i log backend: `docker compose logs backend | grep storage-diag`.
2. Verifica permessi:
  ```bash
  ls -ld backend/storage backend/storage/avatars
  ```
3. Concedi scrittura (solo dev):
  ```bash
  chmod -R u+rwX backend/storage
  ```
4. Se usi SELinux: `chcon -Rt svirt_sandbox_file_t backend/storage`.
5. Se vedi `Permesso negato`, verifica owner: `chown -R $(id -u):$(id -g) backend/storage`.

Gli URL pubblici sono `/static/avatars/<filename>?v=<ts>`.

### Prefetch Models (Local)
```bash
make models  # downloads Whisper small, Piper it_IT-riccardo-x_low, and embeddings cache
```

## 🌐 Access Points

- **Frontend**: http://localhost:5175
- **Backend API**: http://localhost:8005
- **Admin Panel**: http://localhost:5175/admin (password: `Lagom192.`)
- **API Documentation**: http://localhost:8005/docs

### Admin Panel Features
- **🎭 Personalities**: Configure AI personalities with granular controls
- **🔌 MCP Servers**: Manage external service integrations
- **📚 RAG Management**: Upload documents and manage knowledge groups
- **👥 User Management**: Admin user operations and analytics
- **⚙️ System Config**: AI providers, TTS, embeddings, and more
- **📊 Usage Analytics**: Monitor system performance and usage
- **🔧 Pipeline Management**: Configure topic routing and processing

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

## � MCP (Model Context Protocol) Integration

### Overview
The QSA Chatbot now supports MCP (Model Context Protocol) integration, allowing connection to external services and tools to extend AI capabilities. MCP servers can provide additional functionality like email access, calendar management, file operations, and more.

### Supported MCP Server Types
- **📧 Email Servers**: Gmail, Outlook, SMTP providers
- **📅 Calendar Servers**: Google Calendar, Outlook Calendar
- **📁 File System Servers**: Local directories, cloud storage
- **🌐 Web Scraper Servers**: Automated data extraction
- **🗄️ Database Servers**: SQL and NoSQL database access
- **🛠️ Custom Servers**: Support for custom MCP implementations

### Configuration
MCP servers are configured through the Admin Panel:

1. **Navigate to Admin Panel** → MCP Servers tab
2. **Add New Server**: Configure command, arguments, environment variables
3. **Test Connection**: Verify server functionality
4. **Enable for Personalities**: Select which personalities can use each server

### Per-Personality MCP Configuration
Each personality can be configured to use specific MCP servers:
- **Granular Control**: Enable only relevant servers per personality
- **Security**: Limit access to sensitive services
- **Performance**: Reduce overhead by enabling only needed services
- **Flexibility**: Different personalities for different use cases

### Example Use Cases
- **Email Assistant**: Personality with Gmail MCP for email management
- **Calendar Bot**: Personality with calendar MCP for scheduling
- **File Manager**: Personality with filesystem MCP for file operations
- **Research Assistant**: Personality with web scraper MCP for data gathering

### API Endpoints
- `GET /api/admin/mcp-servers` - List configured MCP servers
- `POST /api/admin/mcp-servers` - Create new MCP server
- `PUT /api/admin/mcp-servers/{id}` - Update MCP server
- `DELETE /api/admin/mcp-servers/{id}` - Delete MCP server
- `POST /api/admin/mcp-servers/{id}/test` - Test MCP server connection

### Storage
MCP configurations are stored persistently in:
- **Configuration**: `/app/storage/mcp_servers/mcp_servers.json`
- **Credentials**: Environment variables and secure storage
- **Logs**: Server status and connection logs

*Note: MCP integration is currently in development phase. Full functionality will be available in upcoming releases.*

## �📚 RAG System Architecture

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

### Miglioramenti Recenti
- **Fonti Comprimibili**: La sezione "Topic e Fonti" nella chat è ora comprimibile per un'interfaccia più pulita.
- **Riferimenti ai Documenti più Chiari**: L'elenco delle fonti ora mostra gli ID dei documenti per una maggiore chiarezza.
- **Visualizzazione Controllata delle Fonti**: Il backend non aggiunge più automaticamente un elenco di fonti consultate, offrendo un maggiore controllo sulla risposta del chat.

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

## 📦 Modelli e Dati Grandi (Non Committare)

- Salva modelli locali e indici generati solo in `backend/models/` e `backend/storage/`.
- Git ignora file pesanti comuni: `*.pt`, `*.onnx`, `*.faiss`, `*.safetensors`, `*.bin`, `*.npy`, `*.npz` e le directory indicate.
- Se alcuni file sono già tracciati per errore, rimuovili dal tracking senza cancellarli localmente:
  `git rm --cached -r backend/models backend/storage && git commit -m "chore: stop tracking local models"`.

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

### Persistenza & Permessi Avatar
Vedi sezione inglese sopra. In breve: la directory host `backend/storage/avatars` deve essere scrivibile. Il backend logga una diagnostica `[storage-diag]` all'avvio con permessi, mode e test scrittura. Correggi i permessi se necessario e ricarica la pagina.

### Precarica Modelli (Locale)
```bash
make models  # scarica Whisper small, Piper it_IT-riccardo-x_low e cache embeddings
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

# Multi Summary Prompts

Il sistema supporta ora più profili di summary prompt memorizzati in `backend/storage/summary/SUMMARY_PROMPTS.json`.
Struttura file:
```
{
  "active_id": "default",
  "prompts": [
    {"id": "default", "name": "Default", "text": "..."}
  ]
}
```
Operazioni disponibili nel pannello Admin:
- Creazione nuovo profilo
- Selezione e modifica testo
- Attivazione profilo (imposta `active_id`)
- Eliminazione (non è possibile eliminare l'ultimo profilo)
- Reset dal seed (endpoint legacy `/admin/summary-prompt/reset`)

Compatibilità: gli endpoint legacy `/admin/summary-prompt` continuano a funzionare restituendo il testo del profilo attivo.

## 📨 Welcome & Guides Management

Persistent management of multiple initial welcome messages and user guides (help/onboarding texts) is now available via the Admin panel and REST API.

Storage file (seeded automatically if missing): `backend/storage/welcome-guide/welcome_guide.json`

Example structure:
```json
{
  "welcome": {
    "active_id": "wm_ab12cd34",
    "messages": [
      { "id": "wm_ab12cd34", "title": "Default", "content": "Welcome to the platform..." }
    ]
  },
  "guides": {
    "active_id": "gd_ef56ab78",
    "guides": [
      { "id": "gd_ef56ab78", "title": "Getting Started", "content": "How to use the system..." }
    ]
  }
}
```

### API Endpoints (Base prefix: `/api/welcome-guides`)

Public / read endpoints (no admin token required):
- `GET /api/welcome-guides/state` – Full raw state (ids + all entries)
- `GET /api/welcome-guides/welcome` – List welcome messages
- `GET /api/welcome-guides/guides` – List guides
- `GET /api/welcome-guides/welcome/active` – Active welcome message object or null
- `GET /api/welcome-guides/guides/active` – Active guide object or null
- `GET /api/welcome-guides/public` – Convenience combined payload `{ welcome, guide }` (only active ones)

Admin-only (create / modify) endpoints:
- `POST /api/welcome-guides/welcome` – Create welcome message `{ title?, content }`
- `POST /api/welcome-guides/guides` – Create guide `{ title?, content }`
- `PUT /api/welcome-guides/welcome/{id}` – Update welcome message
- `PUT /api/welcome-guides/guides/{id}` – Update guide
- `DELETE /api/welcome-guides/welcome/{id}` – Delete welcome message (auto reassigns active if needed)
- `DELETE /api/welcome-guides/guides/{id}` – Delete guide (auto reassigns active if needed)
- `POST /api/welcome-guides/activate` – Activate an entry `{ id, kind: "welcome" | "guide" }`

Behavior notes:
- First created item in each category becomes active automatically if none set.
- Deleting the active item promotes the first remaining item (if any) or sets `active_id` to null.
- IDs are short UUID derived (`wm_########` / `gd_########`).
- File access is guarded by a threading lock to avoid race conditions.
- Volume persistence ensured by Docker compose mapping: `./backend/storage/welcome-guide:/app/storage/welcome-guide`.

Frontend integration: a new "Welcome" management tab in the Admin panel allows CRUD + activation without manual API calls.

---

## 📨 Gestione Welcome & Guide (Italiano)

Gestione persistente di più messaggi iniziali (welcome) e guide di onboarding tramite pannello Admin e API REST.

File di storage (creato con seed se assente): `backend/storage/welcome-guide/welcome_guide.json`

Struttura di esempio (vedi sopra per dettagli): contiene due sezioni `welcome` e `guides`, ognuna con `active_id` e un array di oggetti `{ id, title?, content }`.

### Endpoint API (prefisso base: `/api/welcome-guides`)

Lettura pubblica (nessun token admin richiesto):
- `GET /api/welcome-guides/state` – Stato completo
- `GET /api/welcome-guides/welcome` – Lista messaggi welcome
- `GET /api/welcome-guides/guides` – Lista guide
- `GET /api/welcome-guides/welcome/active` – Messaggio welcome attivo o null
- `GET /api/welcome-guides/guides/active` – Guida attiva o null
- `GET /api/welcome-guides/public` – Payload combinato solo con gli attivi `{ welcome, guide }`

Solo Admin (creazione / modifica):
- `POST /api/welcome-guides/welcome` – Crea welcome `{ title?, content }`
- `POST /api/welcome-guides/guides` – Crea guida `{ title?, content }`
- `PUT /api/welcome-guides/welcome/{id}` – Aggiorna welcome
- `PUT /api/welcome-guides/guides/{id}` – Aggiorna guida
- `DELETE /api/welcome-guides/welcome/{id}` – Elimina welcome (riallinea attivo se necessario)
- `DELETE /api/welcome-guides/guides/{id}` – Elimina guida (riallinea attivo se necessario)
- `POST /api/welcome-guides/activate` – Attiva elemento `{ id, kind }`

Note comportamento:
- Il primo elemento creato diventa attivo se non esiste `active_id`.
- Eliminando l'elemento attivo si promuove il primo restante o `null`.
- Persistenza garantita in Docker tramite volume `./backend/storage/welcome-guide:/app/storage/welcome-guide`.

Integrazione frontend: nuova tab "Welcome" nel pannello Admin con CRUD e attivazione.
