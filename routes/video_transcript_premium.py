import asyncio
import json
import logging
import os
import tempfile

import sentry_sdk
import yt_dlp
from deepgram import DeepgramClient
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse
from langfuse import get_client, propagate_attributes

from .utils import extract_video_id, merge_segments
from .youtube_proxy import classify_youtube_error, error_response, with_retries
from dependencies.auth import require_premium

router = APIRouter()
load_dotenv()
logger = logging.getLogger(__name__)
langfuse = get_client()

DEEPGRAM_PER_SECOND_USD = float(os.getenv("DEEPGRAM_PER_SECOND_USD", "0.0000723"))
MAX_VIDEO_MINUTES = int(os.getenv("PREMIUM_MAX_VIDEO_MINUTES", "60"))
# Railway's edge reaps idle connections (PREMIUM-001); events must flow
# faster than that timeout to keep long transcriptions alive.
HEARTBEAT_SECONDS = 5.0


class VideoTooLongError(Exception):
    def __init__(self, duration_minutes: float):
        self.duration_minutes = duration_minutes
        super().__init__(f"{duration_minutes:.0f}min exceeds {MAX_VIDEO_MINUTES}min limit")


def _proxy_url() -> str:
    return (
        f"http://{os.getenv('WEBSHARE_PROXY_USERNAME')}-rotate:"
        f"{os.getenv('WEBSHARE_PROXY_PASSWORD')}@p.webshare.io:80"
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _transcribe_with_deepgram(mp3_path: str, language: str) -> tuple[list[dict], int, float]:
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
        language=language,
    )

    utterances = response.results.utterances
    segments = merge_segments(utterances)

    full_text = response.results.channels[0].alternatives[0].transcript
    word_count = len(full_text.split())
    duration = float(response.metadata.duration)

    return segments, word_count, duration


@router.post("/video/premium/")
async def get_video_transcript_premium(
    video_url: str,
    language: str = "en",
    user=Depends(require_premium),
    x_session_id: str | None = Header(None, alias="X-Session-Id"),
):
    async def event_generator():
        with langfuse.start_as_current_observation(
            name="video-transcript-premium", as_type="span"
        ) as span:
            attrs = {
                "user_id": str(user.id),
                "tags": [f"language:{language}", "tier:premium"],
            }
            if x_session_id:
                attrs["session_id"] = x_session_id
            with propagate_attributes(**attrs):
                span.update(input={
                    "video_url": video_url,
                    "language": language,
                    "tier": "premium",
                })

                try:
                    video_id = extract_video_id(video_url)
                except ValueError as e:
                    span.update(level="ERROR", status_message=f"bad_input: {type(e).__name__}")
                    yield _sse(error_response(e))
                    return

                # Written by the pipeline worker thread, read by the heartbeat
                # loop. Plain dict is safe here: single writer, atomic updates.
                progress = {"stage": "checking", "percent": None}

                def _on_download_progress(d: dict):
                    if d.get("status") == "downloading":
                        total = d.get("total_bytes") or d.get("total_bytes_estimate")
                        downloaded = d.get("downloaded_bytes")
                        progress["stage"] = "downloading"
                        progress["percent"] = (
                            round(downloaded / total * 100) if total and downloaded else None
                        )
                    elif d.get("status") == "finished":
                        progress["stage"] = "transcribing"
                        progress["percent"] = None

                def _pipeline():
                    progress["stage"] = "checking"
                    progress["percent"] = None
                    probe_opts = {
                        "quiet": True,
                        "no_warnings": True,
                        "proxy": _proxy_url(),
                        "socket_timeout": 30,
                    }
                    with yt_dlp.YoutubeDL(probe_opts) as ydl:
                        info = ydl.extract_info(video_url, download=False)
                    duration_s = info.get("duration")
                    if duration_s and duration_s > MAX_VIDEO_MINUTES * 60:
                        raise VideoTooLongError(duration_s / 60)

                    progress["stage"] = "downloading"
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
                            "noprogress": True,
                            "proxy": _proxy_url(),
                            "socket_timeout": 30,
                            "progress_hooks": [_on_download_progress],
                        }

                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            ydl.extract_info(video_url, download=True)

                        progress["stage"] = "transcribing"
                        mp3_file = f"{output_path}.mp3"
                        return _transcribe_with_deepgram(mp3_file, language)

                task = asyncio.create_task(
                    with_retries(_pipeline, attempts=3, backoff=(2.0, 4.0))
                )
                try:
                    yield _sse({"status": dict(progress)})
                    while True:
                        done, _ = await asyncio.wait({task}, timeout=HEARTBEAT_SECONDS)
                        if done:
                            break
                        yield _sse({"status": dict(progress)})
                    segments, word_count, duration = task.result()
                except VideoTooLongError as e:
                    span.update(
                        level="WARNING",
                        status_message=f"too_long: {e.duration_minutes:.0f}min",
                    )
                    yield _sse({
                        "success": False,
                        "error_code": "too_long",
                        "error": (
                            f"This video is about {round(e.duration_minutes)} minutes long — "
                            f"HD transcription currently supports videos up to "
                            f"{MAX_VIDEO_MINUTES} minutes. Try a shorter video, or Quick mode "
                            f"if the video has captions."
                        ),
                    })
                    return
                except Exception as e:
                    sentry_sdk.capture_exception(e)
                    code = classify_youtube_error(e)
                    logger.warning(
                        "video_transcript_premium failed for %s: %s",
                        video_url, type(e).__name__,
                    )
                    span.update(level="ERROR", status_message=f"{code}: {type(e).__name__}")
                    yield _sse(error_response(e))
                    return
                finally:
                    # Client disconnect closes this generator; don't leave the
                    # pipeline task awaiting forever.
                    if not task.done():
                        task.cancel()

                cost_usd = round(duration * DEEPGRAM_PER_SECOND_USD, 6)

                with langfuse.start_as_current_observation(
                    name="deepgram-transcribe",
                    as_type="generation",
                    model="nova-3",
                    input={"language": language, "audio_format": "mp3"},
                    output={"word_count": word_count, "segments_count": len(segments)},
                    usage_details={"seconds": int(duration)},
                    cost_details={"input": cost_usd},
                ):
                    pass

                span.update(output={
                    "video_id": video_id,
                    "segments_count": len(segments),
                    "word_count": word_count,
                    "audio_duration_seconds": round(duration, 2),
                    "cost_usd": cost_usd,
                    "source": "audio_transcription",
                })

                yield _sse({
                    "done": True,
                    "success": True,
                    "video_id": video_id,
                    "source": "audio_transcription",
                    "language": language,
                    "segments": segments,
                    "word_count": word_count,
                    "trace_id": span.trace_id,
                })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
