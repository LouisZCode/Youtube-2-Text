import logging
import sentry_sdk
from pydantic import BaseModel
from agents import summarize

from fastapi import APIRouter, Depends, HTTPException
from dependencies.auth import require_premium

logger = logging.getLogger(__name__)

router = APIRouter()

class SummaryRequest(BaseModel):
    transcription: str

@router.post("/video/summary")
async def create_video_summary(request: SummaryRequest, user=Depends(require_premium)):
    try:
        summary = await summarize(request.transcription)
        return {"summary": summary}
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception("Summary generation failed")
        raise HTTPException(status_code=502, detail="Summary service temporarily unavailable")
