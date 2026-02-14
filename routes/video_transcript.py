from fastapi import APIRouter, Request, Response, HTTPException, Depends
from youtube_transcript_api import YouTubeTranscriptApi
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from .utils import extract_video_id, merge_segments

from itsdangerous import URLSafeSerializer, BadSignature

import os
from dotenv import load_dotenv

from dependencies.auth import get_current_user
from database import get_db

load_dotenv()

COOKIE_SECRET_KEY = os.getenv("COOKIE_SECRET_KEY")

router = APIRouter()

serializer = URLSafeSerializer(COOKIE_SECRET_KEY)

@router.post("/video/")
async def get_video_transcript(request: Request, response : Response, video_url: str, language: str = "en", user = Depends(get_current_user), db: AsyncSession = Depends(get_db)):

    if not user:

        raw_cookie = request.cookies.get("tubetext_session")

        if not raw_cookie:
            count = 1

        else:
            try:
                data = serializer.loads(raw_cookie)  # verify + decode
                count = data["count"] + 1
            except BadSignature:
                raise HTTPException(status_code=403, detail="Invalid session")

        if count > 5:
            raise HTTPException(status_code=429, detail="You ran out of free transcriptions, please signup to get 20 more free ones")

        signed_value = serializer.dumps({"count": count})
        response.set_cookie(
            key="tubetext_session",
            value=signed_value,
            httponly=True,
            max_age=60 * 60 * 24 * 30,
            samesite="lax"
        )

    if user and user.tier != "premium":
        now = datetime.now(timezone.utc)
        if user.usage_reset_at.month != now.month or user.usage_reset_at.year != now.year:
            user.usage_count = 0
            user.usage_reset_at = now

        limit = 20 + user.bonus_uses
        if user.usage_count >= limit:
            raise HTTPException(status_code=429, detail=f"You've used all {limit} free transcriptions this month. Upgrade to Premium for unlimited access.")

        user.usage_count += 1
        db.add(user)
        await db.commit()


    try:
        video_id = extract_video_id(video_url)
        ytt_api = YouTubeTranscriptApi()

        transcript_list = ytt_api.list(video_id)
        available_codes = [t.language_code for t in transcript_list]

        if language not in available_codes:
            return {"success": False, "error": "No captions available for this video"}

        transcript = ytt_api.fetch(video_id, languages=[language])
        snippets = transcript.snippets
        segments = merge_segments(snippets)


        return {
            "success": True,
            "video_id": video_id,
            "source": "captions",
            "language": language,
            "segments": segments,
            "word_count": sum(len(s.text.split()) for s in snippets),
        }
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return {"success": False, "error": str(e)}
