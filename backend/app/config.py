from pathlib import Path

from pydantic_settings import BaseSettings

# Anchored to the backend/ directory so the DB path is stable regardless of
# the process's working directory when uvicorn is launched.
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{BACKEND_DIR / 'noah.db'}"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    admin_passkey: str = "admincog@#$"

    class Config:
        env_file = ".env"


settings = Settings()
