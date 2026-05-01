import uuid
from datetime import datetime, date
from sqlalchemy import (
    String, Boolean, Float, Integer, Date, DateTime, ForeignKey, Text, Table, Column
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


# Many-to-many: Post ↔ User (paws/likes)
post_paws = Table(
    "post_paws",
    Base.metadata,
    Column("post_id", String, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many: Group ↔ User (members)
group_members = Table(
    "group_members",
    Base.metadata,
    Column("group_id", String, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pets: Mapped[list["Pet"]] = relationship("Pet", back_populates="owner", cascade="all, delete-orphan")
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author", cascade="all, delete-orphan")
    pawed_posts: Mapped[list["Post"]] = relationship("Post", secondary=post_paws, back_populates="pawed_by")
    joined_groups: Mapped[list["Group"]] = relationship("Group", secondary=group_members, back_populates="members")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="dog")  # dog, cat, bird, rabbit, other
    breed: Mapped[str | None] = mapped_column(String(100), nullable=True)
    age: Mapped[float | None] = mapped_column(Float, nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_unit: Mapped[str] = mapped_column(String(5), default="kg")
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    microchipped: Mapped[bool] = mapped_column(Boolean, default=False)
    color: Mapped[str | None] = mapped_column(String(30), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activity_level: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped["User"] = relationship("User", back_populates="pets")
    vaccinations: Mapped[list["Vaccination"]] = relationship("Vaccination", back_populates="pet", cascade="all, delete-orphan")
    activities: Mapped[list["Activity"]] = relationship("Activity", back_populates="pet", cascade="all, delete-orphan")
    favorite_foods: Mapped[list["FavoriteFood"]] = relationship("FavoriteFood", back_populates="pet", cascade="all, delete-orphan")


class Vaccination(Base):
    __tablename__ = "vaccinations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    pet_id: Mapped[str] = mapped_column(String, ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="upcoming")  # upcoming, completed, overdue
    administered_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pet: Mapped["Pet"] = relationship("Pet", back_populates="vaccinations")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    pet_id: Mapped[str] = mapped_column(String, ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    duration: Mapped[str | None] = mapped_column(String(50), nullable=True)
    time_of_day: Mapped[str | None] = mapped_column(String(20), nullable=True)  # morning, afternoon, evening
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pet: Mapped["Pet"] = relationship("Pet", back_populates="activities")


class FavoriteFood(Base):
    __tablename__ = "favorite_foods"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    pet_id: Mapped[str] = mapped_column(String, ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    pet: Mapped["Pet"] = relationship("Pet", back_populates="favorite_foods")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    author_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    group_id: Mapped[str | None] = mapped_column(String, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    author: Mapped["User"] = relationship("User", back_populates="posts")
    pawed_by: Mapped[list["User"]] = relationship("User", secondary=post_paws, back_populates="pawed_posts")
    group: Mapped["Group | None"] = relationship("Group", back_populates="posts")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(150), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[list["User"]] = relationship("User", secondary=group_members, back_populates="joined_groups")
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="group")
