import { TranscriptResponse, SummaryResponse, TranslateResponse, Segment, TranslateChunkEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface CurrentUser {
  name: string;
  email: string;
  avatar_url: string | null;
  tier: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, { credentials: "include" });
}

export interface VideoLanguage {
  code: string;
  name: string;
}

export async function fetchLanguages(
  videoUrl: string
): Promise<{ success: boolean; languages: VideoLanguage[]; default: string | null }> {
  const params = new URLSearchParams({ video_url: videoUrl });
  const res = await fetch(`${API_URL}/video/languages?${params}`);
  if (!res.ok) return { success: false, languages: [], default: null };
  return res.json();
}

export async function fetchTranscript(
  videoUrl: string,
  language: string = "en"
): Promise<TranscriptResponse> {
  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/?${params}`, { method: "POST", credentials: "include" });

  if (!res.ok) {
    if (res.status === 429) {
      const body = await res.json();
      throw new Error(`__LIMIT__${body.detail || "Free usage limit reached"}`);
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
    if (res.status === 401) throw new Error("__AUTH__Sign in required");
    if (res.status === 403) throw new Error("__PREMIUM__Premium subscription required");
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
  if (!res.ok) {
    if (res.status === 401) throw new Error("__AUTH__Sign in required");
    if (res.status === 403) throw new Error("__PREMIUM__Premium subscription required");
    throw new Error(`Summary failed: ${res.status}`);
  }
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
  if (!res.ok) {
    if (res.status === 401) throw new Error("__AUTH__Sign in required");
    if (res.status === 403) throw new Error("__PREMIUM__Premium subscription required");
    throw new Error(`Translation failed: ${res.status}`);
  }

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

export async function createCheckout(plan: "monthly" | "yearly" | "lifetime"): Promise<string> {
  const res = await fetch(`${API_URL}/payments/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.detail || "Failed to create checkout");
  }
  const data = await res.json();
  return data.url;
}

export async function fetchCustomerPortal(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/payments/portal`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url;
  } catch {
    return null;
  }
}

export async function downloadPdf(
  segments: { timestamp: string; text: string }[],
  videoId?: string
): Promise<void> {
  const res = await fetch(`${API_URL}/video/pdf/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, video_id: videoId }),
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`PDF download failed: ${res.status}`);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || "transcript.pdf";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
