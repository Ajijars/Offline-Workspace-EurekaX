"""
Vector Service – Qdrant vector database operations.

Handles collection management, document chunk storage,
similarity search, and document deletion.

Supports two modes:
  - Docker mode: connects to Qdrant at QDRANT_HOST:QDRANT_PORT
  - Local mode (fallback): uses file-based storage in ./qdrant_data/
"""

import logging
import uuid
from pathlib import Path
from typing import Optional

from qdrant_client import QdrantClient
from tenacity import retry, stop_after_attempt, wait_exponential
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
    ScrollRequest,
    SparseVectorParams,
    SparseIndexParams,
    SparseVector,
    Prefetch,
    FusionQuery,
    Fusion,
)

from app.config import get_settings

logger = logging.getLogger(__name__)

# Local fallback storage path
QDRANT_LOCAL_PATH = Path("qdrant_data")


class VectorService:
    """Service class wrapping Qdrant vector database operations."""

    def __init__(self):
        settings = get_settings()
        self.host = settings.QDRANT_HOST
        self.port = settings.QDRANT_PORT
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self.dimension = settings.EMBEDDING_DIMENSION
        self._client: Optional[QdrantClient] = None
        self._mode: str = "unknown"

    @property
    def client(self) -> QdrantClient:
        """
        Lazy-initialize the Qdrant client.
        
        Tries Docker-based Qdrant first; falls back to local file mode.
        """
        if self._client is None:
            # Try Docker-based Qdrant first
            try:
                client = QdrantClient(host=self.host, port=self.port, timeout=5)
                client.get_collections()  # Test connectivity
                self._client = client
                self._mode = "docker"
                logger.info(f"Qdrant connected (Docker) at {self.host}:{self.port}")
            except Exception:
                # Fall back to local file storage
                QDRANT_LOCAL_PATH.mkdir(parents=True, exist_ok=True)
                self._client = QdrantClient(path=str(QDRANT_LOCAL_PATH))
                self._mode = "local"
                logger.info(f"Qdrant running (local mode) at {QDRANT_LOCAL_PATH.absolute()}")
        return self._client

    @property
    def mode(self) -> str:
        """Return the current Qdrant connection mode."""
        _ = self.client  # Ensure initialized
        return self._mode

    def supports_sparse(self) -> bool:
        """Check if the target collection is configured with the 'sparse' vector."""
        try:
            info = self.client.get_collection(self.collection_name)
            sparse_config = getattr(getattr(info, "config", None), "params", None)
            sparse_dict = getattr(sparse_config, "sparse_vectors", None)
            return bool(sparse_dict and "sparse" in sparse_dict)
        except Exception:
            return False

    # ──────────────────────────────────────────────
    # Collection Management
    # ──────────────────────────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def init_collection(self) -> bool:
        """
        Create the vector collection if it doesn't exist.
        
        Uses cosine similarity and the configured embedding dimension.
        """
        try:
            collections = self.client.get_collections().collections
            existing = [c.name for c in collections]

            if self.collection_name not in existing:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self.dimension,
                        distance=Distance.COSINE
                    ),
                    sparse_vectors_config={
                        "sparse": SparseVectorParams(
                            index=SparseIndexParams(on_disk=False)
                        )
                    }
                )
                logger.info(f"Created Qdrant collection: {self.collection_name}")
            else:
                # Ensure sparse config is enabled for existing collections
                if not self.supports_sparse():
                    try:
                        info = self.client.get_collection(self.collection_name)
                        points_count = getattr(info, "points_count", 0) or 0
                        if points_count == 0:
                            logger.info(f"Recreating empty collection '{self.collection_name}' with sparse vector support")
                            self.client.delete_collection(self.collection_name)
                            self.client.create_collection(
                                collection_name=self.collection_name,
                                vectors_config=VectorParams(
                                    size=self.dimension,
                                    distance=Distance.COSINE
                                ),
                                sparse_vectors_config={
                                    "sparse": SparseVectorParams(
                                        index=SparseIndexParams(on_disk=False)
                                    )
                                }
                            )
                        else:
                            self.client.update_collection(
                                collection_name=self.collection_name,
                                sparse_vectors_config={
                                    "sparse": SparseVectorParams(
                                        index=SparseIndexParams(on_disk=False)
                                    )
                                }
                            )
                    except Exception as e:
                        logger.warning(f"Could not update/recreate collection for sparse: {e}")
                logger.info(f"Qdrant collection exists: {self.collection_name}")

            return True
        except Exception as e:
            logger.error(f"Failed to initialize Qdrant collection: {e}")
            return False

    async def check_health(self) -> bool:
        """Check if Qdrant is reachable."""
        try:
            self.client.get_collections()
            return True
        except Exception as e:
            logger.warning(f"Qdrant health check failed: {e}")
            return False

    async def get_collection_stats(self) -> dict:
        """Return collection statistics (vector count, etc.)."""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
                "status": str(info.status),
            }
        except Exception:
            return {"vectors_count": 0}

    # ──────────────────────────────────────────────
    # CRUD Operations
    # ──────────────────────────────────────────────

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def upsert_chunks(
        self,
        doc_id: str,
        chunks: list[str],
        vectors: list[list[float]],
        sparse_vectors: Optional[list[dict]] = None,
        metadata: Optional[dict] = None
    ) -> int:
        """
        Store document chunks with their embeddings in Qdrant.

        Args:
            doc_id: Document identifier
            chunks: List of text chunks
            vectors: Corresponding embedding vectors
            metadata: Document-level metadata (filename, etc.)

        Returns:
            Number of points inserted.
        """
        if len(chunks) != len(vectors):
            raise ValueError("chunks and vectors must have the same length")

        if metadata is None:
            metadata = {}

        can_use_sparse = self.supports_sparse()

        points = []
        for i, chunk in enumerate(chunks):
            vector = vectors[i]
            sparse = sparse_vectors[i] if (can_use_sparse and sparse_vectors and i < len(sparse_vectors)) else None
            point_id = str(uuid.uuid4())
            vector_dict = {"": vector}
            if sparse and isinstance(sparse, dict) and sparse.get("indices") and len(sparse["indices"]) > 0:
                vector_dict["sparse"] = SparseVector(
                    indices=sparse["indices"],
                    values=sparse["values"]
                )
            points.append(
                PointStruct(
                    id=point_id,
                    vector=vector_dict,
                    payload={
                        "doc_id": doc_id,
                        "chunk_index": i,
                        "chunk_text": chunk,
                        "filename": metadata.get("filename", ""),
                        "file_type": metadata.get("file_type", ""),
                        "file_path": metadata.get("file_path", ""),
                        "total_chunks": len(chunks),
                    }
                )
            )

        # Upsert in batches of 100 with resilient dense fallback
        batch_size = 100
        try:
            for start in range(0, len(points), batch_size):
                batch = points[start:start + batch_size]
                self.client.upsert(
                    collection_name=self.collection_name,
                    points=batch
                )
        except Exception as e:
            if "Not existing vector name error" in str(e) or "sparse" in str(e).lower():
                logger.warning(f"Upsert with sparse failed ({e}), retrying dense-only...")
                for idx_p, p in enumerate(points):
                    if isinstance(p.vector, dict) and "sparse" in p.vector:
                        p.vector = {"": vectors[idx_p]}
                for start in range(0, len(points), batch_size):
                    batch = points[start:start + batch_size]
                    self.client.upsert(
                        collection_name=self.collection_name,
                        points=batch
                    )
            else:
                raise

        logger.info(
            f"Stored {len(points)} chunks for doc '{doc_id}' "
            f"({metadata.get('filename', 'unknown')})"
        )
        return len(points)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def search(
        self,
        query_vector: list[float],
        sparse_query_vector: Optional[dict] = None,
        top_k: int = 5,
        doc_id: Optional[str] = None
    ) -> list[dict]:
        """
        Perform similarity search in the vector store.

        Args:
            query_vector: The query embedding vector
            top_k: Number of results to return
            doc_id: Optional filter to search within a specific document

        Returns:
            List of dicts with 'chunk_text', 'score', 'filename', 'chunk_index'
        """
        search_filter = None
        if doc_id:
            search_filter = Filter(
                must=[
                    FieldCondition(
                        key="doc_id",
                        match=MatchValue(value=doc_id)
                    )
                ]
            )

        can_use_sparse = self.supports_sparse()
        has_sparse = (
            can_use_sparse
            and sparse_query_vector 
            and isinstance(sparse_query_vector, dict) 
            and sparse_query_vector.get("indices") 
            and len(sparse_query_vector["indices"]) > 0
        )
        try:
            if has_sparse:
                results = self.client.query_points(
                    collection_name=self.collection_name,
                    prefetch=[
                        Prefetch(
                            query=query_vector,
                            using="",
                            limit=top_k * 2,
                            filter=search_filter,
                        ),
                        Prefetch(
                            query=SparseVector(
                                indices=sparse_query_vector["indices"],
                                values=sparse_query_vector["values"]
                            ),
                            using="sparse",
                            limit=top_k * 2,
                            filter=search_filter,
                        ),
                    ],
                    query=FusionQuery(fusion=Fusion.RRF),
                    limit=top_k,
                    with_payload=True,
                ).points
            else:
                results = self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_vector,
                    limit=top_k,
                    query_filter=search_filter,
                    with_payload=True,
                )
        except Exception as e:
            logger.warning(f"Hybrid search failed, falling back to dense search: {e}")
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=top_k,
                query_filter=search_filter,
                with_payload=True,
            )

        return [
            {
                "chunk_text": hit.payload.get("chunk_text", ""),
                "score": round(hit.score, 4) if hit.score is not None else 0.0,
                "filename": hit.payload.get("filename", ""),
                "chunk_index": hit.payload.get("chunk_index", 0),
                "doc_id": hit.payload.get("doc_id", ""),
            }
            for hit in results
        ]

    async def delete_document(self, doc_id: str) -> bool:
        """Delete all chunks belonging to a specific document."""
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="doc_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                ),
            )
            logger.info(f"Deleted all chunks for doc_id: {doc_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete document {doc_id}: {e}")
            return False

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def get_document_chunks(self, doc_id: str) -> list[str]:
        """
        Retrieve all text chunks for a specific document from Qdrant.
        Useful for document comparison and full-text extraction.
        """
        try:
            chunks = []
            offset = None
            
            while True:
                response = self.client.scroll(
                    collection_name=self.collection_name,
                    scroll_filter=Filter(
                        must=[
                            FieldCondition(
                                key="doc_id",
                                match=MatchValue(value=doc_id),
                            )
                        ]
                    ),
                    limit=100,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )
                
                records, next_page_offset = response
                
                for record in records:
                    if record.payload and "chunk_text" in record.payload:
                        chunks.append(record.payload["chunk_text"])
                        
                if next_page_offset is None:
                    break
                offset = next_page_offset
                
            logger.info(f"Retrieved {len(chunks)} chunks for document {doc_id}")
            return chunks
            
        except Exception as e:
            logger.error(f"Error retrieving chunks for {doc_id} from Qdrant: {e}")
            return []

    async def list_documents(self) -> list[dict]:
        """
        List all unique documents in the collection.
        
        Scrolls through all points and groups by doc_id.
        """
        try:
            documents = {}
            offset = None
            batch_size = 100

            while True:
                result = self.client.scroll(
                    collection_name=self.collection_name,
                    limit=batch_size,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )

                points, next_offset = result

                for point in points:
                    doc_id = point.payload.get("doc_id", "")
                    if doc_id not in documents:
                        documents[doc_id] = {
                            "doc_id": doc_id,
                            "filename": point.payload.get("filename", ""),
                            "file_type": point.payload.get("file_type", ""),
                            "file_path": point.payload.get("file_path", ""),
                            "chunk_count": 0,
                        }
                    documents[doc_id]["chunk_count"] += 1

                if next_offset is None:
                    break
                offset = next_offset

            return list(documents.values())

        except Exception as e:
            logger.error(f"Failed to list documents: {e}")
            return []

    async def get_collection_info(self) -> dict:
        """Get collection statistics."""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                "name": self.collection_name,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count,
                "status": info.status.value if info.status else "unknown",
                "mode": self._mode,
            }
        except Exception as e:
            logger.error(f"Failed to get collection info: {e}")
            return {
                "name": self.collection_name,
                "points_count": 0,
                "status": "error",
                "error": str(e),
                "mode": self._mode,
            }


# Singleton instance
vector_service = VectorService()
