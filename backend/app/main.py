from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import auth, papers, results

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cognify NOAH API")

app.include_router(auth.router)
app.include_router(papers.router)
app.include_router(results.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent
if FRONTEND_DIR.joinpath("index.html").exists():
    # Serves the frontend directly when running as a normal process (local dev,
    # Render). On Vercel this directory isn't present in the function bundle —
    # Vercel serves those static files itself, so mounting here is skipped.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
