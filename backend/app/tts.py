import os, httpx, base64, asyncio
import edge_tts
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
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

@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    try:
        print(f"TTS Request: provider={request.provider}, voice={request.voice}, text={request.text[:50]}...")
        
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
            return await edge_tts_generate(request.text, voice or "it-IT-ElsaNeural")
        elif request.provider == "elevenlabs":
            api_key = os.getenv("ELEVENLABS_API_KEY")
            print(f"ElevenLabs API key presente: {'SI' if api_key else 'NO'}")
            return await elevenlabs_tts_generate(request.text, voice, api_key)
        elif request.provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            print(f"OpenAI API key presente: {'SI' if api_key else 'NO'}")
            return await openai_tts_generate(request.text, voice, api_key)
        elif request.provider == "piper":
            return await piper_tts_generate(request.text, voice or "it_IT-riccardo-x_low")
        else:
            raise HTTPException(status_code=400, detail="Provider non supportato")
    except Exception as e:
        print(f"TTS Error: {str(e)}")
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
