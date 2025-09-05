from __future__ import annotations

"""
Dependency helpers (FastAPI) for shared services.
"""

from fastapi import Request
from typing import Any

from .database import db_manager as global_db_manager, DatabaseManager


def get_db_manager(request: Request) -> DatabaseManager:
    """Return the shared DatabaseManager.

    Prefers the instance attached to `app.state.db_manager` (set at startup),
    falls back to the module-level `global_db_manager` otherwise.
    """
    dm: Any = getattr(request.app.state, "db_manager", None)
    if isinstance(dm, DatabaseManager):
        return dm
    return global_db_manager

