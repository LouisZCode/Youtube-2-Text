from fastapi import APIRouter
from youtube_transcript_api import YouTubeTranscriptApi

from .utils import extract_video_id

router = APIRouter()


@router.get("/video/languages")
async def get_video_languages(video_url: str):
    try:
        video_id = extract_video_id(video_url)
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)

        languages = [
            {"code": t.language_code, "name": t.language}
            for t in transcript_list
        ]

        return {
            "success": True,
            "languages": languages,
            "default": languages[0]["code"] if languages else None,
        }
    except Exception as e:
        return {"success": False, "languages": [], "default": None, "error": str(e)}
