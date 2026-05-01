from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..dependencies import get_current_user
from ..models import Pet, Vaccination, Activity, FavoriteFood, User
from ..schemas import (
    PetCreate, PetUpdate, PetOut,
    VaccinationCreate, VaccinationComplete, VaccinationOut,
    ActivityCreate, ActivityOut,
    FavoriteFoodCreate, FavoriteFoodOut,
)

router = APIRouter(prefix="/pets", tags=["pets"])


# ── helpers ──────────────────────────────────────────────────────────────────

async def _get_pet_or_404(pet_id: str, owner_id: str, db: AsyncSession) -> Pet:
    result = await db.execute(select(Pet).where(Pet.id == pet_id, Pet.owner_id == owner_id))
    pet = result.scalar_one_or_none()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet not found")
    return pet


async def _get_vaccination_or_404(vax_id: str, pet_id: str, db: AsyncSession) -> Vaccination:
    result = await db.execute(select(Vaccination).where(Vaccination.id == vax_id, Vaccination.pet_id == pet_id))
    vax = result.scalar_one_or_none()
    if not vax:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaccination not found")
    return vax


# ── pets CRUD ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PetOut])
async def list_pets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Pet).where(Pet.owner_id == current_user.id))
    return result.scalars().all()


@router.post("", response_model=PetOut, status_code=status.HTTP_201_CREATED)
async def create_pet(
    body: PetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = Pet(**body.model_dump(), owner_id=current_user.id)
    db.add(pet)
    await db.flush()
    return pet


@router.get("/{pet_id}", response_model=PetOut)
async def get_pet(
    pet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_pet_or_404(pet_id, current_user.id, db)


@router.patch("/{pet_id}", response_model=PetOut)
async def update_pet(
    pet_id: str,
    body: PetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = await _get_pet_or_404(pet_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pet, field, value)
    db.add(pet)
    return pet


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pet(
    pet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pet = await _get_pet_or_404(pet_id, current_user.id, db)
    await db.delete(pet)


# ── vaccinations ──────────────────────────────────────────────────────────────

@router.get("/{pet_id}/vaccinations", response_model=list[VaccinationOut])
async def list_vaccinations(
    pet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    result = await db.execute(select(Vaccination).where(Vaccination.pet_id == pet_id))
    vaccinations = result.scalars().all()
    today = date.today()
    for vax in vaccinations:
        if vax.status == "upcoming" and vax.due_date < today:
            vax.status = "overdue"
    return vaccinations


@router.post("/{pet_id}/vaccinations", response_model=VaccinationOut, status_code=status.HTTP_201_CREATED)
async def add_vaccination(
    pet_id: str,
    body: VaccinationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    vax = Vaccination(**body.model_dump(), pet_id=pet_id)
    db.add(vax)
    await db.flush()
    return vax


@router.patch("/{pet_id}/vaccinations/{vax_id}/complete", response_model=VaccinationOut)
async def complete_vaccination(
    pet_id: str,
    vax_id: str,
    body: VaccinationComplete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    vax = await _get_vaccination_or_404(vax_id, pet_id, db)
    vax.status = "completed"
    vax.administered_date = body.administered_date or date.today()
    if body.notes:
        vax.notes = body.notes
    db.add(vax)
    return vax


@router.delete("/{pet_id}/vaccinations/{vax_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccination(
    pet_id: str,
    vax_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    vax = await _get_vaccination_or_404(vax_id, pet_id, db)
    await db.delete(vax)


# ── activities ────────────────────────────────────────────────────────────────

@router.get("/{pet_id}/activities", response_model=list[ActivityOut])
async def list_activities(
    pet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    result = await db.execute(select(Activity).where(Activity.pet_id == pet_id))
    return result.scalars().all()


@router.post("/{pet_id}/activities", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def add_activity(
    pet_id: str,
    body: ActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    activity = Activity(**body.model_dump(), pet_id=pet_id)
    db.add(activity)
    await db.flush()
    return activity


@router.delete("/{pet_id}/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    pet_id: str,
    activity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    result = await db.execute(select(Activity).where(Activity.id == activity_id, Activity.pet_id == pet_id))
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    await db.delete(activity)


# ── favorite foods ────────────────────────────────────────────────────────────

@router.get("/{pet_id}/foods", response_model=list[FavoriteFoodOut])
async def list_foods(
    pet_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    result = await db.execute(select(FavoriteFood).where(FavoriteFood.pet_id == pet_id))
    return result.scalars().all()


@router.post("/{pet_id}/foods", response_model=FavoriteFoodOut, status_code=status.HTTP_201_CREATED)
async def add_food(
    pet_id: str,
    body: FavoriteFoodCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    food = FavoriteFood(**body.model_dump(), pet_id=pet_id)
    db.add(food)
    await db.flush()
    return food


@router.delete("/{pet_id}/foods/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_food(
    pet_id: str,
    food_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pet_or_404(pet_id, current_user.id, db)
    result = await db.execute(select(FavoriteFood).where(FavoriteFood.id == food_id, FavoriteFood.pet_id == pet_id))
    food = result.scalar_one_or_none()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    await db.delete(food)
