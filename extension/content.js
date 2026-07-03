// TubeText content script: injects a transcript/summary panel on YouTube
// watch pages. All network calls go through the background service worker
// (see background.js for why); this file only handles DOM and state.
//
// Transcript text and API error strings are untrusted — they are always
// inserted with textContent, never innerHTML.

const TUBETEXT_URL = "https://tubetext.app";

const state = {
  videoId: null,
  transcript: null, // { segments: [{timestamp, text}], language, trace_id }
  summary: null, // string
  view: null, // "transcript" | "summary"
  busy: false,
};

function api(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError || !res) {
        resolve({
          success: false,
          error_code: "network",
          error: "TubeText couldn't reach its background service — try reloading the page.",
        });
      } else {
        resolve(res);
      }
    });
  });
}

function getVideoId() {
  if (location.pathname !== "/watch") return null;
  return new URLSearchParams(location.search).get("v");
}

function canonicalUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function tsToSeconds(ts) {
  // Backend formats timestamps as "(MM:SS)" or "(H:MM:SS)".
  const parts = ts.replace(/[^\d:]/g, "").split(":").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// ---------------------------------------------------------------- panel DOM

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "tubetext-panel";
  panel.innerHTML = `
    <div class="tt-header">
      <img class="tt-logo" alt="" />
      <span class="tt-title">TubeText</span>
      <span class="tt-auth"></span>
    </div>
    <div class="tt-actions">
      <button class="tt-btn" data-tt="transcript">Transcript</button>
      <button class="tt-btn" data-tt="summary">AI Summary</button>
      <button class="tt-btn tt-copy" data-tt="copy" hidden>Copy</button>
    </div>
    <div class="tt-status" hidden></div>
    <div class="tt-message" hidden></div>
    <div class="tt-result" hidden></div>
    <div class="tt-footer">
      <a href="${TUBETEXT_URL}" target="_blank" rel="noopener">Open TubeText for HD transcription &amp; translation ↗</a>
    </div>
  `;
  panel.querySelector(".tt-logo").src = chrome.runtime.getURL("icons/icon48.png");
  panel.querySelector('[data-tt="transcript"]').addEventListener("click", onTranscriptClick);
  panel.querySelector('[data-tt="summary"]').addEventListener("click", onSummaryClick);
  panel.querySelector('[data-tt="copy"]').addEventListener("click", onCopyClick);
  panel.querySelector(".tt-result").addEventListener("click", onResultClick);
  return panel;
}

function getPanel() {
  return document.getElementById("tubetext-panel");
}

function removePanel() {
  // querySelectorAll, not getElementById: duplicate panels (stale content
  // script after an extension reload, YouTube's cached page components)
  // must all go.
  document.querySelectorAll("#tubetext-panel").forEach((el) => el.remove());
}

function findMountPoint() {
  // Sidebar next to the player; falls back to the section under the player
  // (theater mode / narrow layouts).
  return document.querySelector("#secondary #secondary-inner") || document.querySelector("#primary #below");
}

let mountObserver = null;

function mountPanel() {
  const panels = document.querySelectorAll("#tubetext-panel");
  if (panels.length === 1 && panels[0].isConnected) return;
  panels.forEach((el) => el.remove());

  // Only one pending mount at a time — a stale observer from a previous
  // navigation racing a fresh boot() is how duplicate panels appear.
  mountObserver?.disconnect();
  mountObserver = null;

  const tryMount = () => {
    if (getPanel()?.isConnected) return true;
    const mount = findMountPoint();
    if (!mount) return false;
    mount.prepend(buildPanel());
    applyTheme();
    renderState();
    refreshAuthChip();
    return true;
  };

  if (tryMount()) return;

  // YouTube renders progressively — wait for the sidebar to appear.
  mountObserver = new MutationObserver(() => {
    if (tryMount()) {
      mountObserver?.disconnect();
      mountObserver = null;
    }
  });
  mountObserver.observe(document.body, { childList: true, subtree: true });
  const observer = mountObserver;
  setTimeout(() => observer.disconnect(), 15000);
}

// ------------------------------------------------------------------- theme

function pageBackgroundIsDark() {
  for (const el of [document.querySelector("ytd-app"), document.body, document.documentElement]) {
    if (!el) continue;
    const m = getComputedStyle(el).backgroundColor.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (!m) continue;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) continue; // transparent
    return 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3] < 128;
  }
  return false;
}

function isDarkTheme() {
  return document.documentElement.hasAttribute("dark") || pageBackgroundIsDark();
}

function applyTheme() {
  getPanel()?.classList.toggle("tt-dark", isDarkTheme());
}

// ---------------------------------------------------------------- markdown

// Minimal markdown renderer for AI summaries. Builds DOM nodes directly
// (never innerHTML) so model output can't inject markup.
function renderInline(text, target) {
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) target.append(text.slice(last, m.index));
    const tag = m[1] !== undefined ? "strong" : m[2] !== undefined ? "em" : "code";
    const el = document.createElement(tag);
    el.textContent = m[1] ?? m[2] ?? m[3];
    target.append(el);
    last = re.lastIndex;
  }
  if (last < text.length) target.append(text.slice(last));
}

function renderMarkdown(md) {
  const frag = document.createDocumentFragment();
  let list = null;

  for (const rawLine of md.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      list = null;
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) {
      list = null;
      const h = document.createElement("div");
      h.className = "tt-md-h";
      renderInline(heading[1], h);
      frag.append(h);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bullet) {
      if (!list) {
        list = document.createElement("ul");
        list.className = "tt-md-list";
        frag.append(list);
      }
      const li = document.createElement("li");
      if (bullet[1].length >= 2) li.className = "tt-md-nested";
      renderInline(bullet[2], li);
      list.append(li);
      continue;
    }

    list = null;
    const p = document.createElement("p");
    p.className = "tt-md-p";
    renderInline(line, p);
    frag.append(p);
  }
  return frag;
}

// ------------------------------------------------------------------ render

function setStatus(text) {
  const el = getPanel()?.querySelector(".tt-status");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}

function setMessage(text, linkText, linkHref) {
  const el = getPanel()?.querySelector(".tt-message");
  if (!el) return;
  el.textContent = "";
  el.hidden = !text;
  if (!text) return;
  el.append(text + " ");
  if (linkText) {
    const a = document.createElement("a");
    a.href = linkHref || TUBETEXT_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = linkText;
    el.append(a);
  }
}

function setBusy(busy) {
  state.busy = busy;
  const panel = getPanel();
  if (!panel) return;
  panel.querySelector('[data-tt="transcript"]').disabled = busy;
  panel.querySelector('[data-tt="summary"]').disabled = busy;
}

function renderState() {
  const panel = getPanel();
  if (!panel) return;

  const result = panel.querySelector(".tt-result");
  const copyBtn = panel.querySelector('[data-tt="copy"]');
  result.textContent = "";
  result.hidden = true;
  copyBtn.hidden = true;

  panel.querySelector('[data-tt="transcript"]').classList.toggle("tt-active", state.view === "transcript");
  panel.querySelector('[data-tt="summary"]').classList.toggle("tt-active", state.view === "summary");

  if (state.view === "transcript" && state.transcript) {
    for (const seg of state.transcript.segments) {
      const row = document.createElement("div");
      row.className = "tt-segment";
      const ts = document.createElement("button");
      ts.className = "tt-timestamp";
      ts.textContent = seg.timestamp.replace(/[()]/g, "");
      ts.dataset.ts = seg.timestamp;
      const text = document.createElement("span");
      text.className = "tt-text";
      text.textContent = seg.text;
      row.append(ts, text);
      result.append(row);
    }
    result.hidden = false;
    copyBtn.hidden = false;
  } else if (state.view === "summary" && state.summary) {
    const p = document.createElement("div");
    p.className = "tt-summary";
    p.append(renderMarkdown(state.summary));
    result.append(p);
    result.hidden = false;
    copyBtn.hidden = false;
  }
}

async function refreshAuthChip() {
  const chip = getPanel()?.querySelector(".tt-auth");
  if (!chip) return;
  const res = await api({ type: "me" });
  const liveChip = getPanel()?.querySelector(".tt-auth");
  if (!liveChip) return;
  liveChip.textContent = "";
  if (res.user) {
    liveChip.textContent = res.user.tier === "premium" ? "Premium" : "Free";
    liveChip.classList.toggle("tt-premium", res.user.tier === "premium");
  } else {
    const a = document.createElement("a");
    a.href = TUBETEXT_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Sign in ↗";
    liveChip.append(a);
  }
}

// ----------------------------------------------------------------- actions

async function ensureTranscript() {
  if (state.transcript) return true;
  setStatus("Fetching transcript…");
  const res = await api({ type: "transcript", videoUrl: canonicalUrl(state.videoId) });
  setStatus("");
  if (res.success) {
    state.transcript = { segments: res.segments, language: res.language, trace_id: res.trace_id };
    return true;
  }
  if (res.error_code === "limit") {
    setMessage(res.error, "Get more on TubeText ↗", TUBETEXT_URL);
  } else {
    setMessage(res.error || "Something went wrong. Please try again.");
  }
  return false;
}

async function onTranscriptClick() {
  if (state.busy) return;
  setMessage("");
  state.view = "transcript";
  if (state.transcript) {
    renderState();
    return;
  }
  setBusy(true);
  renderState();
  const ok = await ensureTranscript();
  setBusy(false);
  if (!ok) state.view = null;
  renderState();
}

async function onSummaryClick() {
  if (state.busy) return;
  setMessage("");
  state.view = "summary";
  if (state.summary) {
    renderState();
    return;
  }
  setBusy(true);
  renderState();

  const ok = await ensureTranscript();
  if (!ok) {
    setBusy(false);
    state.view = null;
    renderState();
    return;
  }

  setStatus("Summarizing…");
  const text = state.transcript.segments.map((s) => s.text).join(" ");
  const res = await api({ type: "summary", transcription: text, language: state.transcript.language });
  setStatus("");
  setBusy(false);

  if (res.success) {
    state.summary = res.summary;
    renderState();
    return;
  }
  state.view = "transcript";
  renderState();
  if (res.error_code === "auth") {
    setMessage("Sign in to TubeText to use AI summaries.", "Sign in ↗", TUBETEXT_URL);
  } else if (res.error_code === "premium") {
    setMessage("AI Summary is a TubeText Premium feature.", "Upgrade ↗", TUBETEXT_URL);
  } else {
    setMessage(res.error || "Summary failed. Please try again.");
  }
}

function onResultClick(e) {
  const btn = e.target.closest(".tt-timestamp");
  if (!btn) return;
  const seconds = tsToSeconds(btn.dataset.ts);
  if (seconds == null) return;
  const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
  if (video) video.currentTime = seconds;
}

async function onCopyClick() {
  let text = "";
  if (state.view === "transcript" && state.transcript) {
    text = state.transcript.segments.map((s) => `${s.timestamp} ${s.text}`).join("\n");
  } else if (state.view === "summary" && state.summary) {
    text = state.summary;
  }
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const btn = getPanel()?.querySelector('[data-tt="copy"]');
    if (btn) {
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    }
  } catch {
    setMessage("Copy failed — your browser blocked clipboard access.");
  }
}

// -------------------------------------------------------------------- boot

function boot() {
  const videoId = getVideoId();
  if (!videoId) {
    removePanel();
    state.videoId = null;
    return;
  }
  if (videoId !== state.videoId) {
    state.videoId = videoId;
    state.transcript = null;
    state.summary = null;
    state.view = null;
    state.busy = false;
  }
  mountPanel();
  applyTheme();
  renderState();
  setStatus("");
  setMessage("");
}

window.addEventListener("yt-navigate-finish", boot);
new MutationObserver(applyTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["dark"],
});
boot();
