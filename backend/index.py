"""Vercel Python runtime entrypoint.

The application itself stays in app.main so local Uvicorn, Docker/Render, and
Vercel all import the same FastAPI instance.
"""

from app.main import app

__all__ = ["app"]
