import logging
import sentry_sdk
from pydantic import BaseModel
from agents import summarize

from fastapi import APIRouter, Depends, Header, HTTPException
from langfuse import get_client, propagate_attributes
from dependencies.auth import require_premium

logger = logging.getLogger(__name__)
langfuse = get_client()

router = APIRouter()


class SummaryRequest(BaseModel):
    transcription: str
    language: str = "en"


@router.post("/video/summary")
async def create_video_summary(
    request: SummaryRequest,
    user=Depends(require_premium),
    x_session_id: str | None = Header(None, alias="X-Session-Id"),
):
    with langfuse.start_as_current_observation(
        name="video-summary", as_type="span"
    ) as span:
        attrs = {
            "user_id": str(user.id),
            "tags": [f"language:{request.language}", "tier:premium"],
        }
        if x_session_id:
            attrs["session_id"] = x_session_id
        with propagate_attributes(**attrs):
            span.update(input={
                "transcription": request.transcription,
                "transcription_word_count": len(request.transcription.split()),
                "source_language": request.language,
            })

            try:
                summary = await summarize(request.transcription, request.language)
            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.exception("Summary generation failed")
                span.update(level="ERROR", status_message=f"summary_failed: {type(e).__name__}")
                raise HTTPException(status_code=502, detail="Summary service temporarily unavailable")

            span.update(output={
                "summary": summary,
                "summary_chars": len(summary),
            })

            return {"summary": summary, "trace_id": span.trace_id}
