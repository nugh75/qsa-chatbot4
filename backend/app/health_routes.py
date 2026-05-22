"""
Health and diagnostics endpoints.
"""
from fastapi import APIRouter, Request
from datetime import datetime

from .database import db_manager as global_db_manager

router = APIRouter()


@router.get("/health")
async def health_root():
    return {"ok": True, "time": datetime.utcnow().isoformat() + "Z"}


@router.get("/health/db")
async def health_db(request: Request):
    # Prefer app.state db_manager if present
    dbm = getattr(request.app.state, "db_manager", global_db_manager)
    result = dbm.ping()
    return {"ok": bool(result.get("ok")), "backend": result.get("backend"), "error": result.get("error")}

