"""
OKF API Router — Open Knowledge Format endpoints.

Full CRUD for knowledge packages, nodes, edges, plus
export/import in JSON-LD format and AI enrichment.
"""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.services.okf_service import okf_service
from app.services.audit_service import audit_service

logger = logging.getLogger(__name__)
okf_router = APIRouter(prefix="/api/okf", tags=["Open Knowledge Format"])


# ══════════════════════════════════════════════
# Request/Response Schemas
# ══════════════════════════════════════════════


class PackageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    author: str = ""
    license: str = "CC-BY-4.0"
    tags: list[str] = []
    is_public: bool = False


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    license: Optional[str] = None
    tags: Optional[list[str]] = None
    version: Optional[str] = None
    is_public: Optional[bool] = None


class NodeCreate(BaseModel):
    node_type: str = Field(..., pattern="^(entity|concept|fact|document|event|metric)$")
    label: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    content: str = ""
    properties: dict = {}
    source_url: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    position_x: float = 0.0
    position_y: float = 0.0


class NodeUpdate(BaseModel):
    node_type: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    properties: Optional[dict] = None
    source_url: Optional[str] = None
    confidence: Optional[float] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class EdgeCreate(BaseModel):
    source_node_id: str
    target_node_id: str
    relationship_type: str = Field(..., pattern="^(is_a|part_of|causes|relates_to|derived_from|depends_on|contradicts|supports|references|contains)$")
    label: str = ""
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    properties: dict = {}


# ══════════════════════════════════════════════
# Package Endpoints
# ══════════════════════════════════════════════


@okf_router.get("/packages")
async def list_packages(
    search: str = Query("", description="Search by name or description"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all knowledge packages."""
    packages = await okf_service.list_packages(db, user_id=user.id, search=search)
    return packages


@okf_router.post("/packages")
async def create_package(
    body: PackageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new knowledge package."""
    pkg = await okf_service.create_package(
        db,
        name=body.name,
        description=body.description,
        author=body.author or user.username,
        license=body.license,
        tags=body.tags,
        is_public=body.is_public,
        created_by=user.id,
    )
    await audit_service.log(db, user_id=user.id, action="okf_package_create", resource_type="okf_package", resource_id=pkg.id, details={"name": body.name})
    return pkg.to_dict()


@okf_router.get("/packages/{package_id}")
async def get_package(
    package_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single package with its nodes and edges."""
    pkg = await okf_service.get_package(db, package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    nodes = await okf_service.list_nodes(db, package_id)
    edges = await okf_service.list_edges(db, package_id)

    result = pkg.to_dict()
    result["nodes"] = nodes
    result["edges"] = edges
    return result


@okf_router.put("/packages/{package_id}")
async def update_package(
    package_id: str,
    body: PackageUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update package metadata."""
    updates = body.model_dump(exclude_none=True)
    pkg = await okf_service.update_package(db, package_id, **updates)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return pkg.to_dict()


@okf_router.delete("/packages/{package_id}")
async def delete_package(
    package_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a package and all its nodes/edges."""
    deleted = await okf_service.delete_package(db, package_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Package not found")
    await audit_service.log(db, user_id=user.id, action="okf_package_delete", resource_type="okf_package", resource_id=package_id)
    return {"status": "deleted", "id": package_id}


# ══════════════════════════════════════════════
# Node Endpoints
# ══════════════════════════════════════════════


@okf_router.get("/packages/{package_id}/nodes")
async def list_nodes(
    package_id: str,
    node_type: Optional[str] = Query(None, description="Filter by node type"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all nodes in a package."""
    return await okf_service.list_nodes(db, package_id, node_type=node_type)


@okf_router.post("/packages/{package_id}/nodes")
async def create_node(
    package_id: str,
    body: NodeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a knowledge node to a package."""
    pkg = await okf_service.get_package(db, package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    node = await okf_service.create_node(
        db, package_id=package_id,
        node_type=body.node_type, label=body.label,
        description=body.description, content=body.content,
        properties=body.properties, source_url=body.source_url,
        confidence=body.confidence,
        position_x=body.position_x, position_y=body.position_y,
    )
    return node.to_dict()


@okf_router.put("/nodes/{node_id}")
async def update_node(
    node_id: str,
    body: NodeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a knowledge node."""
    updates = body.model_dump(exclude_none=True)
    node = await okf_service.update_node(db, node_id, **updates)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node.to_dict()


@okf_router.delete("/nodes/{node_id}")
async def delete_node(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a knowledge node and its connected edges."""
    deleted = await okf_service.delete_node(db, node_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"status": "deleted", "id": node_id}


# ══════════════════════════════════════════════
# Edge Endpoints
# ══════════════════════════════════════════════


@okf_router.get("/packages/{package_id}/edges")
async def list_edges(
    package_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all edges in a package."""
    return await okf_service.list_edges(db, package_id)


@okf_router.post("/packages/{package_id}/edges")
async def create_edge(
    package_id: str,
    body: EdgeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a relationship between two nodes."""
    pkg = await okf_service.get_package(db, package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    # Verify both nodes exist
    source = await okf_service.get_node(db, body.source_node_id)
    target = await okf_service.get_node(db, body.target_node_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target node not found")

    edge = await okf_service.create_edge(
        db, package_id=package_id,
        source_node_id=body.source_node_id,
        target_node_id=body.target_node_id,
        relationship_type=body.relationship_type,
        label=body.label, weight=body.weight,
        properties=body.properties,
    )
    return edge.to_dict()


@okf_router.delete("/edges/{edge_id}")
async def delete_edge(
    edge_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an edge."""
    deleted = await okf_service.delete_edge(db, edge_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Edge not found")
    return {"status": "deleted", "id": edge_id}


# ══════════════════════════════════════════════
# Export / Import
# ══════════════════════════════════════════════


@okf_router.get("/packages/{package_id}/export")
async def export_package(
    package_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a package as OKF JSON-LD."""
    data = await okf_service.export_package(db, package_id)
    if not data:
        raise HTTPException(status_code=404, detail="Package not found")
    await audit_service.log(db, user_id=user.id, action="okf_export", resource_type="okf_package", resource_id=package_id)
    return JSONResponse(content=data, headers={
        "Content-Disposition": f'attachment; filename="okf_{package_id}.json"'
    })


@okf_router.post("/import")
async def import_package(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a package from OKF JSON-LD file."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files are accepted")

    try:
        content = await file.read()
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    pkg = await okf_service.import_package(db, data, created_by=user.id)
    await audit_service.log(db, user_id=user.id, action="okf_import", resource_type="okf_package", resource_id=pkg.id, details={"name": pkg.name})
    return pkg.to_dict()


# ══════════════════════════════════════════════
# AI Enrichment
# ══════════════════════════════════════════════


@okf_router.post("/packages/{package_id}/enrich")
async def enrich_package(
    package_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use AI to suggest new nodes and relationships."""
    pkg = await okf_service.get_package(db, package_id)
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    from app.services.llm_service import ollama_service
    suggestions = await okf_service.enrich_with_ai(db, package_id, ollama_service)
    return suggestions


# ══════════════════════════════════════════════
# Statistics
# ══════════════════════════════════════════════


@okf_router.get("/stats")
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get OKF system statistics."""
    return await okf_service.get_stats(db)
