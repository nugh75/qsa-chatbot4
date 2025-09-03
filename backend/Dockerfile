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


# Crea le directory per i volumi e i modelli
RUN mkdir -p storage/databases storage/rag_data storage/feedback storage/usage storage/logs storage/avatars \
    && mkdir -p models/whisper models/piper models/sentence-transformers

# Cache locations for embeddings
ENV SENTENCE_TRANSFORMERS_HOME=/app/models/sentence-transformers \
    HF_HOME=/app/models/sentence-transformers/hf_cache

# Opzionale: pre-download modelli base + piper/coqui extra
ARG DOWNLOAD_MODELS=false
ARG PIPER_PRELOAD_VOICES=""
ARG COQUI_PRELOAD_MODELS=""

# Base models (whisper + embeddings + core piper voices)
RUN if [ "$DOWNLOAD_MODELS" = "true" ]; then \
      echo "[build] Pre-download base models" && \
      python app/scripts/download_models.py --whisper small \
        --embeddings sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 \
        --piper it_IT-riccardo-low \
        --piper it_IT-paola-medium || true; \
    else \
      echo "[build] Skipping base model pre-download (DOWNLOAD_MODELS=false)"; \
    fi

# Optional Piper & Coqui preload combined (Python handles empty lists gracefully)
RUN python - <<'PY' || true
import os, asyncio

voices = [v.strip() for v in os.getenv('PIPER_PRELOAD_VOICES','').split(',') if v.strip()]
models = [m.strip() for m in os.getenv('COQUI_PRELOAD_MODELS','').split(',') if m.strip()]

async def preload_piper(vlist):
    if not vlist:
        print('[build] No Piper preload voices')
        return
    from app.tts import ensure_piper_voice_downloaded
    for v in vlist:
        try:
            print(f'[build] downloading piper voice {v}')
            await ensure_piper_voice_downloaded(v)
        except Exception as e:
            print(f'[build] piper voice {v} failed: {e}')

def preload_coqui(mlist):
    if not mlist:
        print('[build] No Coqui preload models')
        return
    from TTS.api import TTS
    for m in mlist:
        try:
            print(f'[build] downloading coqui model {m}')
            _ = TTS(model_name=m)
        except Exception as e:
            print(f'[build] coqui model {m} failed: {e}')

async def main():
    await preload_piper(voices)
    preload_coqui(models)

asyncio.run(main())
PY

# Imposta variabili d'ambiente
ENV PYTHONUNBUFFERED=1 \
    WHISPER_AUTO_DOWNLOAD=0 \
    WHISPER_WARMUP=0
ENV PYTHONPATH=/app

EXPOSE 8005

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
