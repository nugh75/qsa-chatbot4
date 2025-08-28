FROM python:3.11-slim

WORKDIR /app

# Installa dipendenze sistema necessarie
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia e installa dipendenze Python
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copia il codice dell'applicazione
COPY app ./app

# Copia file di configurazione di default
COPY config ./config

# Copia i file seed dei prompt (read-only nel container quando montato volume host)
COPY ../data ./data

# Crea le directory per i volumi e i modelli
RUN mkdir -p storage/databases storage/rag_data storage/feedback storage/usage storage/logs storage/avatars \
    && mkdir -p models/whisper models/piper models/sentence-transformers \
    && mkdir -p data

# Cache locations for embeddings
ENV SENTENCE_TRANSFORMERS_HOME=/app/models/sentence-transformers \
    HF_HOME=/app/models/sentence-transformers/hf_cache

# Pre-download default models (best-effort)
RUN python app/scripts/download_models.py --whisper small \
    --piper it_IT-riccardo-x_low \
    --embeddings sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 || true

# Imposta variabili d'ambiente
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8005

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
