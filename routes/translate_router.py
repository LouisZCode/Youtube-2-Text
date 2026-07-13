import json
import logging
import sentry_sdk
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Header
from dependencies.auth import require_premium
from fastapi.responses import StreamingResponse
from langfuse import get_client, propagate_attributes
from agents.translate_agent import translate

logger = logging.getLogger(__name__)
langfuse = get_client()

router = APIRouter()
CHUNK_SIZE = 1
EMPTY_TRANSCRIPT_ERROR = "There's no transcript text to translate."

class Segment(BaseModel):
    timestamp: str
    text: str

class TranslateStreamRequest(BaseModel):
    segments: List[Segment]
    language: str

@router.post("/video/translate")
async def stream_video_translation(
    request: TranslateStreamRequest,
    user=Depends(require_premium),
    x_session_id: str | None = Header(None, alias="X-Session-Id"),
):
    # Reject empty payloads before opening the stream. Without this, zero
    # segments (e.g. premium transcription found no speech) streamed a
    # successful empty `done` — a silent no-op shown as "Translating… 0/0".
    # Clients surface SSE error events verbatim, so the error goes over the
    # stream rather than as an HTTP 4xx (which they render as a bare status).
    if not any(seg.text.strip() for seg in request.segments):
        logger.warning(
            "Translation requested with no transcript text (segments=%d)",
            len(request.segments),
        )
        with langfuse.start_as_current_observation(name="video-translation", as_type="span") as span:
            attrs = {
                "user_id": str(user.id),
                "tags": [f"language:{request.language}", "tier:premium"],
            }
            if x_session_id:
                attrs["session_id"] = x_session_id
            with propagate_attributes(**attrs):
                span.update(
                    input={
                        "language": request.language,
                        "segments_count": len(request.segments),
                    },
                    level="WARNING",
                    status_message="empty_transcript",
                )

        async def error_generator():
            yield f"data: {json.dumps({'error': EMPTY_TRANSCRIPT_ERROR})}\n\n"

        return StreamingResponse(
            error_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def event_generator():
        with langfuse.start_as_current_observation(name="video-translation", as_type="span") as span:
            attrs = {
                "user_id": str(user.id),
                "tags": [f"language:{request.language}", "tier:premium"],
            }
            if x_session_id:
                attrs["session_id"] = x_session_id
            with propagate_attributes(**attrs):
                source_text = " ".join(seg.text for seg in request.segments)
                span.update(input={
                    "language": request.language,
                    "segments_count": len(request.segments),
                    "source_text": source_text,
                })
                translated_chunks: list[str] = []
                for i in range(0, len(request.segments), CHUNK_SIZE):
                    try:
                        chunk_segments = request.segments[i : i + CHUNK_SIZE]
                        chunk_text = " ".join(seg.text for seg in chunk_segments)
                        translated = await translate(chunk_text, request.language)
                        translated_chunks.append(translated)
                        yield f"data: {json.dumps({'translation': translated})}\n\n"
                    except Exception as e:
                        sentry_sdk.capture_exception(e)
                        logger.exception("Translation chunk failed")
                        span.update(
                            level="ERROR",
                            status_message=f"chunk {i} failed: {type(e).__name__}",
                        )
                        yield f"data: {json.dumps({'error': 'Translation service temporarily unavailable'})}\n\n"
                        return
                span.update(output={
                    "chunks_completed": len(translated_chunks),
                    "translation": " ".join(translated_chunks),
                })
                yield f"data: {json.dumps({'done': True, 'trace_id': span.trace_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
