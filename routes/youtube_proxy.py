import asyncio
import logging
import random
import socket

import requests
from urllib3.exceptions import MaxRetryError
from youtube_transcript_api._errors import (
    AgeRestricted,
    InvalidVideoId,
    IpBlocked,
    NoTranscriptFound,
    NotTranslatable,
    PoTokenRequired,
    RequestBlocked,
    TranscriptsDisabled,
    TranslationLanguageNotAvailable,
    VideoUnavailable,
    VideoUnplayable,
    YouTubeRequestFailed,
)
from yt_dlp.utils import (
    DownloadError,
    ExtractorError,
    GeoRestrictedError,
    UnavailableVideoError,
)

_YTDLP_TRANSIENT_PATTERNS = (
    "sign in to confirm you're not a bot",
    "sign in to confirm you’re not a bot",
    "rate-limited",
    "http error 429",
    "http error 5",
    "connection reset",
    "remote end closed connection",
    "read timed out",
)

_YTDLP_UNAVAILABLE_PATTERNS = (
    "private video",
    "video unavailable",
    "this video has been removed",
    "this video is no longer available",
    "members-only",
    "join this channel",
    "video is age-restricted",
)


def _classify_ytdlp(exc: BaseException) -> str | None:
    if isinstance(exc, (UnavailableVideoError, GeoRestrictedError)):
        return "unavailable"
    if isinstance(exc, (DownloadError, ExtractorError)):
        msg = str(exc).lower()
        if any(p in msg for p in _YTDLP_TRANSIENT_PATTERNS):
            return "transient"
        if any(p in msg for p in _YTDLP_UNAVAILABLE_PATTERNS):
            return "unavailable"
    return None

logger = logging.getLogger(__name__)

ErrorCode = str  # "transient" | "no_captions" | "unavailable" | "bad_input" | "unknown"

USER_MESSAGES: dict[ErrorCode, str] = {
    "transient": "YouTube is throttling us right now. Please try again in a moment.",
    "no_captions": "No captions are available for this video.",
    "unavailable": "This video is private, deleted, age-restricted, or unavailable in your region.",
    "bad_input": "That doesn't look like a valid YouTube video URL.",
    "unknown": "Couldn't read this video's captions right now.",
}


def classify_youtube_error(exc: BaseException) -> ErrorCode:
    # isinstance ordering: most-specific first.
    # IpBlocked < RequestBlocked < CouldNotRetrieveTranscript.
    if isinstance(exc, (IpBlocked, RequestBlocked)):
        return "transient"
    if isinstance(exc, YouTubeRequestFailed):
        return "transient"
    if isinstance(exc, (MaxRetryError, requests.exceptions.RequestException, socket.timeout)):
        return "transient"
    if isinstance(exc, (TranscriptsDisabled, NoTranscriptFound,
                        NotTranslatable, TranslationLanguageNotAvailable)):
        return "no_captions"
    if isinstance(exc, (VideoUnavailable, VideoUnplayable, AgeRestricted, PoTokenRequired)):
        return "unavailable"
    if isinstance(exc, (InvalidVideoId, ValueError)):
        return "bad_input"
    ytdlp_code = _classify_ytdlp(exc)
    if ytdlp_code:
        return ytdlp_code
    return "unknown"


async def with_retries(fn, *, attempts: int = 3, backoff=(0.5, 1.0, 2.0), jitter: float = 0.2):
    """Run a sync callable in a worker thread; retry only on transient errors."""
    for i in range(attempts):
        try:
            return await asyncio.to_thread(fn)
        except BaseException as e:
            if classify_youtube_error(e) != "transient" or i == attempts - 1:
                raise
            wait = backoff[min(i, len(backoff) - 1)] * (1 + random.uniform(-jitter, jitter))
            logger.warning(
                "Transient YouTube error %s, retrying in %.2fs (attempt %d/%d)",
                type(e).__name__, wait, i + 1, attempts,
            )
            await asyncio.sleep(wait)


def error_response(exc: BaseException, **extra) -> dict:
    code = classify_youtube_error(exc)
    return {"success": False, "error_code": code, "error": USER_MESSAGES[code], **extra}
