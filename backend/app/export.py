import csv
import io

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

from .places import maps_link

# Google only permits storing and exporting Place IDs; names, phones, websites and
# addresses stay inside the app and are shown live. The export is the bridge to
# your outreach workflow: Place ID + Maps link + your own notes.
COLUMNS = ["Place ID", "Google Maps Link", "Notes"]


def _safe_cell(value: str) -> str:
    """Keep spreadsheet programs from executing exported user-controlled text."""
    if value.startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + value
    return value


def rows(place_ids: list[str], notes: dict[str, str] | None = None) -> list[list[str]]:
    notes = notes or {}
    return [[pid, maps_link(pid), notes.get(pid, "")] for pid in place_ids]


def to_csv(data: list[list[str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(COLUMNS)
    writer.writerows([[_safe_cell(value) for value in row] for row in data])
    return ("\ufeff" + buf.getvalue()).encode("utf-8")  # BOM so Excel reads UTF-8


def to_xlsx(data: list[list[str]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    ws.append(COLUMNS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in data:
        ws.append([_safe_cell(value) for value in row])
        ws.cell(row=ws.max_row, column=2).hyperlink = row[1]
    for idx, width in enumerate([34, 60, 40], start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
