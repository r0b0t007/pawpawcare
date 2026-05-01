from datetime import datetime, date
from typing import Annotated
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ── Auth ──────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── User ──────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    avatar_url: str | None = None
    bio: str | None = None
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    bio: str | None = None
    avatar_url: str | None = None


# ── Pet ───────────────────────────────────────────────────────────────────────

class PetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = "dog"
    breed: str | None = None
    age: float | None = None
    birthday: date | None = None
    weight: float | None = None
    weight_unit: str = "kg"
    gender: str | None = None
    microchipped: bool = False
    color: str | None = None
    avatar_url: str | None = None
    heart_rate: int | None = None
    activity_level: str | None = None


class PetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: str | None = None
    breed: str | None = None
    age: float | None = None
    birthday: date | None = None
    weight: float | None = None
    weight_unit: str | None = None
    gender: str | None = None
    microchipped: bool | None = None
    color: str | None = None
    avatar_url: str | None = None
    heart_rate: int | None = None
    activity_level: str | None = None


class PetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    name: str
    type: str
    breed: str | None = None
    age: float | None = None
    birthday: date | None = None
    weight: float | None = None
    weight_unit: str
    gender: str | None = None
    microchipped: bool
    color: str | None = None
    avatar_url: str | None = None
    heart_rate: int | None = None
    activity_level: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Vaccination ───────────────────────────────────────────────────────────────

class VaccinationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    due_date: date
    notes: str | None = None


class VaccinationComplete(BaseModel):
    administered_date: date | None = None
    notes: str | None = None


class VaccinationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pet_id: str
    name: str
    due_date: date
    status: str
    administered_date: date | None = None
    notes: str | None = None
    created_at: datetime


# ── Activity ──────────────────────────────────────────────────────────────────

class ActivityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    duration: str | None = None
    time_of_day: str | None = None
    icon: str | None = None


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pet_id: str
    name: str
    duration: str | None = None
    time_of_day: str | None = None
    icon: str | None = None
    created_at: datetime


# ── FavoriteFood ──────────────────────────────────────────────────────────────

class FavoriteFoodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class FavoriteFoodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pet_id: str
    name: str
    created_at: datetime


# ── Community Posts ───────────────────────────────────────────────────────────

class PostCreate(BaseModel):
    content: str = Field(min_length=1)
    image_url: str | None = None
    group_id: str | None = None


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    author_id: str
    content: str
    image_url: str | None = None
    group_id: str | None = None
    paw_count: int = 0
    pawed_by_me: bool = False
    author_name: str = ""
    author_avatar: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Groups ────────────────────────────────────────────────────────────────────

class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    location: str | None = None
    icon: str | None = None
    member_count: int = 0
    is_member: bool = False
    created_at: datetime


# ── Dashboard summary ─────────────────────────────────────────────────────────

class DashboardOut(BaseModel):
    pets: list[PetOut]
    upcoming_vaccinations: list[VaccinationOut]
    recent_activities: list[ActivityOut]
    total_pets: int
    overdue_vaccinations: int
    upcoming_vaccinations_count: int
