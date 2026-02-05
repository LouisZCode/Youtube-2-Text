"""Test Deepgram transcription with downloaded MP3."""

import os
import time
from dotenv import load_dotenv
from deepgram import DeepgramClient

load_dotenv()

MP3_FILE = "data/VgrV2Cip5as.mp3"


def test_deepgram():
    print("=" * 60)
    print("DEEPGRAM TRANSCRIPTION TEST")
    print("=" * 60)

    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        print("  ERROR: DEEPGRAM_API_KEY not found in .env")
        return

    if not os.path.exists(MP3_FILE):
        print(f"  ERROR: {MP3_FILE} not found. Run the yt-dlp test first.")
        return

    file_size_mb = os.path.getsize(MP3_FILE) / (1024 * 1024)
    print(f"  File: {MP3_FILE} ({file_size_mb:.1f} MB)")

    # Create client with extended timeout for large files
    client = DeepgramClient(api_key=api_key, timeout=300.0)

    print("  Transcribing...")
    start_time = time.time()

    with open(MP3_FILE, "rb") as audio:
        buffer_data = audio.read()

    response = client.listen.v1.media.transcribe_file(
        request=buffer_data,
        model="nova-3",
        smart_format=True,
        punctuate=True,
        utterances=True,
        language="en",
    )

    elapsed = time.time() - start_time
    print(f"  Done in {elapsed:.2f}s")

    # Check what we got
    print(f"\n  Results:")
    print(f"  - Channels: {len(response.results.channels)}")
    print(f"  - Utterances: {len(response.results.utterances)}")

    # Show first few utterances
    print(f"\n  First 5 utterances:")
    for i, utt in enumerate(response.results.utterances[:5]):
        start_mm = int(utt.start // 60)
        start_ss = int(utt.start % 60)
        print(f"    ({start_mm:02d}:{start_ss:02d}) {utt.transcript[:80]}...")

    # Full transcript preview
    full_transcript = response.results.channels[0].alternatives[0].transcript
    word_count = len(full_transcript.split())
    print(f"\n  Total words: {word_count}")
    print(f"\n  Preview (first 500 chars):")
    print(f"    {full_transcript[:500]}...")

    return response


if __name__ == "__main__":
    test_deepgram()
