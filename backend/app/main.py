from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_tables, AsyncSessionLocal
from .seed import seed_groups
from .routers import auth, users, pets, community, dashboard

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    async with AsyncSessionLocal() as session:
        await seed_groups(session)
    yield


app = FastAPI(
    title="PawPawCare API",
    version="1.0.0",
    description="Backend API for the PawPawCare pet health management app",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(pets.router)
app.include_router(community.router)
app.include_router(dashboard.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
