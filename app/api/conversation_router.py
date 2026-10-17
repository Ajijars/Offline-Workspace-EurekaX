"""
Conversation History Router — persistent chat history API.

Endpoints:
    GET    /api/conversations           — List conversations for current user
    POST   /api/conversations           — Create a new conversation
    GET    /api/conversations/{id}      — Get conversation with messages
    PUT    /api/conversations/{id}      — Update conversation title
    DELETE /api/conversations/{id}      — Delete conversation
    POST   /api/conversations/{id}/msg  — Add a message
    GET    /api/conversations/stats     — Get conversation statistics
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.services.conversation_service import conversation_service

logger = logging.getLogger(__name__)

conversation_router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


# ── Schemas ──

class CreateConversationRequest(BaseModel):
    title: str = Field(default="New Conversation", max_length=500)
    mode: str = Field(default="chat", pattern="^(chat|rag|agent)$")
    model: Optional[str] = None


class UpdateConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)


class AddMessageRequest(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1)
    mode: Optional[str] = None
    model: Optional[str] = None
    metadata: Optional[dict] = None


# ── Endpoints ──

@conversation_router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get conversation stats for the current user."""
    return await conversation_service.get_stats(db, user.id)


@conversation_router.get("")
async def list_conversations(
    include_archived: bool = False,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List conversations for the current user, newest first."""
    convos = await conversation_service.list_for_user(
        db, user.id, limit=limit, include_archived=include_archived
    )
    return {"conversations": convos, "count": len(convos)}


@conversation_router.post("", status_code=201)
async def create_conversation(
    body: CreateConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation."""
    conv = await conversation_service.create(
        db, user_id=user.id, title=body.title, mode=body.mode, model=body.model
    )
    return conv


@conversation_router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a conversation with all its messages."""
    conv = await conversation_service.get(db, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != user.id and user.role != "admin":
        raise HTTPException(403, "Not your conversation")

    messages = await conversation_service.get_messages(db, conversation_id)
    return {**conv, "messages": messages}


@conversation_router.put("/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    body: UpdateConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update conversation title."""
    conv = await conversation_service.get(db, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != user.id:
        raise HTTPException(403, "Not your conversation")

    updated = await conversation_service.update_title(db, conversation_id, body.title)
    return updated


@conversation_router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all messages."""
    conv = await conversation_service.get(db, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != user.id and user.role != "admin":
        raise HTTPException(403, "Not your conversation")

    await conversation_service.delete(db, conversation_id)
    return {"deleted": True}


@conversation_router.post("/{conversation_id}/messages", status_code=201)
async def add_message(
    conversation_id: str,
    body: AddMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a message to a conversation."""
    conv = await conversation_service.get(db, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["user_id"] != user.id:
        raise HTTPException(403, "Not your conversation")

    msg = await conversation_service.add_message(
        db,
        conversation_id=conversation_id,
        role=body.role,
        content=body.content,
        mode=body.mode,
        model=body.model,
        metadata=body.metadata,
    )
    return msg
