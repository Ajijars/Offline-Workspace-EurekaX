"""
FastAPI Application Entry Point.

Configures the app, mounts static files, includes API routes (LLM + RAG),
and sets up CORS, security headers, GZip, and rate limiting middleware.
"""

import logging
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.rate_limit import limiter

from app.config import get_settings
from app.api.routes import router as api_router
from app.api.routes import rag_router
from app.api.routes import agent_router
from app.auth.router import auth_router
from app.api.governance_router import governance_router
from app.api.security_router import security_router
from app.api.query_router import query_router
from app.api.workspace_router import workspace_router
from app.api.pipeline_router import pipeline_router
from app.api.jobs_router import jobs_router
from app.api.database_router import database_router
from app.api.okf_router import okf_router
from app.api.ws_router import ws_router
from app.api.conversation_router import conversation_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Load settings
settings = get_settings()


# ──────────────────────────────────────────────
# Lifespan (replaces deprecated @app.on_event)
# ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Modern lifespan handler — replaces deprecated @app.on_event("startup").
    Startup logic runs before 'yield', shutdown logic runs after.
    """
    # ── Startup ──
    from app.db.database import init_db
    await init_db()

    logger.info("=" * 55)
    logger.info(f"  {settings.APP_TITLE} v{settings.APP_VERSION}")
    logger.info(f"  Ollama URL   : {settings.OLLAMA_BASE_URL}")
    logger.info(f"  Model        : {settings.OLLAMA_MODEL}")
    logger.info(f"  Qdrant       : {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
    logger.info(f"  Embedding    : {settings.EMBEDDING_MODEL}")
    logger.info(f"  Chunk Size   : {settings.CHUNK_SIZE} (overlap: {settings.CHUNK_OVERLAP})")
    logger.info("=" * 55)

    # Ensure uploads directory exists
    upload_path = Path(settings.UPLOAD_DIR)
    upload_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload dir: {upload_path.absolute()}")

    # Check Ollama
    from app.services.llm_service import ollama_service
    is_healthy = await ollama_service.check_health()

    if is_healthy:
        logger.info("✓ Ollama is reachable and ready")
        # Pre-warm default model into GPU VRAM in background so first user request is instant
        import asyncio
        async def _warm_ollama():
            try:
                logger.info(f"Pre-warming Ollama model '{settings.OLLAMA_MODEL}' into GPU memory...")
                await ollama_service.generate(prompt="ping", model=settings.OLLAMA_MODEL)
                logger.info(f"✓ Ollama model '{settings.OLLAMA_MODEL}' pinned in GPU VRAM (keep_alive=forever)")
            except Exception as e:
                logger.warning(f"Ollama pre-warm notice: {e}")
        asyncio.create_task(_warm_ollama())
    else:
        logger.warning(
            "✗ Ollama is NOT reachable at %s. "
            "Start it with: ollama serve",
            settings.OLLAMA_BASE_URL,
        )

    # Check Qdrant & initialize collection
    try:
        from app.services.vector_service import vector_service
        qdrant_healthy = await vector_service.check_health()

        if qdrant_healthy:
            logger.info("✓ Qdrant is reachable and ready")
            # Initialize collection
            await vector_service.init_collection()
        else:
            logger.warning(
                "✗ Qdrant is NOT reachable at %s:%s. "
                "Start it with: docker-compose up -d",
                settings.QDRANT_HOST,
                settings.QDRANT_PORT,
            )
    except Exception as e:
        logger.warning(f"✗ Qdrant check failed: {e}")

    logger.info("─" * 55)
    logger.info("  RAG Pipeline : Ready (upload documents to get started)")
    logger.info("  Agent System : Ready (LangGraph multi-agent workflow)")
    logger.info("─" * 55)

    # Pre-warm embedding model in background so first upload has no cold-start delay
    try:
        import asyncio
        from app.services.embedding_service import embedding_service
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, embedding_service._load_model)
        loop.run_in_executor(None, embedding_service._load_sparse_model)
        logger.info("✓ Embedding models warming up in background")
    except Exception as emb_err:
        logger.warning(f"Embedding model warmup error: {emb_err}")

    # Pre-compile LangGraph
    try:
        from app.agents.graph import agent_graph
        if agent_graph is not None:
            logger.info("✓ LangGraph agent workflow compiled and ready")
        else:
            logger.warning("✗ LangGraph agent workflow failed to compile")
    except Exception as ag_err:
        logger.warning(f"✗ LangGraph init error: {ag_err}")

    # Validate JWT secret is not default
    if settings.JWT_SECRET_KEY == "eurekax-super-secret-change-me-in-production":
        logger.warning(
            "⚠ JWT_SECRET_KEY is using the default value! "
            "Set a secure value in your .env file. "
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )

    yield  # ── App runs here ──

    # ── Shutdown ──
    logger.info("EurekaX shutting down...")


# ──────────────────────────────────────────────
# Create FastAPI App (with lifespan)
# ──────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=(
        "EurekaX — Offline AI Workbench powered by Ollama. "
        "RAG Pipeline | LangGraph Multi-Agent Orchestration | Open Knowledge Format."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ──────────────────────────────────────────────
# Rate Limiter
# ──────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ──────────────────────────────────────────────
# Middleware Stack
# ──────────────────────────────────────────────

# 1. GZip compression for responses > 1KB (skips streaming and websocket endpoints)
class StreamingAwareGZipMiddleware:
    """
    GZip middleware that skips compression for SSE streaming and WebSocket endpoints.
    Standard Starlette GZipMiddleware buffers streaming chunks inside gzip.GzipFile,
    preventing real-time token-by-token streaming to the browser.
    """
    def __init__(self, app, minimum_size: int = 1000, compresslevel: int = 9):
        self.app = app
        self.gzip_middleware = GZipMiddleware(app, minimum_size=minimum_size, compresslevel=compresslevel)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if "stream" in path:
                await self.app(scope, receive, send)
                return
        elif scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return

        await self.gzip_middleware(scope, receive, send)

app.add_middleware(StreamingAwareGZipMiddleware, minimum_size=1000)


# 2. Request ID tracing — adds X-Request-ID to every request/response
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:12])
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# 3. Security headers — defense-in-depth
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    return response


# 4. Idempotency middleware — proper implementation with LRU cache
class _LRUCache(OrderedDict):
    """Simple LRU cache with max size."""
    def __init__(self, maxsize=256):
        super().__init__()
        self.maxsize = maxsize

    def get_entry(self, key):
        if key in self:
            self.move_to_end(key)
            return self[key]
        return None

    def set_entry(self, key, value):
        if key in self:
            self.move_to_end(key)
        self[key] = value
        if len(self) > self.maxsize:
            self.popitem(last=False)

_idempotency_cache = _LRUCache(maxsize=512)


@app.middleware("http")
async def idempotency_middleware(request: Request, call_next):
    idem_key = request.headers.get("Idempotency-Key")
    if not idem_key or request.method not in ("POST", "PUT", "PATCH"):
        return await call_next(request)

    cache_key = f"{request.method}:{request.url.path}:{idem_key}"
    cached = _idempotency_cache.get_entry(cache_key)
    if cached is not None:
        return JSONResponse(
            content=cached["content"],
            status_code=cached["status_code"],
            headers=dict(cached.get("headers", {})),
        )

    response = await call_next(request)

    # Cache successful JSON responses by reading the body
    if (response.status_code < 400
        and "application/json" in response.headers.get("content-type", "")):
        body = b""
        async for chunk in response.body_iterator:
            body += chunk if isinstance(chunk, bytes) else chunk.encode()

        import json
        try:
            content = json.loads(body)
            _idempotency_cache.set_entry(cache_key, {
                "content": content,
                "status_code": response.status_code,
                "headers": {"X-Idempotent-Replay": "true"},
            })
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

        # Return a new response since we consumed the body
        return JSONResponse(
            content=content if 'content' in dir() else body.decode(),
            status_code=response.status_code,
        )

    return response


# 5. CORS — restricted to known origins (no longer wildcard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",       # Next.js dev server
        "http://127.0.0.1:3000",
        "http://localhost:8000",        # FastAPI static files
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Routes & Static Files
# ──────────────────────────────────────────────

# Include all API routers
app.include_router(auth_router)
app.include_router(api_router)
app.include_router(rag_router)
app.include_router(agent_router)
app.include_router(governance_router)
app.include_router(security_router)
app.include_router(query_router)
app.include_router(workspace_router)
app.include_router(pipeline_router)
app.include_router(jobs_router)
app.include_router(database_router)
app.include_router(okf_router)
app.include_router(ws_router)
app.include_router(conversation_router)

# Mount static files (legacy frontend)
app.mount(
    "/static",
    StaticFiles(directory="app/static", html=True),
    name="static",
)


@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to the chat UI."""
    return RedirectResponse(url="/static/index.html")


# ──────────────────────────────────────────────
# Structured Error Responses
# ──────────────────────────────────────────────

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": {
                "code": "NOT_FOUND",
                "message": f"Resource not found: {request.url.path}",
                "request_id": getattr(request.state, "request_id", "unknown"),
            }
        },
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"Internal server error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred. Check server logs.",
                "request_id": getattr(request.state, "request_id", "unknown"),
            }
        },
    )
