from fastapi import APIRouter
from youtube_transcript_api import YouTubeTranscriptApi

from .utils import extract_video_id, merge_segments

router = APIRouter()


@router.post("/video/")
async def get_video_transcript(video_url: str, language: str = "en"):
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
