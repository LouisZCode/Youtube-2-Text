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

    languages = [
        {"code": t.language_code, "name": t.language, "generated": t.is_generated}
        for t in transcript_list
    ]

    def _is_english(code: str) -> bool:
        return code == "en" or code.startswith("en-")

    # Default chain (LANG-001): YouTube returns auto-generated tracks
    # alphabetically (ar first), so blind languages[0] mistook Arabic
    # auto-translations for the source language on English videos.
    # Prefer English when present, keep autodetect otherwise:
    # 1. manual English, 2. first manual, 3. auto English, 4. first track.
    manual = [lang for lang, t in zip(languages, transcript_list) if not t.is_generated]
    default = None
    for lang in manual:
        if _is_english(lang["code"]):
            default = lang["code"]
            break
    if default is None and manual:
        default = manual[0]["code"]
    if default is None:
        for lang in languages:
            if _is_english(lang["code"]):
                default = lang["code"]
                break
    if default is None and languages:
        default = languages[0]["code"]
    return {
        "success": True,
        "languages": languages,
        "default": default,
    }
