import logging
import os
import tempfile

import sentry_sdk
import yt_dlp
from deepgram import DeepgramClient
from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from langfuse import get_client, propagate_attributes

from .utils import extract_video_id, merge_segments
from .youtube_proxy import classify_youtube_error, error_response, with_retries
from dependencies.auth import require_premium

router = APIRouter()
load_dotenv()
logger = logging.getLogger(__name__)
langfuse = get_client()


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
async def get_video_transcript_premium(
    video_url: str, language: str = "en", user=Depends(require_premium)
):
    with langfuse.start_as_current_observation(
        name="video-transcript-premium", as_type="span"
    ) as span:
        with propagate_attributes(
            user_id=str(user.id),
            tags=[f"language:{language}", "tier:premium"],
        ):
            span.update(input={
                "video_url": video_url,
                "language": language,
                "tier": "premium",
            })

            try:
                video_id = extract_video_id(video_url)
            except ValueError as e:
                span.update(level="ERROR", status_message=f"bad_input: {type(e).__name__}")
                return error_response(e)

            def _pipeline():
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
                        "proxy": (
                            f"http://{os.getenv('WEBSHARE_PROXY_USERNAME')}-rotate:"
                            f"{os.getenv('WEBSHARE_PROXY_PASSWORD')}@p.webshare.io:80"
                        ),
                    }

                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.extract_info(video_url, download=True)

                    mp3_file = f"{output_path}.mp3"
                    return _transcribe_with_deepgram(mp3_file)

            try:
                segments, word_count = await with_retries(
                    _pipeline, attempts=2, backoff=(3.0,)
                )
            except Exception as e:
                sentry_sdk.capture_exception(e)
                code = classify_youtube_error(e)
                logger.warning(
                    "video_transcript_premium failed for %s: %s",
                    video_url, type(e).__name__,
                )
                span.update(level="ERROR", status_message=f"{code}: {type(e).__name__}")
                return error_response(e)

            span.update(output={
                "video_id": video_id,
                "segments_count": len(segments),
                "word_count": word_count,
                "source": "audio_transcription",
            })

            return {
                "success": True,
                "video_id": video_id,
                "source": "audio_transcription",
                "language": language,
                "segments": segments,
                "word_count": word_count,
            }
