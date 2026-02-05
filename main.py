from fastapi import FastAPI
import os
import re

from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
from deepgram import DeepgramClient
import yt_dlp

load_dotenv()

app = FastAPI()
                                                                                                                
                                                                                                                            
def _extract_video_id(url: str) -> str | None:
    patterns = [
        r'(?:v=|\/)([\w-]{11})(?:\?|&|$)',  # watch?v= or /VIDEO_ID
        r'youtu\.be\/([\w-]{11})',            # youtu.be/VIDEO_ID
    ]
    for p in patterns:
        if match := re.search(p, url):
            return match.group(1)
    return None


def _format_timestamp(seconds: float) -> str:
    """Convert seconds to (MM:SS) format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"({mins:02d}:{secs:02d})"


def _merge_segments(snippets, target_duration: float = 30.0) -> list[dict]:
    """Merge small segments into ~30 second chunks.

    Works with both YouTube transcript snippets (has .start, .text)
    and Deepgram utterances (has .start, .transcript).
    """
    if not snippets:
        return []

    merged = []
    current_start = snippets[0].start
    current_texts = []

    for snippet in snippets:
        # Handle both YouTube (.text) and Deepgram (.transcript)
        text = getattr(snippet, 'text', None) or getattr(snippet, 'transcript', '')
        current_texts.append(text)

        # Check if we've accumulated enough time
        elapsed = snippet.start - current_start
        if elapsed >= target_duration:
            merged.append({
                "timestamp": _format_timestamp(current_start),
                "text": " ".join(current_texts)
            })
            # Start new segment with next snippet
            current_start = snippet.start
            current_texts = []

    # Don't forget the last segment
    if current_texts:
        merged.append({
            "timestamp": _format_timestamp(current_start),
            "text": " ".join(current_texts)
        })

    return merged


def _transcribe_with_deepgram(mp3_path: str) -> tuple[list[dict], int]:
    """Transcribe MP3 file using Deepgram Nova-3.

    Returns:
        tuple: (merged_segments, word_count)
    """
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
    segments = _merge_segments(utterances)

    full_text = response.results.channels[0].alternatives[0].transcript
    word_count = len(full_text.split())

    return segments, word_count 

@app.get("/health/")
def check_health():
    return {"status" : "ok"}


@app.post("/video/")
async def test_transcript_api(video_url : str, language : str):

    VIDEO_ID = _extract_video_id(video_url)
    ytt_api = YouTubeTranscriptApi()

    # Try captions first
    try:
        transcript_list = ytt_api.list(VIDEO_ID)
        available_codes = [t.language_code for t in transcript_list]

        if language in available_codes:
            transcript = ytt_api.fetch(VIDEO_ID, languages=[language])
            snippets = transcript.snippets
            segments = _merge_segments(snippets)

            return {
                "success": True,
                "video_id": VIDEO_ID,
                "source": "captions",
                "language": language,
                "segments": segments,
                "word_count": sum(len(s.text.split()) for s in snippets)
            }
    except Exception as e:
        # Captions not available (disabled, etc.) — fall through to audio
        print(f"  Captions unavailable: {type(e).__name__}: {e}")
    
    # Fallback: Download audio and transcribe with Deepgram
    try:
        output_path = f"data/{VIDEO_ID}"
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

        # Transcribe with Deepgram
        segments, word_count = _transcribe_with_deepgram(mp3_file)

        return {
            "success": True,
            "video_id": VIDEO_ID,
            "source": "audio_transcription",
            "language": language,
            "segments": segments,
            "word_count": word_count
        }

    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return {"success": False, "error": str(e)}