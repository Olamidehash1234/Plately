"""FastAPI application entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import Base, engine
from app.ml.predictor import predictor
from app.routers import auth, classify, meals

logging.basicConfig(level=logging.INFO if settings.debug else logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import for the side effect of registering the models on Base.metadata.
    from app import models  # noqa: F401

    settings.media_root.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)

    reason = predictor.availability_error()
    if reason:
        logger.warning("Classification is unavailable: %s", reason)
    else:
        logger.info("Classification is available.")

    yield


app = FastAPI(
    title=settings.app_name,
    description="Food classification and dietary monitoring API.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(classify.router)
app.include_router(meals.router)

# Meal photos are served statically under unguessable UUID filenames rather
# than behind the bearer token, because <img src> cannot send an Authorization
# header. A uuid4 name is 122 bits of entropy, so the paths are not walkable,
# but they are technically reachable by anyone holding the URL. If this system
# ever handles clinical data, swap this for signed, expiring URLs.
settings.media_root.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media", StaticFiles(directory=settings.media_root), name="media"
)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}
