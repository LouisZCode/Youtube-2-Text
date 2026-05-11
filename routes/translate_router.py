import json
import logging
import sentry_sdk
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from dependencies.auth import require_premium
from fastapi.responses import StreamingResponse
from langfuse import get_client, propagate_attributes
from agents.translate_agent import translate

logger = logging.getLogger(__name__)
langfuse = get_client()

router = APIRouter()
CHUNK_SIZE = 1

class Segment(BaseModel):
    timestamp: str
    text: str

class TranslateStreamRequest(BaseModel):
    segments: List[Segment]
    language: str

@router.post("/video/translate")
async def stream_video_translation(request: TranslateStreamRequest, user=Depends(require_premium)):
    async def event_generator():
        with langfuse.start_as_current_observation(name="video-translation", as_type="span") as span:
            with propagate_attributes(
                user_id=str(user.id),
                tags=[f"language:{request.language}", "tier:premium"],
            ):
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
                yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
