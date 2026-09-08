# EurekaX — SIH Local LLM Assistant
## Complete Project Overview for Presentation

---

## What is this Project?

**EurekaX** is a fully **offline,secure workspace for industry, enterprise-grade AI assistant** built for the Smart India Hackathon (SIH). It runs entirely on local hardware — no cloud API keys, no internet. dependency, no data leaves the machine. It combines a local Large Language Model, a document search pipeline, and a multi-agent AI orchestration system into a single unified platform.

> **Core Value Proposition:** Bring the power of ChatGPT-level AI to government/enterprise environments where data privacy, air-gap compliance, and offline operation are non-negotiable.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                    USER (Browser)                       │
│                 http://localhost:3000                   │
└─────────────────────┬───────────────────────────────────┘
                      │  REST + SSE (Server-Sent Events)
┌─────────────────────▼───────────────────────────────────┐
│          Next.js 16 Frontend (TypeScript)                │
│  Pages: Login, Dashboard, Chat, RAG, Agent, SQL Editor   │
│         Governance, Pipelines, Workspace, Audit          │
└─────────────────────┬───────────────────────────────────┘
                      │  HTTP / API Proxy (:8000)
┌─────────────────────▼───────────────────────────────────┐
│              FastAPI Backend (Python 3.11)               │
│  Routers: auth, chat, rag, agent, governance, query,     │
│           pipelines, jobs, databases, workspace          │
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

**State Management (Zustand):**
- `authStore.ts` — Stores JWT token, user object, role; hydrates from localStorage on page load
- `appStore.ts` — Chat history, RAG results, agent steps, sidebar state

---

### 2. Backend: FastAPI (Python 3.11)

**What it is:** FastAPI is an async Python web framework built on Starlette + Pydantic. It auto-generates OpenAPI (Swagger) documentation.

**Why we used it:**
- **Async-first** — all I/O (LLM calls, DB queries, file reads) runs concurrently without blocking
- **Pydantic v2 validation** — request/response schemas are validated automatically
- **Auto Swagger docs** — every endpoint is documented at `/docs` without extra work
- **SSE streaming** — supports Server-Sent Events for real-time token streaming

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

**8 Callable Agent Tools:**
1. `search_documents(query, top_k)` — Qdrant semantic search
2. `read_file(path)` — safe sandboxed file read
3. `write_file(path, content)` — safe sandboxed file write
4. `list_files(dir)` — directory listing
5. `analyze_data(path)` — pandas DataFrame summary (shape, dtypes, head, describe)
6. `execute_python(code)` — Docker sandbox → subprocess fallback
7. `extract_image_text(path)` — PaddleOCR → pytesseract fallback
8. `query_databricks(sql)` — SQL against Databricks Delta Lake

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

### 8. Additional Services

| Service | Technology | Purpose |
|---------|-----------|---------|
| **SQL Service** | SQLAlchemy | Natural language to SQL; query execution against registered sources |
| **Databricks** | `databricks-sql-connector` | Query Delta Lake tables via Databricks SQL Warehouse |
| **MongoDB** | `pymongo` | Optional NoSQL data source for the Data Agent |
| **Pipeline Service** | Custom | ETL pipeline definition, step tracking, run history |
| **Notebook Service** | Custom | Jupyter-like notebook persistence in `workspace/` |
| **Scheduler** | Custom | Cron-style job scheduling for automated pipelines |
| **Watchdog** | Custom | File system monitoring for the workspace directory |
| **Audit Service** | SQLAlchemy | Write audit log entries; query with filters |

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

---

## Complete Dependency Map

### Python Backend (40 packages across 4 layers)

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

---

## Recent Enhancements (Pre-Presentation Updates)

1. **Unified Database Query Interface**: Replaced hardcoded local SQL databases in the Databases tab with a dynamic **Data Governance Catalog** integration. The UI now fluidly loads all available external sources, including MySQL, Databricks, and secure offline CSV files.
2. **In-Memory CSV Querying**: Enabled executing raw SQL directly against uploaded `.csv` datasets (e.g. `amazon.csv`) by securely mounting them into in-memory SQLite tables via `pandas`.
3. **NL-to-SQL Integration**: Integrated an **"Ask AI"** feature directly into the Database Query Editor. Users can provide natural language prompts (e.g., *"Show me all records from amazon"*), and the AI will contextually inspect the dynamically selected source's schema and generate the exact SQL query required.
4. **Dark Mode UI/UX Polish**: Resolved global contrast and visibility issues across native `<select>` and `<option>` elements, ensuring a seamless, premium dark mode aesthetic during the presentation.
