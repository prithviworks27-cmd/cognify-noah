from pathlib import Path

from pydantic_settings import BaseSettings

# Anchored to the backend/ directory so both the DB path and the .env file
# are found correctly regardless of the process's working directory when
# uvicorn is launched (it's launched with --app-dir, which does NOT chdir).
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    database_url: str = f"sqlite:///{BACKEND_DIR / 'noah.db'}"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    # No defaults for secrets — these must come from backend/.env (gitignored).
    # Missing either one fails the app at startup instead of silently running
    # with a weak, publicly-visible fallback.
    jwt_secret: str
    admin_passkey: str

    # Optional: if unset, grading silently falls back to the keyword-based
    # grader instead of failing the app at startup.
    gemini_api_key: str = ""

    class Config:
        env_file = str(BACKEND_DIR / ".env")


settings = Settings()
