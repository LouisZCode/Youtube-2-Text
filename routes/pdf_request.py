import os
import re
import json
import urllib.request
import urllib.error
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from fpdf import FPDF
from pydantic import BaseModel

router = APIRouter()

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_LOGO_PATH = os.path.join(_DATA_DIR, "tubetext_logo.png")
_FONT_REGULAR = os.path.join(_DATA_DIR, "fonts", "DejaVuSans.ttf")
_FONT_BOLD = os.path.join(_DATA_DIR, "fonts", "DejaVuSans-Bold.ttf")


def _fetch_video_title(video_id: str | None) -> str:
    """Fetch title via YouTube oEmbed (no API key needed). Falls back to 'Transcript'."""
    if not video_id:
        return "Transcript"
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "TubeText/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("title", "Transcript")
    except Exception:
        return "Transcript"


_VARIANT_HEADING = {
    "transcript": "Transcript",
    "summary": "Summary",
    "translation": "Translation",
}


def _strip_markdown(s: str) -> str:
    out_lines = []
    for line in s.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#"):
            stripped = stripped.lstrip("#").lstrip()
        if stripped.startswith("- "):
            stripped = "• " + stripped[2:]
        stripped = stripped.replace("**", "").replace("__", "")
        out_lines.append(stripped)
    return "\n".join(out_lines)


def _safe_filename(title: str, kind: str, language: str | None) -> str:
    name = re.sub(r"[^\w\s-]", "", title)
    name = re.sub(r"\s+", "_", name.strip())[:80] or "video"
    today = date.today().isoformat()
    if kind == "translation" and language:
        return f"{name}_translation_{language}_{today}.pdf"
    if kind == "transcript":
        return f"{name}_transcription_{today}.pdf"
    return f"{name}_{kind}_{today}.pdf"


def _build_pdf(segments: list[dict], title: str) -> bytes:
    """Build a branded PDF with timestamped transcript segments."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_font("DejaVu", "", _FONT_REGULAR, uni=True)
    pdf.add_font("DejaVu", "B", _FONT_BOLD, uni=True)
    pdf.add_page()

    # --- Branded header ---
    pdf.image(_LOGO_PATH, x=10, y=10, w=18)
    pdf.set_xy(30, 14)
    pdf.set_font("DejaVu", "B", 16)
    pdf.cell(0, 9, "TubeText", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(140, 140, 140)
    pdf.set_xy(10, 14)
    pdf.cell(0, 9, "tubetext.app", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    # --- Video title (centered) ---
    pdf.set_font("DejaVu", "B", 13)
    pdf.multi_cell(0, 7, title, align="C")
    pdf.ln(2)

    # --- Divider (below title) ---
    y = pdf.get_y()
    pdf.set_draw_color(210, 210, 210)
    pdf.line(10, y, 200, y)
    pdf.ln(6)

    # --- Segments ---
    for seg in segments:
        # Timestamp — bold black, on its own line
        pdf.set_font("DejaVu", "B", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 5, seg.get("timestamp", ""), new_x="LMARGIN", new_y="NEXT")

        # Text — regular black, below timestamp
        pdf.set_font("DejaVu", "", 10)
        pdf.multi_cell(0, 5, seg.get("text", ""))
        pdf.ln(3)

    return bytes(pdf.output())


def _build_text_pdf(text: str, title: str, heading: str) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_font("DejaVu", "", _FONT_REGULAR, uni=True)
    pdf.add_font("DejaVu", "B", _FONT_BOLD, uni=True)
    pdf.add_page()

    pdf.image(_LOGO_PATH, x=10, y=10, w=18)
    pdf.set_xy(30, 14)
    pdf.set_font("DejaVu", "B", 16)
    pdf.cell(0, 9, "TubeText", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(140, 140, 140)
    pdf.set_xy(10, 14)
    pdf.cell(0, 9, "tubetext.app", align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(4)

    pdf.set_font("DejaVu", "B", 13)
    pdf.multi_cell(0, 7, title, align="C")
    pdf.ln(1)

    pdf.set_font("DejaVu", "B", 11)
    pdf.set_text_color(140, 140, 140)
    pdf.multi_cell(0, 6, heading, align="C")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    y = pdf.get_y()
    pdf.set_draw_color(210, 210, 210)
    pdf.line(10, y, 200, y)
    pdf.ln(6)

    pdf.set_font("DejaVu", "", 11)
    pdf.multi_cell(0, 6, text)

    return bytes(pdf.output())


class PdfRequest(BaseModel):
    kind: Literal["transcript", "summary", "translation"] = "transcript"
    segments: list[dict] | None = None
    text: str | None = None
    language: str | None = None
    video_id: str | None = None


@router.post("/video/pdf/")
async def get_video_pdf(request: PdfRequest):
    title = _fetch_video_title(request.video_id)
    filename = _safe_filename(title, request.kind, request.language)

    if request.kind == "transcript":
        if not request.segments:
            raise HTTPException(400, "segments required for transcript PDF")
        pdf_bytes = _build_pdf(request.segments, title)
    else:
        if not request.text:
            raise HTTPException(400, f"text required for {request.kind} PDF")
        body = _strip_markdown(request.text) if request.kind == "summary" else request.text
        pdf_bytes = _build_text_pdf(body, title, _VARIANT_HEADING[request.kind])

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
