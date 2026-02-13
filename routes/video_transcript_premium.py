from fastapi import APIRouter, Depends
from deepgram import DeepgramClient
import yt_dlp
import os
import tempfile

from dotenv import load_dotenv

from .utils import extract_video_id, merge_segments
from dependencies.auth import require_premium

router = APIRouter()
load_dotenv()


def _transcribe_with_deepgram(mp3_path: str) -> tuple[list[dict], int]:
    """Transcribe MP3 file using Deepgram Nova-3."""
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY not found in .env")

    client = DeepgramClient(api_key=api_key, timeout=300.0)

    with open(mp3_path, "rb") as audio:
        buffer_data = audio.read()

    response = client.listen.v1.media.transcribe_file(
        request=buffer_data,
        model="nova-3",
        smart_format=True,
        punctuate=True,
        utterances=True,
        language="en",
    )

    utterances = response.results.utterances
    segments = merge_segments(utterances)

    full_text = response.results.channels[0].alternatives[0].transcript
    word_count = len(full_text.split())

    return segments, word_count


@router.post("/video/premium/")
async def get_video_transcript_premium(video_url: str, language: str = "en", user=Depends(require_premium)):
    try:
        video_id = extract_video_id(video_url)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = os.path.join(tmpdir, video_id)
            ydl_opts = {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
                "outtmpl": f"{output_path}.%(ext)s",
                "quiet": True,
                "no_warnings": True,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(video_url, download=True)

            mp3_file = f"{output_path}.mp3"
            segments, word_count = _transcribe_with_deepgram(mp3_file)

        return {
            "success": True,
            "video_id": video_id,
            "source": "audio_transcription",
            "language": language,
            "segments": segments,
            "word_count": word_count,
        }
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return {"success": False, "error": str(e)}
