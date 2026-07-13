# TubeText Chrome Extension

Injects a TubeText panel on YouTube watch pages: full transcript, AI
summary, and translation (English/Spanish/Portuguese/German/French via the
language dropdown) without leaving the video, powered by the production API
at `api.tubetext.app`.

## Architecture

- **`content.js`** — DOM only. Injects the panel into the watch-page sidebar
  (`#secondary-inner`, falling back to `#below` in theater/narrow layouts),
  re-boots on YouTube's `yt-navigate-finish` SPA navigation event, renders
  results. Transcript/summary text is always inserted with `textContent`.
- **`background.js`** — all network calls. Content-script fetches would run
  under youtube.com's origin and drop the `SameSite=Lax` cookies on
  api.tubetext.app (auth JWT + anonymous usage counter). Extension-context
  fetches to hosts in `host_permissions` are treated as same-site and are
  CORS-exempt, so **no backend changes are needed**.
- Auth: user signs in at tubetext.app (Google OAuth); the `tubetext_token`
  cookie is then automatically available to the extension's API calls.
  Tier limits are enforced server-side per route — the extension can't
  bypass them.

## Endpoints used

| Call | Endpoint | Notes |
|---|---|---|
| Auth state | `GET /auth/me` | 401 → signed out |
| Language detect | `GET /video/languages` | best-effort, falls back to `en` |
| Transcript | `POST /video/` | anonymous (5), free (20/mo), premium |
| Summary | `POST /video/summary` | premium-only (401/403 → sign-in/upgrade CTA); `language` in the body controls the summary's output language |
| Translation | `POST /video/translate` | premium-only SSE stream, one event per segment; consumed in `background.js` over a `chrome.runtime.connect` port so the panel renders progressively |

## Load for development

1. Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Open any YouTube video — the panel appears at the top of the sidebar

After editing files, click the reload icon on the extension card, then
refresh the YouTube tab.

## Publish to Chrome Web Store

1. Zip the folder contents: `cd extension && zip -r tubetext-extension.zip . -x '*.DS_Store'`
2. Upload at https://chrome.google.com/webstore/devconsole ($5 one-time
   registration). Review typically takes 1–3 days.
3. Bump `version` in `manifest.json` for every new upload.
