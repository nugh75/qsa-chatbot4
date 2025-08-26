from fastapi import APIRouter
router = APIRouter()

@router.post("/transcribe/whisper")
async def transcribe():
    return {"text":"(stub) integra Whisper locale o via API a tua scelta."}
