from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .routes import assets, assignments, auth, masters, organization, reports


DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]


def cors_origins() -> list[str]:
    configured = os.environ.get("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return DEFAULT_CORS_ORIGINS + origins


init_db()

app = FastAPI(title="Inventory System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(masters.router, prefix="/api")
app.include_router(organization.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
