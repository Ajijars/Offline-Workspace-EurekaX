"""
Open Knowledge Format (OKF) Service.

Implements Google's Open Knowledge Format — a structured, interoperable
format for representing knowledge as typed nodes with relationships,
metadata, and provenance tracking.

Key concepts:
  - KnowledgePackage: A versioned collection of knowledge nodes (like a project)
  - KnowledgeNode: A single unit of knowledge (entity, concept, fact, document)
  - KnowledgeEdge: A typed relationship between two nodes
  - Provenance: Source attribution and confidence scoring

All data persists in SQLite via SQLAlchemy (same DB as the rest of EurekaX).
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    select,
    func,
    delete,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import relationship

from app.db.database import Base

logger = logging.getLogger(__name__)


# ── Helpers ──

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return uuid.uuid4().hex


# ══════════════════════════════════════════════
# ORM Models
# ══════════════════════════════════════════════


class KnowledgePackage(Base):
    """A versioned collection of knowledge nodes — the top-level OKF container."""
    __tablename__ = "okf_packages"

    id = Column(String(32), primary_key=True, default=_uuid)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, default="")
    version = Column(String(50), default="1.0.0")
    author = Column(String(255), default="")
    license = Column(String(100), default="CC-BY-4.0")
    tags = Column(Text, default="[]")  # JSON array of strings
    schema_version = Column(String(20), default="okf-1.0")
    is_public = Column(Boolean, default=False)
    created_by = Column(String(32), nullable=True)  # user ID
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    nodes = relationship("KnowledgeNode", back_populates="package", cascade="all, delete-orphan")
    edges = relationship("KnowledgeEdge", back_populates="package", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "license": self.license,
            "tags": json.loads(self.tags) if self.tags else [],
            "schema_version": self.schema_version,
            "is_public": self.is_public,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class KnowledgeNode(Base):
    """A single unit of knowledge — entity, concept, fact, or document reference."""
    __tablename__ = "okf_nodes"

    id = Column(String(32), primary_key=True, default=_uuid)
    package_id = Column(String(32), ForeignKey("okf_packages.id", ondelete="CASCADE"), nullable=False, index=True)
    node_type = Column(String(50), nullable=False, index=True)  # entity, concept, fact, document, event, metric
    label = Column(String(500), nullable=False)
    description = Column(Text, default="")
    content = Column(Text, default="")  # Rich content / full text
    properties = Column(Text, default="{}")  # JSON key-value pairs
    source_url = Column(String(2000), default="")
    confidence = Column(Float, default=1.0)  # 0.0 to 1.0
    position_x = Column(Float, default=0.0)  # For graph visualization
    position_y = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Relationships
    package = relationship("KnowledgePackage", back_populates="nodes")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "package_id": self.package_id,
            "node_type": self.node_type,
            "label": self.label,
            "description": self.description,
            "content": self.content,
            "properties": json.loads(self.properties) if self.properties else {},
            "source_url": self.source_url,
            "confidence": self.confidence,
            "position_x": self.position_x,
            "position_y": self.position_y,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class KnowledgeEdge(Base):
    """A typed relationship between two knowledge nodes."""
    __tablename__ = "okf_edges"

    id = Column(String(32), primary_key=True, default=_uuid)
    package_id = Column(String(32), ForeignKey("okf_packages.id", ondelete="CASCADE"), nullable=False, index=True)
    source_node_id = Column(String(32), ForeignKey("okf_nodes.id", ondelete="CASCADE"), nullable=False)
    target_node_id = Column(String(32), ForeignKey("okf_nodes.id", ondelete="CASCADE"), nullable=False)
    relationship_type = Column(String(100), nullable=False)  # is_a, part_of, causes, relates_to, etc.
    label = Column(String(255), default="")
    weight = Column(Float, default=1.0)  # Relationship strength 0.0 to 1.0
    properties = Column(Text, default="{}")  # JSON metadata
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    # Relationships
    package = relationship("KnowledgePackage", back_populates="edges")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "package_id": self.package_id,
            "source_node_id": self.source_node_id,
            "target_node_id": self.target_node_id,
            "relationship_type": self.relationship_type,
            "label": self.label,
            "weight": self.weight,
            "properties": json.loads(self.properties) if self.properties else {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ══════════════════════════════════════════════
# OKF Service
# ══════════════════════════════════════════════


class OKFService:
    """Service layer for Open Knowledge Format operations."""

    # ── Packages ──

    async def create_package(
        self, db: AsyncSession, name: str, description: str = "",
        author: str = "", license: str = "CC-BY-4.0", tags: list[str] | None = None,
        is_public: bool = False, created_by: str | None = None,
    ) -> KnowledgePackage:
        pkg = KnowledgePackage(
            name=name,
            description=description,
            author=author,
            license=license,
            tags=json.dumps(tags or []),
            is_public=is_public,
            created_by=created_by,
        )
        db.add(pkg)
        await db.commit()
        await db.refresh(pkg)
        logger.info("[OKF] Created package: %s (%s)", name, pkg.id)
        return pkg

    async def list_packages(
        self, db: AsyncSession, user_id: str | None = None, search: str = "",
    ) -> list[dict]:
        stmt = select(KnowledgePackage).order_by(KnowledgePackage.updated_at.desc())
        if search:
            stmt = stmt.where(
                KnowledgePackage.name.ilike(f"%{search}%")
                | KnowledgePackage.description.ilike(f"%{search}%")
            )
        result = await db.execute(stmt)
        packages = result.scalars().all()

        # Enrich with node/edge counts
        enriched = []
        for pkg in packages:
            node_count = await db.scalar(
                select(func.count(KnowledgeNode.id)).where(KnowledgeNode.package_id == pkg.id)
            )
            edge_count = await db.scalar(
                select(func.count(KnowledgeEdge.id)).where(KnowledgeEdge.package_id == pkg.id)
            )
            d = pkg.to_dict()
            d["node_count"] = node_count or 0
            d["edge_count"] = edge_count or 0
            enriched.append(d)
        return enriched

    async def get_package(self, db: AsyncSession, package_id: str) -> KnowledgePackage | None:
        result = await db.execute(
            select(KnowledgePackage).where(KnowledgePackage.id == package_id)
        )
        return result.scalar_one_or_none()

    async def update_package(
        self, db: AsyncSession, package_id: str, **kwargs
    ) -> KnowledgePackage | None:
        pkg = await self.get_package(db, package_id)
        if not pkg:
            return None
        for key, value in kwargs.items():
            if key == "tags" and isinstance(value, list):
                setattr(pkg, key, json.dumps(value))
            elif hasattr(pkg, key):
                setattr(pkg, key, value)
        await db.commit()
        await db.refresh(pkg)
        return pkg

    async def delete_package(self, db: AsyncSession, package_id: str) -> bool:
        pkg = await self.get_package(db, package_id)
        if not pkg:
            return False
        await db.delete(pkg)
        await db.commit()
        logger.info("[OKF] Deleted package: %s", package_id)
        return True

    # ── Nodes ──

    async def create_node(
        self, db: AsyncSession, package_id: str, node_type: str, label: str,
        description: str = "", content: str = "", properties: dict | None = None,
        source_url: str = "", confidence: float = 1.0,
        position_x: float = 0.0, position_y: float = 0.0,
    ) -> KnowledgeNode:
        node = KnowledgeNode(
            package_id=package_id,
            node_type=node_type,
            label=label,
            description=description,
            content=content,
            properties=json.dumps(properties or {}),
            source_url=source_url,
            confidence=confidence,
            position_x=position_x,
            position_y=position_y,
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        return node

    async def list_nodes(
        self, db: AsyncSession, package_id: str, node_type: str | None = None,
    ) -> list[dict]:
        stmt = select(KnowledgeNode).where(KnowledgeNode.package_id == package_id)
        if node_type:
            stmt = stmt.where(KnowledgeNode.node_type == node_type)
        stmt = stmt.order_by(KnowledgeNode.created_at.desc())
        result = await db.execute(stmt)
        return [n.to_dict() for n in result.scalars().all()]

    async def get_node(self, db: AsyncSession, node_id: str) -> KnowledgeNode | None:
        result = await db.execute(
            select(KnowledgeNode).where(KnowledgeNode.id == node_id)
        )
        return result.scalar_one_or_none()

    async def update_node(self, db: AsyncSession, node_id: str, **kwargs) -> KnowledgeNode | None:
        node = await self.get_node(db, node_id)
        if not node:
            return None
        for key, value in kwargs.items():
            if key == "properties" and isinstance(value, dict):
                setattr(node, key, json.dumps(value))
            elif hasattr(node, key):
                setattr(node, key, value)
        await db.commit()
        await db.refresh(node)
        return node

    async def delete_node(self, db: AsyncSession, node_id: str) -> bool:
        node = await self.get_node(db, node_id)
        if not node:
            return False
        # Also delete edges connected to this node
        await db.execute(
            delete(KnowledgeEdge).where(
                (KnowledgeEdge.source_node_id == node_id) | (KnowledgeEdge.target_node_id == node_id)
            )
        )
        await db.delete(node)
        await db.commit()
        return True

    # ── Edges ──

    async def create_edge(
        self, db: AsyncSession, package_id: str,
        source_node_id: str, target_node_id: str,
        relationship_type: str, label: str = "", weight: float = 1.0,
        properties: dict | None = None,
    ) -> KnowledgeEdge:
        edge = KnowledgeEdge(
            package_id=package_id,
            source_node_id=source_node_id,
            target_node_id=target_node_id,
            relationship_type=relationship_type,
            label=label,
            weight=weight,
            properties=json.dumps(properties or {}),
        )
        db.add(edge)
        await db.commit()
        await db.refresh(edge)
        return edge

    async def list_edges(self, db: AsyncSession, package_id: str) -> list[dict]:
        stmt = (
            select(KnowledgeEdge)
            .where(KnowledgeEdge.package_id == package_id)
            .order_by(KnowledgeEdge.created_at.desc())
        )
        result = await db.execute(stmt)
        return [e.to_dict() for e in result.scalars().all()]

    async def delete_edge(self, db: AsyncSession, edge_id: str) -> bool:
        result = await db.execute(
            select(KnowledgeEdge).where(KnowledgeEdge.id == edge_id)
        )
        edge = result.scalar_one_or_none()
        if not edge:
            return False
        await db.delete(edge)
        await db.commit()
        return True

    # ── Export / Import (JSON-LD compliant) ──

    async def export_package(self, db: AsyncSession, package_id: str) -> dict | None:
        """Export a full package in OKF JSON-LD format."""
        pkg = await self.get_package(db, package_id)
        if not pkg:
            return None

        nodes = await self.list_nodes(db, package_id)
        edges = await self.list_edges(db, package_id)

        return {
            "@context": {
                "@vocab": "https://schema.org/",
                "okf": "https://openknowledge.dev/schema/1.0/",
                "nodes": "okf:KnowledgeNode",
                "edges": "okf:KnowledgeEdge",
            },
            "@type": "okf:KnowledgePackage",
            "@id": f"urn:okf:{pkg.id}",
            "name": pkg.name,
            "description": pkg.description,
            "version": pkg.version,
            "author": pkg.author,
            "license": pkg.license,
            "schemaVersion": pkg.schema_version,
            "tags": json.loads(pkg.tags) if pkg.tags else [],
            "dateCreated": pkg.created_at.isoformat() if pkg.created_at else None,
            "dateModified": pkg.updated_at.isoformat() if pkg.updated_at else None,
            "nodes": [
                {
                    "@type": f"okf:{n['node_type'].capitalize()}",
                    "@id": f"urn:okf:node:{n['id']}",
                    "label": n["label"],
                    "description": n["description"],
                    "content": n["content"],
                    "nodeType": n["node_type"],
                    "properties": n["properties"],
                    "sourceUrl": n["source_url"],
                    "confidence": n["confidence"],
                    "position": {"x": n["position_x"], "y": n["position_y"]},
                }
                for n in nodes
            ],
            "edges": [
                {
                    "@type": "okf:KnowledgeEdge",
                    "@id": f"urn:okf:edge:{e['id']}",
                    "source": f"urn:okf:node:{e['source_node_id']}",
                    "target": f"urn:okf:node:{e['target_node_id']}",
                    "relationshipType": e["relationship_type"],
                    "label": e["label"],
                    "weight": e["weight"],
                    "properties": e["properties"],
                }
                for e in edges
            ],
        }

    async def import_package(self, db: AsyncSession, data: dict, created_by: str | None = None) -> KnowledgePackage:
        """Import a package from OKF JSON-LD format."""
        pkg = await self.create_package(
            db,
            name=data.get("name", "Imported Package"),
            description=data.get("description", ""),
            author=data.get("author", ""),
            license=data.get("license", "CC-BY-4.0"),
            tags=data.get("tags", []),
            created_by=created_by,
        )

        # Build ID mapping for node references
        node_id_map = {}  # old_urn -> new_id

        for node_data in data.get("nodes", []):
            old_urn = node_data.get("@id", "")
            pos = node_data.get("position", {})
            node = await self.create_node(
                db,
                package_id=pkg.id,
                node_type=node_data.get("nodeType", node_data.get("node_type", "entity")),
                label=node_data.get("label", "Untitled"),
                description=node_data.get("description", ""),
                content=node_data.get("content", ""),
                properties=node_data.get("properties", {}),
                source_url=node_data.get("sourceUrl", node_data.get("source_url", "")),
                confidence=node_data.get("confidence", 1.0),
                position_x=pos.get("x", 0.0),
                position_y=pos.get("y", 0.0),
            )
            node_id_map[old_urn] = node.id

        for edge_data in data.get("edges", []):
            source_urn = edge_data.get("source", "")
            target_urn = edge_data.get("target", "")
            source_id = node_id_map.get(source_urn)
            target_id = node_id_map.get(target_urn)
            if source_id and target_id:
                await self.create_edge(
                    db,
                    package_id=pkg.id,
                    source_node_id=source_id,
                    target_node_id=target_id,
                    relationship_type=edge_data.get("relationshipType", edge_data.get("relationship_type", "relates_to")),
                    label=edge_data.get("label", ""),
                    weight=edge_data.get("weight", 1.0),
                    properties=edge_data.get("properties", {}),
                )

        logger.info("[OKF] Imported package '%s' with %d nodes, %d edges",
                     pkg.name, len(node_id_map), len(data.get("edges", [])))
        return pkg

    # ── AI Enrichment ──

    async def enrich_with_ai(
        self, db: AsyncSession, package_id: str, llm_service
    ) -> dict:
        """Use the LLM to suggest new nodes and relationships for a package."""
        nodes = await self.list_nodes(db, package_id)
        edges = await self.list_edges(db, package_id)

        # Build a context summary
        node_labels = [n["label"] for n in nodes]
        edge_descs = [
            f"{e['source_node_id']} --{e['relationship_type']}--> {e['target_node_id']}"
            for e in edges
        ]

        prompt = f"""Analyze this knowledge graph and suggest 3-5 new knowledge nodes and relationships that would enrich it.

Current nodes: {', '.join(node_labels[:20])}
Current relationships: {'; '.join(edge_descs[:10])}

Respond in valid JSON format:
{{
  "suggested_nodes": [
    {{"label": "...", "node_type": "concept|entity|fact", "description": "...", "confidence": 0.8}}
  ],
  "suggested_edges": [
    {{"source_label": "...", "target_label": "...", "relationship_type": "relates_to|causes|part_of|is_a", "label": "..."}}
  ],
  "summary": "Brief explanation of suggestions"
}}

/no_think"""

        try:
            response = await llm_service.generate(prompt, temperature=0.3)
            # Parse JSON from response
            text = response.get("response", "")
            # Try to extract JSON
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except Exception as e:
            logger.warning("[OKF] AI enrichment failed: %s", e)

        return {"suggested_nodes": [], "suggested_edges": [], "summary": "AI enrichment unavailable"}

    # ── Statistics ──

    async def get_stats(self, db: AsyncSession) -> dict:
        """Get OKF system-wide statistics."""
        pkg_count = await db.scalar(select(func.count(KnowledgePackage.id)))
        node_count = await db.scalar(select(func.count(KnowledgeNode.id)))
        edge_count = await db.scalar(select(func.count(KnowledgeEdge.id)))

        # Node type distribution
        type_result = await db.execute(
            select(KnowledgeNode.node_type, func.count(KnowledgeNode.id))
            .group_by(KnowledgeNode.node_type)
        )
        type_dist = {row[0]: row[1] for row in type_result.all()}

        # Relationship type distribution
        rel_result = await db.execute(
            select(KnowledgeEdge.relationship_type, func.count(KnowledgeEdge.id))
            .group_by(KnowledgeEdge.relationship_type)
        )
        rel_dist = {row[0]: row[1] for row in rel_result.all()}

        return {
            "total_packages": pkg_count or 0,
            "total_nodes": node_count or 0,
            "total_edges": edge_count or 0,
            "node_types": type_dist,
            "relationship_types": rel_dist,
        }


# Singleton
okf_service = OKFService()
