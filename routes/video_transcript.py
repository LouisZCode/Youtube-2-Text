import logging
import os
from datetime import datetime, timezone

import sentry_sdk
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeSerializer
from langfuse import get_client, propagate_attributes
from sqlalchemy.ext.asyncio import AsyncSession
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

from database import get_db
from dependencies.auth import get_current_user

from .utils import extract_video_id, merge_segments
from .youtube_proxy import classify_youtube_error, error_response, with_retries

load_dotenv()
logger = logging.getLogger(__name__)
langfuse = get_client()

COOKIE_SECRET_KEY = os.getenv("COOKIE_SECRET_KEY")

router = APIRouter()

serializer = URLSafeSerializer(COOKIE_SECRET_KEY)


@router.post("/video/")
async def get_video_transcript(
    request: Request,
    response: Response,
    video_url: str,
    language: str = "en",
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raw_cookie = request.cookies.get("tubetext_session")

        if not raw_cookie:
            count = 1
        else:
            try:
                data = serializer.loads(raw_cookie)
                count = data["count"] + 1
            except BadSignature:
                raise HTTPException(status_code=403, detail="Invalid session")

        if count > 5:
            raise HTTPException(
                status_code=429,
                detail="You ran out of free transcriptions, please signup to get 20 more free ones",
            )

        signed_value = serializer.dumps({"count": count})
        response.set_cookie(
            key="tubetext_session",
            value=signed_value,
            httponly=True,
            max_age=60 * 60 * 24 * 30,
            samesite="lax",
        )

    if user and user.tier != "premium":
        now = datetime.now(timezone.utc)
        if user.usage_reset_at.month != now.month or user.usage_reset_at.year != now.year:
            user.usage_count = 0
            user.usage_reset_at = now

        limit = 20
        if user.usage_count >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"You've used all {limit} free transcriptions this month. Upgrade to Premium for unlimited access.",
            )

        user.usage_count += 1
        db.add(user)
        await db.commit()
        await db.refresh(user)

    with langfuse.start_as_current_observation(
        name="video-transcript-free", as_type="span"
    ) as span:
        tier_label = user.tier if user else "anonymous"
        user_id = str(user.id) if user else "anonymous"

        with propagate_attributes(
            user_id=user_id,
            tags=[f"language:{language}", f"tier:{tier_label}"],
        ):
            span.update(input={
                "video_url": video_url,
                "language": language,
                "tier": tier_label,
            })

            try:
                video_id = extract_video_id(video_url)
            except ValueError as e:
                span.update(level="ERROR", status_message=f"bad_input: {type(e).__name__}")
                return error_response(e)

            def _fetch():
                ytt_api = YouTubeTranscriptApi(
                    proxy_config=WebshareProxyConfig(
                        proxy_username=os.getenv("WEBSHARE_PROXY_USERNAME"),
                        proxy_password=os.getenv("WEBSHARE_PROXY_PASSWORD"),
                    )
                )
                return ytt_api.fetch(video_id, languages=[language])

            try:
                transcript = await with_retries(_fetch)
            except Exception as e:
                sentry_sdk.capture_exception(e)
                code = classify_youtube_error(e)
                logger.warning("video_transcript failed for %s: %s", video_url, type(e).__name__)
                span.update(level="ERROR", status_message=f"{code}: {type(e).__name__}")
                if user and user.tier != "premium" and code == "transient":
                    user.usage_count = max(0, user.usage_count - 1)
                    db.add(user)
                    await db.commit()
                    await db.refresh(user)
                return error_response(e)

            snippets = transcript.snippets
            segments = merge_segments(snippets)
            word_count = sum(len(s.text.split()) for s in snippets)

            span.update(output={
                "video_id": video_id,
                "segments_count": len(segments),
                "word_count": word_count,
                "source": "captions",
            })

            return {
                "success": True,
                "video_id": video_id,
                "source": "captions",
                "language": language,
                "segments": segments,
                "word_count": word_count,
                "trace_id": span.trace_id,
            }
