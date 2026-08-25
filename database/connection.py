from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import os
from dotenv import load_dotenv
load_dotenv()

database_url = os.getenv("DATABASE_URL")
if database_url and database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Railway's network reaps idle connections and Postgres restarts on patching,
# so pooled connections go stale. Sentry: PYTHON-FASTAPI-F.
engine = create_async_engine(
    database_url,
    pool_pre_ping=True,
    pool_recycle=300,
)
SessionLocal = async_sessionmaker(bind=engine, autoflush=False, autocommit=False)

async def get_db():
    async with SessionLocal() as db:
        yield db
