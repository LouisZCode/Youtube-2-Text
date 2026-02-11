#  uvicorn main:app --reload
# cd frontend   npm run dev

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import all_routes

app = FastAPI()
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

