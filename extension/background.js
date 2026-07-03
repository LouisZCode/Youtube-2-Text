// TubeText background service worker.
//
// All API calls happen here, not in the content script: content-script
// fetches run under youtube.com's origin, so the SameSite=Lax cookies on
// api.tubetext.app (auth JWT + anonymous usage counter) would be dropped.
// Extension-context fetches to a host listed in host_permissions are
// treated as same-site and are exempt from CORS, so no backend changes
// (ALLOWED_ORIGINS) are needed.

const API_URL = "https://api.tubetext.app";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch(() =>
      sendResponse({
        success: false,
        error_code: "network",
        error: "Couldn't reach TubeText. Check your connection and try again.",
      })
    );
  return true; // keep the message channel open for the async response
});

async function handle(msg) {
  switch (msg.type) {
    case "me":
      return getMe();
    case "transcript":
      return getTranscript(msg.videoUrl);
    case "summary":
      return getSummary(msg.transcription, msg.language);
    default:
      return { success: false, error_code: "unknown", error: `Unknown message type: ${msg.type}` };
  }
}

async function getMe() {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (!res.ok) return { success: true, user: null };
  return { success: true, user: await res.json() };
}

async function getTranscript(videoUrl) {
  // Prefer the video's own caption language over hardcoded English.
  let language = "en";
  try {
    const params = new URLSearchParams({ video_url: videoUrl });
    const res = await fetch(`${API_URL}/video/languages?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.default) language = data.default;
    }
  } catch {
    // Detection is best-effort; the transcript call reports real errors.
  }

  const params = new URLSearchParams({ video_url: videoUrl, language });
  const res = await fetch(`${API_URL}/video/?${params}`, {
    method: "POST",
    credentials: "include",
  });

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    return { success: false, error_code: "limit", error: body.detail || "Free usage limit reached." };
  }
  if (!res.ok) {
    return { success: false, error_code: "unknown", error: `TubeText error (${res.status}). Please try again.` };
  }
  // Body is {success: true, segments, ...} or {success: false, error, error_code}.
  return res.json();
}

async function getSummary(transcription, language) {
  const res = await fetch(`${API_URL}/video/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcription, language }),
    credentials: "include",
  });

  if (res.status === 401) return { success: false, error_code: "auth" };
  if (res.status === 403) return { success: false, error_code: "premium" };
  if (!res.ok) {
    return {
      success: false,
      error_code: "unknown",
      error: "Summary service is unavailable right now. Please try again in a moment.",
    };
  }
  const data = await res.json();
  return { success: true, summary: data.summary, trace_id: data.trace_id };
}
