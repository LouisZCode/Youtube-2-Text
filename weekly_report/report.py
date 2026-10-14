"""Weekly TubeText metrics email.

Collects three metrics and emails them via Resend:
  1. Users            — total + new this week        (Postgres `users` table)
  2. Transcriptions   — free / premium root spans    (Langfuse observations)
  3. Errors           — Langfuse ERROR observations  (grouped by message)
                        + Sentry unresolved issues   (context)

Runs weekly via .github/workflows/weekly-report.yml (Mondays 09:00 UTC).
Run locally:  python weekly_report/report.py   (with env vars set / .env loaded)

Required env vars:
  DATABASE_URL            — public (TCP) Postgres URL, see LEARNINGS.md
  LANGFUSE_HOST           — e.g. https://cloud.langfuse.com
  LANGFUSE_PUBLIC_KEY     — pk-lf-...
  LANGFUSE_SECRET_KEY     — sk-lf-...
  SENTRY_AUTH_TOKEN       — Sentry API token (read:org, project:read, event:read)
  RESEND_API_KEY          — Resend API key for sending the email
  REPORT_EMAIL_FROM       — e.g. "TubeText <reports@tubetext.app>"
  REPORT_EMAIL_TO         — e.g. luis@tubetext.app
Optional:
  SENTRY_ORG              — default: tubetext
  SENTRY_PROJECT          — default: python-fastapi
"""

import os
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

import psycopg2
import requests

# ---------------------------------------------------------------- config

DATABASE_URL = os.environ["DATABASE_URL"]
LANGFUSE_HOST = os.environ["LANGFUSE_HOST"].rstrip("/")
LANGFUSE_AUTH = (os.environ["LANGFUSE_PUBLIC_KEY"], os.environ["LANGFUSE_SECRET_KEY"])
SENTRY_AUTH_TOKEN = os.environ["SENTRY_AUTH_TOKEN"]
SENTRY_ORG = os.environ.get("SENTRY_ORG", "tubetext")
SENTRY_PROJECT = os.environ.get("SENTRY_PROJECT", "python-fastapi")
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
REPORT_EMAIL_FROM = os.environ["REPORT_EMAIL_FROM"]
REPORT_EMAIL_TO = os.environ["REPORT_EMAIL_TO"]

NOW = datetime.now(timezone.utc)
WEEK_AGO = NOW - timedelta(days=7)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- postgres

def user_metrics() -> dict:
    """Total users and new signups in the last 7 days."""
    # Same rewrite as database/connection.py — psycopg2 needs the plain driver.
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    with psycopg2.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM users")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT count(*) FROM users WHERE created_at >= %s", (WEEK_AGO,)
            )
            new_this_week = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM users WHERE tier = 'premium'")
            premium = cur.fetchone()[0]
    return {"total": total, "new": new_this_week, "premium": premium}


# ---------------------------------------------------------------- langfuse

def langfuse_get(path: str, params: dict) -> list:
    """Paginated GET against the Langfuse public API; returns all `data` rows."""
    rows, params = [], dict(params)
    while True:
        for attempt in range(5):  # cloud Langfuse rate-limits; back off and retry
            resp = requests.get(
                f"{LANGFUSE_HOST}{path}", params=params, auth=LANGFUSE_AUTH, timeout=60
            )
            if resp.status_code != 429:
                break
            time.sleep(10 * (attempt + 1))
        resp.raise_for_status()
        body = resp.json()
        rows.extend(body["data"])
        cursor = (body.get("meta") or {}).get("page") and body["meta"].get("cursor")
        if not cursor:
            break
        params["cursor"] = cursor
    return rows


def transcription_metrics() -> dict:
    """Count root transcription spans per tier in the last 7 days."""
    out = {}
    for tier in ("free", "premium"):
        rows = langfuse_get(
            "/api/public/observations",
            {"name": f"video-transcript-{tier}", "fromStartTime": iso(WEEK_AGO), "limit": 100},
        )
        out[tier] = len(rows)
    return out


def error_metrics() -> dict:
    """Failed requests in the last 7 days, grouped by message.

    Deduped by trace ID: a failing premium transcription logs ERROR on both
    the root span and the deepgram-transcribe child — one request, one error.
    The root observation's message wins when present.
    """
    rows = langfuse_get(
        "/api/public/observations",
        {
            "level": "ERROR",
            "fromStartTime": iso(WEEK_AGO),
            "fields": "core,basic",
            "limit": 100,
        },
    )
    def rank(r: dict) -> int:
        # Prefer the request-level span name ("video-transcript-*") over
        # child spans like "deepgram-transcribe" for the shown message.
        return 0 if r.get("name", "").startswith("video-transcript") else 1

    by_trace: dict = {}
    for r in rows:
        kept = by_trace.get(r["traceId"])
        if kept is None or rank(r) < rank(kept):
            by_trace[r["traceId"]] = r
    counts = Counter(
        (r.get("name", "?"), (r.get("statusMessage") or "unknown")[:120])
        for r in by_trace.values()
    )
    return {"total": len(by_trace), "grouped": counts.most_common(5)}


# ---------------------------------------------------------------- sentry

def sentry_issues() -> list:
    """Unresolved Sentry issues active in the last 7 days (for context lines)."""
    resp = requests.get(
        f"https://sentry.io/api/0/organizations/{SENTRY_ORG}/issues/",
        params={"query": "is:unresolved", "statsPeriod": "7d", "project": "-1"},
        headers={"Authorization": f"Bearer {SENTRY_AUTH_TOKEN}"},
        timeout=60,
    )
    resp.raise_for_status()
    return [
        {
            "short_id": i["shortId"],
            "title": i["title"][:120],
            "events": i.get("count"),
            "users": i.get("userCount"),
        }
        for i in resp.json()
    ]


# ---------------------------------------------------------------- email

def build_email(users: dict, transcriptions: dict, errors: dict, issues: list) -> str:
    error_lines = (
        "<ul>"
        + "".join(
            f"<li><b>{n}× {name}</b> — {msg}</li>" for (name, msg), n in errors["grouped"]
        )
        + "</ul>"
        if errors["grouped"]
        else "<p>🎉 No errors this week.</p>"
    )
    sentry_lines = (
        "<ul>"
        + "".join(
            f"<li><code>{i['short_id']}</code> — {i['title']} "
            f"({i['events']} events, {i['users']} users)</li>"
            for i in issues[:5]
        )
        + "</ul>"
        if issues
        else "<p>🎉 No unresolved Sentry issues active this week.</p>"
    )
    return f"""
    <h2>TubeText weekly ({WEEK_AGO:%b %d} – {NOW:%b %d, %Y})</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td>👥 Users</td><td><b>{users['total']}</b> total
          (+{users['new']} this week, {users['premium']} premium)</td></tr>
      <tr><td>🎬 Transcriptions</td><td><b>{transcriptions['free'] + transcriptions['premium']}</b>
          ({transcriptions['free']} free / {transcriptions['premium']} premium)</td></tr>
      <tr><td>⚠️ Errors</td><td><b>{errors['total']}</b></td></tr>
    </table>
    <h3>Errors (Langfuse)</h3>{error_lines}
    <h3>Open Sentry issues (active last 7d)</h3>{sentry_lines}
    """


def send_email(html: str) -> None:
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json={
            "from": REPORT_EMAIL_FROM,
            "to": [REPORT_EMAIL_TO],
            "subject": f"TubeText weekly — {NOW:%b %d}",
            "html": html,
        },
        timeout=60,
    )
    resp.raise_for_status()


# ---------------------------------------------------------------- main

def main() -> None:
    users = user_metrics()
    transcriptions = transcription_metrics()
    errors = error_metrics()
    try:
        issues = sentry_issues()
    except Exception as e:  # Sentry is context-only; don't fail the email over it
        print(f"Sentry fetch failed ({e}), continuing without it", file=sys.stderr)
        issues = []

    html = build_email(users, transcriptions, errors, issues)
    print(html)
    send_email(html)
    print(f"Email sent to {REPORT_EMAIL_TO}")


if __name__ == "__main__":
    main()
