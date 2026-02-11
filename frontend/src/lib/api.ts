import { TranscriptResponse, SummaryResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchTranscript(
  videoUrl: string,
  language: string = "en"
): Promise<TranscriptResponse> {
  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/?${params}`, { method: "POST" });

  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`);
  }

  return res.json();
}

export async function fetchTranscriptPremium(
  videoUrl: string,
  language: string = "en"
): Promise<TranscriptResponse> {
  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/premium/?${params}`, { method: "POST" });

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
  });
  if (!res.ok) throw new Error(`Summary failed: ${res.status}`);
  return res.json();
}

export async function downloadPdf(
  segments: { timestamp: string; text: string }[]
): Promise<void> {
  const res = await fetch(`${API_URL}/video/pdf/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
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
