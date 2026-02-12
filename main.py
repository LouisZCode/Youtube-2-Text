#  uvicorn main:app --reload
# cd frontend   npm run dev

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

import os
from dotenv import load_dotenv
load_dotenv()

from routes import all_routes

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=os.getenv("JWT_SECRET"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
for route in all_routes:
    app.include_router(route)

@app.get("/health/")
def check_health():
    return {"status" : "ok"}

