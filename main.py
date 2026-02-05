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
            full_text = " ".join(s.text for s in snippets)

            return {"success": True, "text": full_text, "words": len(full_text.split())}
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