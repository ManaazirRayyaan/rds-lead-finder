from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


RequiredSearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
OptionalSearchText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
PlaceId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=1024)


class SearchRequest(BaseModel):
    category: RequiredSearchText
    location: RequiredSearchText
    locality: OptionalSearchText = ""
    keyword: OptionalSearchText = ""
    radius_m: int | None = Field(default=None, ge=500, le=50000)
    max_pages: int = Field(default=3, ge=1, le=3)
    page_token: str | None = Field(default=None, max_length=2048)


class SaveRequest(BaseModel):
    place_ids: list[PlaceId] = Field(min_length=1, max_length=200)


class NotesUpdate(BaseModel):
    notes: str = Field(max_length=5000)


class BulkDelete(BaseModel):
    ids: list[Annotated[int, Field(ge=1)]] = Field(min_length=1, max_length=500)


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    place_id: str
    notes: str
    created_at: datetime


class ExportRequest(BaseModel):
    format: Literal["csv", "xlsx"]
    scope: Literal["results", "selected", "saved"]
    place_ids: list[PlaceId] = Field(default_factory=list, max_length=500)
