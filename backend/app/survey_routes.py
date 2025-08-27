from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import secrets
from .database import SurveyModel

router = APIRouter()

class SurveySubmission(BaseModel):
    session_id: Optional[str] = None
    q_utilita: Optional[int] = None
    q_pertinenza: Optional[int] = None
    q_chiarezza: Optional[int] = None
    q_dettaglio: Optional[int] = None
    q_facilita: Optional[int] = None
    q_velocita: Optional[int] = None
    q_fiducia: Optional[int] = None
    q_riflessione: Optional[int] = None
    q_coinvolgimento: Optional[int] = None
    q_riuso: Optional[int] = None
    q_riflessioni: Optional[str] = None
    q_commenti: Optional[str] = None

@router.post('/survey/submit')
async def submit_survey(payload: SurveySubmission):
    data = payload.dict()
    if not any(data.get(f) for f in SurveyModel.FIELDS):
        raise HTTPException(status_code=400, detail="Nessuna risposta Likert fornita")
    # Validazione range 1-5
    for f in SurveyModel.FIELDS:
        v = data.get(f)
        if v is not None and (v < 1 or v > 5):
            raise HTTPException(status_code=400, detail=f"Valore fuori range per {f}")
    if not data.get('session_id'):
        data['session_id'] = secrets.token_hex(8)
    ok = SurveyModel.add_response(data)
    if not ok:
        raise HTTPException(status_code=500, detail="Errore salvataggio")
    return { 'success': True, 'session_id': data['session_id'] }

@router.get('/survey/summary')
async def survey_summary():
    return SurveyModel.get_summary()

@router.get('/survey/open-answers')
async def survey_open_answers(limit: int = 500):
    return { 'items': SurveyModel.get_open_answers(limit=limit) }