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


class NoSpeechDetectedError(Exception):
    """Raised when Deepgram (nova-3, and the whisper-large fallback) both
    come back with ~zero transcribed words for audio that isn't just a
    couple seconds long -- there's nothing here for translate/summary to
    work with, so the route should say so instead of faking a success."""

    def __init__(self, duration_seconds: float):
        self.duration_seconds = duration_seconds
        super().__init__(f"no speech detected in {duration_seconds:.0f}s of audio")


def _proxy_url() -> str:
    return (
        f"http://{os.getenv('WEBSHARE_PROXY_USERNAME')}-rotate:"
        f"{os.getenv('WEBSHARE_PROXY_PASSWORD')}@p.webshare.io:80"
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# nova-3 is Deepgram's best/fastest model for normal speech, but local
# repro confirmed it can silently return ~0 words on sung vocals (worship
# / music videos with real lyrics) -- one prod video got 0 words, another
# got 72 words over 294s (density 0.24 words/sec vs ~2 for normal speech).
# whisper-large handles sung lyrics far better (310 clean words on the
# same failing file) but is slower/costlier, so it's a fallback, not the
# default.
_FALLBACK_MODEL = "whisper-large"
_FALLBACK_MIN_DURATION_S = 60
_FALLBACK_MIN_WORDS_PER_SECOND = 0.5


def _transcribe_with_deepgram(mp3_path: str, language: str) -> dict:
    """Transcribe MP3 file using Deepgram, falling back from nova-3 to
    whisper-large when nova-3 looks like it missed the audio entirely.

    Returns a dict with the winning segments/word_count/duration, which
    model produced them, and the total seconds billed across every
    Deepgram call made (both calls bill if the fallback fired).
    """
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY not found in .env")

    client = DeepgramClient(api_key=api_key, timeout=300.0)

    with open(mp3_path, "rb") as audio:
        buffer_data = audio.read()

    def _call(model: str) -> tuple[list[dict], int, float]:
        # "whisper-large" isn't in the SDK's typed model Literal, but the
        # param type is Union[Literal[...], Any], so Deepgram accepts it
        # as a passthrough string (verified against deepgram-sdk 5.3.2).
        response = client.listen.v1.media.transcribe_file(
            request=buffer_data,
            model=model,
            smart_format=True,
            punctuate=True,
            utterances=True,
            language=language,
        )
        segments = merge_segments(response.results.utterances)
        full_text = response.results.channels[0].alternatives[0].transcript
        word_count = len(full_text.split())
        duration = float(response.metadata.duration)
        return segments, word_count, duration

    # Nested under the ambient "video-transcript-premium" span: both
    # asyncio.create_task (at task creation) and asyncio.to_thread (at the
    # call site) copy the current contextvars context, so the OTel span
    # context set by event_generator's `with langfuse.start_as_current_
    # observation(...)` propagates into this worker thread. Opening the
    # generation here -- instead of after the whole pipeline finishes --
    # gives it real start/end wall-clock timing instead of start==end.
    # Verified empirically: a span opened in an outer asyncio task and a
    # generation opened inside asyncio.to_thread(...) share the same
    # trace_id and parent/child span_ids.
    with langfuse.start_as_current_observation(
        name="deepgram-transcribe",
        as_type="generation",
        model="nova-3",
        input={"language": language, "audio_format": "mp3"},
    ) as generation:
        segments, word_count, duration = _call("nova-3")
        model_used = "nova-3"
        calls_made = 1

        words_per_second = (word_count / duration) if duration else 0.0
        needs_fallback = word_count == 0 or (
            duration >= _FALLBACK_MIN_DURATION_S
            and words_per_second < _FALLBACK_MIN_WORDS_PER_SECOND
        )

        if needs_fallback:
            fb_segments, fb_word_count, fb_duration = _call(_FALLBACK_MODEL)
            calls_made += 1
            if fb_word_count > word_count:
                segments, word_count, duration = fb_segments, fb_word_count, fb_duration
                model_used = _FALLBACK_MODEL

        billed_seconds = duration * calls_made
        # Single env rate applied regardless of which model won -- a
        # knowing simplification. whisper-large's actual per-second
        # Deepgram rate may differ from nova-3's, but we only track one
        # DEEPGRAM_PER_SECOND_USD today.
        cost_usd = round(billed_seconds * DEEPGRAM_PER_SECOND_USD, 6)

        generation.update(
            model=model_used,
            output={
                "word_count": word_count,
                "segments_count": len(segments),
                "model": model_used,
                "fallback_triggered": calls_made > 1,
            },
            usage_details={"seconds": int(round(billed_seconds))},
            cost_details={"input": cost_usd},
        )

    if word_count == 0 and duration > 10:
        raise NoSpeechDetectedError(duration)

    return {
        "segments": segments,
        "word_count": word_count,
        "duration": duration,
        "model_used": model_used,
        "billed_seconds": billed_seconds,
        "cost_usd": cost_usd,
    }


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
                    result = task.result()
                    segments = result["segments"]
                    word_count = result["word_count"]
                    duration = result["duration"]
                    model_used = result["model_used"]
                    cost_usd = result["cost_usd"]
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
                except NoSpeechDetectedError as e:
                    span.update(
                        level="WARNING",
                        status_message=f"no_speech: {e.duration_seconds:.0f}s audio, 0 words",
                    )
                    yield _sse({
                        "success": False,
                        "error_code": "no_speech",
                        "error": (
                            "We couldn't detect any speech or lyrics in this video's audio, "
                            "so there's nothing to transcribe."
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

                # The "deepgram-transcribe" generation observation (with real
                # start/end timing, the winning model, and the honest total
                # cost across every Deepgram call made) is created inside
                # _transcribe_with_deepgram, nested under this span.

                span.update(output={
                    "video_id": video_id,
                    "segments_count": len(segments),
                    "word_count": word_count,
                    "audio_duration_seconds": round(duration, 2),
                    "model": model_used,
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
                    "model": model_used,
                    "trace_id": span.trace_id,
                })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
