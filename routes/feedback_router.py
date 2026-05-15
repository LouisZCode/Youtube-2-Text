import logging
import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from langfuse import get_client
from pydantic import BaseModel, Field

from dependencies.auth import get_current_user

logger = logging.getLogger(__name__)
langfuse = get_client()
router = APIRouter()

FeedbackName = Literal["transcript-thumbs", "summary-thumbs", "translation-thumbs"]


class FeedbackRequest(BaseModel):
    trace_id: str = Field(..., min_length=32, max_length=32, pattern=r"^[a-f0-9]{32}$")
    name: FeedbackName
    value: Literal[0, 1]
    comment: str | None = Field(None, max_length=500)


_RATE_WINDOW_SEC = 300
_RATE_MAX = 30
_ip_hits: dict[str, deque[float]] = defaultdict(deque)


def _check_rate(ip: str) -> bool:
    now = time.monotonic()
    hits = _ip_hits[ip]
    while hits and hits[0] < now - _RATE_WINDOW_SEC:
        hits.popleft()
    if len(hits) >= _RATE_MAX:
        return False
    hits.append(now)
    return True


def _write_score(req: FeedbackRequest) -> None:
    try:
        langfuse.create_score(
            score_id=f"{req.trace_id}:{req.name}",
            trace_id=req.trace_id,
            name=req.name,
            value=req.value,
            data_type="BOOLEAN",
            comment=req.comment,
        )
    except Exception:
        logger.exception("feedback score write failed")


@router.post("/video/feedback")
async def submit_feedback(
    payload: FeedbackRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    user=Depends(get_current_user),
):
    ip = request.client.host if request.client else "unknown"
    if not _check_rate(ip):
        raise HTTPException(status_code=429, detail="Too many feedback submissions")
    background_tasks.add_task(_write_score, payload)
    return {"ok": True}
