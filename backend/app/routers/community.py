from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from ..database import get_db
from ..dependencies import get_current_user
from ..models import Post, Group, User
from ..schemas import PostCreate, PostOut, GroupOut

router = APIRouter(prefix="/community", tags=["community"])


def _serialize_post(post: Post, current_user_id: str) -> PostOut:
    pawed_ids = {u.id for u in post.pawed_by}
    return PostOut(
        id=post.id,
        author_id=post.author_id,
        content=post.content,
        image_url=post.image_url,
        group_id=post.group_id,
        paw_count=len(pawed_ids),
        pawed_by_me=current_user_id in pawed_ids,
        author_name=post.author.name if post.author else "",
        author_avatar=post.author.avatar_url if post.author else None,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _serialize_group(group: Group, current_user_id: str) -> GroupOut:
    member_ids = {u.id for u in group.members}
    return GroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        location=group.location,
        icon=group.icon,
        member_count=len(member_ids),
        is_member=current_user_id in member_ids,
        created_at=group.created_at,
    )


# ── Posts ─────────────────────────────────────────────────────────────────────

@router.get("/posts", response_model=list[PostOut])
async def list_posts(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.pawed_by), selectinload(Post.author))
        .order_by(Post.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    posts = result.scalars().all()
    return [_serialize_post(p, current_user.id) for p in posts]


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    body: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = Post(**body.model_dump(), author_id=current_user.id)
    db.add(post)
    await db.flush()
    await db.refresh(post, ["pawed_by", "author"])
    return _serialize_post(post, current_user.id)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Post).where(Post.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your post")
    await db.delete(post)


@router.post("/posts/{post_id}/paw", response_model=PostOut)
async def toggle_paw(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Post)
        .options(selectinload(Post.pawed_by), selectinload(Post.author))
        .where(Post.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    pawed_ids = {u.id for u in post.pawed_by}
    if current_user.id in pawed_ids:
        post.pawed_by = [u for u in post.pawed_by if u.id != current_user.id]
    else:
        post.pawed_by.append(current_user)

    db.add(post)
    await db.flush()
    return _serialize_post(post, current_user.id)


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[GroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Group).options(selectinload(Group.members))
    )
    groups = result.scalars().all()
    return [_serialize_group(g, current_user.id) for g in groups]


@router.post("/groups/{group_id}/join", response_model=GroupOut)
async def toggle_group_membership(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Group).options(selectinload(Group.members)).where(Group.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    member_ids = {u.id for u in group.members}
    if current_user.id in member_ids:
        group.members = [u for u in group.members if u.id != current_user.id]
    else:
        group.members.append(current_user)

    db.add(group)
    await db.flush()
    return _serialize_group(group, current_user.id)
