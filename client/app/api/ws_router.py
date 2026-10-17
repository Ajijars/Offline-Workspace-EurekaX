"""
WebSocket Chat Router — bidirectional real-time communication.

Supports:
    - Real-time token streaming (faster than SSE)
    - Mid-generation cancellation
    - Agent step updates pushed live
    - Connection heartbeat/keepalive
    - Multi-model selection per message

Protocol (JSON messages):

    Client → Server:
        {"type": "query", "query": "...", "mode": "chat|rag|agent", "model": "qwen3:8b"}
        {"type": "cancel"}
        {"type": "ping"}

    Server → Client:
        {"type": "token", "data": "..."}
        {"type": "step", "step": {...}}
        {"type": "done", "answer": "...", "metadata": {...}}
        {"type": "error", "message": "..."}
        {"type": "pong"}
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.llm_service import ollama_service

logger = logging.getLogger(__name__)
settings = get_settings()

ws_router = APIRouter(tags=["WebSocket"])

# Track active sessions for cancel support
_active_sessions: dict[str, asyncio.Event] = {}


class ChatSession:
    """Manages a single WebSocket chat session."""

    def __init__(self, websocket: WebSocket, session_id: str):
        self.ws = websocket
        self.session_id = session_id
        self.cancel_event = asyncio.Event()
        self.model = settings.OLLAMA_MODEL

    async def send(self, msg: dict):
        """Send a JSON message to the client."""
        try:
            await self.ws.send_json(msg)
        except Exception:
            pass  # Connection may have closed

    async def handle_query(self, data: dict):
        """Process an incoming query — stream tokens back."""
        query = data.get("query", "").strip()
        mode = data.get("mode", "chat")
        self.model = data.get("model", settings.OLLAMA_MODEL)

        if not query:
            await self.send({"type": "error", "message": "Empty query"})
            return

        self.cancel_event.clear()
        logger.info(f"[WS:{self.session_id}] Query ({mode}): {query[:80]!r}")

        try:
            if mode == "agent":
                await self._stream_agent(query)
            elif mode == "rag":
                await self._stream_rag(query)
            else:
                await self._stream_chat(query)
        except asyncio.CancelledError:
            await self.send({"type": "done", "answer": "[Generation cancelled]", "cancelled": True})
        except Exception as e:
            logger.error(f"[WS:{self.session_id}] Error: {e}", exc_info=True)
            await self.send({"type": "error", "message": str(e)})

    async def handle_resume(self, data: dict):
        """Resume a paused agent workflow."""
        self.cancel_event.clear()
        
        try:
            await self._stream_agent(query="", resume=True)
        except asyncio.CancelledError:
            await self.send({"type": "done", "answer": "[Generation cancelled]", "cancelled": True})
        except Exception as e:
            logger.error(f"[WS:{self.session_id}] Error: {e}", exc_info=True)
            await self.send({"type": "error", "message": str(e)})

    async def _stream_chat(self, query: str):
        """Direct LLM chat with streaming."""
        full_response = ""

        async for chunk in ollama_service.generate_stream(
            prompt=query, model=self.model
        ):
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()

            token = chunk.get("response", "")
            if token:
                full_response += token
                await self.send({"type": "token", "data": token})

            if chunk.get("done"):
                break

        await self.send({
            "type": "done",
            "answer": full_response,
            "model": self.model,
            "metadata": {"mode": "chat"},
        })

    async def _stream_rag(self, query: str):
        """RAG query with streaming."""
        from app.services.rag_service import rag_service
        from app.services.embedding_service import embedding_service
        from app.services.vector_service import vector_service

        # Step 1: Search
        await self.send({"type": "step", "step": {
            "agent": "rag", "action": "searching_documents",
            "result": "Searching indexed documents...",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }})

        query_vector = embedding_service.embed_query(query)
        results = await vector_service.search(query_vector=query_vector, top_k=5)

        if not results:
            await self.send({"type": "done", "answer": "No relevant documents found.", "metadata": {"mode": "rag", "chunks": 0}})
            return

        await self.send({"type": "step", "step": {
            "agent": "rag", "action": "found_chunks",
            "result": f"Found {len(results)} relevant chunks",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }})

        # Step 2: Build context and stream answer
        context_parts = []
        for i, chunk in enumerate(results, 1):
            filename = chunk.get("filename", "unknown")
            text = chunk.get("chunk_text", "")
            context_parts.append(f"[Doc {i} – {filename}]:\n{text}")
        context = "\n\n".join(context_parts)

        prompt = (
            f"You are a helpful assistant. Answer based on the context below.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n\nAnswer:"
        )

        full_response = ""
        async for chunk in ollama_service.generate_stream(prompt=prompt, model=self.model):
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()
            token = chunk.get("response", "")
            if token:
                full_response += token
                await self.send({"type": "token", "data": token})
            if chunk.get("done"):
                break

        # Build citations
        citations = [
            {"id": i, "filename": r.get("filename", ""), "score": round(r.get("score", 0), 3)}
            for i, r in enumerate(results, 1)
        ]

        await self.send({
            "type": "done",
            "answer": full_response,
            "model": self.model,
            "metadata": {"mode": "rag", "chunks": len(results), "citations": citations},
        })

    async def _stream_agent(self, query: str, resume: bool = False):
        """Agent workflow with live step streaming and HITL pause/resume."""
        from app.agents.graph import agent_graph, stream_agent_workflow

        if agent_graph is None:
            await self.send({"type": "error", "message": "Agent graph not compiled"})
            return

        async for update in stream_agent_workflow(query, thread_id=self.session_id, resume=resume):
            if self.cancel_event.is_set():
                raise asyncio.CancelledError()

            if update["type"] == "step":
                await self.send({"type": "step", "step": update["step"]})
            elif update["type"] == "paused":
                await self.send({
                    "type": "paused",
                    "pending_node": update.get("pending_node"),
                    "message": update.get("message")
                })
            elif update["type"] == "answer":
                await self.send({
                    "type": "done",
                    "answer": update["answer"],
                    "model": self.model,
                    "metadata": {
                        "mode": "agent",
                        "intent": update.get("intent"),
                        "active_agent": update.get("active_agent"),
                    },
                })
            elif update["type"] == "error":
                await self.send({"type": "error", "message": update.get("error", "Unknown agent error")})


@ws_router.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat.

    The session_id allows tracking and cancelling active generations.
    """
    await websocket.accept()
    session = ChatSession(websocket, session_id)
    _active_sessions[session_id] = session.cancel_event

    logger.info(f"[WS] Client connected: {session_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await session.send({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type", "")

            if msg_type == "query":
                await session.handle_query(data)
            elif msg_type == "resume":
                await session.handle_resume(data)
            elif msg_type == "cancel":
                session.cancel_event.set()
                logger.info(f"[WS:{session_id}] Cancel requested")
            elif msg_type == "ping":
                await session.send({"type": "pong"})
            else:
                await session.send({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info(f"[WS] Client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"[WS:{session_id}] Error: {e}", exc_info=True)
    finally:
        _active_sessions.pop(session_id, None)
