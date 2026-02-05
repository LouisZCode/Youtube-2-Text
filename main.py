from fastapi import FastAPI
import os

from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp

import re   

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
    """Merge small segments into ~30 second chunks."""
    if not snippets:
        return []

    merged = []
    current_start = snippets[0].start
    current_texts = []

    for snippet in snippets:
        current_texts.append(snippet.text)

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

@app.get("/health/")
def check_health():
    return {"status" : "ok"}


@app.post("/video/")
async def test_transcript_api(video_url : str, language : str):

    VIDEO_ID = _extract_video_id(video_url)
    ytt_api = YouTubeTranscriptApi()
    # Check available languages
    transcript_list = ytt_api.list(VIDEO_ID)
    available_codes = [t.language_code for t in transcript_list]                                                                
    if language in available_codes: 

        try:
            # Fetch transcript
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
            print(f"  FAILED: {type(e).__name__}: {e}")
            return {"success": False, "text": "", "words": 0}
    
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
            info = ydl.extract_info(video_url, download=True)
            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)

        mp3_file = f"{output_path}.mp3"
        file_size_mb = os.path.getsize(mp3_file) / (1024 * 1024)
        return {"success": True, "file": mp3_file, "size_mb": file_size_mb, "duration": duration}

    except Exception as e:
        return {"success": False, "file": "", "size_mb": 0, "duration": 0}