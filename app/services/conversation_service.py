"""
Conversation Service — persistent chat history.

Stores conversations and messages in SQLite so users can resume
previous chats, search history, and maintain context across sessions.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import Base

logger = logging.getLogger(__name__)


# ── Database Models ──

class Conversation(Base):
    """A chat conversation (thread)."""
    __tablename__ = "conversations"

    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(String(32), nullable=False, index=True)
    title = Column(String(500), nullable=False, default="New Conversation")
    mode = Column(String(20), nullable=False, default="chat")  # chat, rag, agent
    model = Column(String(100), nullable=True)
    message_count = Column(Integer, default=0)
    is_archived = Column(Integer, default=0)  # 0=active, 1=archived
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class Message(Base):
    """A single message within a conversation."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(32), ForeignKey("conversations.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    mode = Column(String(20), nullable=True)  # chat, rag, agent
    model = Column(String(100), nullable=True)
    metadata_json = Column(Text, nullable=True)  # JSON: citations, agent_steps, etc.
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ConversationService:
    """CRUD operations for conversations and messages."""

    # ── Conversations ──

    async def create(
        self, db: AsyncSession, *, user_id: str, title: str = "New Conversation",
        mode: str = "chat", model: Optional[str] = None
    ) -> dict:
        """Create a new conversation."""
        conv = Conversation(
            user_id=user_id, title=title, mode=mode, model=model
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        logger.info(f"[Conversation] Created: {conv.id} for user {user_id}")
        return self._conv_to_dict(conv)

    async def list_for_user(
        self, db: AsyncSession, user_id: str, *, limit: int = 50,
        include_archived: bool = False
    ) -> list[dict]:
        """List conversations for a user, most recent first."""
        q = select(Conversation).where(Conversation.user_id == user_id)
        if not include_archived:
            q = q.where(Conversation.is_archived == 0)
        q = q.order_by(desc(Conversation.updated_at)).limit(limit)
        result = await db.execute(q)
        return [self._conv_to_dict(c) for c in result.scalars().all()]

    async def get(self, db: AsyncSession, conversation_id: str) -> Optional[dict]:
        """Get a single conversation by ID."""
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        return self._conv_to_dict(conv) if conv else None

    async def update_title(self, db: AsyncSession, conversation_id: str, title: str) -> Optional[dict]:
        """Update conversation title."""
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return None
        conv.title = title
        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(conv)
        return self._conv_to_dict(conv)

    async def archive(self, db: AsyncSession, conversation_id: str) -> bool:
        """Archive (soft-delete) a conversation."""
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False
        conv.is_archived = 1
        await db.commit()
        return True

    async def delete(self, db: AsyncSession, conversation_id: str) -> bool:
        """Hard-delete a conversation and all its messages."""
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False
        await db.delete(conv)
        await db.commit()
        return True

    # ── Messages ──

    async def add_message(
        self, db: AsyncSession, *, conversation_id: str, role: str,
        content: str, mode: Optional[str] = None, model: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> dict:
        """Add a message to a conversation."""
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            mode=mode,
            model=model,
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        db.add(msg)

        # Update conversation
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count = (conv.message_count or 0) + 1
            conv.updated_at = datetime.now(timezone.utc)
            # Auto-title from first user message
            if conv.title == "New Conversation" and role == "user":
                conv.title = content[:100].strip()

        await db.commit()
        await db.refresh(msg)
        return self._msg_to_dict(msg)

    async def get_messages(
        self, db: AsyncSession, conversation_id: str, *, limit: int = 100
    ) -> list[dict]:
        """Get all messages in a conversation, oldest first."""
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
        return [self._msg_to_dict(m) for m in result.scalars().all()]

    # ── Stats ──

    async def get_stats(self, db: AsyncSession, user_id: str) -> dict:
        """Get conversation stats for a user."""
        conv_count = await db.execute(
            select(func.count()).select_from(Conversation)
            .where(Conversation.user_id == user_id, Conversation.is_archived == 0)
        )
        msg_count = await db.execute(
            select(func.count()).select_from(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id)
        )
        return {
            "total_conversations": conv_count.scalar() or 0,
            "total_messages": msg_count.scalar() or 0,
        }

    # ── Helpers ──

    def _conv_to_dict(self, conv: Conversation) -> dict:
        return {
            "id": conv.id,
            "user_id": conv.user_id,
            "title": conv.title,
            "mode": conv.mode,
            "model": conv.model,
            "message_count": conv.message_count or 0,
            "is_archived": bool(conv.is_archived),
            "created_at": conv.created_at.isoformat() if conv.created_at else None,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        }

    def _msg_to_dict(self, msg: Message) -> dict:
        metadata = None
        if msg.metadata_json:
            try:
                metadata = json.loads(msg.metadata_json)
            except json.JSONDecodeError:
                metadata = None
        return {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "role": msg.role,
            "content": msg.content,
            "mode": msg.mode,
            "model": msg.model,
            "metadata": metadata,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }


# Singleton
conversation_service = ConversationService()
