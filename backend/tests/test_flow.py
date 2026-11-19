"""End-to-end check of search -> save -> list -> export against a fake Google transport.

The fake only exists here, to prove the request shape and parsing. The app itself
never uses mock data.
"""
import io
import json
import os
import tempfile

import httpx
import pytest
from openpyxl import load_workbook
from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.exc import OperationalError

tmp = tempfile.mkdtemp()
TEST_PASSWORD = "Correct-Horse-Battery-Staple-42"
os.environ.update(
    DATABASE_URL=f"sqlite:///{tmp}/t.db",
    GOOGLE_MAPS_API_KEY="test-key",
    ADMIN_USERNAME="admin",
    ADMIN_PASSWORD_HASH=PasswordHash.recommended().hash(TEST_PASSWORD),
    SESSION_SECRET="test-session-secret-that-is-at-least-32-characters",
    AUTH_COOKIE_SECURE="false",
)

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.export import rows, to_csv, to_xlsx  # noqa: E402
from app.db import SessionLocal, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Lead  # noqa: E402
from app.places import CENTER_MASK, SEARCH_MASK, PlacesClient, maps_link  # noqa: E402

PLACES = {
    "A1": {"id": "A1", "displayName": {"text": "Smile Dental"}, "formattedAddress": "HSR Layout, Bengaluru",
           "nationalPhoneNumber": "080 1234 5678", "internationalPhoneNumber": "+91 80 1234 5678",
           "websiteUri": "https://smile.example", "googleMapsUri": "https://maps.google.com/?cid=1"},
    "B2": {"id": "B2", "displayName": {"text": "Care Clinic"}, "formattedAddress": "Sector 2, Bengaluru"},
    "C3": {"id": "C3", "displayName": {"text": "Bright Teeth"}, "formattedAddress": "Sector 7, Bengaluru",
           "nationalPhoneNumber": "099 000 1111"},
}
calls = []
urls = []


def google(request: httpx.Request) -> httpx.Response:
    assert request.headers["X-Goog-Api-Key"] == "test-key"
    mask = request.headers["X-Goog-FieldMask"]
    if request.method == "POST":
        body = json.loads(request.content)
        calls.append(body)
        if mask == CENTER_MASK:
            return httpx.Response(200, json={"places": [{"location": {"latitude": 12.9, "longitude": 77.6}}]})
        assert mask == SEARCH_MASK
        if body.get("pageToken") == "T2":
            return httpx.Response(200, json={"places": [PLACES["A1"], PLACES["C3"]]})
        return httpx.Response(200, json={"places": [PLACES["A1"], PLACES["B2"]], "nextPageToken": "T2"})
    pid = request.url.path.rsplit("/", 1)[-1]
    urls.append(str(request.url))
    if pid == "ERR":
        return httpx.Response(500, json={"error": {"message": "temporary failure"}})
    if pid == "MAL":
        return httpx.Response(200, text="not json")
    if pid in PLACES:
        return httpx.Response(200, json=PLACES[pid])
    return httpx.Response(404, json={"error": {"message": "gone"}})


@pytest.fixture(scope="module")
def client():
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    with TestClient(app) as c:
        app.state.places = PlacesClient("test-key", transport=httpx.MockTransport(google))
        yield c


@pytest.fixture(autouse=True)
def clean_state(client):
    calls.clear()
    urls.clear()
    client.cookies.clear()
    with SessionLocal() as db:
        db.execute(delete(Lead))
        db.commit()
    yield


@pytest.fixture
def logged_in(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD})
    assert response.status_code == 200
    return client


def test_auth_required(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/status").status_code == 401
    assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
    login = client.post("/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD})
    assert login.status_code == 200
    assert "HttpOnly" in login.headers["set-cookie"] and "SameSite=lax" in login.headers["set-cookie"]
    assert client.get("/api/auth/me").json() == {"username": "admin"}
    response = client.get("/api/status")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert client.post("/api/auth/logout").json() == {"signed_out": True}
    assert client.get("/api/status").status_code == 401


def test_search_paginates_and_dedupes(logged_in):
    client = logged_in
    r = client.post("/api/search", json={"category": "Dental clinics", "location": "Bengaluru", "locality": "HSR Layout"})
    assert r.status_code == 200
    data = r.json()
    assert [p["place_id"] for p in data["results"]] == ["A1", "B2", "C3"]
    assert data["results"][0]["phone_tel"] == "+918012345678"
    assert data["results"][1]["website"] == ""
    assert data["results"][1]["maps_url"].endswith("query_place_id=B2")
    assert calls[-2]["textQuery"] == "Dental clinics in HSR Layout, Bengaluru"


def test_radius_uses_rectangle(logged_in):
    client = logged_in
    client.post("/api/search", json={"category": "Gyms", "location": "Bengaluru", "radius_m": 2000, "max_pages": 1})
    assert "locationRestriction" in calls[-1] and calls[-1]["textQuery"] == "Gyms"


def test_request_validation(logged_in):
    client = logged_in
    assert client.post("/api/search", json={"category": "  ", "location": "Bengaluru"}).status_code == 422
    assert client.get("/api/leads?offset=-1").status_code == 422
    assert client.post("/api/leads", json={"place_ids": [" "]}).status_code == 422


def test_database_errors_are_reported_as_service_unavailable(logged_in):
    def unavailable_db():
        raise OperationalError("SELECT 1", {}, Exception("database offline"))
        yield

    app.dependency_overrides[get_db] = unavailable_db
    try:
        response = logged_in.post("/api/leads", json={"place_ids": ["A1"]})
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Database is unavailable. Check DATABASE_URL and run the database migrations."
    }


def test_save_dedupe_notes_list_export_delete(logged_in):
    client = logged_in
    assert client.post("/api/leads", json={"place_ids": ["A1", "B2", "A1"]}).json() == {"added": 2, "skipped": 0}
    assert client.post("/api/leads", json={"place_ids": ["A1", "C3"]}).json() == {"added": 1, "skipped": 1}
    listing = client.get("/api/leads").json()
    assert listing["total"] == 3
    first = listing["items"][0]
    assert first["place"]["name"] == "Bright Teeth"
    client.patch(f"/api/leads/{first['id']}", json={"notes": "call Monday"})
    assert client.get("/api/leads?q=monday").json()["total"] == 1

    csv_r = client.post("/api/export", json={"format": "csv", "scope": "saved"})
    text = csv_r.content.decode("utf-8-sig")
    assert text.splitlines()[0] == "Place ID,Google Maps Link,Notes"
    assert "call Monday" in text and "Smile" not in text  # Google fields are never exported

    x = client.post("/api/export", json={"format": "xlsx", "scope": "selected", "place_ids": ["A1"]})
    ws = load_workbook(io.BytesIO(x.content)).active
    assert [c.value for c in ws[1]] == ["Place ID", "Google Maps Link", "Notes"] and ws.max_row == 2

    assert client.post("/api/export", json={"format": "csv", "scope": "selected"}).status_code == 400
    ids = [i["id"] for i in listing["items"]]
    assert client.post("/api/leads/bulk-delete", json={"ids": ids[:2]}).json() == {"deleted": 2}
    assert client.delete(f"/api/leads/{ids[2]}").json() == {"deleted": 1}
    assert client.get("/api/leads/ids").json() == {"place_ids": []}


def test_stale_place_flagged(logged_in):
    client = logged_in
    client.post("/api/leads", json={"place_ids": ["ZZ"]})
    item = client.get("/api/leads").json()["items"][0]
    assert item["stale"] is True and item["place"] is None


def test_upstream_detail_errors_are_reported(logged_in):
    client = logged_in
    client.post("/api/leads", json={"place_ids": ["ERR"]})
    response = client.get("/api/leads")
    assert response.status_code == 502
    assert "temporary failure" in response.json()["detail"]


def test_place_id_path_is_encoded_and_bad_google_json_is_reported(logged_in):
    client = logged_in
    client.post("/api/leads", json={"place_ids": ["a/b?c"]})
    assert client.get("/api/leads").status_code == 200
    assert "%2F" in urls[-1] and "%3F" in urls[-1]

    with SessionLocal() as db:
        db.execute(delete(Lead))
        db.add(Lead(place_id="MAL", notes=""))
        db.commit()
    response = client.get("/api/leads")
    assert response.status_code == 502
    assert response.json()["detail"] == "Google Places returned an invalid response."


def test_exports_neutralize_spreadsheet_formulas_and_encode_links():
    data = rows(["=2+2"], {"=2+2": "@SUM(1,1)"})
    csv_text = to_csv(data).decode("utf-8-sig")
    assert "'=2+2" in csv_text and "'@SUM(1,1)" in csv_text

    sheet = load_workbook(io.BytesIO(to_xlsx(data))).active
    assert sheet.cell(2, 1).data_type == "s"
    assert sheet.cell(2, 3).data_type == "s"
    assert maps_link("a/b+c").endswith("query_place_id=a%2Fb%2Bc")
