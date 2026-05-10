import logging
import os

import sentry_sdk
from dotenv import load_dotenv
from fastapi import APIRouter
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

from .utils import extract_video_id
from .youtube_proxy import error_response, with_retries

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/video/languages")
async def get_video_languages(video_url: str):
    try:
        video_id = extract_video_id(video_url)
    except ValueError as e:
        return error_response(e, languages=[], default=None)

    def _list():
        ytt_api = YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(
                proxy_username=os.getenv("WEBSHARE_PROXY_USERNAME"),
                proxy_password=os.getenv("WEBSHARE_PROXY_PASSWORD"),
            )
        )
        return ytt_api.list(video_id)

    try:
        transcript_list = await with_retries(_list)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.warning("language_detect failed for %s: %s", video_url, type(e).__name__)
        return error_response(e, languages=[], default=None)

    languages = [{"code": t.language_code, "name": t.language} for t in transcript_list]
    return {
        "success": True,
        "languages": languages,
        "default": languages[0]["code"] if languages else None,
    }
