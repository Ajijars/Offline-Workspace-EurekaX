"""
API Routes – all HTTP endpoints for the Local LLM Assistant.

Endpoints:
    POST /api/chat              – Generate a complete response
    POST /api/chat/stream       – Stream response via SSE
    GET  /api/health            – Health check (API + Ollama + Qdrant)
    GET  /api/models            – List available Ollama models

    POST   /api/rag/upload      – Upload & index a document
    POST   /api/rag/query       – RAG query (non-streaming)
    POST   /api/rag/query/stream – RAG query (SSE streaming)
    GET    /api/rag/documents   – List indexed documents
    DELETE /api/rag/documents/{doc_id} – Delete a document
    GET    /api/rag/stats       – Vector store statistics
"""

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Header, Request
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse

from app.api.schemas import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    ModelInfo,
    ModelsResponse,
    DocumentUploadResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    DocumentCompareRequest,
    SourceChunk,
    DocumentInfo,
    DocumentListResponse,
    RAGStatsResponse,
    # Step 3 – Agent schemas
    AgentRequest,
    AgentResponse,
    AgentStep,
    AgentStatusResponse,
    AgentFileUploadResponse,
)
from app.config import get_settings
from app.services.llm_service import ollama_service

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# LLM Router (Step 1)
# ──────────────────────────────────────────────

router = APIRouter(prefix="/api", tags=["LLM"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the local LLM and receive a complete response.
    
    Supports optional conversation history for multi-turn dialogue
    and temperature control for response creativity.
    """
    try:
        # Convert Pydantic models to dicts for the service
        history = [msg.model_dump() for msg in request.conversation_history]

        result = await ollama_service.generate(
            prompt=request.message,
            model=request.model,
            conversation_history=history,
            temperature=request.temperature,
        )

        return ChatResponse(
            response=result["response"],
            model=result["model"],
            created_at=datetime.now(),
            total_duration_ms=result.get("total_duration_ms"),
            tokens_per_second=result.get("tokens_per_second"),
        )

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    last_event_id: str = Header(None)
):
    """
    Stream a response from the local LLM using Server-Sent Events (SSE).
    
    Each event contains a JSON chunk with partial content.
    The final event has 'done: true' and optional performance stats.
    Resumes are supported via Last-Event-ID header.
    """
    history = [msg.model_dump() for msg in request.conversation_history]
    
    # If resuming, we can adjust the prompt or history here
    if last_event_id:
        logger.info(f"Resuming chat stream from event ID: {last_event_id}")

    async def event_generator():
        async for chunk in ollama_service.generate_stream(
            prompt=request.message,
            model=request.model,
            conversation_history=history,
            temperature=request.temperature,
        ):
            yield {"data": chunk}

    return EventSourceResponse(event_generator())


@router.get("/health")
async def health_check():
    """
    Comprehensive health check — API, Ollama, Qdrant, SQLite, LangGraph, disk, memory.

    Returns detailed status and diagnostics for all services.
    """
    import os
    import shutil
    import time

    settings = get_settings()
    services = {}

    # 1. Ollama
    t0 = time.monotonic()
    ollama_healthy = await ollama_service.check_health()
    ollama_latency = round((time.monotonic() - t0) * 1000)
    services["ollama"] = {
        "status": "healthy" if ollama_healthy else "unreachable",
        "url": settings.OLLAMA_BASE_URL,
        "model": settings.OLLAMA_MODEL,
        "latency_ms": ollama_latency,
    }

    # 2. Qdrant
    try:
        from app.services.vector_service import vector_service
        t0 = time.monotonic()
        qdrant_healthy = await vector_service.check_health()
        qdrant_latency = round((time.monotonic() - t0) * 1000)
        qdrant_info = {"status": "healthy" if qdrant_healthy else "unreachable", "latency_ms": qdrant_latency}
        if qdrant_healthy:
            try:
                stats = await vector_service.get_collection_stats()
                qdrant_info["vectors"] = stats.get("vectors_count", 0)
                qdrant_info["collection"] = settings.QDRANT_COLLECTION_NAME
            except Exception:
                pass
        services["qdrant"] = qdrant_info
    except Exception:
        services["qdrant"] = {"status": "unreachable"}

    # 3. LangGraph
    try:
        from app.agents.graph import agent_graph
        services["langgraph"] = {"status": "healthy" if agent_graph is not None else "unavailable"}
    except Exception:
        services["langgraph"] = {"status": "unavailable"}

    # 4. SQLite
    try:
        db_path = os.path.join("data", "eurekax.db")
        if os.path.exists(db_path):
            db_size = os.path.getsize(db_path)
            services["sqlite"] = {
                "status": "healthy",
                "path": db_path,
                "size_mb": round(db_size / (1024 * 1024), 2),
            }
        else:
            services["sqlite"] = {"status": "no_database"}
    except Exception as e:
        services["sqlite"] = {"status": "error", "error": str(e)}

    # 5. System resources
    try:
        disk = shutil.disk_usage(".")
        system = {
            "disk_free_gb": round(disk.free / (1024**3), 1),
            "disk_total_gb": round(disk.total / (1024**3), 1),
            "disk_used_percent": round((disk.used / disk.total) * 100, 1),
        }
        # Upload directory size
        upload_dir = settings.UPLOAD_DIR
        if os.path.exists(upload_dir):
            upload_size = sum(
                f.stat().st_size for f in Path(upload_dir).rglob("*") if f.is_file()
            )
            system["uploads_mb"] = round(upload_size / (1024 * 1024), 2)
            system["uploads_count"] = sum(1 for _ in Path(upload_dir).rglob("*") if _.is_file())
        services["system"] = system
    except Exception:
        services["system"] = {}

    # Overall status
    all_healthy = (
        services.get("ollama", {}).get("status") == "healthy"
        and services.get("qdrant", {}).get("status") == "healthy"
    )

    return {
        "status": "healthy" if all_healthy else "degraded",
        "version": settings.APP_VERSION,
        "services": services,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/models", response_model=ModelsResponse)
async def list_models():
    """
    List all models available in the local Ollama instance.
    
    Returns model names, sizes, and the currently configured default.
    """
    settings = get_settings()

    try:
        models_data = await ollama_service.list_models()
        models = [ModelInfo(**m) for m in models_data]
    except Exception as e:
        logger.error(f"Failed to list models: {e}")
        models = []

    return ModelsResponse(
        models=models,
        default_model=settings.OLLAMA_MODEL,
    )


# ──────────────────────────────────────────────
# RAG Router (Step 2)
# ──────────────────────────────────────────────

rag_router = APIRouter(prefix="/api/rag", tags=["RAG"])


@rag_router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    x_checksum_sha256: str = Header(None, description="Optional SHA-256 checksum for integrity verification")
):
    """
    Upload a document and index it in the RAG pipeline.
    
    Supports: PDF, DOCX, PPTX, TXT, CSV.
    The document is parsed, chunked, embedded, and stored in Qdrant.
    """
    import hashlib
    from app.services.rag_service import rag_service

    try:
        content = await file.read()
        
        # Verify checksum if provided
        if x_checksum_sha256:
            file_hash = hashlib.sha256(content).hexdigest()
            if file_hash.lower() != x_checksum_sha256.lower():
                raise HTTPException(status_code=400, detail="Checksum mismatch. Transfer may be corrupted.")
        
        await file.seek(0)
        
        result = await rag_service.ingest_document(file)
        return DocumentUploadResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@rag_router.post("/query", response_model=RAGQueryResponse)
async def rag_query(request: RAGQueryRequest):
    """
    Ask a question and get a RAG-augmented answer.
    
    Retrieves relevant document chunks from the vector store,
    then generates an answer using the LLM with context.
    """
    from app.services.rag_service import rag_service

    try:
        result = await rag_service.query(
            question=request.question,
            top_k=request.top_k,
            model=request.model,
            temperature=request.temperature,
            conversation_history=request.conversation_history,
        )

        sources = [SourceChunk(**s) for s in result.get("sources", [])]

        return RAGQueryResponse(
            answer=result["answer"],
            sources=sources,
            model=result["model"],
            total_duration_ms=result["total_duration_ms"],
            tokens_per_second=result.get("tokens_per_second"),
        )

    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"RAG query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.post("/query/stream")
async def rag_query_stream(
    request: RAGQueryRequest,
    last_event_id: str = Header(None)
):
    """
    Stream a RAG-augmented answer via Server-Sent Events.
    
    First event contains the sources, followed by streamed answer chunks.
    Resumes are supported via Last-Event-ID header.
    """
    from app.services.rag_service import rag_service
    
    if last_event_id:
        logger.info(f"Resuming RAG stream from event ID: {last_event_id}")

    async def event_generator():
        async for chunk in rag_service.query_stream(
            question=request.question,
            top_k=request.top_k,
            model=request.model,
            temperature=request.temperature,
            conversation_history=request.conversation_history,
        ):
            yield {"data": chunk}

    return EventSourceResponse(event_generator())


@rag_router.post("/compare")
async def compare_documents(request: DocumentCompareRequest):
    """
    Compare two indexed documents.
    """
    from app.services.rag_service import rag_service
    
    try:
        answer = await rag_service.compare_documents(
            doc1_id=request.doc1_id,
            doc2_id=request.doc2_id,
            custom_prompt=request.custom_prompt
        )
        return {"answer": answer}
    except Exception as e:
        logger.error(f"Document comparison failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.get("/documents", response_model=DocumentListResponse)
async def list_documents():
    """List all documents indexed in the RAG pipeline."""
    from app.services.rag_service import rag_service

    try:
        docs = await rag_service.list_documents()
        doc_infos = [DocumentInfo(**d) for d in docs]
        return DocumentListResponse(
            documents=doc_infos,
            total_count=len(doc_infos),
        )
    except Exception as e:
        logger.error(f"Failed to list documents: {e}")
        return DocumentListResponse(documents=[], total_count=0)


@rag_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str):
    """
    Download a document that was previously uploaded.
    Supports HTTP Range requests automatically via FileResponse.
    """
    from app.services.rag_service import rag_service
    import os
    
    docs = await rag_service.list_documents()
    doc = next((d for d in docs if d["doc_id"] == doc_id), None)
    
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
        
    file_path = doc.get("file_path")
    if not file_path or not os.path.exists(file_path):
         raise HTTPException(status_code=404, detail="File content not found on disk")
         
    return FileResponse(file_path, filename=doc["filename"], headers={"Accept-Ranges": "bytes"})


@rag_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """
    Delete a document and all its chunks from the vector store.
    
    Also removes the uploaded file from disk.
    """
    from app.services.rag_service import rag_service

    try:
        deleted = await rag_service.delete_document(doc_id)
        if deleted:
            return {"status": "deleted", "doc_id": doc_id}
        else:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@rag_router.get("/stats", response_model=RAGStatsResponse)
async def rag_stats():
    """Get RAG pipeline statistics including vector store info."""
    from app.services.rag_service import rag_service

    try:
        stats = await rag_service.get_stats()
        return RAGStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Failed to get RAG stats: {e}")
        return RAGStatsResponse()


# ──────────────────────────────────────────────
# Agent Router (Step 3 – LangGraph)
# ──────────────────────────────────────────────

agent_router = APIRouter(prefix="/api/agent", tags=["Agent"])


@agent_router.post("/upload", response_model=AgentFileUploadResponse)
async def upload_agent_file(file: UploadFile = File(...)):
    """
    Save a file for the Data / File / Vision agents.

    Stored under workspace/agent_files/ so specialized agents can read it
    via the returned path.
    """
    import uuid
    from pathlib import Path

    from app.config import get_settings as _get_settings

    settings = _get_settings()
    dest_dir = Path(settings.WORKSPACE_DIR) / "agent_files"
    dest_dir.mkdir(parents=True, exist_ok=True)

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    safe_name = Path(file.filename).name
    dest = dest_dir / f"{uuid.uuid4().hex[:8]}_{safe_name}"
    content = await file.read()
    dest.write_bytes(content)

    logger.info("[Agent Upload] Saved %s (%s bytes)", dest, len(content))
    return AgentFileUploadResponse(
        filename=safe_name,
        path=str(dest),
        size_bytes=len(content),
        status="saved",
    )


@agent_router.post("/run", response_model=AgentResponse)
async def run_agent(request: AgentRequest):
    """
    Run the multi-agent LangGraph workflow for a user query.

    The supervisor classifies the intent and routes to the appropriate
    specialized agent (RAG, Data, File, Code, or Vision).
    Returns the final answer along with the agent execution trace.
    """
    from app.agents.graph import run_agent_workflow

    try:
        result = await run_agent_workflow(
            query=request.query,
            file_paths=request.file_paths,
            history=request.conversation_history,
        )

        steps = [AgentStep(**s) for s in result.get("agent_steps", [])]

        return AgentResponse(
            answer=result["answer"],
            intent=result["intent"],
            active_agent=result["active_agent"],
            agent_steps=steps,
            error=result.get("error"),
            metadata=result.get("metadata", {}),
        )
    except Exception as e:
        logger.error(f"Agent workflow failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@agent_router.post("/run/stream")
async def run_agent_stream(request: AgentRequest):
    """
    Stream the multi-agent workflow response via Server-Sent Events.

    Streams agent step events first, then the final answer.
    """
    from app.agents.graph import stream_agent_workflow

    async def event_generator():
        import json as _json
        async for event in stream_agent_workflow(
            query=request.query,
            file_paths=request.file_paths,
            history=request.conversation_history,
            thread_id=request.thread_id,
            resume=request.resume
        ):
            yield {"data": _json.dumps(event)}

    return EventSourceResponse(event_generator())


@agent_router.get("/status", response_model=AgentStatusResponse)
async def agent_status():
    """
    Check the health and configuration of the multi-agent system.

    Returns whether the LangGraph is compiled and lists available agents.
    """
    from app.agents.graph import agent_graph

    is_compiled = agent_graph is not None

    return AgentStatusResponse(
        status="ready" if is_compiled else "unavailable",
        graph_compiled=is_compiled,
        available_agents=[
            "rag_agent",
            "data_agent",
            "file_agent",
            "code_agent",
            "vision_agent",
            "general_agent",
        ],
        intent_classes=["rag", "data", "file", "code", "vision", "general"],
    )
