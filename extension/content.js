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
  translations: {}, // lang -> { segments: [{timestamp, text}] } (only complete ones)
  summaries: {}, // lang -> summary string
  lang: "", // dropdown selection; "" = video's original language
  view: null, // "transcript" | "summary"
  busy: false,
};

const LANGUAGES = [
  ["en", "English"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["de", "German"],
  ["fr", "French"],
];

// A transcript with zero segments (or segments that are all blank text) can
// come back from a successful fetch — e.g. premium transcription finding no
// speech in the audio. Treat that as "nothing to show" rather than letting
// Translate/Summary run against empty input (they'd otherwise call the
// backend and, in translate's case, get back a no-op empty stream).
const NO_SPEECH_MESSAGE = "No speech was detected in this video's audio.";

function hasSpeech(segments) {
  return Array.isArray(segments) && segments.some((s) => s.text && s.text.trim());
}

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
    <div class="tt-lang-row">
      <span class="tt-lang-label">Language:</span>
      <select class="tt-lang" data-tt="lang" title="Get the transcript or summary in another language">
        <option value="">Original</option>
      </select>
    </div>
    <div class="tt-actions">
      <button class="tt-btn" data-tt="transcript">Transcript</button>
      <button class="tt-btn" data-tt="summary">Summary</button>
      <button class="tt-btn tt-copy" data-tt="copy" hidden>Copy</button>
    </div>
    <div class="tt-status" hidden></div>
    <div class="tt-message" hidden></div>
    <div class="tt-result" hidden></div>
    <div class="tt-footer">
      <a href="${TUBETEXT_URL}" target="_blank" rel="noopener">Open TubeText for HD transcription ↗</a>
    </div>
  `;
  panel.querySelector(".tt-logo").src = chrome.runtime.getURL("icons/icon48.png");
  const langSel = panel.querySelector('[data-tt="lang"]');
  for (const [code, name] of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    langSel.append(opt);
  }
  langSel.value = state.lang;
  langSel.addEventListener("change", onLangChange);
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
  panel.querySelector('[data-tt="lang"]').disabled = busy;
}

// Segments to show for the current language: the original transcript when
// "Original" is selected (or the video is already in that language), a
// cached translation otherwise, or null if it hasn't been fetched yet, or if
// it came back with no actual speech (empty array, or segments that are all
// blank text — same "nothing to show" case hasSpeech() guards elsewhere).
function currentSegments() {
  if (!state.transcript) return null;
  const segments =
    !state.lang || state.lang === state.transcript.language
      ? state.transcript.segments
      : state.translations[state.lang]?.segments;
  return hasSpeech(segments) ? segments : null;
}

function effectiveSummaryLang() {
  return state.lang || state.transcript?.language || "en";
}

function segmentRow(seg) {
  const row = document.createElement("div");
  row.className = "tt-segment";
  if (seg.timestamp) {
    const ts = document.createElement("button");
    ts.className = "tt-timestamp";
    ts.textContent = seg.timestamp.replace(/[()]/g, "");
    ts.dataset.ts = seg.timestamp;
    row.append(ts);
  }
  const text = document.createElement("span");
  text.className = "tt-text";
  text.textContent = seg.text;
  row.append(text);
  return row;
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

  if (state.view === "transcript") {
    const segments = currentSegments();
    if (segments) {
      for (const seg of segments) result.append(segmentRow(seg));
      result.hidden = false;
      copyBtn.hidden = false;
    }
  } else if (state.view === "summary") {
    const summary = state.transcript && state.summaries[effectiveSummaryLang()];
    if (summary) {
      const p = document.createElement("div");
      p.className = "tt-summary";
      p.append(renderMarkdown(summary));
      result.append(p);
      result.hidden = false;
      copyBtn.hidden = false;
    }
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
  renderState();
  if (currentSegments()) return; // original or cached translation, already rendered

  setBusy(true);
  const ok = await ensureTranscript();
  if (!ok) {
    setBusy(false);
    state.view = null;
    renderState();
    return;
  }
  if (!hasSpeech(state.transcript.segments)) {
    setBusy(false);
    state.view = null;
    setMessage(NO_SPEECH_MESSAGE);
    renderState();
    return;
  }
  renderState();
  if (currentSegments()) {
    setBusy(false);
    return;
  }
  await streamTranslation(state.lang); // resolves busy/status itself
}

async function onSummaryClick() {
  if (state.busy) return;
  setMessage("");
  state.view = "summary";
  renderState();
  if (state.transcript && state.summaries[effectiveSummaryLang()]) return;

  setBusy(true);
  const ok = await ensureTranscript();
  if (!ok) {
    setBusy(false);
    state.view = null;
    renderState();
    return;
  }
  if (!hasSpeech(state.transcript.segments)) {
    setBusy(false);
    state.view = null;
    setMessage(NO_SPEECH_MESSAGE);
    renderState();
    return;
  }

  const lang = effectiveSummaryLang();
  if (state.summaries[lang]) {
    setBusy(false);
    renderState();
    return;
  }

  setStatus("Summarizing…");
  const text = state.transcript.segments.map((s) => s.text).join(" ");
  const res = await api({ type: "summary", transcription: text, language: lang });
  setStatus("");
  setBusy(false);

  if (res.success) {
    state.summaries[lang] = res.summary;
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

function onLangChange(e) {
  if (state.busy) return; // select is disabled while busy, belt and suspenders
  state.lang = e.target.value;
  setMessage("");
  // Re-run the active view so it reflects the new language.
  if (state.view === "transcript") onTranscriptClick();
  else if (state.view === "summary") onSummaryClick();
}

// ------------------------------------------------------- translation stream

// The translate endpoint sends one SSE chunk per transcript segment (see
// background.js), so results render progressively instead of freezing on a
// spinner. Only complete translations are cached.
let activeStream = null;

function abortActiveStream() {
  activeStream?.cancel();
}

function streamTranslation(lang) {
  return new Promise((resolve) => {
    const videoId = state.videoId;
    const source = state.transcript.segments;
    // Belt and suspenders: callers already check hasSpeech() first, but
    // never open a port/stream for an empty transcript (the backend would
    // otherwise stream back a no-op "0/0 done" — see EMPTY_TRANSCRIPT_ERROR
    // in routes/translate_router.py for the server-side version of this).
    if (!hasSpeech(source)) {
      setMessage(NO_SPEECH_MESSAGE);
      resolve(false);
      return;
    }
    const collected = [];
    const port = chrome.runtime.connect({ name: "translate" });
    let settled = false;

    const resultEl = getPanel()?.querySelector(".tt-result");
    if (resultEl) {
      resultEl.textContent = "";
      resultEl.hidden = false;
    }
    setStatus(`Translating… 0/${source.length}`);

    const finish = (ok, { silent = false } = {}) => {
      if (settled) return;
      settled = true;
      if (activeStream === stream) activeStream = null;
      try {
        port.disconnect();
      } catch {
        // already gone
      }
      if (!silent && state.videoId === videoId) {
        setBusy(false);
        setStatus("");
      }
      resolve(ok);
    };
    const stream = { cancel: () => finish(false, { silent: true }) };
    activeStream = stream;

    const showingThisStream = () =>
      state.videoId === videoId && state.view === "transcript" && state.lang === lang;

    port.onMessage.addListener((msg) => {
      if (state.videoId !== videoId) {
        finish(false, { silent: true });
        return;
      }
      if (msg.type === "chunk") {
        const seg = { timestamp: source[collected.length]?.timestamp || "", text: msg.text };
        collected.push(seg);
        setStatus(`Translating… ${collected.length}/${source.length}`);
        if (showingThisStream()) {
          const el = getPanel()?.querySelector(".tt-result");
          if (el) {
            el.append(segmentRow(seg));
            el.hidden = false;
          }
        }
      } else if (msg.type === "done") {
        state.translations[lang] = { segments: collected };
        finish(true);
        renderState();
      } else if (msg.type === "error") {
        finish(false);
        // Fall back to the original transcript so the panel isn't left empty.
        state.lang = "";
        const sel = getPanel()?.querySelector('[data-tt="lang"]');
        if (sel) sel.value = "";
        renderState();
        if (msg.error_code === "auth") {
          setMessage("Sign in to TubeText to use translation.", "Sign in ↗", TUBETEXT_URL);
        } else if (msg.error_code === "premium") {
          setMessage("Translation is a TubeText Premium feature.", "Upgrade ↗", TUBETEXT_URL);
        } else {
          setMessage(msg.error || "Translation failed. Please try again.");
        }
      }
    });

    // Fires if the service worker dies mid-stream; not when we disconnect.
    port.onDisconnect.addListener(() => {
      if (settled) return;
      finish(false);
      if (state.videoId === videoId) {
        state.lang = "";
        const sel = getPanel()?.querySelector('[data-tt="lang"]');
        if (sel) sel.value = "";
        renderState();
        setMessage("Translation was interrupted. Please try again.");
      }
    });

    port.postMessage({ segments: source, language: lang });
  });
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
  if (state.view === "transcript") {
    const segments = currentSegments();
    if (segments) {
      text = segments.map((s) => (s.timestamp ? `${s.timestamp} ${s.text}` : s.text)).join("\n");
    }
  } else if (state.view === "summary" && state.transcript) {
    text = state.summaries[effectiveSummaryLang()] || "";
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
    abortActiveStream();
    removePanel();
    state.videoId = null;
    return;
  }
  if (videoId !== state.videoId) {
    abortActiveStream();
    state.videoId = videoId;
    state.transcript = null;
    state.translations = {};
    state.summaries = {};
    state.view = null;
    state.busy = false;
    // state.lang survives navigation — it's a user preference, caches aren't.
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
