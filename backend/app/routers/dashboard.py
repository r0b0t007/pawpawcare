from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..dependencies import get_current_user
from ..models import Pet, Vaccination, Activity, User
from ..schemas import DashboardOut, PetOut, VaccinationOut, ActivityOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pets_result = await db.execute(select(Pet).where(Pet.owner_id == current_user.id))
    pets = pets_result.scalars().all()
    pet_ids = [p.id for p in pets]

    today = date.today()
    thirty_days = today + timedelta(days=30)

    upcoming_vax = []
    overdue_count = 0
    upcoming_count = 0
    recent_activities = []

    if pet_ids:
        vax_result = await db.execute(
            select(Vaccination).where(
                Vaccination.pet_id.in_(pet_ids),
                Vaccination.status != "completed",
            ).order_by(Vaccination.due_date)
        )
        vaccinations = vax_result.scalars().all()

        for vax in vaccinations:
            if vax.due_date < today:
                vax.status = "overdue"
                overdue_count += 1
            elif vax.due_date <= thirty_days:
                upcoming_count += 1
            if vax.due_date <= thirty_days:
                upcoming_vax.append(vax)

        act_result = await db.execute(
            select(Activity).where(Activity.pet_id.in_(pet_ids))
            .order_by(Activity.created_at.desc())
            .limit(10)
        )
        recent_activities = act_result.scalars().all()

    return DashboardOut(
        pets=[PetOut.model_validate(p) for p in pets],
        upcoming_vaccinations=[VaccinationOut.model_validate(v) for v in upcoming_vax],
        recent_activities=[ActivityOut.model_validate(a) for a in recent_activities],
        total_pets=len(pets),
        overdue_vaccinations=overdue_count,
        upcoming_vaccinations_count=upcoming_count,
    )
