from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.queries_routes import router as queries_router
from backend.app.auth import get_current_admin_user


def _dummy_admin():
    return {"id": 1, "email": "admin@example.com"}


def create_app() -> FastAPI:
    app = FastAPI()
    app.include_router(queries_router, prefix="/api")
    # Override admin auth dependency for tests
    app.dependency_overrides[get_current_admin_user] = _dummy_admin
    return app


def test_list_and_describe_queries():
    app = create_app()
    client = TestClient(app)
    r = client.get("/api/queries")
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") is True
    assert isinstance(data.get("queries"), list)
    # describe a known query
    r2 = client.get("/api/queries/users_recent")
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get("success") is True
    assert d2.get("query", {}).get("id") == "users_recent"


def test_preview_users_recent():
    app = create_app()
    client = TestClient(app)
    payload = {"params": {"only_active": 1, "limit": 5}}
    r = client.post("/api/queries/users_recent/preview", json=payload)
    assert r.status_code == 200
    d = r.json()
    assert d.get("success") is True
    # rows may be empty, but shape should be present
    assert d.get("query_id") == "users_recent"
    assert "rows" in d


def test_nlq_basic_mapping():
    app = create_app()
    client = TestClient(app)
    r = client.post("/api/queries/nlq", json={"text": "utenti attivi ultimi 10 ordina per login desc"})
    assert r.status_code == 200
    d = r.json()
    assert d.get("matched") is True
    assert d.get("query_id") == "users_recent"
    assert d.get("params", {}).get("limit") == 10

