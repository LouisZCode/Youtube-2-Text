# TubeText

Get transcripts, summaries, and translations from any YouTube video.

Use it and test it in real time at  www.tubetext.app

<!-- Add a screenshot or GIF here -->
<!-- ![TubeText Screenshot](docs/screenshot.png) -->

## Features

- **Transcription** — Extract captions from any YouTube video
- **Premium Transcription** — Audio-based transcription via Deepgram when captions aren't available
- **AI Summary** — Get key takeaways powered by OpenAI GPT-4 mini
- **AI Translation** — Translate transcripts to 20+ languages via Cerebras (streaming)
- **PDF Export** — Download formatted transcripts as PDF
- **Auth & Billing** — Google OAuth + Stripe subscriptions (free tier included)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Backend | FastAPI, Python 3.12, SQLAlchemy (async), Alembic |
| Database | PostgreSQL (asyncpg) |
| Auth | Google OAuth + JWT (HTTP-only cookies) |
| AI | OpenAI, Cerebras, Deepgram |
| Payments | Stripe |
| Email | Resend |
| Deployment | Railway (Docker) |

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL
- ffmpeg

### Backend

```bash
cp .env.example .env  # fill in your keys
pip install .
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local  # set NEXT_PUBLIC_API_URL
npm install
npm run dev
```

### Docker (backend only)

```bash
docker build -t tubetext .
docker run -p 8000:8000 --env-file .env tubetext
```

## Environment Variables

See [`.env.example`](.env.example) for all required backend variables and [`frontend/.env.local.example`](frontend/.env.local.example) for frontend config.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation on endpoints, database schema, user tiers, auth flows, and design decisions.

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
