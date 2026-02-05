"""Test the 2 YouTube data extraction options side by side.

Option 1: youtube-transcript-api (captions)
Option 2: yt-dlp (audio download — for future Deepgram transcription)
"""

import os

VIDEO_URL = "https://www.youtube.com/watch?v=bkVKLPvXBUc"
VIDEO_ID = "bkVKLPvXBUc"


def test_transcript_api():
    """Option 1: youtube-transcript-api — fetch existing captions."""
    print("\n" + "=" * 60)
    print("OPTION 1: youtube-transcript-api (captions)")
    print("=" * 60)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        ytt_api = YouTubeTranscriptApi()

        # Check available languages
        transcript_list = ytt_api.list(VIDEO_ID)
        print("  Available transcripts:")
        for t in transcript_list:
            print(f"    - {t.language} ({t.language_code}) | auto-generated: {t.is_generated}")

        # Fetch transcript
        transcript = ytt_api.fetch(VIDEO_ID)
        snippets = transcript.snippets
        full_text = " ".join(s.text for s in snippets)

        print(f"\n  Snippets: {len(snippets)}")
        print(f"  Total chars: {len(full_text)}")
        print(f"  Total words: {len(full_text.split())}")
        print(f"\n  Preview (first 500 chars):")
        print(f"    {full_text[:500]}...")
        return {"success": True, "text": full_text, "words": len(full_text.split())}
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return {"success": False, "text": "", "words": 0}


def test_ytdlp():
    """Option 2: yt-dlp — download audio file."""
    print("\n" + "=" * 60)
    print("OPTION 2: yt-dlp (audio download)")
    print("=" * 60)
    try:
        import yt_dlp

        output_path = "data/test_ytdlp"
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
            info = ydl.extract_info(VIDEO_URL, download=True)
            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)

        mp3_file = f"{output_path}.mp3"
        file_size_mb = os.path.getsize(mp3_file) / (1024 * 1024)

        print(f"  Title: {title}")
        print(f"  Duration: {duration}s ({duration // 60}m {duration % 60}s)")
        print(f"  File: {mp3_file} ({file_size_mb:.1f} MB)")
        print(f"  Ready for Deepgram transcription")
        return {"success": True, "file": mp3_file, "size_mb": file_size_mb, "duration": duration}
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return {"success": False, "file": "", "size_mb": 0, "duration": 0}


if __name__ == "__main__":
    r1 = test_transcript_api()
    r2 = test_ytdlp()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Option 1 (captions):  {'PASS' if r1['success'] else 'FAIL'}  |  {r1['words']} words")
    print(f"  Option 2 (yt-dlp):    {'PASS' if r2['success'] else 'FAIL'}  |  {r2['size_mb']:.1f} MB  |  {r2['duration']}s")

    if r1["success"]:
        print("\n  → This video HAS captions. Transcript API is the best path.")
        print("  → yt-dlp + Deepgram would be the fallback for videos without captions.")
