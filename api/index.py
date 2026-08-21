import sys
from pathlib import Path

# Vercel deploys the whole repo alongside this function, but only puts this
# file's own directory on sys.path. The backend app uses "app.xxx" imports
# (e.g. "from app.database import ..."), which only resolve if backend/ itself
# — not backend/app/ — is on the path, matching how it's run locally/on Render
# (uvicorn app.main:app --app-dir backend).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402
