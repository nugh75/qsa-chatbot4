from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import secrets
from .database import SurveyModel

router = APIRouter()

class SurveySubmission(BaseModel):
    session_id: Optional[str] = None
    # Demografia
    demo_eta: Optional[int] = None
    demo_sesso: Optional[str] = None
    demo_istruzione: Optional[str] = None
    demo_tipo_istituto: Optional[str] = None
    demo_provenienza: Optional[str] = None
    demo_area: Optional[str] = None
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
    data = {}
    for key, value in payload.dict().items():
        if isinstance(value, str):
            value = value.strip()
            if not value:
                value = None
        data[key] = value

    has_likert = any(data.get(f) is not None for f in SurveyModel.FIELDS)
    has_text = bool(data.get('q_riflessioni')) or bool(data.get('q_commenti'))

    if not has_likert and not has_text:
        raise HTTPException(status_code=400, detail="Nessuna risposta fornita")

    if has_likert:
        for f in SurveyModel.FIELDS:
            v = data.get(f)
            if v is not None:
                if v < 1 or v > 5:
                    raise HTTPException(status_code=400, detail=f"Valore fuori range per {f}")
        required_demo = ['demo_eta', 'demo_sesso', 'demo_istruzione', 'demo_tipo_istituto', 'demo_provenienza']
        missing = [f for f in required_demo if data.get(f) in (None, '')]
        if missing:
            raise HTTPException(status_code=400, detail="Per inviare la parte quantitativa compila i dati di base")
    else:
        for f in SurveyModel.FIELDS:
            data[f] = None

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
