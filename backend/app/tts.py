import os, httpx, base64, asyncio, re
import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from .logging_utils import log_interaction, log_system
import tempfile
import io

try:
    import piper
    PIPER_AVAILABLE = True
except ImportError:
    PIPER_AVAILABLE = False

router = APIRouter()

class TTSRequest(BaseModel):
    text: str
    provider: str = "edge"  # edge, elevenlabs, openai, piper
    voice: str = "it-IT-ElsaNeural"  # Voce italiana di default per edge-tts

def sanitize_text_for_tts(text: str) -> str:
    """Rimuove marcatori Markdown/HTML e normalizza il testo per la sintesi vocale.
    Questo è un fallback lato server: il frontend già invia testo pulito.
    """
    if not text:
        return text
    cleaned = text
    # Blocchi di codice
    cleaned = re.sub(r"```[\s\S]*?```", " ", cleaned)
    # Inline code
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    # Immagini: mantieni alt
    cleaned = re.sub(r"!\[([^\]]*)\]\([^\)]*\)", r"\1", cleaned)
    # Link: mantieni testo
    cleaned = re.sub(r"\[([^\]]+)\]\(([^\)]+)\)", r"\1", cleaned)
    # Header
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    # Citazioni
    cleaned = re.sub(r"^\s{0,3}>\s?", "", cleaned, flags=re.MULTILINE)
    # Liste (puntate/numerate)
    cleaned = re.sub(r"^\s{0,3}[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s{0,3}\d+\.\s+", "", cleaned, flags=re.MULTILINE)
    # Righe separatrici e tabelle
    cleaned = re.sub(r"^\s*\|?\s*:?[-]{2,}:?\s*(\|\s*:?[-]{2,}:?\s*)+\|?\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*[-]{3,}\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.replace("|", " • ")
    # Tag HTML
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    # Enfasi
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
    # Spazi
    cleaned = re.sub(r"[ \t\f\v]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()

@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    try:
        print(f"TTS Request: provider={request.provider}, voice={request.voice}, text={request.text[:50]}...")
        import time
        _start = time.perf_counter()
        import uuid as _uuid
        request_id = f"req_{_uuid.uuid4().hex}"
        try:
            log_interaction({
                "event": "tts_start",
                "request_id": request_id,
                "provider": request.provider,
                "voice": request.voice,
                "text_chars": len(request.text or ""),
            })
            log_system(20, f"REQUEST tts start: id={request_id} provider={request.provider} voice={request.voice} chars={len(request.text or '')}")
        except Exception:
            pass
        clean_text = sanitize_text_for_tts(request.text)
        
        # Carica la configurazione admin per ottenere le voci predefinite
        from .admin import load_config
        admin_config = load_config()
        
        # Ottieni la voce predefinita dalla configurazione admin
        tts_config = admin_config.get("tts_providers", {}).get(request.provider, {})
        if not tts_config.get("enabled", True):
            raise HTTPException(status_code=400, detail=f"Provider {request.provider} non abilitato")
        
        # Usa la voce dalla configurazione admin se non specificata
        voice = request.voice
        if not voice and "selected_voice" in tts_config:
            voice = tts_config["selected_voice"]
        
        print(f"Request voice: {request.voice}")
        print(f"Config voice: {tts_config.get('selected_voice', 'none')}")
        print(f"Final voice: {voice}")
        
        if request.provider == "edge":
            resp = await edge_tts_generate(clean_text, voice or "it-IT-ElsaNeural")
            duration_ms = int((time.perf_counter() - _start) * 1000)
            try:
                log_interaction({
                    "event": "tts_generate",
                    "request_id": request_id,
                    "provider": "edge",
                    "voice": voice or "it-IT-ElsaNeural",
                    "text_chars": len(clean_text or ""),
                    "duration_ms": duration_ms,
                })
            except Exception:
                pass
            try:
                log_system(20, f"REQUEST tts done: id={request_id} provider=edge voice={voice or 'it-IT-ElsaNeural'} dur={duration_ms}ms")
            except Exception:
                pass
            return resp
        elif request.provider == "elevenlabs":
            api_key = os.getenv("ELEVENLABS_API_KEY")
            print(f"ElevenLabs API key presente: {'SI' if api_key else 'NO'}")
            resp = await elevenlabs_tts_generate(clean_text, voice, api_key)
            duration_ms = int((time.perf_counter() - _start) * 1000)
            try:
                log_interaction({
                    "event": "tts_generate",
                    "request_id": request_id,
                    "provider": "elevenlabs",
                    "voice": voice,
                    "text_chars": len(clean_text or ""),
                    "duration_ms": duration_ms,
                })
            except Exception:
                pass
            try:
                log_system(20, f"REQUEST tts done: id={request_id} provider=elevenlabs voice={voice} dur={duration_ms}ms")
            except Exception:
                pass
            return resp
        elif request.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            print(f"OpenAI API key presente: {'SI' if api_key else 'NO'}")
            resp = await openai_tts_generate(clean_text, voice, api_key)
            duration_ms = int((time.perf_counter() - _start) * 1000)
            try:
                log_interaction({
                    "event": "tts_generate",
                    "request_id": request_id,
                    "provider": "openai",
                    "voice": voice,
                    "text_chars": len(clean_text or ""),
                    "duration_ms": duration_ms,
                })
            except Exception:
                pass
            try:
                log_system(20, f"REQUEST tts done: id={request_id} provider=openai voice={voice} dur={duration_ms}ms")
            except Exception:
                pass
            return resp
        elif request.provider == "piper":
            resp = await piper_tts_generate(clean_text, voice or "it_IT-riccardo-x_low")
            duration_ms = int((time.perf_counter() - _start) * 1000)
            try:
                log_interaction({
                    "event": "tts_generate",
                    "request_id": request_id,
                    "provider": "piper",
                    "voice": voice or "it_IT-riccardo-x_low",
                    "text_chars": len(clean_text or ""),
                    "duration_ms": duration_ms,
                })
            except Exception:
                pass
            try:
                log_system(20, f"REQUEST tts done: id={request_id} provider=piper voice={voice or 'it_IT-riccardo-x_low'} dur={duration_ms}ms")
            except Exception:
                pass
            return resp
        else:
            raise HTTPException(status_code=400, detail="Provider non supportato")
    except Exception as e:
        print(f"TTS Error: {str(e)}")
        try:
            import time
            log_interaction({
                "event": "tts_generate_error",
                "request_id": locals().get('request_id'),
                "provider": request.provider,
                "voice": request.voice,
                "text_chars": len((request.text or "")),
                "error": str(e),
            })
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))

async def edge_tts_generate(text: str, voice: str = "it-IT-ElsaNeural"):
    """Genera audio usando Edge TTS (gratuito)"""
    try:
        communicate = edge_tts.Communicate(text, voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        # Ritorna l'audio direttamente
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore Edge TTS: {str(e)}")

async def elevenlabs_tts_generate(text: str, voice: str = "Rachel", api_key: str = None):
    """Genera audio usando ElevenLabs"""
    if not api_key:
        api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="ELEVENLABS_API_KEY mancante")
    
    # Prima ottieni l'ID della voce dal nome
    voice_id = await get_elevenlabs_voice_id(voice, api_key)
    if not voice_id:
        raise HTTPException(status_code=400, detail=f"Voce '{voice}' non trovata")
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text, 
        "model_id": "eleven_multilingual_v2", 
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}
    }
    headers = {
        "xi-api-key": api_key, 
        "accept": "audio/mpeg", 
        "content-type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        
        return Response(
            content=response.content,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"}
        )

async def openai_tts_generate(text: str, voice: str = "nova", api_key: str = None):
    """Genera audio usando OpenAI TTS"""
    if not api_key:
        api_key = os.getenv("OPENAI_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="OPENAI_API_KEY mancante")
    
    # Assicurati che la voce sia una di quelle supportate da OpenAI
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if voice not in valid_voices:
        print(f"Voice '{voice}' not valid for OpenAI, using 'nova' instead")
        voice = "nova"
    
    print(f"OpenAI TTS: Using voice '{voice}' for text: '{text[:50]}...'")
    
    url = "https://api.openai.com/v1/audio/speech"
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": voice,
        "response_format": "mp3"
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json=payload)
            print(f"OpenAI TTS response status: {response.status_code}")
            if response.status_code != 200:
                print(f"OpenAI TTS error response: {response.text}")
            response.raise_for_status()
            
            return Response(
                content=response.content,
                media_type="audio/mpeg",
                headers={"Content-Disposition": "attachment; filename=speech.mp3"}
            )
    except Exception as e:
        print(f"OpenAI TTS exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OpenAI TTS error: {str(e)}")

async def piper_tts_generate(text: str, voice: str = "it_IT-riccardo-x_low"):
    """Genera audio usando Piper TTS (gratuito, locale)"""
    if not PIPER_AVAILABLE:
        raise HTTPException(status_code=400, detail="Piper TTS non installato")
    
    try:
        from piper.voice import PiperVoice
        import wave
        
        # Directory per i modelli Piper (scaricati automaticamente)
        models_dir = os.path.join(os.path.dirname(__file__), "..", "models", "piper")
        os.makedirs(models_dir, exist_ok=True)
        
        # Path del modello basato sulla voce
        model_path = os.path.join(models_dir, f"{voice}.onnx")
        config_path = os.path.join(models_dir, f"{voice}.onnx.json")
        
        # Se il modello non esiste, scarichiamolo (semplificato)
        if not os.path.exists(model_path):
            # In un'implementazione completa, qui scaricheresti i modelli da GitHub
            # Per ora assumiamo che siano già presenti o usiamo una voce di fallback
            raise HTTPException(
                status_code=400, 
                detail=f"Modello Piper {voice} non trovato. Installa i modelli Piper separatamente."
            )
        
        # Carica la voce Piper
        voice_obj = PiperVoice.load(model_path, config_path)
        
        # Genera l'audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            audio_data = voice_obj.synthesize(text, tmp_file)
            tmp_file.flush()
            
            # Leggi il file WAV generato
            with open(tmp_file.name, "rb") as audio_file:
                audio_content = audio_file.read()
            
            # Rimuovi il file temporaneo
            os.unlink(tmp_file.name)
            
            return Response(
                content=audio_content,
                media_type="audio/wav",
                headers={"Content-Disposition": "attachment; filename=speech.wav"}
            )
            
    except Exception as e:
        # Fallback: usa Edge TTS se Piper fallisce
        print(f"Piper TTS fallito: {e}, usando Edge TTS come fallback")
        return await edge_tts_generate(text, "it-IT-DiegoNeural")

# Endpoint legacy per compatibilità
@router.post("/tts/elevenlabs")
async def elevenlabs_tts(inp: TTSRequest):
    return await elevenlabs_tts_generate(inp.text)

async def get_elevenlabs_voice_id(voice_name: str, api_key: str) -> str:
    """Ottieni l'ID di una voce ElevenLabs dal nome"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key}
            )
            if response.status_code == 200:
                data = response.json()
                for voice in data.get("voices", []):
                    if voice["name"] == voice_name:
                        return voice["voice_id"]
        
        # Se non trova la voce, usa Rachel come default
        return "21m00Tcm4TlvDq8ikWAM"  # Rachel voice ID
    except Exception:
        # Fallback a Rachel
        return "21m00Tcm4TlvDq8ikWAM"
