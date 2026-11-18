from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Lead(Base):
    """A saved lead.

    Google's Places terms let us keep only the Place ID indefinitely, so this table
    holds the Place ID and your own notes. Name, phone, website and address are
    fetched live from Google whenever a lead is displayed.
    """

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
