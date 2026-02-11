import json
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from agents.translate_agent import translate

router = APIRouter()
CHUNK_SIZE = 1

class Segment(BaseModel):
    timestamp: str
    text: str

class TranslateStreamRequest(BaseModel):
    segments: List[Segment]
    language: str

@router.post("/video/translate")
async def stream_video_translation(request: TranslateStreamRequest):
    async def event_generator():
        for i in range(0, len(request.segments), CHUNK_SIZE):
            chunk_segments = request.segments[i : i + CHUNK_SIZE]
            chunk_text = " ".join(seg.text for seg in chunk_segments)
            translated = await translate(chunk_text, request.language)
            yield f"data: {json.dumps({'translation': translated})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
