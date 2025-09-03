FROM python:3.11-slim

WORKDIR /app

# Installa dipendenze sistema necessarie
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    libsndfile1 \
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

# Opzionalmente pre-download dei modelli (disabilitato di default per evitare download Whisper durante build)
ARG DOWNLOAD_MODELS=false
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
            echo "[build] Pre-download dei modelli abilitato" && \
            python app/scripts/download_models.py --whisper small \
                --embeddings sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 \
                --piper it_IT-riccardo-x_low \
                --piper it_IT-paola-medium || true ; \
        else \
            echo "[build] Skipping model pre-download (DOWNLOAD_MODELS=false)" ; \
        fi

# Imposta variabili d'ambiente
ENV PYTHONUNBUFFERED=1 \
    WHISPER_AUTO_DOWNLOAD=0 \
    WHISPER_WARMUP=0
ENV PYTHONPATH=/app

EXPOSE 8005

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
