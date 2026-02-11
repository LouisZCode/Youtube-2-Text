import { TranscriptResponse, SummaryResponse, TranslateResponse, Segment, TranslateChunkEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchTranscript(
  videoUrl: string,
  language: string = "en"
): Promise<TranscriptResponse> {
  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/?${params}`, { method: "POST", credentials: "include" });

  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json();
      throw new Error(body.detail || "Free usage limit reached");
    }
    throw new Error(`Server error: ${res.status}`);
  }

  return res.json();
}

export async function fetchTranscriptPremium(
  videoUrl: string,
  language: string = "en"
): Promise<TranscriptResponse> {
  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/premium/?${params}`, { method: "POST", credentials: "include" });

  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`);
  }

  return res.json();
}

export async function fetchSummary(transcription: string): Promise<SummaryResponse> {
  const res = await fetch(`${API_URL}/video/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcription }),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Summary failed: ${res.status}`);
  return res.json();
}

export async function fetchTranslationStream(
  segments: Segment[],
  language: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/video/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, language }),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Translation failed: ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      const event: TranslateChunkEvent = JSON.parse(line.slice(6));
      if (event.done) return;
      if (event.translation) onChunk(event.translation);
    }
  }
}

export async function downloadPdf(
  segments: { timestamp: string; text: string }[]
): Promise<void> {
  const res = await fetch(`${API_URL}/video/pdf/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`PDF download failed: ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "transcript.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
