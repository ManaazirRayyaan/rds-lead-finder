"""Thin client for Google Places API (New).

Only the five lead fields are requested, so every call stays inside one field mask
and we never pay for data we do not show.
"""
from __future__ import annotations

import asyncio
import math
from typing import Any
from urllib.parse import quote, urlencode

import httpx

BASE = "https://places.googleapis.com/v1"

# Text Search (New) response fields. Phone and website put the request in the
# Enterprise tier; that is the price of getting them in a single call.
SEARCH_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "nextPageToken",
    ]
)
DETAILS_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "websiteUri",
        "googleMapsUri",
    ]
)
CENTER_MASK = "places.location"
PAGE_SIZE = 20


class PlacesError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


def maps_link(place_id: str) -> str:
    """Documented Google Maps URL for a Place ID."""
    query = urlencode({"api": "1", "query": "Google", "query_place_id": place_id})
    return f"https://www.google.com/maps/search/?{query}"


def normalize(place: dict[str, Any]) -> dict[str, Any]:
    pid = place.get("id", "")
    intl = (place.get("internationalPhoneNumber") or "").replace(" ", "")
    display_name = place.get("displayName")
    if not isinstance(display_name, dict):
        display_name = {}
    return {
        "place_id": pid,
        "name": display_name.get("text", ""),
        "phone": place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber") or "",
        "phone_tel": intl,
        "website": place.get("websiteUri") or "",
        "address": place.get("formattedAddress") or "",
        "maps_url": place.get("googleMapsUri") or maps_link(pid),
    }


def _raise_for(resp: httpx.Response) -> None:
    if resp.status_code < 400:
        return
    try:
        detail = resp.json().get("error", {})
    except ValueError:
        detail = {}
    message = detail.get("message") or resp.text[:200] or "Google Places request failed."
    status = resp.status_code
    if status in (401, 403):
        raise PlacesError(
            "Google rejected the API key. Check that GOOGLE_MAPS_API_KEY is correct, "
            "that Places API (New) is enabled, and that billing is on. " + message,
            502,
        )
    if status == 429:
        raise PlacesError("Google quota exceeded. Wait a minute or raise your quota in Google Cloud.", 429)
    if status == 404:
        raise PlacesError("Not found.", 404)
    if status == 400:
        raise PlacesError(f"Google could not understand the search: {message}", 400)
    raise PlacesError(f"Google Places error ({status}): {message}", 502)


def _json_object(resp: httpx.Response) -> dict[str, Any]:
    try:
        data = resp.json()
    except (ValueError, TypeError) as exc:
        raise PlacesError("Google Places returned an invalid response.", 502) from exc
    if not isinstance(data, dict):
        raise PlacesError("Google Places returned an invalid response.", 502)
    return data


def _place_list(data: dict[str, Any]) -> list[dict[str, Any]]:
    places = data.get("places") or []
    if not isinstance(places, list) or any(not isinstance(place, dict) for place in places):
        raise PlacesError("Google Places returned an invalid response.", 502)
    return places


class PlacesClient:
    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=20, transport=transport)
        self._sem = asyncio.Semaphore(8)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _headers(self, mask: str) -> dict[str, str]:
        if not self.api_key:
            raise PlacesError("GOOGLE_MAPS_API_KEY is not set on the server.", 500)
        return {"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": mask, "Content-Type": "application/json"}

    async def _post(self, body: dict[str, Any], mask: str) -> dict[str, Any]:
        try:
            resp = await self._client.post(f"{BASE}/places:searchText", json=body, headers=self._headers(mask))
        except httpx.HTTPError as exc:
            raise PlacesError(f"Could not reach Google: {exc.__class__.__name__}.", 502) from exc
        _raise_for(resp)
        return _json_object(resp)

    async def _center(self, text: str) -> tuple[float, float]:
        data = await self._post({"textQuery": text, "pageSize": 1}, CENTER_MASK)
        places = _place_list(data)
        loc = places[0].get("location") if places else None
        if not isinstance(loc, dict) or not isinstance(loc.get("latitude"), (int, float)) or not isinstance(loc.get("longitude"), (int, float)):
            raise PlacesError(f"Could not find the location “{text}”. Try a more specific city or locality.", 404)
        return loc["latitude"], loc["longitude"]

    async def search(
        self,
        *,
        category: str,
        location: str,
        locality: str = "",
        keyword: str = "",
        radius_m: int | None = None,
        max_pages: int = 3,
        page_token: str | None = None,
    ) -> dict[str, Any]:
        """Run a text search, following next-page tokens up to max_pages."""
        place_text = ", ".join(p for p in (locality.strip(), location.strip()) if p)
        what = " ".join(p for p in (category.strip(), keyword.strip()) if p)
        body: dict[str, Any] = {"pageSize": PAGE_SIZE}
        if radius_m:
            lat, lng = await self._center(place_text)
            dlat = radius_m / 111_320
            dlng = radius_m / (111_320 * max(math.cos(math.radians(lat)), 0.01))
            body["textQuery"] = what
            body["locationRestriction"] = {
                "rectangle": {
                    "low": {"latitude": lat - dlat, "longitude": lng - dlng},
                    "high": {"latitude": lat + dlat, "longitude": lng + dlng},
                }
            }
        else:
            body["textQuery"] = f"{what} in {place_text}"

        results: list[dict[str, Any]] = []
        seen: set[str] = set()
        token = page_token
        for _ in range(max_pages):
            if token:
                body["pageToken"] = token
            data = await self._post(body, SEARCH_MASK)
            for place in _place_list(data):
                item = normalize(place)
                if item["place_id"] and item["place_id"] not in seen:
                    seen.add(item["place_id"])
                    results.append(item)
            token = data.get("nextPageToken")
            if not token:
                break
        return {"results": results, "next_page_token": token, "query": body["textQuery"]}

    async def details(self, place_id: str) -> dict[str, Any] | None:
        """Live details for one place, or None if Google no longer knows the ID."""
        async with self._sem:
            try:
                encoded_id = quote(place_id, safe="")
                resp = await self._client.get(f"{BASE}/places/{encoded_id}", headers=self._headers(DETAILS_MASK))
            except httpx.HTTPError as exc:
                raise PlacesError(f"Could not reach Google: {exc.__class__.__name__}.", 502) from exc
        if resp.status_code == 404:
            return None
        _raise_for(resp)
        return normalize(_json_object(resp))
