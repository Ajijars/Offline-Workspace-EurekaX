# EurekaX — Local LLM Assistant
## Complete Project Overview for Presentation

---

## What is this Project?

**EurekaX** is a fully **offline,secure workspace for industry, enterprise-grade AI assistant**. It runs entirely on local hardware — no cloud API keys, no internet. dependency, no data leaves the machine. It combines a local Large Language Model, a document search pipeline, and a multi-agent AI orchestration system into a single unified platform.

> **Core Value Proposition:** Bring the power of ChatGPT-level AI to government 
---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                    USER (Browser)                       │
│                 http://localhost:3000                   │
└─────────────────────┬───────────────────────────────────┘
                      │  REST + SSE + WebSocket (bidirectional)
┌─────────────────────▼───────────────────────────────────┐
│          Next.js 16 Frontend (TypeScript)                │
│  Pages: Login, Dashboard, Chat, RAG, Agent, SQL Editor   │
│         Governance, Pipelines, Workspace, Audit, OKF     │
└─────────────────────┬───────────────────────────────────┘
                      │  HTTP / API Proxy (:8000)
┌─────────────────────▼───────────────────────────────────┐
│              FastAPI Backend (Python 3.11)               │
│  Routers: auth, chat, rag, agent, governance, query,     │
│           pipelines, jobs, databases, workspace, okf     │
└──────┬──────────────┬──────────────┬───────────┬────────┘
       │              │              │           │
  Ollama         Qdrant         SQLite    Databricks /
  qwen3:8b    (Vector Store)  (Users,     MongoDB
  :11434          :6333        RBAC,     (optional)
  (LLM)                       Audit)
```

---

## Three-Step Build Philosophy

The project was built incrementally across defined steps, each adding a layer of intelligence:

| Step | What was Built | Key Tech |
|------|---------------|----------|
| **Step 1** | Foundation — Local LLM Chat | FastAPI + Ollama + qwen3:8b |
| **Step 2** | RAG Pipeline — Document Intelligence | LangChain + BGE Embeddings + Qdrant |
| **Step 3** | Multi-Agent Orchestration | LangGraph + 6 Specialized Agents |
| **Step 4** | Auth, RBAC, Governance | JWT + SQLite + SQLAlchemy |
| **Step 5** | Security Hardening & Resilience | Guardrails + Query Sanitizer + Anomaly Detector + Rate Limiter |
| **Step 6** | Open Knowledge Format (OKF) | Graph Canvas + JSON-LD + AI Enrichment |
| **Step 7** | Infrastructure & Connectivity | WebSocket + Docker Stack + GZip + Security Headers + Conversation History |

---

## Technology Stack — Full Detail

### 1. Frontend: Next.js 16 + TypeScript

**What it is:** Next.js is a React framework from Vercel that provides server-side rendering, file-system routing, and API proxying out of the box.

**Why we used it:**
- **App Router (Next 13+)** — every folder under `src/app/` automatically becomes a route. Zero configuration routing.
- **TypeScript** — static typing catches bugs at compile time; essential for large multi-page apps.
- **Built-in API proxy** — Next.js proxies `/api/*` calls to our FastAPI backend, avoiding CORS issues.
- **React 19** — latest React with concurrent features for smoother UI.

**Key Libraries:**

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | 16.3.4 | Framework, routing, SSR |
| `react` | 19.2.8 | UI library |
| `zustand` | 5.0.15 | Lightweight global state management |
| `react-markdown` | 10.1.0 | Render LLM markdown responses in chat |
| `remark-gfm` | 4.0.1 | GitHub-Flavored Markdown (tables, checklists) |
| `lucide-react` | 1.39.0 | Icon library (consistent UI icons) |

**Pages Built:**
- `/login` — JWT-based login form
- `/dashboard` — Landing page with role-based menu
- `/admin-home` — Admin control panel
- `/employee-home` — Employee workspace
- `/admin` — Full admin panel (user management + dataset permission CRUD per user)
- `/(chat)` — Direct LLM chat with streaming
- `/(rag)` — Document upload + RAG query UI
- `/(agent)` — Multi-agent runner with step trace viewer
- `/sql-editor` — Interactive SQL query editor
- `/governance` — Data governance and catalog UI
- `/pipelines` — ETL/data pipeline management
- `/workspace` — Jupyter-style notebook workspace
- `/jobs` — Scheduled job monitoring
- `/security` — Security policy management
- `/audit` — Full audit log viewer
- `/databases` — Data source connection manager
- `/okf` — Open Knowledge Format (OKF) graph editor & visualizer
- `/history` — Persistent chat history with search and mode stats

**State Management (Zustand):**
- `authStore.ts` — Stores JWT token, user object, role; hydrates from localStorage on page load
- `appStore.ts` — Chat history, RAG results, agent steps, sidebar state
- `themeStore.ts` — Dark/light theme toggle with `data-theme` CSS attribute switching and `localStorage` persistence

**Custom React Hooks:**
- `useChat.ts` — Manages conversation logic, message sending, and SSE streaming; auto-routes to correct endpoint based on mode (Chat / RAG / Agent)
- `useDocuments.ts` — Document upload and listing for the RAG pipeline
- `useHealth.ts` — Real-time Ollama and Qdrant health status polling
- `useKeyboardShortcuts.ts` — Global keyboard shortcuts (Ctrl+K search, Ctrl+/ sidebar toggle, Ctrl+Shift+N new chat, Escape close modals)
- `useToast.ts` — Lightweight toast notification system (success/error/warning/info, auto-dismiss, max 5 concurrent)

**UI Components:**
- `ToastContainer.tsx` — Renders animated toast notification stack (bottom-right)
- `AppProviders.tsx` — Client-side provider wrapping keyboard shortcuts, offline banner, and toast container

**Connection Resilience:**
- `resilientFetch.ts` — Fetch wrapper with exponential backoff retry (3 attempts), AbortSignal timeout (15s), toast notifications on failure, and `X-Request-ID` header injection

---

### 2. Backend: FastAPI (Python 3.11)

**What it is:** FastAPI is an async Python web framework built on Starlette + Pydantic. It auto-generates OpenAPI (Swagger) documentation.

**Why we used it:**
- **Async-first** — all I/O (LLM calls, DB queries, file reads) runs concurrently without blocking
- **Pydantic v2 validation** — request/response schemas are validated automatically
- **Auto Swagger docs** — every endpoint is documented at `/docs` without extra work
- **SSE streaming** — supports Server-Sent Events for real-time token streaming
- **WebSocket** — bidirectional real-time communication for chat, with mid-generation cancel support

**API Routers:**

| Router File | Prefix | What it handles |
|-------------|--------|----------------|
| `routes.py` | `/api` | Chat, RAG, Agent endpoints |
| `auth/router.py` | `/auth` | Login, register, refresh token |
| `governance_router.py` | `/api/governance` | Data catalog, lineage, tags |
| `security_router.py` | `/api/security` | Security policy CRUD |
| `query_router.py` | `/api/query` | Natural language to SQL, direct SQL |
| `workspace_router.py` | `/api/workspace` | Notebook/workspace management |
| `pipeline_router.py` | `/api/pipelines` | ETL pipeline CRUD |
| `jobs_router.py` | `/api/jobs` | Scheduled jobs |
| `database_router.py` | `/api/databases` | Data source connections |
| `okf_router.py` | `/api/okf` | Open Knowledge Format (Packages, Nodes, Edges) |
| `ws_router.py` | `/ws/chat/{id}` | WebSocket chat with streaming, cancel, multi-model |
| `conversation_router.py` | `/api/conversations` | Persistent chat history CRUD + message storage |

**Configuration** (via `pydantic-settings`): All settings loaded from `.env`, cached singleton via `@lru_cache()`. Covers Ollama URL, model name, Qdrant host/port, embedding model, chunk sizes, Databricks credentials, JWT secrets.

---

### 3. LLM Engine: Ollama + qwen3:8b

**What Ollama is:** A local model server that downloads and runs open-source LLMs on your CPU/GPU. It exposes a REST API.

**Why we used it:**
- **100% offline** — the model runs on local machine; no internet needed after the initial pull
- **REST API** — our `OllamaService` makes simple HTTP calls via `httpx`; easy to swap models
- **Model: qwen3:8b** — Qwen3 8B from Alibaba: state-of-the-art multilingual model with excellent reasoning at 8 billion parameters; runs on 8-16GB RAM

**LLM Service methods:**
- `generate()` — single async call, returns full response
- `generate_stream()` — async generator, streams tokens one-by-one via SSE
- `check_health()` — pings Ollama `/api/tags` to verify it's running
- `list_models()` — discovers all locally installed models

**How SSE streaming works:**
```
User types question
  → FastAPI SSE endpoint opens
  → FastAPI calls Ollama /api/generate with stream=true
  → Ollama returns NDJSON line-by-line (one token per line)
  → FastAPI forwards each token as an SSE event
  → Next.js reads EventSource and appends tokens to chat bubble in real time
```

---

### 4. RAG Pipeline: LangChain + BGE Embeddings + Qdrant

**What RAG is:** Retrieval-Augmented Generation — instead of relying only on what the LLM was trained on, we feed it relevant chunks from your own documents as context for each question.

**The full 4-step pipeline:**

```
INGESTION:
File Upload → Text Extraction → Chunking → Embedding → Qdrant Storage

QUERY:
Question → Embed → Search Qdrant → Top-K Chunks → Build Prompt → LLM → Answer
```

#### 4a. Document Processing
Supports: **PDF, DOCX, PPTX, TXT, CSV**
- PDF → PyPDF2 (text layers) + OCR fallback (PaddleOCR / Tesseract)
- DOCX → python-docx
- PPTX → python-pptx (slide text extraction)
- Images → PaddleOCR or pytesseractx`

#### 4b. Text Chunking (LangChain)
Uses `RecursiveCharacterTextSplitter`:
- Chunk size: **500 characters**
- Overlap: **50 characters** (prevents context loss at boundaries)
- Separators: `\n\n`, `\n`, `.`, ` ` — tries natural breaks first

**Why chunking?** LLMs have a fixed context window. We split large documents into small, overlapping pieces so we can retrieve only the most relevant pieces per question.

#### 4c. Embeddings (sentence-transformers)
- Model: **BAAI/bge-small-en-v1.5**
- Produces **384-dimensional vectors** for each chunk
- Runs fully locally (downloaded from HuggingFace once, cached)
- BGE (BAAI General Embedding) is a top-ranked model on the MTEB benchmark

**Why embeddings?** They convert text into numbers (vectors) that capture semantic meaning. "Car" and "automobile" will have very similar vectors — enabling semantic search even when exact keywords don't match.

#### 4d. Vector Database: Qdrant
- Stores all chunk embeddings + metadata (filename, page, chunk text)
- Similarity search: finds top-K chunks most similar to the query using **cosine similarity**
- Docker container (port 6333) or falls back to local file storage (`qdrant_data/`)

---

### 5. Multi-Agent System: LangGraph

**What LangGraph is:** A framework from LangChain that lets you build stateful, multi-step AI workflows as directed graphs. Each node is a function (agent); edges define the flow.

**The Graph:**

```
START
  ↓
[supervisor] ← classifies intent using the LLM
  ↓ (conditional routing based on intent)
  ┌──────┬────────┬──────┬────────┬────────┬─────────┐
 rag   data    file   code   vision  general
agent agent  agent  agent  agent   agent
  └──────┴────────┴──────┴────────┴────────┴─────────┘
                         ↓ (all converge here)
                   [final_response]
                         ↓
                        END
```

**Shared AgentState TypedDict** (flows through every node):
- `user_query` — the original question
- `intent` — rag | data | file | code | vision | general
- `agent_steps` — execution trace for the UI
- `final_answer` — the response sent to the user
- `file_paths` — paths of uploaded files agents can access
- `messages` — conversation history (auto-managed via `add_messages` reducer)

**The 7 Agent Nodes:**

| Agent | What it does |
|-------|-------------|
| **Supervisor** | LLM classifies intent into 6 categories; routes to correct agent |
| **RAG Agent** | Calls `search_documents` tool; retrieves and answers from indexed docs |
| **Data Agent** | Loads CSV/JSON/Excel with pandas; computes stats; optionally queries Databricks |
| **File Agent** | `read_file`, `write_file`, `list_files` within sandboxed workspace |
| **Code Agent** | Generates Python code and executes it in Docker sandbox or subprocess |
| **Vision Agent** | Extracts text from images via PaddleOCR or Tesseract; answers visual questions |
| **General Agent** | Direct LLM answer for general knowledge/math/conversation |

**9 Callable Agent Tools:**
1. `search_documents(query, top_k)` — Qdrant semantic search
2. `read_file(path)` — safe sandboxed file read
3. `write_file(path, content)` — safe sandboxed file write
4. `list_files(dir)` — directory listing
5. `analyze_data(path)` — pandas DataFrame summary (shape, dtypes, head, describe)
6. `execute_python(code)` — Docker sandbox → subprocess fallback
7. `extract_image_text(path)` — PaddleOCR → pytesseract fallback
8. `query_databricks(sql)` — SQL against Databricks Delta Lake
9. `execute_catalog_query(sql)` — SQL against the internal Data Governance Catalog via MySQL

**Data Agent — Catalog Fallback:**
When no data file is attached, the Data Agent automatically falls back to the **internal Data Governance Catalog**:
1. Calls `get_catalog_context()` to retrieve all registered table schemas from the catalog
2. Generates a SQL query from the user's natural language question
3. Executes the query against MySQL via `execute_catalog_query()`
4. Passes the results to the LLM for natural language interpretation

This means the Data Agent can answer questions about any dataset registered in the governance catalog — even without explicit file uploads.

---

### 6. Authentication and RBAC: JWT + SQLite + SQLAlchemy

**Why we built this:** Enterprise systems need user identity and access control.

**Auth Flow:**
```
1. POST /auth/register → hash password (bcrypt) → store in SQLite
2. POST /auth/login → verify bcrypt → issue JWT access token (1h) + refresh token (7d)
3. Protected endpoints → FastAPI dependency reads Authorization: Bearer <token>
   → verifies JWT → loads user from DB
4. POST /auth/refresh → exchange refresh token for new access token
```

**Tech Stack:**
- **SQLAlchemy 2.0 (async)** — ORM with async session support via `aiosqlite`
- **SQLite** — file-based DB; zero config, perfect for local deployment
- **passlib[bcrypt]** — industry standard password hashing
- **python-jose** — JWT encoding/decoding with HS256 algorithm

**Database Models:**
- `User` — id, email, username, hashed_password, role (admin/employee), is_active
- `Permission` — user_id, resource_type, resource_id, access_level (read/write/admin)
- `AuditLog` — user_id, action, resource_type, details, ip_address, timestamp
- `SecurityAlert` — user_id, alert_type (rate_limit/bulk_extract/unusual_access), severity, message, resolved
- `QueryHistory` — user_id, source_name, query_text, status, row_count, duration_ms, error_message
- `SavedQuery` — user_id, name, query_text, source_name, description

**Role Hierarchy:**
- `admin` — full access: manage users, data sources, security policies, all audit logs
- `employee` — scoped access: query permitted datasets, upload documents

---

### 7. Data Governance Layer

A full enterprise data catalog and governance system:

**Catalog Service:**
- **DataSource** model — registers SQL, MongoDB, CSV, Databricks connections
- **CatalogEntry** model — per-table metadata: schema, tags, description, row count, data lineage
- Search catalog by table name or tag
- Track lineage as JSON: `{upstream: [...], downstream: [...]}`

---

### 8. Security Layer: Guardrails + Query Sanitizer + Anomaly Detector

A full **defence-in-depth security module** under `app/security/`:

#### 8a. AI Guardrails (`guardrails.py`)

Scans both LLM inputs and outputs for security violations:

**Output Scanning (PII / Sensitive Data Leak Prevention):**
- SSN, credit cards, phone numbers, email addresses
- IP addresses, API keys, password leaks
- Role-aware: employees get redacted output (`[REDACTED-SSN]`); admins see warnings

**Input Scanning (Prompt Injection Detection):**
- "Ignore previous instructions" patterns
- Role override / jailbreak (DAN, developer mode)
- System prompt extraction attempts
- Encoding bypass attempts (base64, rot13)

#### 8b. Query Sanitizer (`query_sanitizer.py`)

Validates and restricts SQL/MongoDB queries by user role:

| Role | SQL Rules | MongoDB Rules |
|------|-----------|---------------|
| **Employee** | Block DROP, DELETE, ALTER, TRUNCATE, CREATE, GRANT, INSERT, UPDATE, EXEC | Block $where, $function, db.drop, deleteMany({}) |
| **Admin** | All queries allowed (with audit logging + warnings) | All queries allowed |
| **Everyone** | SQL injection patterns always blocked (UNION SELECT, chained ;--, OR 1=1) | — |

#### 8c. Anomaly Detector (`anomaly_detector.py`)

Tracks and flags unusual query patterns:
- **Per-user rate limiting** — 30 queries/min, 500 queries/hr thresholds
- **Bulk data extraction detection** — flags queries returning >10,000 rows
- **Security alerts** — persisted to SQLite `security_alerts` table with severity levels (low/medium/high/critical)
- **Alert management** — create, list (filtered by resolved status), resolve

---

### 9. Rate Limiting & Resilience

#### Rate Limiting (`slowapi`)
- Global API rate limiter via `slowapi` middleware
- Extracted into `app/rate_limit.py` to avoid circular imports
- Configurable per-route limits; returns HTTP 429 on exceed

#### Idempotency Middleware
- Custom middleware in `main.py` checks for `Idempotency-Key` header on POST/PUT/PATCH requests
- Caches responses by `method:path:key` to prevent duplicate operations

#### Retry with Exponential Backoff (`tenacity`)
- LLM service methods (`check_health`, `list_models`, `generate`) use `@retry` decorators
- 3 attempts with exponential backoff (2s → 4s → 10s max)
- Retries only on `ConnectError` and `TimeoutException`

---

### 10. Additional Services

| Service | Technology | Purpose |
|---------|-----------|---------|
| **SQL Service** | SQLAlchemy | Natural language to SQL; query execution against registered sources; query history + saved queries |
| **Databricks** | `databricks-sql-connector` | Query Delta Lake tables via Databricks SQL Warehouse |
| **MongoDB** | `pymongo` | Optional NoSQL data source for the Data Agent |
| **Pipeline Service** | Custom | ETL pipeline definition, step tracking, run history |
| **Notebook Service** | Custom | Jupyter-like notebook persistence in `workspace/` |
| **Scheduler** | Custom | Cron-style job scheduling for automated pipelines |
| **Watchdog** | Custom | File system monitoring for the workspace directory |
| **Audit Service** | SQLAlchemy | Write audit log entries; query with filters |
| **Catalog Service** | SQLAlchemy | Data catalog CRUD, source registration, lineage tracking, entry search |

---

### 11. Secure Storage & Seed Scripts

**Secure Storage (`secure_storage/dataset/`):**
- Air-gapped local folder for CSV, JSON, and Excel datasets
- Registered as governed data sources in the catalog
- Queryable via the SQL Editor and Data Agent

**Seed & Setup Scripts (`scripts/`):**

| Script | Purpose |
|--------|---------|
| `setup_ollama.ps1` | PowerShell script: checks Ollama install, starts server, pulls qwen3:8b |
| `seed_users.py` | Creates default admin + employee user accounts |
| `seed_catalog.py` | Populates the data governance catalog with sample sources & entries |
| `seed_secure_storage.py` | Registers CSV/JSON/Excel files from `secure_storage/` into the catalog |
| `add_mysql_source.py` | Registers a MySQL data source for external database querying |
| `download_datasets.py` | Downloads sample datasets for local development |

---

## Complete Request Lifecycle (End-to-End)

**Example: User asks "Summarize the uploaded policy document"**

```
1.  User types in Next.js chat UI
2.  Frontend → POST /api/agent/run/stream {query: "Summarize...", file_paths: []}
3.  FastAPI authenticates JWT, validates Pydantic schema
4.  LangGraph workflow starts with initial AgentState
5.  Supervisor node:
        → Builds prompt with query + file hints
        → Calls Ollama qwen3:8b at temperature=0 (deterministic)
        → Receives JSON: {"intent": "rag", "reason": "..."}
        → Sets state.intent = "rag"
6.  Conditional edge routes to rag_agent node
7.  RAG Agent:
        → search_documents("Summarize policy document", top_k=5)
        → embedding_service.embed_query() → 384-dim vector
        → vector_service.search() → Qdrant cosine similarity search
        → Returns top 5 chunks with scores and source filenames
        → Builds context-augmented prompt
        → Calls Ollama to generate the answer
        → Sets state.final_answer
8.  final_response node logs completion, passes state to END
9.  FastAPI streams agent_steps back as SSE events (frontend shows step trace)
10. Final answer streamed token-by-token to frontend
11. AuditLog entry written: user X ran agent query at timestamp T
```

---

## Key Technical Decisions and Why

| Decision | Alternative | Why We Chose This |
|----------|-------------|-------------------|
| **qwen3:8b** model | llama3.1, mistral | Best multilingual reasoning at 8B scale; supports thinking mode |
| **Qdrant** vector DB | ChromaDB, FAISS | Production-ready, Docker-deployable, REST + gRPC APIs, scales well |
| **BGE-small embeddings** | nomic-embed, mxbai | Top MTEB ranking for retrieval, small (134MB), runs on CPU |
| **LangGraph** for agents | CrewAI, AutoGen | Explicit control flow state graph; debuggable; supports streaming |
| **FastAPI** | Django, Flask | Async-native, auto-docs, Pydantic validation, SSE streaming |
| **Next.js 16** | Vue, raw React | App router, TypeScript, zero-config API proxy, SSR |
| **SQLite** for auth | PostgreSQL, MySQL | Zero-config, file-based, perfect for local offline deployment |
| **Zustand** | Redux, Context API | Minimal boilerplate, works with React 19, tiny bundle size |
| **100% offline** | Cloud APIs (OpenAI) | Privacy-first: data never leaves the machine |

---

## Security Features

1. **JWT Authentication** — access tokens (1hr) + refresh tokens (7d)
2. **bcrypt Password Hashing** — industry standard; no plain-text passwords stored
3. **RBAC** — role-based access control at both API and UI levels
4. **Path Traversal Guard** — file agent uses `_safe_path()` to prevent directory escape
5. **Code Sandboxing** — Python code execution in Docker container; subprocess is fallback
6. **Audit Logging** — every login, query, upload, admin action logged with user + IP
7. **CORS Middleware** — configured on FastAPI
8. **AI Guardrails** — PII/sensitive data scanning on LLM output; prompt injection detection on input
9. **Query Sanitizer** — role-based SQL/MongoDB query validation; blocks destructive operations for non-admins
10. **Anomaly Detection** — per-user rate limiting, bulk extraction flagging, persistent security alerts
11. **API Rate Limiting** — `slowapi` middleware prevents abuse with configurable per-route limits
12. **Idempotency Keys** — prevents duplicate mutations via `Idempotency-Key` header
13. **Retry with Backoff** — `tenacity` decorators on external service calls (Ollama, Qdrant)

---

## Complete Dependency Map

### Python Backend (44 packages across 5 layers)

```
Layer 1 — Foundation
  fastapi==0.115.0
  uvicorn[standard]==0.30.6
  httpx==0.27.2              ← async HTTP client for Ollama
  pydantic==2.9.2            ← data validation
  pydantic-settings==2.5.2
  python-dotenv==1.0.1
  sse-starlette==2.1.3       ← Server-Sent Events

Layer 2 — RAG Pipeline
  langchain==0.3.7            ← text splitting, prompt templates
  langchain-community==0.3.7
  langchain-text-splitters==0.3.2
  qdrant-client==1.12.1       ← vector database client
  sentence-transformers==3.3.1  ← BGE embeddings
  PyPDF2==3.0.1               ← PDF text extraction
  python-docx==1.1.2          ← DOCX extraction
  python-pptx==1.0.2          ← PPTX extraction
  pytesseract==0.3.13         ← OCR fallback
  Pillow==11.0.0              ← image processing
  pdf2image==1.17.0           ← PDF to image for OCR
  python-multipart==0.0.12    ← file upload handling
  aiofiles==24.1.0            ← async file I/O

Layer 3 — Agentic Workflow
  langgraph==0.2.53           ← agent orchestration graph
  langchain-ollama==0.2.2     ← Ollama LLM integration
  pandas==2.2.3               ← tabular data analysis
  openpyxl==3.1.5             ← Excel file support
  databricks-sql-connector==3.6.0

Layer 4 — Auth and Persistence
  sqlalchemy[asyncio]==2.0.25
  aiosqlite==0.19.0
  passlib[bcrypt]==1.7.4
  python-jose[cryptography]==3.3.0
  email-validator==2.1.0
  pymongo==4.8.0

Layer 5 — Resilience & Security
  slowapi==0.1.9              ← API rate limiting middleware
  tenacity==8.3.0             ← retry with exponential backoff for external calls
```

### JavaScript Frontend

```
next@16.3.4            ← Framework
react@19.2.8           ← UI library
typescript@5           ← Type safety
zustand@5.0.15         ← State management
react-markdown@10.1.0  ← Render LLM output as markdown
remark-gfm@4.0.1       ← Markdown tables / GitHub-Flavored Markdown
lucide-react@1.39.0    ← Icons
```

---

## What Makes This Stand Out

1. **Fully Offline** — runs on a laptop with no internet; ideal for secure/air-gapped environments
2. **Multi-Modal** — handles text docs, tabular data, images, code, and general Q&A in one system
3. **Streaming Responses** — real-time token streaming via SSE; feels like ChatGPT
4. **Transparent Agent Reasoning** — step trace view shows exactly which agent ran and why
5. **Enterprise-Ready** — RBAC, audit logging, data catalog, lineage tracking
6. **Databricks Integration** — optional connection to enterprise Delta Lake for production data
7. **Modular Architecture** — each layer (LLM, RAG, agents, auth) is independent and swappable
8. **Three Operation Modes** — Chat (simple), RAG (document-grounded), Agent (fully autonomous)
9. **Open Knowledge Format (OKF)** — Build, visualize, and share structured JSON-LD knowledge graphs directly in the browser
10. **Production-Ready Infrastructure** — Full Docker Compose stack, GZip compression, security headers, WebSocket support, and structured error responses

---

## Recent Enhancements (Pre-Presentation Updates)

1. **Unified Database Query Interface**: Replaced hardcoded local SQL databases in the Databases tab with a dynamic **Data Governance Catalog** integration. The UI now fluidly loads all available external sources, including MySQL, Databricks, and secure offline CSV files.
2. **In-Memory CSV Querying**: Enabled executing raw SQL directly against uploaded `.csv` datasets (e.g. `amazon.csv`) by securely mounting them into in-memory SQLite tables via `pandas`.
3. **NL-to-SQL Integration**: Integrated an **"Ask AI"** feature directly into the Database Query Editor. Users can provide natural language prompts (e.g., *"Show me all records from amazon"*), and the AI will contextually inspect the dynamically selected source's schema and generate the exact SQL query required.
4. **Dark Mode UI/UX Polish**: Resolved global contrast and visibility issues across native `<select>` and `<option>` elements, ensuring a seamless, premium dark mode aesthetic during the presentation.
5. **Full Security Module**: Added `app/security/` with three defence-in-depth layers:
   - **AI Guardrails** — PII leak prevention (SSN, credit cards, API keys) with role-aware redaction; prompt injection and jailbreak detection
   - **Query Sanitizer** — blocks destructive SQL (DROP/DELETE/ALTER) and MongoDB ops ($where, db.drop) for employee-role users; SQL injection pattern blocking for all roles
   - **Anomaly Detector** — per-user rate tracking (30 queries/min), bulk extraction alerting (>10K rows), persistent `SecurityAlert` DB model
6. **API Rate Limiting**: Added `slowapi` middleware for global API rate limiting with HTTP 429 responses.
7. **Idempotency Middleware**: Custom middleware checks `Idempotency-Key` header on POST/PUT/PATCH requests to prevent duplicate operations.
8. **Retry with Exponential Backoff**: All Ollama service calls (`check_health`, `list_models`, `generate`) wrapped with `tenacity` retry decorators — 3 attempts, exponential wait (2s→4s→10s).
9. **Data Agent Catalog Fallback**: When no data file is uploaded, the Data Agent automatically queries the internal Data Governance Catalog via `catalog_tool.py` — generates SQL from natural language, executes against MySQL, and interprets results.
10. **Theme System**: Added `themeStore.ts` with dark/light toggle, `data-theme` CSS attribute switching, and `localStorage` persistence.
11. **Admin Panel** (`/admin`): Full user management UI with dataset-level permission CRUD per user, role switching, and user deactivation.
12. **Query History & Saved Queries**: SQL Service now tracks every query execution (`QueryHistory` model) and supports named saved queries (`SavedQuery` model).
13. **Secure Storage Layer**: Air-gapped `secure_storage/dataset/` folder for CSV/JSON/Excel datasets, auto-registered into the Data Governance Catalog via `seed_secure_storage.py`.
14. **Setup & Seed Scripts**: PowerShell Ollama setup (`setup_ollama.ps1`), user seeding (`seed_users.py`), catalog seeding (`seed_catalog.py`), secure storage seeding, MySQL source registration, and dataset downloader.
15. **Open Knowledge Format (OKF)**: Introduced a full graph visualization and editing suite. Users can build interactive knowledge graphs visually, enrich them via the `qwen3:8b` LLM context, and export standard JSON-LD data structures. Backend features 3 dedicated SQL models and 15 distinct API endpoints managed through the `okf_service`.
16. **WebSocket Chat**: Added `ws_router.py` with bidirectional WebSocket endpoint (`/ws/chat/{session_id}`) — supports real-time token streaming (faster than SSE), mid-generation cancellation, live agent step updates, multi-model selection per message, and heartbeat/keepalive.
17. **Persistent Conversation History**: New `conversation_service.py` with `Conversation` + `Message` SQLite models. Full CRUD API via `conversation_router.py` — auto-titles from first user message, per-user scoping, archive/delete, stats endpoint. Frontend `/history` page with skeleton loading, search, and mode stats.
18. **Infrastructure Hardening**:
    - **Modern Lifespan** — replaced deprecated `@app.on_event("startup")` with FastAPI `lifespan` context manager including proper shutdown cleanup
    - **CORS Lock-down** — replaced dangerous `allow_origins=["*"]` with explicit localhost origins
    - **Security Headers** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` on every response
    - **GZip Compression** — Starlette `GZipMiddleware` for responses >1KB
    - **Request ID Tracing** — `X-Request-ID` header on every request/response for log correlation
    - **Fixed Idempotency** — proper LRU-cached response body caching (previously was a no-op `pass`)
    - **Structured Errors** — consistent JSON error envelope with `code`, `message`, and `request_id` for 404/500
    - **JWT Secret Warning** — startup warning if JWT_SECRET_KEY is still default
19. **Full Docker Compose Stack**: Single `docker-compose up` boots backend, frontend, Ollama, and Qdrant. Separate Dockerfiles for backend (Python 3.11 multi-stage with OCR deps) and frontend (Node 20 multi-stage Next.js build).
20. **Frontend UX Upgrades**:
    - **Toast Notifications** — `useToast` hook + `ToastContainer` component with success/error/warning/info types, auto-dismiss, slide-in animation
    - **Keyboard Shortcuts** — `useKeyboardShortcuts` hook: Ctrl+K (search), Ctrl+/ (sidebar), Ctrl+Shift+N (new chat), Escape (close modals)
    - **Skeleton Loading** — CSS shimmer animations for loading states across pages
    - **Connection Resilience** — `resilientFetch.ts` with auto-retry, exponential backoff, timeout, and user-facing toast on failure
    - **Offline Banner** — detects `navigator.onLine` and shows warning banner
    - **Comprehensive Health Dashboard** — `/api/health` now reports Ollama/Qdrant latency, SQLite DB size, disk usage, upload stats, and LangGraph status
21. **Multi-Turn Agent Chat** — injected `conversation_history` into Agent Graph and RAG pipeline context allowing contextual follow-up questions across modes.
22. **Agent Planner Node** — added an intermediate LLM step between Supervisor and Execution to generate step-by-step arrays before executing complex multi-agent queries.
23. **Tool-Use with Function Calling** — upgraded the Agent workflow (`file_agent` and `llm_service`) to use Ollama's native OpenAI-compatible `tools` array for exact function mapping instead of fragile JSON regex parsing.
24. **Voice Input/Output** — integrated the browser's native `SpeechRecognition` API for mic dictation and `speechSynthesis` API for text-to-speech agent read-alouds.
25. **Document Comparison Tool** — created a specialized `/api/rag/compare` endpoint and backend RAG logic to retrieve chunks from two distinct documents and map out their differences, contradictions, and commonalities.
26. **Human-in-the-loop Agent (HITL)** — implemented `MemorySaver` checkpointer in LangGraph to automatically pause execution prior to dangerous nodes (`file_agent`, `code_agent`), streaming a paused state to the Next.js frontend where users can review the intended action and click "Approve & Continue" to resume.
27. **Hybrid Search (Vector + BM25)** — integrated `fastembed` for BM25 sparse embeddings and configured Qdrant `query_points` to use Reciprocal Rank Fusion (RRF) for optimal keyword-aware retrieval.

---

## Future Scope (Beyond Phase 3)

All original planned features for Phase 1, Phase 2, and Phase 3 have now been completed! The system is fully feature-complete and ready for demonstration.

For future roadmap and scaling, the following enhancements are proposed:

1. **Multi-Modal Vision Agents**
   - Upgrading the local models (e.g., using `llava`) to allow the agents to "see" and understand images, charts, and scanned handwritten documents.
2. **Native Desktop Application (Tauri/Electron)**
   - Packaging the web app into a lightweight, one-click installable desktop app for Windows/Mac/Linux, making offline enterprise deployment even easier without requiring Docker.
3. **Agentic Long-Term Memory (Self-Reflection)**
   - Giving the agents a dedicated memory vector-store where they remember user preferences across different sessions (e.g., "Always write my reports in markdown"), allowing the agent to continuously adapt and improve.
4. **Federated Knowledge Syncing**
   - Allowing multiple isolated, air-gapped knowledge bases to "sync" their encrypted knowledge via physical USB drives, enabling knowledge sharing between secure facilities without a network connection.
5. **Enterprise Connectors (Offline Dumps)**
   - Building specialized ingestion pipelines to consume raw data dumps from enterprise tools (Jira, SharePoint, Confluence) and automatically map them into the RAG pipeline.

---

## Client-Server Architecture Deep Dive

EurekaX uses a strict **decoupled client-server architecture** designed for both local monolith deployments and distributed enterprise deployments (e.g. backend on a hefty GPU server, frontend accessed via LAN).

### 1. The Server (Backend)
- **Role**: Heavy lifting. Hosts the LLM, the Vector Database, the SQL databases, and the REST/WebSocket APIs.
- **Tech**: FastAPI running on Python 3.11, mounted on port `8000`.
- **Boundaries**: The backend handles zero UI rendering. It strictly exposes standard JSON REST endpoints and a unified WebSocket endpoint at `/ws/chat/{session_id}`.
- **State**: The backend persists all state via SQLite (Users, Roles, Chat History, OKF graphs).

### 2. The Client (Frontend)
- **Role**: Presentation and UX. Runs entirely in the user's browser after being served by Next.js.
- **Tech**: Next.js 16 (React 19) running on Node 20, mounted on port `3000`.
- **Boundaries**: The frontend holds no sensitive LLM configurations. It maintains ephemeral state via `zustand` (current chat session, UI themes) and persists standard auth tokens in `localStorage`.
- **Communication Flow**: 
  - The client makes HTTP calls to relative paths (e.g., `/api/chat`).
  - Next.js intercepts these calls using the `next.config.ts` proxy rewrite rules and forwards them to the Server IP (e.g., `http://127.0.0.1:8000/api/chat`).
  - This proxying strictly bypasses CORS issues and allows the Client code folder to be cleanly synced to any remote employee machine simply by updating the `SERVER_IP` environment variable in the client's `.env.local` file.
