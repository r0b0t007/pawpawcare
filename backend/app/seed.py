"""Seed the database with default groups. Run once on startup."""
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models import Group

DEFAULT_GROUPS = [
    {
        "name": "Dog Lovers",
        "description": "All things dogs — training tips, breed advice, and cute photos.",
        "location": "Global",
        "icon": "dog",
    },
    {
        "name": "Cat Parents",
        "description": "Share your feline adventures and get expert advice.",
        "location": "Global",
        "icon": "cat",
    },
    {
        "name": "Pet Health Tips",
        "description": "Evidence-based nutrition, vet advice, and wellness routines.",
        "location": "Global",
        "icon": "heart-pulse",
    },
    {
        "name": "Puppy Training",
        "description": "Positive-reinforcement techniques from beginner to advanced.",
        "location": "Global",
        "icon": "school",
    },
    {
        "name": "Exotic Pets",
        "description": "Rabbits, birds, reptiles — support for the unique companions.",
        "location": "Global",
        "icon": "rabbit",
    },
]


async def seed_groups(db: AsyncSession) -> None:
    result = await db.execute(select(Group))
    if result.scalars().first():
        return

    for g in DEFAULT_GROUPS:
        db.add(Group(**g))
    await db.commit()
