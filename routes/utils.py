import re


def extract_video_id(url: str) -> str | None:
    patterns = [
        r'(?:v=|\/)([\w-]{11})(?:\?|&|$)',
        r'youtu\.be\/([\w-]{11})',
    ]
    for p in patterns:
        if match := re.search(p, url):
            return match.group(1)
    return None


def format_timestamp(seconds: float) -> str:
    """Convert seconds to (MM:SS) format."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"({mins:02d}:{secs:02d})"


def merge_segments(snippets, target_duration: float = 30.0) -> list[dict]:
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
        text = getattr(snippet, 'text', None) or getattr(snippet, 'transcript', '')
        current_texts.append(text)

        elapsed = snippet.start - current_start
        if elapsed >= target_duration:
            merged.append({
                "timestamp": format_timestamp(current_start),
                "text": " ".join(current_texts)
            })
            current_start = snippet.start
            current_texts = []

    if current_texts:
        merged.append({
            "timestamp": format_timestamp(current_start),
            "text": " ".join(current_texts)
        })

    return merged
