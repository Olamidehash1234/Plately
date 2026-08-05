"""Application settings, read from the environment or a .env file."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/
BASE_DIR = Path(__file__).resolve().parent.parent
# repository root, which also holds the ml/ training pipeline
PROJECT_ROOT = BASE_DIR.parent

# Refusing to boot with this value outside debug is the whole point of it being
# a recognisable constant rather than a random string.
INSECURE_SECRET_KEY = "dev-only-insecure-key-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # "model_" is a protected prefix in pydantic v2; we use model_path etc.
        protected_namespaces=(),
    )

    app_name: str = "Plately API"
    # Defaults to off so that a deployment which forgets to set anything gets
    # the safe behaviour. Local development sets DEBUG=true in backend/.env.
    debug: bool = False

    # --- Security -----------------------------------------------------------
    # Override in .env for anything other than local development.
    secret_key: str = INSECURE_SECRET_KEY
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # one week

    # --- Database -----------------------------------------------------------
    # Swap for postgresql+psycopg://user:pass@host/db in production.
    database_url: str = f"sqlite:///{BASE_DIR / 'plately.db'}"

    # --- Media --------------------------------------------------------------
    media_root: Path = BASE_DIR / "media"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB
    allowed_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
    )

    # --- Model --------------------------------------------------------------
    # Produced by ml/train.py. Absent until the model has been trained.
    model_path: Path = PROJECT_ROOT / "ml" / "artifacts" / "model.keras"
    # Preferred in deployment when present: the LiteRT interpreter is a fraction
    # of TensorFlow's size and memory. Produced by ml/export_tflite.py.
    tflite_model_path: Path = PROJECT_ROOT / "ml" / "artifacts" / "model.tflite"
    class_index_path: Path = PROJECT_ROOT / "ml" / "artifacts" / "class_indices.json"
    image_size: int = 224
    # Predictions below this confidence are flagged as uncertain to the client.
    low_confidence_threshold: float = 0.55

    # --- CORS ---------------------------------------------------------------
    # In deployment set CORS_ORIGINS to the front end's origin, comma separated
    # if there is more than one:
    #     CORS_ORIGINS=https://plately.example.com,https://www.plately.example.com
    # NoDecode stops pydantic-settings trying to JSON-parse the env var before
    # the validator below gets a chance to split it.
    cors_origins: Annotated[tuple[str, ...], NoDecode] = (
        "http://localhost:5173",
        "http://localhost:5183",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5183",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        """Accept a comma-separated string, which is all an env var can carry."""
        if isinstance(value, str):
            return tuple(origin.strip() for origin in value.split(",") if origin.strip())
        return value

    @model_validator(mode="after")
    def refuse_insecure_production_secret(self) -> "Settings":
        """Fail loudly at boot rather than quietly signing tokens with a public key.

        The default secret is committed to the repository, so anyone can mint a
        valid token for any user with it. That is fine on a laptop and fatal in
        deployment, and the difference between the two is exactly `debug`.
        """
        if not self.debug and self.secret_key == INSECURE_SECRET_KEY:
            raise ValueError(
                "SECRET_KEY is still the development default. Set a real one:\n"
                '  python -c "import secrets; print(secrets.token_urlsafe(32))"\n'
                "then put it in backend/.env or the environment as SECRET_KEY."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
