#  uvicorn main:app --reload
# cd frontend   npm run dev

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

import os
import sentry_sdk
from dotenv import load_dotenv
load_dotenv()

sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=os.getenv("RAILWAY_ENVIRONMENT_NAME", "development"),
        release=os.getenv("RAILWAY_GIT_COMMIT_SHA", "local")[:7],
        send_default_pii=True,
        traces_sample_rate=0.0,
    )

from routes import all_routes

app = FastAPI()
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
app.add_middleware(SessionMiddleware, secret_key=os.getenv("JWT_SECRET"))
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
for route in all_routes:
    app.include_router(route)

@app.get("/health/")
def check_health():
    return {"status" : "ok"}

@app.get("/sentry-test/")
def sentry_test():
    1 / 0

