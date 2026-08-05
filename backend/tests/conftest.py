"""Test fixtures.

Two things are swapped out for tests: the database (an in-memory SQLite that
starts empty for every test) and the predictor (a stub returning fixed
probabilities). Stubbing the predictor is what lets the whole API be tested
without TensorFlow or a trained model — the routes, storage, nutrition maths
and history logic are all exercised for real.
"""

import io
import os

# Settings refuses to build with the development secret unless debug is on, so
# a checkout with no backend/.env would otherwise fail at import time. Set both
# before anything imports app.config.
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-only-secret")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.db import Base, get_db
from app.main import app
from app.ml import predictor as predictor_module


@pytest.fixture
def db_session():
    # StaticPool keeps one connection alive, so an in-memory database is
    # visible to both the test and the request handler.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def media_root(tmp_path, monkeypatch):
    """Write uploads to a temp directory rather than the real media root."""
    target = tmp_path / "media"
    target.mkdir()
    monkeypatch.setattr(settings, "media_root", target)
    return target


class StubPredictor:
    """Stands in for the trained model.

    Returns jollof_rice at 0.92 by default; tests override `predictions` to
    exercise the low-confidence and unknown-class paths.
    """

    def __init__(self):
        self.predictions = [
            predictor_module.Prediction("jollof_rice", "Jollof Rice", 0.92),
            predictor_module.Prediction("fried_rice", "Fried Rice", 0.05),
            predictor_module.Prediction("moi_moi", "Moi Moi", 0.03),
        ]
        self.error: str | None = None

    def availability_error(self):
        return self.error

    def predict(self, image, top_k=3):
        if self.error:
            raise predictor_module.ModelUnavailableError(self.error)
        return self.predictions[:top_k]


@pytest.fixture
def stub_predictor(monkeypatch):
    stub = StubPredictor()
    # Patch the name the router imported, not just the module attribute.
    monkeypatch.setattr("app.routers.classify.predictor", stub)
    return stub


@pytest.fixture
def client(db_session, media_root):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(client):
    """A client with a registered, logged-in user's token attached."""
    response = client.post(
        "/auth/signup",
        json={
            "email": "ada@example.com",
            "password": "a-good-password",
            "name": "Ada",
        },
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture
def meal_image():
    """A small valid JPEG, as (filename, bytes, content_type)."""
    buffer = io.BytesIO()
    Image.new("RGB", (640, 480), (200, 120, 60)).save(buffer, format="JPEG")
    return ("meal.jpg", buffer.getvalue(), "image/jpeg")
