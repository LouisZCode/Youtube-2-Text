"""Test Voxtral Mini Transcribe 2 with downloaded MP3."""

import os
import time
from dotenv import load_dotenv
from mistralai import Mistral

load_dotenv()

MP3_FILE = "data/VgrV2Cip5as.mp3"


def test_voxtral():
    print("=" * 60)
    print("VOXTRAL MINI TRANSCRIBE 2 TEST")
    print("=" * 60)

    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("  ERROR: MISTRAL_API_KEY not found in .env")
        return

    if not os.path.exists(MP3_FILE):
        print(f"  ERROR: {MP3_FILE} not found. Run the yt-dlp test first.")
        return

    file_size_mb = os.path.getsize(MP3_FILE) / (1024 * 1024)
    print(f"  File: {MP3_FILE} ({file_size_mb:.1f} MB)")

    client = Mistral(api_key=api_key)

    print("  Transcribing...")
    start_time = time.time()

    with open(MP3_FILE, "rb") as f:
        response = client.audio.transcriptions.complete(
            model="voxtral-mini-latest",
            file={
                "content": f,
                "file_name": "audio.mp3",
            },
            timestamp_granularities=["segment"],
        )

    elapsed = time.time() - start_time
    print(f"  Done in {elapsed:.2f}s")

    # Check what we got
    print(f"\n  Results:")
    print(f"  - Type: {type(response)}")

    # Get segments if available
    if hasattr(response, 'segments') and response.segments:
        print(f"  - Segments: {len(response.segments)}")

        print(f"\n  First 5 segments:")
        for seg in response.segments[:5]:
            start_mm = int(seg.start // 60)
            start_ss = int(seg.start % 60)
            text = seg.text[:80] if len(seg.text) > 80 else seg.text
            print(f"    ({start_mm:02d}:{start_ss:02d}) {text}...")

    # Get full text
    if hasattr(response, 'text'):
        word_count = len(response.text.split())
        print(f"\n  Total words: {word_count}")
        print(f"\n  Preview (first 500 chars):")
        print(f"    {response.text[:500]}...")

    return response


if __name__ == "__main__":
    test_voxtral()
