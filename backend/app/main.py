from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from . import export as exporter
from .auth import (
    authenticate,
    check_login_limit,
    clear_failed_logins,
    clear_session_cookie,
    create_session_token,
    record_failed_login,
    require_user,
    set_session_cookie,
)
from .config import get_settings
from .db import SessionLocal, get_db
from .models import Lead
from .places import PlacesClient, PlacesError
from .schemas import BulkDelete, ExportRequest, LeadOut, LoginRequest, NotesUpdate, SaveRequest, SearchRequest

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.places = PlacesClient(settings.google_maps_api_key)
    yield
    await app.state.places.aclose()


app = FastAPI(
    title="RDS Lead Finder API",
    lifespan=lifespan,
    docs_url="/docs" if settings.enable_api_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.enable_api_docs else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def prevent_places_caching(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(PlacesError)
async def places_error_handler(_: Request, exc: PlacesError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


def places(request: Request) -> PlacesClient:
    return request.app.state.places


auth_api = APIRouter(prefix="/api/auth")
api = APIRouter(prefix="/api", dependencies=[Depends(require_user)])


@app.get("/health")
def health(db: Session = Depends(get_db)):
    if not settings.auth_configured or not settings.google_maps_api_key:
        raise HTTPException(status_code=503, detail="Service configuration is incomplete.")
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
    return {"status": "ok"}


@auth_api.post("/login")
def login(body: LoginRequest, request: Request):
    check_login_limit(request)
    if not authenticate(body.username, body.password):
        record_failed_login(request)
        raise HTTPException(status_code=401, detail="Username or password is incorrect.")
    clear_failed_logins(request)
    response = JSONResponse({"username": settings.admin_username})
    set_session_cookie(response, create_session_token(settings.admin_username))
    return response


@auth_api.get("/me")
def current_user(username: str = Depends(require_user)):
    return {"username": username}


@auth_api.post("/logout")
def logout():
    response = JSONResponse({"signed_out": True})
    clear_session_cookie(response)
    return response


@api.get("/status")
def status(db: Session = Depends(get_db)):
    return {
        "google_key_configured": bool(settings.google_maps_api_key),
        "saved_count": db.scalar(select(func.count(Lead.id))) or 0,
    }


@api.post("/search")
async def search(body: SearchRequest, client: PlacesClient = Depends(places)):
    return await client.search(**body.model_dump())


# ---- saved leads ---------------------------------------------------------------

@api.get("/leads/ids")
def saved_ids(db: Session = Depends(get_db)):
    return {"place_ids": list(db.scalars(select(Lead.place_id)))}


@api.post("/leads")
def save_leads(body: SaveRequest, db: Session = Depends(get_db)):
    wanted = list(dict.fromkeys(p.strip() for p in body.place_ids if p.strip()))
    existing = set(db.scalars(select(Lead.place_id).where(Lead.place_id.in_(wanted))))
    new = [p for p in wanted if p not in existing]
    for pid in new:
        db.add(Lead(place_id=pid, notes=""))
    try:
        db.commit()
    except IntegrityError:  # a parallel save won the race for the unique Place ID
        db.rollback()
        existing = set(db.scalars(select(Lead.place_id).where(Lead.place_id.in_(wanted))))
        new = [p for p in wanted if p not in existing]
        for pid in new:
            db.add(Lead(place_id=pid, notes=""))
        db.commit()
    return {"added": len(new), "skipped": len(wanted) - len(new)}


@api.get("/leads")
async def list_leads(
    q: str = Query(default="", max_length=5000),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    client: PlacesClient = Depends(places),
):
    """One page of saved leads. Only this page is fetched live from Google."""
    def load():
        with SessionLocal() as db:
            stmt = select(Lead)
            if q.strip():
                stmt = stmt.where(Lead.notes.ilike(f"%{q.strip()}%"))
            total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
            rows = db.scalars(stmt.order_by(Lead.created_at.desc(), Lead.id.desc()).offset(offset).limit(limit)).all()
            return total, [LeadOut.model_validate(r).model_dump(mode="json") for r in rows]

    total, rows = await run_in_threadpool(load)

    import asyncio

    details = await asyncio.gather(*(client.details(r["place_id"]) for r in rows), return_exceptions=True)
    items = []
    for row, det in zip(rows, details):
        # A failed upstream request affects every row, so surface it to the UI
        # instead of rendering a full page of identical per-row errors. A 404
        # is already represented by details() as a stale listing (None).
        if isinstance(det, PlacesError):
            raise det
        if isinstance(det, Exception):
            row["error"] = getattr(det, "message", "Could not load details from Google.")
            row["place"] = None
        else:
            row["place"] = det
            row["stale"] = det is None
        items.append(row)
    return {"total": total, "items": items}


@api.patch("/leads/{lead_id}")
def update_notes(lead_id: int, body: NotesUpdate, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found.")
    lead.notes = body.notes
    db.commit()
    return LeadOut.model_validate(lead)


@api.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found.")
    db.delete(lead)
    db.commit()
    return {"deleted": 1}


@api.post("/leads/bulk-delete")
def bulk_delete(body: BulkDelete, db: Session = Depends(get_db)):
    leads = db.scalars(select(Lead).where(Lead.id.in_(body.ids))).all()
    for lead in leads:
        db.delete(lead)
    db.commit()
    return {"deleted": len(leads)}


# ---- export --------------------------------------------------------------------

@api.post("/export")
def export(body: ExportRequest, db: Session = Depends(get_db)):
    if body.scope == "saved":
        leads = db.scalars(select(Lead).order_by(Lead.created_at.desc())).all()
        ids = [l.place_id for l in leads]
        notes = {l.place_id: l.notes for l in leads}
    else:
        ids = list(dict.fromkeys(body.place_ids))
        if not ids:
            raise HTTPException(400, "Nothing to export. Select leads or run a search first.")
        saved = db.scalars(select(Lead).where(Lead.place_id.in_(ids))).all()
        notes = {l.place_id: l.notes for l in saved}
    if not ids:
        raise HTTPException(400, "No saved leads to export yet.")
    data = exporter.rows(ids, notes)
    if body.format == "csv":
        content, media, ext = exporter.to_csv(data), "text/csv; charset=utf-8", "csv"
    else:
        content = exporter.to_xlsx(data)
        media, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    return Response(
        content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="rds-leads-{body.scope}.{ext}"'},
    )


app.include_router(auth_api)
app.include_router(api)


# In production the Docker image includes the Vite build and FastAPI serves it
# from the same origin as the API, keeping the session cookie first-party.
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    assets_dir = frontend_dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        requested = (frontend_dist / path).resolve()
        if requested.is_relative_to(frontend_dist) and requested.is_file():
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html", headers={"Cache-Control": "no-cache"})
